/**
 * ManualReviewReport
 * Sprint 2: Template Analysis
 *
 * Generates comprehensive reports for human review
 */

import * as fs from 'fs/promises';
import type { ComparisonResult } from '../../types/cloudformation';
import type {
  DifferenceClassification,
  ClassificationSummary,
} from '../analysis/difference-analyzer';
import type { ConfidenceScore } from '../analysis/confidence-scoring';

export interface ReviewReportData {
  migrationId: string;
  timestamp: Date;
  resources: Array<{
    logicalId: string;
    resourceType: string;
    physicalId?: string;
    comparisonResult: ComparisonResult;
    classifications: DifferenceClassification[];
    confidenceScore: ConfidenceScore;
  }>;
  summary: ClassificationSummary;
  overallConfidence: ConfidenceScore;
}

/**
 * ManualReviewReport class
 */
export class ManualReviewReport {
  /**
   * Generate HTML report for manual review
   */
  generateHTMLReport(data: ReviewReportData): string {
    const resourcesRequiringReview = data.resources.filter(
      (r) => r.confidenceScore.recommendation !== 'auto-proceed'
    );

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Migration Manual Review Report - ${data.migrationId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #2c3e50; margin-bottom: 10px; font-size: 32px; }
    h2 { color: #34495e; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h3 { color: #34495e; margin-top: 30px; margin-bottom: 15px; font-size: 20px; }
    .meta { color: #7f8c8d; margin-bottom: 30px; font-size: 14px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .summary-card { background: #ecf0f1; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db; }
    .summary-card h4 { font-size: 14px; color: #7f8c8d; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 36px; font-weight: bold; color: #2c3e50; }
    .summary-card .subtitle { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
    .confidence { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; }
    .confidence.high { background: #d4edda; color: #155724; }
    .confidence.medium { background: #fff3cd; color: #856404; }
    .confidence.low { background: #f8d7da; color: #721c24; }
    .resource { background: #f8f9fa; padding: 25px; margin-bottom: 25px; border-radius: 8px; border-left: 4px solid #95a5a6; }
    .resource.critical { border-left-color: #e74c3c; }
    .resource.warning { border-left-color: #f39c12; }
    .resource.acceptable { border-left-color: #2ecc71; }
    .resource-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; }
    .resource-title { font-size: 20px; font-weight: 600; color: #2c3e50; }
    .resource-type { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 10px; }
    .badge.critical { background: #e74c3c; color: white; }
    .badge.warning { background: #f39c12; color: white; }
    .badge.acceptable { background: #2ecc71; color: white; }
    .differences { margin-top: 20px; }
    .difference { background: white; padding: 15px; margin-bottom: 10px; border-radius: 4px; border-left: 3px solid #95a5a6; }
    .difference.critical { border-left-color: #e74c3c; background: #fef5f5; }
    .difference.warning { border-left-color: #f39c12; background: #fffef5; }
    .difference.acceptable { border-left-color: #2ecc71; background: #f5fef5; }
    .difference-property { font-weight: 600; color: #2c3e50; margin-bottom: 8px; }
    .difference-values { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 10px 0; }
    .value-box { background: #ecf0f1; padding: 10px; border-radius: 4px; }
    .value-label { font-size: 11px; text-transform: uppercase; color: #7f8c8d; margin-bottom: 5px; letter-spacing: 0.5px; }
    .value-content { font-family: 'Courier New', monospace; font-size: 13px; color: #2c3e50; word-break: break-all; }
    .explanation { font-size: 14px; color: #555; line-height: 1.5; margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 4px; }
    .recommendation { background: #e8f4fd; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db; margin-top: 15px; }
    .recommendation-title { font-weight: 600; color: #2c3e50; margin-bottom: 10px; }
    .factors { margin-top: 20px; }
    .factor { display: flex; align-items: center; padding: 10px; margin-bottom: 8px; background: white; border-radius: 4px; }
    .factor-name { flex: 1; font-weight: 500; color: #2c3e50; }
    .factor-impact { width: 100px; text-align: right; font-weight: 600; }
    .factor-desc { flex: 2; color: #7f8c8d; font-size: 14px; }
    .no-issues { text-align: center; padding: 60px 20px; color: #7f8c8d; }
    .no-issues .icon { font-size: 64px; margin-bottom: 20px; }
    code { background: #ecf0f1; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Migration Manual Review Report</h1>
    <div class="meta">
      Migration ID: <strong>${data.migrationId}</strong> |
      Generated: <strong>${data.timestamp.toLocaleString()}</strong>
    </div>

    <h2>Summary</h2>
    <div class="summary">
      <div class="summary-card">
        <h4>Overall Confidence</h4>
        <div class="value">${(data.overallConfidence.overall * 100).toFixed(0)}%</div>
        <div class="subtitle">
          <span class="confidence ${this.getConfidenceClass(data.overallConfidence.overall)}">
            ${data.overallConfidence.recommendation.toUpperCase().replace(/-/g, ' ')}
          </span>
        </div>
      </div>
      <div class="summary-card">
        <h4>Total Resources</h4>
        <div class="value">${data.resources.length}</div>
        <div class="subtitle">${resourcesRequiringReview.length} require review</div>
      </div>
      <div class="summary-card">
        <h4>Critical Issues</h4>
        <div class="value">${data.summary.critical}</div>
        <div class="subtitle">Must be resolved</div>
      </div>
      <div class="summary-card">
        <h4>Warnings</h4>
        <div class="value">${data.summary.warning}</div>
        <div class="subtitle">Review recommended</div>
      </div>
    </div>

    ${this.generateOverallRecommendation(data)}

    ${resourcesRequiringReview.length > 0 ? this.generateResourcesSection(resourcesRequiringReview) : this.generateNoIssuesSection()}
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generate terminal-friendly summary with colors
   */
  generateTerminalSummary(data: ReviewReportData): string {
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    const resourcesRequiringReview = data.resources.filter(
      (r) => r.confidenceScore.recommendation !== 'auto-proceed'
    );

    let output = '\n';
    output += `${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`;
    output += `${colors.bright}  Migration Manual Review Report${colors.reset}\n`;
    output += `${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n\n`;

    // Summary
    output += `${colors.bright}Summary${colors.reset}\n`;
    output += `${colors.gray}${'─'.repeat(60)}${colors.reset}\n`;
    output += `  Total Resources: ${colors.bright}${data.resources.length}${colors.reset}\n`;
    output += `  Require Review:  ${colors.yellow}${resourcesRequiringReview.length}${colors.reset}\n`;
    output += `  Critical Issues: ${colors.red}${data.summary.critical}${colors.reset}\n`;
    output += `  Warnings:        ${colors.yellow}${data.summary.warning}${colors.reset}\n`;
    output += `  Acceptable:      ${colors.green}${data.summary.acceptable}${colors.reset}\n`;
    output += `\n`;
    output += `  Overall Confidence: ${this.formatConfidenceTerminal(data.overallConfidence.overall, colors)}\n`;
    output += `  Recommendation:     ${this.formatRecommendationTerminal(data.overallConfidence.recommendation, colors)}\n`;
    output += `\n`;

    // Overall reasoning
    output += `${colors.gray}${data.overallConfidence.reasoning}${colors.reset}\n\n`;

    if (resourcesRequiringReview.length === 0) {
      output += `${colors.green}✓ No resources require manual review${colors.reset}\n\n`;
      return output;
    }

    // Resources requiring review
    output += `${colors.bright}Resources Requiring Review${colors.reset}\n`;
    output += `${colors.gray}${'─'.repeat(60)}${colors.reset}\n\n`;

    resourcesRequiringReview.forEach((resource, index) => {
      const criticalDiffs = resource.classifications.filter(
        (c) => c.category === 'critical'
      );
      const warningDiffs = resource.classifications.filter(
        (c) => c.category === 'warning'
      );

      output += `${colors.bright}${index + 1}. ${resource.logicalId}${colors.reset} ${colors.gray}(${resource.resourceType})${colors.reset}\n`;
      output += `   Physical ID: ${resource.physicalId || colors.gray + 'Unknown' + colors.reset}\n`;
      output += `   Confidence:  ${this.formatConfidenceTerminal(resource.confidenceScore.overall, colors)}\n`;
      output += `   Status:      ${this.formatStatusTerminal(resource.comparisonResult.status, colors)}\n`;
      output += `\n`;

      if (criticalDiffs.length > 0) {
        output += `   ${colors.red}❌ Critical Issues:${colors.reset}\n`;
        criticalDiffs.forEach((diff) => {
          output += `      • ${diff.difference.property}: ${diff.explanation}\n`;
        });
        output += `\n`;
      }

      if (warningDiffs.length > 0) {
        output += `   ${colors.yellow}⚠️  Warnings:${colors.reset}\n`;
        warningDiffs.forEach((diff) => {
          output += `      • ${diff.difference.property}: ${diff.explanation}\n`;
        });
        output += `\n`;
      }

      output += `   ${colors.gray}Recommendation: ${resource.confidenceScore.reasoning}${colors.reset}\n`;
      output += `\n`;
    });

    return output;
  }

  /**
   * Export to JSON for programmatic processing
   */
  exportToJSON(data: ReviewReportData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export to Markdown
   */
  exportToMarkdown(data: ReviewReportData): string {
    const resourcesRequiringReview = data.resources.filter(
      (r) => r.confidenceScore.recommendation !== 'auto-proceed'
    );

    let md = `# Migration Manual Review Report\n\n`;
    md += `**Migration ID:** ${data.migrationId}  \n`;
    md += `**Generated:** ${data.timestamp.toISOString()}\n\n`;

    md += `## Summary\n\n`;
    md += `- **Total Resources:** ${data.resources.length}\n`;
    md += `- **Require Review:** ${resourcesRequiringReview.length}\n`;
    md += `- **Critical Issues:** ${data.summary.critical}\n`;
    md += `- **Warnings:** ${data.summary.warning}\n`;
    md += `- **Acceptable:** ${data.summary.acceptable}\n`;
    md += `- **Overall Confidence:** ${(data.overallConfidence.overall * 100).toFixed(0)}%\n`;
    md += `- **Recommendation:** ${data.overallConfidence.recommendation}\n\n`;

    md += `### Overall Assessment\n\n`;
    md += `${data.overallConfidence.reasoning}\n\n`;

    if (resourcesRequiringReview.length === 0) {
      md += `✅ No resources require manual review.\n\n`;
      return md;
    }

    md += `## Resources Requiring Review\n\n`;

    resourcesRequiringReview.forEach((resource, index) => {
      const criticalDiffs = resource.classifications.filter(
        (c) => c.category === 'critical'
      );
      const warningDiffs = resource.classifications.filter(
        (c) => c.category === 'warning'
      );

      md += `### ${index + 1}. ${resource.logicalId}\n\n`;
      md += `- **Resource Type:** ${resource.resourceType}\n`;
      md += `- **Physical ID:** ${resource.physicalId || 'Unknown'}\n`;
      md += `- **Confidence:** ${(resource.confidenceScore.overall * 100).toFixed(0)}%\n`;
      md += `- **Status:** ${resource.comparisonResult.status}\n\n`;

      if (criticalDiffs.length > 0) {
        md += `#### ❌ Critical Issues\n\n`;
        criticalDiffs.forEach((diff) => {
          md += `- **${diff.difference.property}**\n`;
          md += `  - Serverless: \`${JSON.stringify(diff.difference.slsValue)}\`\n`;
          md += `  - CDK: \`${JSON.stringify(diff.difference.cdkValue)}\`\n`;
          md += `  - ${diff.explanation}\n\n`;
        });
      }

      if (warningDiffs.length > 0) {
        md += `#### ⚠️ Warnings\n\n`;
        warningDiffs.forEach((diff) => {
          md += `- **${diff.difference.property}**\n`;
          md += `  - Serverless: \`${JSON.stringify(diff.difference.slsValue)}\`\n`;
          md += `  - CDK: \`${JSON.stringify(diff.difference.cdkValue)}\`\n`;
          md += `  - ${diff.explanation}\n\n`;
        });
      }

      md += `**Recommendation:** ${resource.confidenceScore.reasoning}\n\n`;
      md += `---\n\n`;
    });

    return md;
  }

  /**
   * Save report to file
   */
  async saveReport(
    data: ReviewReportData,
    outputPath: string,
    format: 'html' | 'json' | 'markdown' = 'html'
  ): Promise<void> {
    let content: string;

    switch (format) {
      case 'html':
        content = this.generateHTMLReport(data);
        break;
      case 'json':
        content = this.exportToJSON(data);
        break;
      case 'markdown':
        content = this.exportToMarkdown(data);
        break;
    }

    await fs.writeFile(outputPath, content, 'utf-8');
  }

  // Helper methods for HTML generation
  private getConfidenceClass(score: number): string {
    if (score >= 0.9) return 'high';
    if (score >= 0.7) return 'medium';
    return 'low';
  }

  private generateOverallRecommendation(data: ReviewReportData): string {
    const icon = data.overallConfidence.overall >= 0.9 ? '✅' : data.overallConfidence.overall >= 0.7 ? '⚠️' : '❌';
    return `
    <div class="recommendation">
      <div class="recommendation-title">${icon} ${data.overallConfidence.recommendation.toUpperCase().replace(/-/g, ' ')}</div>
      <p>${data.overallConfidence.reasoning}</p>
      <div class="factors">
        <h4>Confidence Factors:</h4>
        ${data.overallConfidence.factors.map((f) => `
          <div class="factor">
            <div class="factor-name">${f.factor}</div>
            <div class="factor-impact">${(f.impact * 100).toFixed(0)}%</div>
            <div class="factor-desc">${f.description}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  private generateResourcesSection(resources: Array<any>): string {
    return `
    <h2>Resources Requiring Review (${resources.length})</h2>
    ${resources.map((r) => this.generateResourceHTML(r)).join('')}`;
  }

  private generateResourceHTML(resource: any): string {
    const statusClass = resource.comparisonResult.status.toLowerCase();
    const criticalDiffs = resource.classifications.filter((c: any) => c.category === 'critical');
    const warningDiffs = resource.classifications.filter((c: any) => c.category === 'warning');

    return `
    <div class="resource ${statusClass}">
      <div class="resource-header">
        <div>
          <div class="resource-title">
            ${resource.logicalId}
            <span class="badge ${statusClass}">${resource.comparisonResult.status}</span>
          </div>
          <div class="resource-type">${resource.resourceType}</div>
          <div class="resource-type">Physical ID: ${resource.physicalId || '<em>Unknown</em>'}</div>
        </div>
        <div>
          <span class="confidence ${this.getConfidenceClass(resource.confidenceScore.overall)}">
            ${(resource.confidenceScore.overall * 100).toFixed(0)}% Confidence
          </span>
        </div>
      </div>

      ${criticalDiffs.length > 0 ? `
        <div class="differences">
          <h4>❌ Critical Issues (${criticalDiffs.length})</h4>
          ${criticalDiffs.map((d: any) => this.generateDifferenceHTML(d)).join('')}
        </div>
      ` : ''}

      ${warningDiffs.length > 0 ? `
        <div class="differences">
          <h4>⚠️ Warnings (${warningDiffs.length})</h4>
          ${warningDiffs.map((d: any) => this.generateDifferenceHTML(d)).join('')}
        </div>
      ` : ''}

      <div class="recommendation">
        <div class="recommendation-title">Recommendation</div>
        <p>${resource.confidenceScore.reasoning}</p>
      </div>
    </div>`;
  }

  private generateDifferenceHTML(diff: DifferenceClassification): string {
    return `
    <div class="difference ${diff.category}">
      <div class="difference-property">${diff.difference.property}</div>
      <div class="difference-values">
        <div class="value-box">
          <div class="value-label">Serverless Template</div>
          <div class="value-content">${this.formatValue(diff.difference.slsValue)}</div>
        </div>
        <div class="value-box">
          <div class="value-label">CDK Template</div>
          <div class="value-content">${this.formatValue(diff.difference.cdkValue)}</div>
        </div>
      </div>
      <div class="explanation">
        <strong>${diff.category.toUpperCase()}:</strong> ${diff.explanation}
        ${diff.autoResolvable ? ' <em>(Auto-resolvable)</em>' : ''}
      </div>
    </div>`;
  }

  private generateNoIssuesSection(): string {
    return `
    <div class="no-issues">
      <div class="icon">✅</div>
      <h2>No Issues Found</h2>
      <p>All resources passed validation with no critical issues or warnings.</p>
    </div>`;
  }

  private formatValue(value: any): string {
    if (value === undefined) return '<em>undefined</em>';
    if (value === null) return '<em>null</em>';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  // Terminal formatting helpers
  private formatConfidenceTerminal(score: number, colors: any): string {
    const percentage = `${(score * 100).toFixed(0)}%`;
    if (score >= 0.9) return `${colors.green}${percentage}${colors.reset}`;
    if (score >= 0.7) return `${colors.yellow}${percentage}${colors.reset}`;
    return `${colors.red}${percentage}${colors.reset}`;
  }

  private formatRecommendationTerminal(recommendation: string, colors: any): string {
    const text = recommendation.toUpperCase().replace(/-/g, ' ');
    if (recommendation === 'auto-proceed') return `${colors.green}${text}${colors.reset}`;
    if (recommendation === 'review-recommended') return `${colors.yellow}${text}${colors.reset}`;
    return `${colors.red}${text}${colors.reset}`;
  }

  private formatStatusTerminal(status: string, colors: any): string {
    if (status === 'MATCH') return `${colors.green}${status}${colors.reset}`;
    if (status === 'ACCEPTABLE') return `${colors.green}${status}${colors.reset}`;
    if (status === 'WARNING') return `${colors.yellow}${status}${colors.reset}`;
    return `${colors.red}${status}${colors.reset}`;
  }
}
