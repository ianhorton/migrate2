# Comparator Module Usage Examples

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Advanced Features](#advanced-features)
3. [Integration Examples](#integration-examples)
4. [Error Handling](#error-handling)
5. [Testing Examples](#testing-examples)

---

## Basic Usage

### Simple Template Comparison

```typescript
import { Comparator } from './src/modules/comparator';

async function basicComparison() {
  const comparator = new Comparator();

  // Compare templates
  const report = await comparator.compareTemplates(
    '.serverless/cloudformation-template-update-stack.json',
    'cdk.out/CdkMigrationStack.template.json'
  );

  // Check results
  console.log(`Overall Status: ${report.overall_status}`);
  console.log(`Ready for Import: ${report.ready_for_import}`);
  console.log(`Total Resources: ${report.summary.total_resources}`);
  console.log(`Matched: ${report.summary.matched}`);
  console.log(`Critical Issues: ${report.summary.status.CRITICAL}`);
}
```

### Generate Reports

```typescript
async function generateReports() {
  const comparator = new Comparator();

  const report = await comparator.compareTemplates(
    'sls-template.json',
    'cdk-template.json'
  );

  // Save both JSON and HTML
  await comparator.saveReport(report, './reports/comparison', 'both');
  console.log('Reports saved to:');
  console.log('  - ./reports/comparison.json');
  console.log('  - ./reports/comparison.html');
}
```

### Quick Validation

```typescript
async function quickValidation() {
  const comparator = new Comparator();

  const { ready, issues } = await comparator.validateForImport(
    'sls-template.json',
    'cdk-template.json'
  );

  if (ready) {
    console.log('✅ Templates are ready for import');
    return true;
  } else {
    console.error('❌ Cannot proceed with import:');
    issues.forEach((issue) => console.error(`  - ${issue}`));
    return false;
  }
}
```

---

## Advanced Features

### Include Unmatched Resources

```typescript
async function compareWithUnmatched() {
  const comparator = new Comparator();

  const report = await comparator.compareTemplates(
    'sls-template.json',
    'cdk-template.json',
    { includeUnmatched: true }
  );

  console.log(`Unmatched in Serverless: ${report.summary.unmatched_sls}`);
  console.log(`Unmatched in CDK: ${report.summary.unmatched_cdk}`);
}
```

### Custom Report Analysis

```typescript
async function analyzeReport() {
  const comparator = new Comparator();

  const report = await comparator.compareTemplates(
    'sls-template.json',
    'cdk-template.json'
  );

  // Find resources with critical issues
  const criticalResources = report.resources.filter(
    (r) => r.status === 'CRITICAL'
  );

  console.log(`\nCritical Issues (${criticalResources.length}):`);
  criticalResources.forEach((resource) => {
    console.log(`\n${resource.resourceType}: ${resource.physicalId}`);
    resource.differences
      .filter((d) => d.severity === 'CRITICAL')
      .forEach((diff) => {
        console.log(`  - ${diff.property}: ${diff.explanation}`);
        console.log(`    SLS: ${JSON.stringify(diff.slsValue)}`);
        console.log(`    CDK: ${JSON.stringify(diff.cdkValue)}`);
      });
  });

  // Find auto-fixable issues
  const autoFixable = report.resources.flatMap((r) =>
    r.differences.filter((d) => d.autoFixable)
  );

  console.log(`\nAuto-fixable Issues: ${autoFixable.length}`);
}
```

### Property-Level Comparison

```typescript
import { compareProperties } from './src/modules/comparator/property-comparator';

function compareResourceProperties() {
  const slsProps = {
    TableName: 'my-table',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  };

  const cdkProps = {
    TableName: 'my-table',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
  };

  const differences = compareProperties(
    slsProps,
    cdkProps,
    'AWS::DynamoDB::Table'
  );

  differences.forEach((diff) => {
    console.log(`${diff.property}: ${diff.severity}`);
    console.log(`  ${diff.explanation}`);
  });
}
```

---

## Integration Examples

### CLI Integration

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { Comparator } from './src/modules/comparator';

const program = new Command();

program
  .name('sls-to-cdk-compare')
  .description('Compare Serverless and CDK CloudFormation templates')
  .version('1.0.0');

program
  .command('compare')
  .description('Compare two CloudFormation templates')
  .requiredOption('--sls <path>', 'Path to Serverless template')
  .requiredOption('--cdk <path>', 'Path to CDK template')
  .option('--output <path>', 'Output path for reports')
  .option('--format <format>', 'Report format: json, html, or both', 'both')
  .option('--include-unmatched', 'Include unmatched resources')
  .action(async (options) => {
    const comparator = new Comparator();

    console.log('🔍 Comparing templates...\n');

    const report = await comparator.compareTemplates(
      options.sls,
      options.cdk,
      { includeUnmatched: options.includeUnmatched }
    );

    // Display summary
    console.log(`Status: ${report.overall_status}`);
    console.log(`Ready for Import: ${report.ready_for_import ? '✅' : '❌'}`);
    console.log(`\nResources:`);
    console.log(`  Total: ${report.summary.total_resources}`);
    console.log(`  Match: ${report.summary.status.MATCH}`);
    console.log(`  Acceptable: ${report.summary.status.ACCEPTABLE}`);
    console.log(`  Warning: ${report.summary.status.WARNING}`);
    console.log(`  Critical: ${report.summary.status.CRITICAL}`);

    // Save report
    if (options.output) {
      await comparator.saveReport(report, options.output, options.format);
      console.log(`\n📊 Report saved to: ${options.output}`);
    }

    // Exit with error if not ready
    process.exit(report.ready_for_import ? 0 : 1);
  });

program.parse();
```

### Migration Orchestrator Integration

```typescript
import { Comparator } from './src/modules/comparator';
import { MigrationState } from './src/types/migration';

class MigrationOrchestrator {
  private comparator: Comparator;

  constructor() {
    this.comparator = new Comparator();
  }

  async executeCompareStep(state: MigrationState): Promise<void> {
    console.log('📋 Step 4/9: Comparing Templates');

    const report = await this.comparator.compareTemplates(
      `${state.serverlessPath}/.serverless/cloudformation-template-update-stack.json`,
      `${state.cdkPath}/cdk.out/${state.cdkStackName}.template.json`
    );

    // Save report
    const reportPath = `${state.cdkPath}/migration-comparison`;
    await this.comparator.saveReport(report, reportPath, 'both');
    console.log(`📊 Comparison report: ${reportPath}.html`);

    // Display summary
    this.displayComparisonSummary(report);

    // Check for blocking issues
    if (!report.ready_for_import) {
      console.error('\n❌ Template comparison found blocking issues:');
      report.blocking_issues.forEach((issue) => {
        console.error(`  - ${issue}`);
      });

      throw new Error(
        'Fix critical issues in CDK code and re-run comparison'
      );
    }

    console.log('\n✅ Templates are ready for import');

    // Store in state
    state.comparisonReport = report;
  }

  private displayComparisonSummary(report: ComparisonReport): void {
    report.resources.forEach((resource) => {
      const icon = this.getStatusIcon(resource.status);
      console.log(
        `\n${icon} ${resource.resourceType}: ${resource.physicalId}`
      );

      if (resource.differences.length > 0) {
        resource.differences.forEach((diff) => {
          const severity = this.getSeverityIcon(diff.severity);
          console.log(`  ${severity} ${diff.property}: ${diff.explanation}`);
        });
      }
    });
  }

  private getStatusIcon(status: string): string {
    const icons = {
      MATCH: '✅',
      ACCEPTABLE: '✅',
      WARNING: '⚠️ ',
      CRITICAL: '❌',
    };
    return icons[status] || '❓';
  }

  private getSeverityIcon(severity: string): string {
    const icons = {
      CRITICAL: '🔴',
      WARNING: '🟠',
      ACCEPTABLE: '🔵',
      INFO: 'ℹ️ ',
    };
    return icons[severity] || '⚪';
  }
}
```

### CI/CD Pipeline Integration

```typescript
// GitHub Actions workflow example
import { Comparator } from './src/modules/comparator';

async function cicdValidation() {
  const comparator = new Comparator();

  try {
    // Compare templates
    const report = await comparator.compareTemplates(
      process.env.SLS_TEMPLATE_PATH,
      process.env.CDK_TEMPLATE_PATH
    );

    // Save reports as artifacts
    await comparator.saveReport(report, './artifacts/comparison', 'both');

    // Post summary as GitHub comment
    const summary = generateGitHubSummary(report);
    console.log(summary);

    // Fail if critical issues
    if (!report.ready_for_import) {
      core.setFailed('Critical template differences detected');
      process.exit(1);
    }

    core.setOutput('comparison-status', report.overall_status);
  } catch (error) {
    core.setFailed(`Comparison failed: ${error.message}`);
    process.exit(1);
  }
}

function generateGitHubSummary(report: ComparisonReport): string {
  const icon = report.ready_for_import ? '✅' : '❌';

  return `
## ${icon} Template Comparison Results

**Status**: ${report.overall_status}
**Ready for Import**: ${report.ready_for_import ? 'Yes' : 'No'}

### Summary
- Total Resources: ${report.summary.total_resources}
- Match: ${report.summary.status.MATCH}
- Acceptable: ${report.summary.status.ACCEPTABLE}
- Warning: ${report.summary.status.WARNING}
- Critical: ${report.summary.status.CRITICAL}

${
  report.blocking_issues.length > 0
    ? `
### Blocking Issues
${report.blocking_issues.map((issue) => `- ${issue}`).join('\n')}
`
    : ''
}

📊 [View Full Report](./artifacts/comparison.html)
  `;
}
```

---

## Error Handling

### Graceful Error Handling

```typescript
async function robustComparison() {
  const comparator = new Comparator();

  try {
    // Attempt to load templates
    const report = await comparator.compareTemplates(
      'sls-template.json',
      'cdk-template.json'
    );

    return report;
  } catch (error) {
    if (error.message.includes('ENOENT')) {
      console.error('❌ Template file not found');
      console.error('  Make sure both templates exist');
    } else if (error.message.includes('Failed to parse')) {
      console.error('❌ Invalid JSON in template');
      console.error('  Check template syntax');
    } else if (error.message.includes('missing Resources')) {
      console.error('❌ Invalid CloudFormation template');
      console.error('  Template must have Resources section');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }

    throw error;
  }
}
```

### Retry Logic

```typescript
async function compareWithRetry(maxRetries = 3) {
  const comparator = new Comparator();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const report = await comparator.compareTemplates(
        'sls-template.json',
        'cdk-template.json'
      );

      return report;
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

---

## Testing Examples

### Unit Test Example

```typescript
import { Comparator } from '../src/modules/comparator';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Comparator', () => {
  let comparator: Comparator;
  let tempDir: string;

  beforeEach(async () => {
    comparator = new Comparator();
    tempDir = path.join(process.cwd(), 'test-temp');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should compare identical templates', async () => {
    const template = {
      Resources: {
        MyTable: {
          Type: 'AWS::DynamoDB::Table',
          Properties: { TableName: 'my-table' },
        },
      },
    };

    const slsPath = path.join(tempDir, 'sls.json');
    const cdkPath = path.join(tempDir, 'cdk.json');

    await fs.writeFile(slsPath, JSON.stringify(template));
    await fs.writeFile(cdkPath, JSON.stringify(template));

    const report = await comparator.compareTemplates(slsPath, cdkPath);

    expect(report.overall_status).toBe('MATCH');
    expect(report.ready_for_import).toBe(true);
  });
});
```

### Integration Test Example

```typescript
describe('Full Migration Workflow', () => {
  it('should successfully compare real templates', async () => {
    const comparator = new Comparator();

    // Use real templates from fixtures
    const report = await comparator.compareTemplates(
      'fixtures/serverless-template.json',
      'fixtures/cdk-template.json'
    );

    // Verify report structure
    expect(report.comparison_id).toBeDefined();
    expect(report.timestamp).toBeDefined();
    expect(report.resources).toBeInstanceOf(Array);

    // Verify each resource has required fields
    report.resources.forEach((resource) => {
      expect(resource.resourceType).toBeDefined();
      expect(resource.physicalId).toBeDefined();
      expect(resource.status).toMatch(/^(MATCH|ACCEPTABLE|WARNING|CRITICAL)$/);
      expect(resource.recommendation).toBeDefined();
    });
  });
});
```

---

## Best Practices

### 1. Always Check Ready Status

```typescript
const { ready, issues } = await comparator.validateForImport(sls, cdk);
if (!ready) {
  // Handle issues before proceeding
  console.error('Fix these issues:', issues);
  return;
}
```

### 2. Save Reports for Audit Trail

```typescript
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
await comparator.saveReport(
  report,
  `./audit/comparison-${timestamp}`,
  'both'
);
```

### 3. Use Unmatched Resources for Discovery

```typescript
const report = await comparator.compareTemplates(sls, cdk, {
  includeUnmatched: true,
});

if (report.summary.unmatched_sls > 0) {
  console.warn('Some SLS resources not found in CDK');
}
```

### 4. Analyze Differences Programmatically

```typescript
const warnings = report.resources
  .filter((r) => r.status === 'WARNING')
  .map((r) => ({
    resource: r.physicalId,
    issues: r.differences.map((d) => d.property),
  }));

console.log('Review these warnings:', warnings);
```

---

## Conclusion

The Comparator Module provides a comprehensive solution for automated CloudFormation template comparison. Use these examples as a starting point for integrating the comparator into your migration workflow.

For more information, see:
- [Implementation Summary](./comparator-implementation-summary.md)
- [Design Document](./design.md)
- [API Documentation](../src/modules/comparator/README.md)
