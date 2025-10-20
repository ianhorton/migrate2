/**
 * Protect Resources Step Executor
 * Adds DeletionPolicy: Retain to stateful resources
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import {
  CloudFormationTemplate,
  CloudFormationResource
} from '../../../types/migration';
import { Editor } from '../../editor';
import * as AWS from 'aws-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

interface ProtectResult {
  protectedResources: string[];
  templatePath: string;
  deploymentStatus: string;
  stackId?: string;
}

export class ProtectExecutor extends BaseStepExecutor {
  private cloudformation: AWS.CloudFormation;
  private editor: Editor;

  constructor() {
    super(MigrationStep.DISCOVERY);
    this.editor = new Editor();
    this.cloudformation = new AWS.CloudFormation();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure scan step is completed
    const scanResult = state.stepResults[MigrationStep.INITIAL_SCAN];
    if (!scanResult || !scanResult.data?.inventory) {
      this.logger.error('Scan step must be completed before protecting resources');
      return false;
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<ProtectResult> {
    this.logger.info('Adding DeletionPolicy: Retain to stateful resources...');

    const { sourceDir, stackName, region } = state.config;
    const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
    const statefulResources = scanData.inventory.stateful;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    // Step 1: Load the CloudFormation template
    const templatePath = path.join(
      sourceDir,
      '.serverless',
      'cloudformation-template-update-stack.json'
    );

    let template: CloudFormationTemplate;
    try {
      const content = await fs.readFile(templatePath, 'utf-8');
      template = JSON.parse(content);
    } catch (error) {
      // If template doesn't exist, run serverless package
      this.logger.info('CloudFormation template not found, running serverless package...');
      await this.runServerlessPackage(sourceDir);
      const content = await fs.readFile(templatePath, 'utf-8');
      template = JSON.parse(content);
    }

    // Step 2: Add DeletionPolicy to stateful resources
    const protectedResources: string[] = [];

    for (const resource of statefulResources) {
      if (template.Resources[resource.logicalId]) {
        const existingResource = template.Resources[resource.logicalId];
        template.Resources[resource.logicalId] = {
          Type: existingResource.Type,
          Properties: existingResource.Properties,
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          ...(existingResource.DependsOn && { DependsOn: existingResource.DependsOn }),
          ...(existingResource.Metadata && { Metadata: existingResource.Metadata }),
          ...(existingResource.Condition && { Condition: existingResource.Condition })
        };
        protectedResources.push(resource.logicalId);
        this.logger.info(`  ✓ Protected: ${resource.logicalId} (${resource.type})`);
      }
    }

    // Step 3: Save modified template
    const protectedTemplatePath = path.join(
      sourceDir,
      '.serverless',
      'cloudformation-template-protected.json'
    );
    await fs.writeFile(protectedTemplatePath, JSON.stringify(template, null, 2));
    this.logger.info(`Protected template saved to: ${protectedTemplatePath}`);

    // Step 4: Deploy with Serverless (if not dry run)
    let deploymentStatus = 'skipped (dry-run)';
    let stackId: string | undefined;

    if (!state.config.dryRun) {
      this.logger.info('Deploying Serverless stack with protection policies...');
      try {
        await this.runServerlessDeploy(sourceDir, state.config.stage);
        deploymentStatus = 'deployed';

        // Get stack ID
        const stackInfo = await this.cloudformation.describeStacks({
          StackName: stackName
        }).promise();

        if (stackInfo.Stacks && stackInfo.Stacks.length > 0) {
          stackId = stackInfo.Stacks[0].StackId;
          this.logger.info(`Stack deployed: ${stackId}`);
        }
      } catch (error) {
        this.logger.error('Deployment failed', error);
        throw new Error(`Failed to deploy protected stack: ${error}`);
      }
    }

    const result: ProtectResult = {
      protectedResources,
      templatePath: protectedTemplatePath,
      deploymentStatus,
      stackId
    };

    this.logger.info(`Protected ${protectedResources.length} stateful resources`);

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    this.logger.warn('Rolling back protection step...');

    // Rollback would involve removing DeletionPolicy from template and redeploying
    // However, this is generally safe to leave in place
    this.logger.info('DeletionPolicy: Retain will remain on resources (safe to keep)');
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.DISCOVERY];

    // Check 1: Protected template exists
    if (result?.data?.templatePath) {
      try {
        await fs.access(result.data.templatePath);
        checks.push({
          name: 'protected-template-exists',
          passed: true,
          message: 'Protected CloudFormation template created',
          severity: 'error' as const
        });
      } catch (error) {
        checks.push({
          name: 'protected-template-exists',
          passed: false,
          message: 'Protected template file not found',
          severity: 'error' as const
        });
      }
    }

    // Check 2: Resources protected
    if (result?.data?.protectedResources) {
      const count = result.data.protectedResources.length;
      checks.push({
        name: 'resources-protected',
        passed: count > 0,
        message: `${count} resources have DeletionPolicy: Retain`,
        severity: 'error' as const
      });
    }

    // Check 3: Stack deployed (if not dry run)
    if (!state.config.dryRun && result?.data?.stackId) {
      try {
        const stackInfo = await this.cloudformation.describeStacks({
          StackName: state.config.stackName
        }).promise();

        if (stackInfo.Stacks && stackInfo.Stacks.length > 0) {
          const stackStatus = stackInfo.Stacks[0].StackStatus;
          const isComplete = stackStatus?.includes('COMPLETE') || false;
          checks.push({
            name: 'stack-deployed',
            passed: isComplete,
            message: isComplete
              ? `Stack deployed: ${stackStatus}`
              : `Stack status: ${stackStatus || 'UNKNOWN'}`,
            severity: 'error' as const
          });
        } else {
          checks.push({
            name: 'stack-deployed',
            passed: false,
            message: 'Stack not found',
            severity: 'error' as const
          });
        }
      } catch (error) {
        checks.push({
          name: 'stack-deployed',
          passed: false,
          message: `Failed to verify stack: ${error}`,
          severity: 'error' as const
        });
      }
    } else if (state.config.dryRun) {
      checks.push({
        name: 'stack-deployed',
        passed: true,
        message: 'Deployment skipped (dry-run mode)',
        severity: 'info' as const
      });
    }

    return checks;
  }

  private async runServerlessPackage(sourceDir: string): Promise<void> {
    this.logger.info('Running: serverless package');
    execSync('serverless package', {
      cwd: sourceDir,
      stdio: 'inherit'
    });
  }

  private async runServerlessDeploy(sourceDir: string, stage: string): Promise<void> {
    this.logger.info(`Running: serverless deploy --stage ${stage}`);
    execSync(`serverless deploy --stage ${stage}`, {
      cwd: sourceDir,
      stdio: 'inherit'
    });
  }
}
