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
import { ImportResourceGenerator } from '../../importer/import-resource-generator';

interface ImportResult {
  importedResources: string[];
  importMethod: 'interactive' | 'automatic';
  importOutput: string;
  stackId?: string;
  importableCount?: number;
  skippedCount?: number;
  warnings?: string[];
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
    this.logger.info('Starting resource import preparation...');

    const { targetDir, region, autoApprove } = state.config;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    // Get comparison results (preferred) or fall back to scan data
    const comparisonResult = state.stepResults[MigrationStep.COMPARISON]?.data;
    const cdkOutputPath = path.join(targetDir, 'cdk');

    let importableCount = 0;
    let skippedCount = 0;
    let warnings: string[] = [];
    let resourcesToImport: string[] = [];

    if (comparisonResult) {
      // Use ImportResourceGenerator to create import-resources.json from comparison
      this.logger.debug('Generating import resources from comparison results...');

      const generator = new ImportResourceGenerator();
      const generationResult = await generator.generateImportResources(
        comparisonResult.report,
        cdkOutputPath
      );

      importableCount = generationResult.importableCount;
      skippedCount = generationResult.skippedCount;
      warnings = generationResult.warnings;
      resourcesToImport = generationResult.importResources.map(r => r.logicalResourceId);

      this.logger.debug(`Generated import resources: ${importableCount} importable, ${skippedCount} skipped`);

      if (warnings.length > 0) {
        this.logger.debug(`Import generation warnings: ${warnings.length}`);
        warnings.forEach(w => this.logger.debug(`  - ${w}`));
      }
    } else {
      // Fallback: use scan data (old behavior)
      this.logger.debug('No comparison results available, using scan data (less accurate)');
      const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
      const scanResources = scanData.inventory.stateful.map((r: any) => ({
        logicalId: r.logicalId,
        physicalId: r.physicalId,
        type: r.type
      }));

      // Create simple import mapping
      await this.createImportMapping(cdkOutputPath, scanResources);
      resourcesToImport = scanResources.map((r: any) => r.logicalId);
      importableCount = resourcesToImport.length;
    }

    this.logger.debug(`Prepared ${resourcesToImport.length} resources for import`);

    let importMethod: 'interactive' | 'automatic';
    let importOutput = '';
    let stackId: string | undefined;

    if (state.config.dryRun) {
      this.logger.userMessage('✅ Import Preparation Complete (Dry-Run Mode)');
      this.logger.userInstructions('Generated Files', [
        `Location: ${cdkOutputPath}`,
        'import-resources.json - Application resources to import',
        'IMPORT_PLAN.md - Complete migration instructions'
      ]);

      this.logger.userMessage('📋 Three-Step Migration Process');

      const profileFlag = state.config.profile ? ` --profile ${state.config.profile}` : '';
      const updateStackCmd = `aws cloudformation update-stack --stack-name ${state.config.stackName} \\
  --template-body file://.serverless/cloudformation-template-protected.json \\
  --capabilities CAPABILITY_NAMED_IAM${profileFlag}`;
      const waitCmd = `aws cloudformation wait stack-update-complete --stack-name ${state.config.stackName}${profileFlag}`;

      this.logger.userInstructions('Step 1: Deploy Protected Template', [
        `cd ${state.config.sourceDir}`,
        updateStackCmd,
        waitCmd
      ]);

      this.logger.userInstructions('Step 2: Delete Serverless Stack', [
        `cd ${state.config.sourceDir}`,
        'serverless remove  # Application resources retained, Serverless infra deleted'
      ]);

      this.logger.userInstructions('Step 3: Import to CDK', [
        `cd ${cdkOutputPath}`,
        'cdk import --resource-mapping import-resources.json'
      ]);

      this.logger.userMessage('📊 What Gets Migrated');
      console.log(`✅ Application Resources: ${importableCount} (DynamoDB tables, etc.)`);
      console.log(`❌ Serverless Infrastructure: Skipped (CDK creates its own)`);
      console.log(`❌ Stateless Resources: ${skippedCount} (Lambda, IAM recreated by CDK)\n`);

      importMethod = 'automatic';
      importOutput = 'Skipped (dry-run mode)';
    } else {
      // Import resources using the generated import-resources.json
      this.logger.info('Starting CDK import process...');

      if (autoApprove) {
        // Automatic import using --auto-approve
        this.logger.info('Running automatic import with auto-approve...');
        importMethod = 'automatic';

        try {
          // Use the generated import-resources.json file
          const importResourcesPath = path.join(cdkOutputPath, 'import-resources.json');
          const importFileExists = await fs.access(importResourcesPath).then(() => true).catch(() => false);

          if (importFileExists) {
            this.logger.info('Using generated import-resources.json for import');
            importOutput = execSync(`cdk import --resource-mapping import-resources.json --auto-approve`, {
              cwd: cdkOutputPath,
              encoding: 'utf-8',
              stdio: 'pipe'
            });
          } else {
            this.logger.warn('import-resources.json not found, using interactive import');
            importOutput = execSync(`cdk import --auto-approve`, {
              cwd: cdkOutputPath,
              encoding: 'utf-8',
              stdio: 'pipe'
            });
          }

          this.logger.info('Import completed successfully');

        } catch (error: any) {
          this.logger.error('Import failed', error);
          throw new Error(`CDK import failed: ${error.message}\n${error.stdout || error.stderr}`);
        }
      } else {
        // Interactive import
        this.logger.info('Running interactive import...');
        this.logger.info('Review the IMPORT_PLAN.md file for instructions');
        importMethod = 'interactive';

        try {
          importOutput = await this.runInteractiveImport(cdkOutputPath);
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
      importedResources: resourcesToImport,
      importMethod,
      importOutput,
      stackId,
      importableCount,
      skippedCount,
      warnings
    };

    this.logger.info(`✅ Import preparation completed`);
    this.logger.info(`   Importable resources: ${importableCount}`);
    if (skippedCount > 0) {
      this.logger.warn(`   Skipped resources: ${skippedCount}`);
    }

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

    // Check 4: All resources prepared for import
    if (result?.data?.importableCount !== undefined) {
      const importableCount = result.data.importableCount;
      const skippedCount = result.data.skippedCount || 0;
      const totalCount = importableCount + skippedCount;

      checks.push({
        name: 'resources-prepared',
        passed: importableCount > 0,
        message: skippedCount > 0
          ? `${importableCount} resources prepared, ${skippedCount} skipped`
          : `All ${importableCount} resources prepared for import`,
        severity: importableCount > 0 ? 'info' as const : 'error' as const
      });
    }

    // Check 5: Import generation warnings
    if (result?.data?.warnings && result.data.warnings.length > 0) {
      checks.push({
        name: 'import-warnings',
        passed: false,
        message: `${result.data.warnings.length} warnings during import preparation`,
        severity: 'warning' as const
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
