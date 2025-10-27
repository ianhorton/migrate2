/**
 * Report Generator
 * Generates JSON and HTML comparison reports
 */

import type {
  ComparisonResult,
  ComparisonReport,
} from '../../types/cloudformation';

/**
 * Generate comparison report from results
 * @param results - Array of comparison results
 * @returns Complete comparison report
 */
export function generateReport(results: ComparisonResult[]): ComparisonReport {
  const timestamp = new Date().toISOString();
  const comparisonId = `comp-${timestamp.split('T')[0]}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Calculate summary statistics
  const summary = {
    total_resources: results.length,
    matched: results.length,
    unmatched_sls: 0,
    unmatched_cdk: 0,
    status: {
      MATCH: results.filter((r) => r.status === 'MATCH').length,
      ACCEPTABLE: results.filter((r) => r.status === 'ACCEPTABLE').length,
      WARNING: results.filter((r) => r.status === 'WARNING').length,
      CRITICAL: results.filter((r) => r.status === 'CRITICAL').length,
    },
  };

  // Determine overall status
  let overall_status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL' = 'MATCH';
  if (summary.status.CRITICAL > 0) {
    overall_status = 'CRITICAL';
  } else if (summary.status.WARNING > 0) {
    overall_status = 'WARNING';
  } else if (summary.status.ACCEPTABLE > 0) {
    overall_status = 'ACCEPTABLE';
  }

  // Identify blocking issues
  const blocking_issues: string[] = [];
  results.forEach((result) => {
    if (result.status === 'CRITICAL') {
      const criticalDiffs = result.differences.filter(
        (d) => d.severity === 'CRITICAL'
      );
      criticalDiffs.forEach((diff) => {
        blocking_issues.push(
          `${result.resourceType} (${result.physicalId}): ${diff.property} mismatch`
        );
      });
    }
  });

  const ready_for_import = blocking_issues.length === 0;

  return {
    comparison_id: comparisonId,
    timestamp,
    summary,
    resources: results,
    overall_status,
    ready_for_import,
    blocking_issues,
  };
}

/**
 * Generate HTML report from comparison report
 * @param report - Comparison report
 * @returns HTML string
 */
export function generateHTMLReport(report: ComparisonReport): string {
  const statusColor = (status: string): string => {
    switch (status) {
      case 'MATCH':
        return 'green';
      case 'ACCEPTABLE':
        return 'blue';
      case 'WARNING':
        return 'orange';
      case 'CRITICAL':
        return 'red';
      default:
        return 'gray';
    }
  };

  const formatValue = (value: any): string => {
    if (value === undefined || value === null) {
      return '<em>undefined</em>';
    }
    if (typeof value === 'object') {
      return `<pre>${JSON.stringify(value, null, 2)}</pre>`;
    }
    return `<code>${String(value)}</code>`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Migration Comparison Report - ${report.comparison_id}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 1200px;
      margin: 20px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .timestamp {
      color: #666;
      font-size: 14px;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary h2 {
      margin-top: 0;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    .stat {
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
      border-left: 4px solid #ddd;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      margin-top: 5px;
    }
    .status-MATCH { color: green; }
    .status-ACCEPTABLE { color: blue; }
    .status-WARNING { color: orange; }
    .status-CRITICAL { color: red; }
    .resource-card {
      background: white;
      border: 1px solid #ddd;
      margin: 20px 0;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .resource-card.critical {
      border-left: 4px solid red;
    }
    .resource-card.warning {
      border-left: 4px solid orange;
    }
    .resource-card.acceptable {
      border-left: 4px solid blue;
    }
    .resource-card.match {
      border-left: 4px solid green;
    }
    .resource-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .resource-title {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
    .resource-type {
      font-size: 14px;
      color: #666;
      font-family: 'Courier New', monospace;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    td, th {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #f9f9f9;
      font-weight: 600;
    }
    .property-diff {
      background: #f5f5f5;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
      border-left: 3px solid #ddd;
    }
    .property-diff.critical {
      border-left-color: red;
      background: #fff5f5;
    }
    .property-diff.warning {
      border-left-color: orange;
      background: #fffaf0;
    }
    .property-diff.acceptable {
      border-left-color: blue;
      background: #f0f8ff;
    }
    .diff-header {
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .severity-badge {
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .severity-CRITICAL {
      background: red;
      color: white;
    }
    .severity-WARNING {
      background: orange;
      color: white;
    }
    .severity-ACCEPTABLE {
      background: blue;
      color: white;
    }
    .value-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 10px 0;
    }
    .value-box {
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .value-label {
      font-size: 11px;
      color: #666;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    pre {
      margin: 5px 0 0 0;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 3px;
      overflow-x: auto;
      font-size: 12px;
    }
    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    .recommendation {
      margin-top: 15px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
      font-weight: 500;
    }
    .blocking-issues {
      background: #fff5f5;
      border: 1px solid #ffcccb;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .blocking-issues h3 {
      margin-top: 0;
      color: red;
    }
    .blocking-issues ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .no-differences {
      color: #666;
      font-style: italic;
      padding: 15px;
      text-align: center;
      background: #f9f9f9;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Serverless to CDK Migration - Comparison Report</h1>
    <div class="timestamp">Generated: ${new Date(
      report.timestamp
    ).toLocaleString()}</div>
    <div class="timestamp">Report ID: ${report.comparison_id}</div>
  </div>

  <div class="summary">
    <h2>Summary</h2>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total Resources</div>
        <div class="stat-value">${report.summary.total_resources}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Matched</div>
        <div class="stat-value status-MATCH">${
          report.summary.status.MATCH
        }</div>
      </div>
      <div class="stat">
        <div class="stat-label">Acceptable</div>
        <div class="stat-value status-ACCEPTABLE">${
          report.summary.status.ACCEPTABLE
        }</div>
      </div>
      <div class="stat">
        <div class="stat-label">Warnings</div>
        <div class="stat-value status-WARNING">${
          report.summary.status.WARNING
        }</div>
      </div>
      <div class="stat">
        <div class="stat-label">Critical</div>
        <div class="stat-value status-CRITICAL">${
          report.summary.status.CRITICAL
        }</div>
      </div>
      <div class="stat">
        <div class="stat-label">Overall Status</div>
        <div class="stat-value status-${report.overall_status}">${
    report.overall_status
  }</div>
      </div>
    </div>

    ${
      !report.ready_for_import
        ? `
    <div class="blocking-issues">
      <h3>⚠️ Blocking Issues</h3>
      <p>The following issues must be resolved before importing:</p>
      <ul>
        ${report.blocking_issues.map((issue) => `<li>${issue}</li>`).join('')}
      </ul>
    </div>
    `
        : '<p style="color: green; font-weight: bold; margin-top: 15px;">✅ Ready for import! No blocking issues detected.</p>'
    }
  </div>

  ${
    report.ready_for_import
      ? `
  <div class="summary">
    <h2>📦 Import Instructions</h2>
    <p>Your CDK stack is ready to import existing AWS resources. The migration tool has generated the necessary import files:</p>

    <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid green;">
      <h3 style="margin-top: 0;">Generated Files</h3>
      <ul>
        <li><strong>import-resources.json</strong> - CDK import resource mapping</li>
        <li><strong>IMPORT_PLAN.md</strong> - Detailed import instructions and troubleshooting</li>
      </ul>
    </div>

    <div style="background: #f0f8ff; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid blue;">
      <h3 style="margin-top: 0;">Option 1: Automatic Import (Recommended)</h3>
      <p>Navigate to your CDK directory and run:</p>
      <pre style="background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 4px;">cd cdk
cdk import --resource-mapping import-resources.json</pre>
      <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
        ℹ️ This command will import ${report.summary.total_resources} resource${report.summary.total_resources !== 1 ? 's' : ''} into your CDK stack without recreating them.
      </p>
    </div>

    <div style="background: #fffaf0; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid orange;">
      <h3 style="margin-top: 0;">Option 2: Review First (Safer)</h3>
      <ol>
        <li>Review the <code>IMPORT_PLAN.md</code> file in your CDK directory</li>
        <li>Verify resource identifiers are correct</li>
        <li>Run the import command from Option 1</li>
      </ol>
    </div>

    ${
      report.summary.status.WARNING > 0 || report.summary.status.ACCEPTABLE > 0
        ? `
    <div style="background: #fff5f5; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid orange;">
      <h3 style="margin-top: 0;">⚠️ Note: Property Differences Detected</h3>
      <p>Some resources have property differences (${
        report.summary.status.WARNING + report.summary.status.ACCEPTABLE
      } resource${
            report.summary.status.WARNING + report.summary.status.ACCEPTABLE !== 1
              ? 's'
              : ''
          }):</p>
      <ul>
        ${
          report.summary.status.WARNING > 0
            ? `<li><strong>${report.summary.status.WARNING} Warning${report.summary.status.WARNING !== 1 ? 's' : ''}</strong> - Review recommended but import should succeed</li>`
            : ''
        }
        ${
          report.summary.status.ACCEPTABLE > 0
            ? `<li><strong>${report.summary.status.ACCEPTABLE} Acceptable difference${report.summary.status.ACCEPTABLE !== 1 ? 's' : ''}</strong> - Expected differences (e.g., CDK-managed values)</li>`
            : ''
        }
      </ul>
      <p style="color: #666; font-size: 14px;">
        These differences won't prevent import. After import, run <code>cdk diff</code> to verify the actual state.
      </p>
    </div>
    `
        : ''
    }

    <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
      <h3 style="margin-top: 0;">What Happens During Import?</h3>
      <ol>
        <li>CDK creates a new CloudFormation stack</li>
        <li>Existing resources are adopted into the stack (no downtime)</li>
        <li>CloudFormation now manages your resources via CDK</li>
        <li>You can use <code>cdk deploy</code> for future updates</li>
      </ol>
    </div>

    <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 15px 0;">
      <h3 style="margin-top: 0;">After Import</h3>
      <ul>
        <li>Run <code>cdk diff</code> to verify no unexpected changes</li>
        <li>Run <code>aws cloudformation drift-detection</code> if needed</li>
        <li>Your Serverless Framework stack can be safely removed: <code>serverless remove</code></li>
      </ul>
    </div>
  </div>
  `
      : `
  <div class="summary">
    <h2>🚫 Import Blocked</h2>
    <p style="color: red; font-weight: bold;">
      Your migration has ${report.blocking_issues.length} blocking issue${report.blocking_issues.length !== 1 ? 's' : ''}
      that must be resolved before importing resources.
    </p>
    <p>Please review the blocking issues above and the resource details below, then re-run the comparison after making necessary changes.</p>
  </div>
  `
  }

  <h2>Resource Details</h2>

  ${report.resources
    .map(
      (r) => `
    <div class="resource-card ${r.status.toLowerCase()}">
      <div class="resource-header">
        <div>
          <div class="resource-title">${r.physicalId}</div>
          <div class="resource-type">${r.resourceType}</div>
        </div>
        <div class="stat-value status-${r.status}">${r.status}</div>
      </div>

      <table>
        <tr><th>Serverless Logical ID</th><td><code>${
          r.slsLogicalId
        }</code></td></tr>
        <tr><th>CDK Logical ID</th><td><code>${r.cdkLogicalId}</code></td></tr>
        <tr><th>Physical ID</th><td><code>${r.physicalId}</code></td></tr>
      </table>

      ${
        r.differences.length > 0
          ? `
        <h4>Differences (${r.differences.length})</h4>
        ${r.differences
          .map(
            (d) => `
          <div class="property-diff ${d.severity.toLowerCase()}">
            <div class="diff-header">
              <strong>${d.property}</strong>
              <span class="severity-badge severity-${d.severity}">${
              d.severity
            }</span>
            </div>
            <div class="value-comparison">
              <div class="value-box">
                <div class="value-label">Serverless</div>
                ${formatValue(d.slsValue)}
              </div>
              <div class="value-box">
                <div class="value-label">CDK</div>
                ${formatValue(d.cdkValue)}
              </div>
            </div>
            <p><em>${d.explanation}</em></p>
            ${
              d.autoFixable
                ? '<p style="color: blue;">💡 Auto-fixable: This can be automatically corrected.</p>'
                : ''
            }
          </div>
        `
          )
          .join('')}
      `
          : '<div class="no-differences">No differences detected</div>'
      }

      <div class="recommendation">
        <strong>Recommendation:</strong> ${r.recommendation}
      </div>
    </div>
  `
    )
    .join('')}

</body>
</html>
  `.trim();
}
