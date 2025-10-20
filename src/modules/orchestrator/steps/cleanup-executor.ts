/**
 * Cleanup Step Executor
 * Optional cleanup of old Serverless stack and temporary files
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import * as AWS from 'aws-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

interface CleanupResult {
  serverlessStackRemoved: boolean;
  tempFilesRemoved: string[];
  backupCreated: boolean;
  backupPath?: string;
  summary: string;
}

export class CleanupExecutor extends BaseStepExecutor {
  private cloudformation: AWS.CloudFormation;

  constructor() {
    super(MigrationStep.COMPLETE);
    this.cloudformation = new AWS.CloudFormation();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Cleanup can run after verification
    const verifyResult = state.stepResults[MigrationStep.VERIFICATION];

    if (!verifyResult) {
      this.logger.warn('Verification step not completed - cleanup may be risky');
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<CleanupResult> {
    this.logger.info('Starting cleanup...');

    const { sourceDir, region, backupEnabled, autoApprove } = state.config;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    const tempFilesRemoved: string[] = [];
    let serverlessStackRemoved = false;
    let backupCreated = false;
    let backupPath: string | undefined;

    // Step 1: Create backup if enabled
    if (backupEnabled) {
      this.logger.info('Creating migration backup...');
      backupPath = await this.createMigrationBackup(state);
      backupCreated = true;
      this.logger.info(`✓ Backup created: ${backupPath}`);
    }

    // Step 2: Remove temporary CloudFormation templates
    this.logger.info('Cleaning up temporary files...');

    const tempFiles = [
      path.join(sourceDir, '.serverless', 'cloudformation-template-scan.json'),
      path.join(sourceDir, '.serverless', 'cloudformation-template-protected.json'),
      path.join(sourceDir, '.serverless', 'cloudformation-template-removed.json'),
    ];

    for (const filePath of tempFiles) {
      try {
        await fs.unlink(filePath);
        tempFilesRemoved.push(filePath);
        this.logger.info(`  ✓ Removed: ${path.basename(filePath)}`);
      } catch (error) {
        // File might not exist, which is fine
        this.logger.debug(`Could not remove ${filePath}`);
      }
    }

    // Step 3: Optional - Remove old Serverless stack
    if (!state.config.dryRun && autoApprove) {
      this.logger.info('Removing old Serverless stack...');
      this.logger.warn('⚠️  This will delete the Serverless CloudFormation stack');
      this.logger.warn('Resources with DeletionPolicy: Retain will NOT be deleted');

      try {
        // Use serverless remove command
        execSync('serverless remove', {
          cwd: sourceDir,
          stdio: 'inherit'
        });

        serverlessStackRemoved = true;
        this.logger.info('✓ Serverless stack removed');
      } catch (error) {
        this.logger.error('Failed to remove Serverless stack', error);
        this.logger.warn('You may need to manually delete the stack from AWS Console');
      }
    } else if (state.config.dryRun) {
      this.logger.info('Skipping Serverless stack removal (dry-run mode)');
    } else {
      this.logger.info('Skipping Serverless stack removal (not auto-approved)');
      this.logger.info('You can manually remove it later with: serverless remove');
    }

    // Step 4: Generate migration summary report
    const summaryPath = await this.generateMigrationSummary(state);
    this.logger.info(`\n📄 Migration summary saved to: ${summaryPath}`);

    // Create result summary
    const summary = this.createSummary(
      serverlessStackRemoved,
      tempFilesRemoved.length,
      backupCreated,
      state
    );

    const result: CleanupResult = {
      serverlessStackRemoved,
      tempFilesRemoved,
      backupCreated,
      backupPath,
      summary
    };

    this.logger.info('\n' + summary);
    this.logger.info('\n✅ Migration cleanup completed');

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    this.logger.warn('Rolling back cleanup...');

    // Restore from backup if it was created
    const result = state.stepResults[MigrationStep.COMPLETE];

    if (result?.data?.backupPath) {
      this.logger.info(`Backup available at: ${result.data.backupPath}`);
      this.logger.info('Manual restoration may be required');
    }
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.COMPLETE];

    // Check 1: Backup created (if enabled)
    if (state.config.backupEnabled) {
      const backupCreated = result?.data?.backupCreated || false;
      checks.push({
        name: 'backup-created',
        passed: backupCreated,
        message: backupCreated
          ? 'Migration backup created successfully'
          : 'Backup creation failed',
        severity: 'warning' as const
      });
    }

    // Check 2: Temp files cleaned
    if (result?.data?.tempFilesRemoved) {
      const count = result.data.tempFilesRemoved.length;
      checks.push({
        name: 'temp-files-cleaned',
        passed: true,
        message: `Removed ${count} temporary files`,
        severity: 'info' as const
      });
    }

    // Check 3: Old stack status
    if (state.config.autoApprove && !state.config.dryRun) {
      const stackRemoved = result?.data?.serverlessStackRemoved || false;
      checks.push({
        name: 'old-stack-removed',
        passed: stackRemoved,
        message: stackRemoved
          ? 'Old Serverless stack removed'
          : 'Failed to remove old Serverless stack',
        severity: 'warning' as const
      });
    } else {
      checks.push({
        name: 'old-stack-removed',
        passed: true,
        message: 'Old stack removal skipped',
        severity: 'info' as const
      });
    }

    // Check 4: Summary generated
    checks.push({
      name: 'summary-generated',
      passed: true,
      message: 'Migration summary report generated',
      severity: 'info' as const
    });

    return checks;
  }

  private async createMigrationBackup(state: MigrationState): Promise<string> {
    const { sourceDir } = state.config;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(sourceDir, '.migration-backup', timestamp);

    await fs.mkdir(backupDir, { recursive: true });

    // Backup serverless.yml
    const serverlessPath = path.join(sourceDir, 'serverless.yml');
    try {
      const content = await fs.readFile(serverlessPath, 'utf-8');
      await fs.writeFile(path.join(backupDir, 'serverless.yml'), content);
    } catch (error) {
      this.logger.warn('Could not backup serverless.yml');
    }

    // Backup migration state
    const stateContent = JSON.stringify(state, null, 2);
    await fs.writeFile(path.join(backupDir, 'migration-state.json'), stateContent);

    // Backup .serverless directory
    const serverlessDir = path.join(sourceDir, '.serverless');
    try {
      await this.copyDirectory(serverlessDir, path.join(backupDir, '.serverless'));
    } catch (error) {
      this.logger.warn('Could not backup .serverless directory');
    }

    return backupDir;
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async generateMigrationSummary(state: MigrationState): Promise<string> {
    const { targetDir } = state.config;
    const summaryPath = path.join(targetDir, 'MIGRATION_SUMMARY.md');

    const scanData = state.stepResults[MigrationStep.INITIAL_SCAN]?.data;
    const compareData = state.stepResults[MigrationStep.COMPARISON]?.data;
    const verifyData = state.stepResults[MigrationStep.VERIFICATION]?.data;

    const summary = `# Serverless to CDK Migration Summary

## Migration Details

- **Migration ID**: ${state.id}
- **Started**: ${state.startedAt.toISOString()}
- **Completed**: ${new Date().toISOString()}
- **Status**: ${state.status}

## Resources Migrated

- **Total Resources**: ${scanData?.resourceCount?.total || 'N/A'}
- **Stateful Resources (Imported)**: ${scanData?.resourceCount?.stateful || 'N/A'}
- **Stateless Resources (Recreated)**: ${scanData?.resourceCount?.stateless || 'N/A'}

## Migration Steps

${this.generateStepSummary(state)}

## Verification Results

- **Stack Health**: ${verifyData?.stackHealth || 'N/A'}
- **Drift Status**: ${verifyData?.driftStatus || 'N/A'}
- **Resources Verified**: ${verifyData?.resourcesVerified || 'N/A'}
- **Issues Found**: ${verifyData?.issues?.length || 0}

## Template Comparison

- **Matched Resources**: ${compareData?.report?.summary?.matched_resources || 'N/A'}
- **Identical**: ${compareData?.report?.summary?.identical || 'N/A'}
- **Compatible**: ${compareData?.report?.summary?.compatible || 'N/A'}
- **Critical Differences**: ${compareData?.report?.summary?.critical_diffs || 'N/A'}

## Next Steps

1. Review this summary and the comparison report
2. Test your CDK stack thoroughly
3. Update your CI/CD pipelines to use CDK
4. ${state.config.autoApprove ? 'Old Serverless stack has been removed' : 'Manually remove the old Serverless stack when ready'}

## Configuration

\`\`\`json
${JSON.stringify(state.config, null, 2)}
\`\`\`

---
Generated by sls-to-cdk migration tool
`;

    await fs.writeFile(summaryPath, summary);
    return summaryPath;
  }

  private generateStepSummary(state: MigrationState): string {
    const steps = Object.values(MigrationStep);
    const lines: string[] = [];

    for (const step of steps) {
      const result = state.stepResults[step];
      if (result) {
        const status = result.status === 'COMPLETED' ? '✅' :
                      result.status === 'FAILED' ? '❌' :
                      result.status === 'IN_PROGRESS' ? '⏳' : '⏸️';
        lines.push(`- ${status} **${step}**: ${result.status}`);
      }
    }

    return lines.join('\n');
  }

  private createSummary(
    stackRemoved: boolean,
    tempFilesCount: number,
    backupCreated: boolean,
    state: MigrationState
  ): string {
    const lines = [
      '🎉 Migration Complete!',
      '',
      'Summary:',
      `  - Temporary files cleaned: ${tempFilesCount}`,
      `  - Backup created: ${backupCreated ? 'Yes' : 'No'}`,
      `  - Old Serverless stack removed: ${stackRemoved ? 'Yes' : 'No'}`,
      '',
      'Your application has been successfully migrated from Serverless to CDK!',
    ];

    if (!stackRemoved && !state.config.dryRun) {
      lines.push('');
      lines.push('⚠️  Remember to manually remove the old Serverless stack when ready:');
      lines.push('   serverless remove');
    }

    return lines.join('\n');
  }
}
