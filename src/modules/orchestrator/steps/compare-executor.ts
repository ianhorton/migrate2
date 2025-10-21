/**
 * Compare Templates Step Executor
 * Compares Serverless and CDK CloudFormation templates
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import { Comparator } from '../../comparator';
import type { ComparisonReport } from '../../../types/cloudformation';
import * as path from 'path';
import * as fs from 'fs/promises';

interface CompareResult {
  report: ComparisonReport;
  reportPath: string;
  readyForImport: boolean;
  blockingIssues: string[];
}

export class CompareExecutor extends BaseStepExecutor {
  private comparator: Comparator;

  constructor() {
    super(MigrationStep.COMPARISON);
    this.comparator = new Comparator();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure scan and generate steps are completed
    const scanResult = state.stepResults[MigrationStep.INITIAL_SCAN];
    const generateResult = state.stepResults[MigrationStep.CDK_GENERATION];

    if (!scanResult || !scanResult.data?.cloudFormationTemplate) {
      this.logger.error('Scan step must be completed before comparison');
      return false;
    }

    if (!generateResult || !generateResult.data?.templatePath) {
      this.logger.error('CDK generation step must be completed before comparison');
      return false;
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<CompareResult> {
    this.logger.info('Comparing CloudFormation templates...');

    const { sourceDir, targetDir } = state.config;

    // Get paths to both templates
    const slsTemplatePath = path.join(
      sourceDir,
      '.serverless',
      'cloudformation-template-update-stack.json'
    );

    const generateData = state.stepResults[MigrationStep.CDK_GENERATION].data;
    const cdkTemplatePath = generateData.templatePath;

    // Log which files are being compared
    this.logger.info('\n📁 Comparing templates:');
    this.logger.info(`  Serverless: ${slsTemplatePath}`);
    this.logger.info(`  CDK:        ${cdkTemplatePath}`);

    // Verify both templates exist
    await this.verifyTemplateExists(slsTemplatePath, 'Serverless');
    await this.verifyTemplateExists(cdkTemplatePath, 'CDK');

    // Step 1: Compare templates
    this.logger.info('Analyzing resource matches and differences...');
    const report = await this.comparator.compareTemplates(
      slsTemplatePath,
      cdkTemplatePath,
      { includeUnmatched: true }
    );

    // Step 2: Log comparison summary
    this.logComparisonSummary(report);

    // Step 3: Generate HTML report
    const reportPath = path.join(targetDir, 'migration-comparison-report.html');
    await this.comparator.saveReport(report, reportPath, 'both');
    this.logger.info(`\nDetailed comparison report saved to:`);
    this.logger.info(`  HTML: ${reportPath}`);
    this.logger.info(`  JSON: ${reportPath.replace('.html', '.json')}`);

    // Step 4: Check for blocking issues
    const readyForImport = report.ready_for_import;
    const blockingIssues = report.blocking_issues;

    if (!readyForImport) {
      this.logger.warn('\n⚠️  Blocking issues detected:');
      blockingIssues.forEach(issue => {
        this.logger.warn(`  - ${issue}`);
      });
      this.logger.warn('\nPlease review the comparison report and address these issues before proceeding.');
      this.logger.warn('\n📄 Templates compared:');
      this.logger.warn(`  Serverless: ${slsTemplatePath}`);
      this.logger.warn(`  CDK:        ${cdkTemplatePath}`);
      this.logger.warn(`  Report:     ${reportPath}`);
    } else {
      this.logger.info('\n✅ Templates are compatible for import');
    }

    const result: CompareResult = {
      report,
      reportPath,
      readyForImport,
      blockingIssues
    };

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    // No rollback needed for comparison - it's read-only
    this.logger.info('No rollback needed for comparison step (read-only operation)');
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.COMPARISON];

    // Check 1: Comparison report generated
    if (result?.data?.report) {
      checks.push({
        name: 'comparison-completed',
        passed: true,
        message: 'Template comparison completed successfully',
        severity: 'error' as const
      });
    } else {
      checks.push({
        name: 'comparison-completed',
        passed: false,
        message: 'Comparison report not generated',
        severity: 'error' as const
      });
    }

    // Check 2: Report file saved
    if (result?.data?.reportPath) {
      try {
        await fs.access(result.data.reportPath);
        checks.push({
          name: 'report-saved',
          passed: true,
          message: 'Comparison report saved successfully',
          severity: 'error' as const
        });
      } catch (error) {
        checks.push({
          name: 'report-saved',
          passed: false,
          message: 'Failed to save comparison report',
          severity: 'error' as const
        });
      }
    }

    // Check 3: Ready for import
    if (result?.data?.report) {
      const report = result.data.report as ComparisonReport;
      const ready = report.ready_for_import;
      const criticalCount = report.summary.status.CRITICAL;
      const warningCount = report.summary.status.WARNING;

      checks.push({
        name: 'ready-for-import',
        passed: ready,
        message: ready
          ? 'Templates are ready for resource import'
          : `Not ready: ${criticalCount} critical issues, ${warningCount} warnings`,
        severity: 'error' as const
      });

      // Check 4: Resource match rate
      const totalMatched = report.summary.matched;
      const unmatchedSls = report.summary.unmatched_sls || 0;
      const unmatchedCdk = report.summary.unmatched_cdk || 0;
      const totalResources = totalMatched + unmatchedSls + unmatchedCdk;
      const matchRate = totalResources > 0 ? (totalMatched / totalResources) * 100 : 0;

      checks.push({
        name: 'resource-match-rate',
        passed: matchRate > 80,
        message: `${matchRate.toFixed(1)}% of resources matched (${totalMatched}/${totalResources})`,
        severity: matchRate > 90 ? 'info' as const : 'warning' as const
      });

      // Check 5: Blocking issues
      if (result.data.blockingIssues && result.data.blockingIssues.length > 0) {
        checks.push({
          name: 'blocking-issues',
          passed: false,
          message: `${result.data.blockingIssues.length} blocking issues must be resolved`,
          severity: 'error' as const
        });
      } else {
        checks.push({
          name: 'blocking-issues',
          passed: true,
          message: 'No blocking issues detected',
          severity: 'info' as const
        });
      }
    }

    return checks;
  }

  private async verifyTemplateExists(templatePath: string, type: string): Promise<void> {
    try {
      await fs.access(templatePath);
    } catch (error) {
      throw new Error(`${type} template not found at: ${templatePath}`);
    }
  }

  private logComparisonSummary(report: ComparisonReport): void {
    this.logger.info('\n📊 Comparison Summary:');
    this.logger.info(`  Matched resources: ${report.summary.matched}`);
    this.logger.info(`  Matches: ${report.summary.status.MATCH}`);
    this.logger.info(`  Acceptable: ${report.summary.status.ACCEPTABLE}`);
    this.logger.info(`  Critical differences: ${report.summary.status.CRITICAL}`);
    this.logger.info(`  Warnings: ${report.summary.status.WARNING}`);

    if (report.summary.unmatched_sls) {
      this.logger.info(`  Unmatched in Serverless: ${report.summary.unmatched_sls}`);
    }
    if (report.summary.unmatched_cdk) {
      this.logger.info(`  Unmatched in CDK: ${report.summary.unmatched_cdk}`);
    }
  }
}
