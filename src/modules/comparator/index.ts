/**
 * Comparator Module
 * Main entry point for CloudFormation template comparison
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  CloudFormationTemplate,
  ComparisonReport,
  ComparisonResult,
  ResourceMatch,
} from '../../types/cloudformation';
import { matchResources, findUnmatchedResources } from './resource-matcher';
import { compareResource } from './property-comparator';
import { generateReport, generateHTMLReport } from './report-generator';

export interface ComparatorOptions {
  includeUnmatched?: boolean;
  outputFormat?: 'json' | 'html' | 'both';
}

/**
 * Main Comparator class for template comparison
 */
export class Comparator {
  /**
   * Load CloudFormation template from file
   * @param templatePath - Path to CloudFormation template JSON file
   * @returns Parsed CloudFormation template
   */
  async loadTemplate(templatePath: string): Promise<CloudFormationTemplate> {
    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      const template = JSON.parse(content);

      // Validate basic structure
      if (!template.Resources || typeof template.Resources !== 'object') {
        throw new Error(
          `Invalid CloudFormation template: missing Resources section in ${templatePath}`
        );
      }

      return template as CloudFormationTemplate;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Failed to parse CloudFormation template at ${templatePath}: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Compare two CloudFormation templates
   * @param slsTemplatePath - Path to Serverless CloudFormation template
   * @param cdkTemplatePath - Path to CDK CloudFormation template
   * @param options - Comparison options
   * @returns Comparison report
   */
  async compareTemplates(
    slsTemplatePath: string,
    cdkTemplatePath: string,
    options: ComparatorOptions = {}
  ): Promise<ComparisonReport> {
    // Load both templates
    const slsTemplate = await this.loadTemplate(slsTemplatePath);
    const cdkTemplate = await this.loadTemplate(cdkTemplatePath);

    // Match resources
    const matches = matchResources(slsTemplate, cdkTemplate);

    // Compare each matched resource
    const results: ComparisonResult[] = matches.map((match) =>
      compareResource(match)
    );

    // Add unmatched resources to summary if requested
    let unmatchedSls: string[] = [];
    let unmatchedCdk: string[] = [];

    if (options.includeUnmatched) {
      unmatchedSls = findUnmatchedResources(slsTemplate, matches, 'sls');
      unmatchedCdk = findUnmatchedResources(cdkTemplate, matches, 'cdk');
    }

    // Generate report
    const report = generateReport(results);

    // Add unmatched counts to summary
    report.summary.unmatched_sls = unmatchedSls.length;
    report.summary.unmatched_cdk = unmatchedCdk.length;

    return report;
  }

  /**
   * Save comparison report to file(s)
   * @param report - Comparison report
   * @param outputPath - Base output path (extension determines format)
   * @param format - Output format override
   */
  async saveReport(
    report: ComparisonReport,
    outputPath: string,
    format?: 'json' | 'html' | 'both'
  ): Promise<void> {
    const ext = path.extname(outputPath);
    const basePath = outputPath.replace(ext, '');

    // Determine format from extension if not specified
    const outputFormat =
      format ||
      (ext === '.html' ? 'html' : ext === '.json' ? 'json' : 'both');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Save JSON report
    if (outputFormat === 'json' || outputFormat === 'both') {
      const jsonPath = outputFormat === 'both' ? `${basePath}.json` : outputPath;
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    }

    // Save HTML report
    if (outputFormat === 'html' || outputFormat === 'both') {
      const htmlPath = outputFormat === 'both' ? `${basePath}.html` : outputPath;
      const html = generateHTMLReport(report);
      await fs.writeFile(htmlPath, html, 'utf-8');
    }
  }

  /**
   * Quick validation - check if templates are ready for import
   * @param slsTemplatePath - Path to Serverless CloudFormation template
   * @param cdkTemplatePath - Path to CDK CloudFormation template
   * @returns True if ready for import (no blocking issues)
   */
  async validateForImport(
    slsTemplatePath: string,
    cdkTemplatePath: string
  ): Promise<{ ready: boolean; issues: string[] }> {
    const report = await this.compareTemplates(
      slsTemplatePath,
      cdkTemplatePath
    );

    return {
      ready: report.ready_for_import,
      issues: report.blocking_issues,
    };
  }
}

// Export main comparator instance
export const comparator = new Comparator();

// Re-export types and utilities
export type { ComparisonReport, ComparisonResult, ResourceMatch };
export { matchResources, compareResource, generateReport, generateHTMLReport };
