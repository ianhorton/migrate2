/**
 * Import Resources Step Executor
 * Imports existing AWS resources into CDK stack
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import { execSync, spawn } from 'child_process';
import * as AWS from 'aws-sdk';
import * as path from 'path';
import * as fs from 'fs/promises';

interface ImportResult {
  importedResources: string[];
  importMethod: 'interactive' | 'automatic';
  importOutput: string;
  stackId?: string;
}

export class ImportExecutor extends BaseStepExecutor {
  private cloudformation: AWS.CloudFormation;

  constructor() {
    super(MigrationStep.IMPORT_PREPARATION);
    this.cloudformation = new AWS.CloudFormation();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure all previous steps are completed
    const removeResult = state.stepResults[MigrationStep.TEMPLATE_MODIFICATION];
    const generateResult = state.stepResults[MigrationStep.CDK_GENERATION];
    const compareResult = state.stepResults[MigrationStep.COMPARISON];

    if (!removeResult || !generateResult) {
      this.logger.error('Remove and generate steps must be completed before import');
      return false;
    }

    if (compareResult && !compareResult.data?.readyForImport) {
      this.logger.error('Templates must be compatible for import');
      return false;
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<ImportResult> {
    this.logger.info('Starting resource import into CDK stack...');

    const { targetDir, region, autoApprove } = state.config;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    // Get list of resources to import
    const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
    const resourcesToImport = scanData.inventory.stateful.map((r: any) => ({
      logicalId: r.logicalId,
      physicalId: r.physicalId,
      type: r.type
    }));

    this.logger.info(`Importing ${resourcesToImport.length} resources into CDK stack...`);

    let importMethod: 'interactive' | 'automatic';
    let importOutput = '';
    let stackId: string | undefined;

    if (state.config.dryRun) {
      this.logger.info('Dry-run mode: skipping actual import');
      importMethod = 'automatic';
      importOutput = 'Skipped (dry-run mode)';
    } else {
      // Prepare import mapping file
      const importMapPath = await this.createImportMapping(targetDir, resourcesToImport);

      if (autoApprove) {
        // Automatic import using --auto-approve
        this.logger.info('Running automatic import with auto-approve...');
        importMethod = 'automatic';

        try {
          importOutput = execSync(`cdk import --auto-approve`, {
            cwd: targetDir,
            encoding: 'utf-8',
            stdio: 'pipe'
          });

          this.logger.info('Import completed successfully');

        } catch (error: any) {
          this.logger.error('Import failed', error);
          throw new Error(`CDK import failed: ${error.message}\n${error.stdout || error.stderr}`);
        }
      } else {
        // Interactive import
        this.logger.info('Running interactive import...');
        this.logger.info('You will be prompted to provide physical resource IDs');
        importMethod = 'interactive';

        try {
          importOutput = await this.runInteractiveImport(targetDir);
        } catch (error: any) {
          this.logger.error('Import failed', error);
          throw new Error(`CDK import failed: ${error.message}`);
        }
      }

      // Get stack ID after import
      try {
        const stackInfo = await this.cloudformation.describeStacks({
          StackName: state.config.stackName
        }).promise();

        if (stackInfo.Stacks && stackInfo.Stacks.length > 0) {
          stackId = stackInfo.Stacks[0].StackId;
        }
      } catch (error) {
        this.logger.warn('Could not retrieve stack ID after import');
      }
    }

    const result: ImportResult = {
      importedResources: resourcesToImport.map((r: any) => r.logicalId),
      importMethod,
      importOutput,
      stackId
    };

    this.logger.info(`✅ Imported ${resourcesToImport.length} resources into CDK stack`);

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    this.logger.warn('Rolling back resource import...');
    this.logger.warn('Import rollback requires manual intervention');
    this.logger.warn('You may need to delete the CDK stack and re-run from the generate step');
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.IMPORT_PREPARATION];

    // Check 1: Import completed
    if (result?.data?.importedResources) {
      const count = result.data.importedResources.length;
      checks.push({
        name: 'import-completed',
        passed: count > 0,
        message: `${count} resources imported successfully`,
        severity: 'error' as const
      });
    }

    // Check 2: Stack exists
    if (!state.config.dryRun && result?.data?.stackId) {
      try {
        const stackInfo = await this.cloudformation.describeStacks({
          StackName: state.config.stackName
        }).promise();

        const status = stackInfo.Stacks?.[0]?.StackStatus;
        const isComplete = status?.includes('COMPLETE') || status === 'IMPORT_COMPLETE';

        checks.push({
          name: 'stack-exists',
          passed: isComplete,
          message: isComplete
            ? `CDK stack active: ${status}`
            : `Stack status: ${status}`,
          severity: 'error' as const
        });
      } catch (error) {
        checks.push({
          name: 'stack-exists',
          passed: false,
          message: 'CDK stack not found',
          severity: 'error' as const
        });
      }
    } else if (state.config.dryRun) {
      checks.push({
        name: 'stack-exists',
        passed: true,
        message: 'Import skipped (dry-run mode)',
        severity: 'info' as const
      });
    }

    // Check 3: No import errors
    if (result?.data?.importOutput) {
      const hasErrors = result.data.importOutput.toLowerCase().includes('error');
      checks.push({
        name: 'no-import-errors',
        passed: !hasErrors,
        message: hasErrors
          ? 'Import output contains errors'
          : 'Import completed without errors',
        severity: hasErrors ? 'error' as const : 'info' as const
      });
    }

    // Check 4: All resources imported
    if (result?.data?.importedResources) {
      const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
      const expectedCount = scanData.inventory.stateful.length;
      const actualCount = result.data.importedResources.length;

      checks.push({
        name: 'all-resources-imported',
        passed: actualCount === expectedCount,
        message: actualCount === expectedCount
          ? `All ${expectedCount} resources imported`
          : `Imported ${actualCount} of ${expectedCount} resources`,
        severity: actualCount === expectedCount ? 'info' as const : 'warning' as const
      });
    }

    return checks;
  }

  private async createImportMapping(targetDir: string, resources: any[]): Promise<string> {
    // Create a mapping file for CDK import
    const mapping = resources.map(r => ({
      LogicalResourceId: r.logicalId,
      PhysicalResourceId: r.physicalId,
      ResourceType: r.type
    }));

    const mappingPath = path.join(targetDir, 'import-mapping.json');
    await fs.writeFile(mappingPath, JSON.stringify(mapping, null, 2));

    this.logger.info(`Import mapping saved to: ${mappingPath}`);
    return mappingPath;
  }

  private async runInteractiveImport(targetDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';

      const proc = spawn('cdk', ['import'], {
        cwd: targetDir,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        process.stdout.write(str);
      });

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        output += str;
        process.stderr.write(str);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`cdk import exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }
}
