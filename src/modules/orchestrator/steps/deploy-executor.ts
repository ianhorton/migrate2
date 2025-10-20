/**
 * Deploy CDK Step Executor
 * Deploys the CDK stack with imported resources
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import { execSync } from 'child_process';
import * as AWS from 'aws-sdk';

interface DeployResult {
  deploymentStatus: string;
  stackId?: string;
  stackOutputs?: Record<string, string>;
  deploymentTime?: number;
  changeSetSummary?: {
    created: number;
    modified: number;
    deleted: number;
  };
}

export class DeployExecutor extends BaseStepExecutor {
  private cloudformation: AWS.CloudFormation;

  constructor() {
    super(MigrationStep.VERIFICATION);
    this.cloudformation = new AWS.CloudFormation();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure import step is completed
    const importResult = state.stepResults[MigrationStep.IMPORT_PREPARATION];

    if (!importResult || !importResult.data?.importedResources) {
      this.logger.error('Import step must be completed before deployment');
      return false;
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<DeployResult> {
    this.logger.info('Deploying CDK stack...');

    const { targetDir, region, stackName, autoApprove } = state.config;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    if (state.config.dryRun) {
      this.logger.info('Dry-run mode: skipping deployment');
      return {
        deploymentStatus: 'skipped (dry-run)',
        deploymentTime: 0
      };
    }

    const startTime = Date.now();

    // Step 1: Show what will be deployed (diff)
    this.logger.info('Checking for changes to deploy...');
    try {
      const diffOutput = execSync('cdk diff', {
        cwd: targetDir,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      this.logger.info('Changes to deploy:');
      console.log(diffOutput);
    } catch (error) {
      // cdk diff exits with non-zero if there are changes
      // This is expected, so we continue
      this.logger.info('Changes detected, proceeding with deployment');
    }

    // Step 2: Deploy the stack
    this.logger.info('Starting CDK deployment...');

    const deployArgs = ['deploy'];
    if (autoApprove) {
      deployArgs.push('--require-approval', 'never');
    }

    let deployOutput: string;
    try {
      deployOutput = execSync(`cdk ${deployArgs.join(' ')}`, {
        cwd: targetDir,
        encoding: 'utf-8',
        stdio: 'inherit'
      });
    } catch (error: any) {
      this.logger.error('CDK deployment failed', error);
      throw new Error(`Deployment failed: ${error.message}`);
    }

    const deploymentTime = Date.now() - startTime;
    this.logger.info(`Deployment completed in ${(deploymentTime / 1000).toFixed(2)}s`);

    // Step 3: Get stack information
    let stackId: string | undefined;
    let stackOutputs: Record<string, string> | undefined;

    try {
      const stackInfo = await this.cloudformation.describeStacks({
        StackName: stackName
      }).promise();

      if (stackInfo.Stacks && stackInfo.Stacks.length > 0) {
        const stack = stackInfo.Stacks[0];
        stackId = stack.StackId;

        // Extract outputs
        if (stack.Outputs) {
          stackOutputs = {};
          for (const output of stack.Outputs) {
            if (output.OutputKey && output.OutputValue) {
              stackOutputs[output.OutputKey] = output.OutputValue;
            }
          }

          this.logger.info('Stack outputs:');
          for (const [key, value] of Object.entries(stackOutputs)) {
            this.logger.info(`  ${key}: ${value}`);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Could not retrieve stack information', error);
    }

    // Step 4: Analyze change set (if available)
    let changeSetSummary: { created: number; modified: number; deleted: number } | undefined;

    try {
      // Get the most recent change set
      const changeSets = await this.cloudformation.listChangeSets({
        StackName: stackName
      }).promise();

      if (changeSets.Summaries && changeSets.Summaries.length > 0) {
        const latestChangeSet = changeSets.Summaries[0];

        if (latestChangeSet.ChangeSetName) {
          const changeSet = await this.cloudformation.describeChangeSet({
            ChangeSetName: latestChangeSet.ChangeSetName,
            StackName: stackName
          }).promise();

          // Count changes by action
          const changes = changeSet.Changes || [];
          changeSetSummary = {
            created: changes.filter(c => c.ResourceChange?.Action === 'Add').length,
            modified: changes.filter(c => c.ResourceChange?.Action === 'Modify').length,
            deleted: changes.filter(c => c.ResourceChange?.Action === 'Remove').length
          };

          this.logger.info('Change set summary:');
          this.logger.info(`  Created: ${changeSetSummary.created}`);
          this.logger.info(`  Modified: ${changeSetSummary.modified}`);
          this.logger.info(`  Deleted: ${changeSetSummary.deleted}`);
        }
      }
    } catch (error) {
      // Change set info is optional
      this.logger.debug('Could not retrieve change set information');
    }

    const result: DeployResult = {
      deploymentStatus: 'completed',
      stackId,
      stackOutputs,
      deploymentTime,
      changeSetSummary
    };

    this.logger.info('✅ CDK stack deployed successfully');

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    this.logger.warn('Rolling back CDK deployment...');

    const { targetDir } = state.config;

    // Rollback by destroying the CDK stack
    this.logger.warn('This will destroy the CDK stack');
    this.logger.info('Running: cdk destroy');

    try {
      execSync('cdk destroy --force', {
        cwd: targetDir,
        stdio: 'inherit'
      });

      this.logger.info('CDK stack destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy CDK stack', error);
      throw error;
    }
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.VERIFICATION];

    // Check 1: Deployment completed
    if (result?.data?.deploymentStatus) {
      const status = result.data.deploymentStatus;
      const isSuccess = status === 'completed';

      checks.push({
        name: 'deployment-completed',
        passed: isSuccess || status.includes('skipped'),
        message: isSuccess
          ? 'CDK stack deployed successfully'
          : `Deployment status: ${status}`,
        severity: 'error' as const
      });
    }

    // Check 2: Stack exists and is in good state
    if (!state.config.dryRun) {
      try {
        const stackInfo = await this.cloudformation.describeStacks({
          StackName: state.config.stackName
        }).promise();

        const stack = stackInfo.Stacks?.[0];
        const status = stack?.StackStatus;
        const isHealthy = status?.includes('COMPLETE') && !status?.includes('ROLLBACK');

        checks.push({
          name: 'stack-healthy',
          passed: isHealthy,
          message: isHealthy
            ? `Stack is healthy: ${status}`
            : `Stack status: ${status}`,
          severity: 'error' as const
        });

        // Check 3: Stack has resources
        if (stack) {
          // Get stack resources
          const resources = await this.cloudformation.listStackResources({
            StackName: state.config.stackName
          }).promise();

          const resourceCount = resources.StackResourceSummaries?.length || 0;

          checks.push({
            name: 'stack-has-resources',
            passed: resourceCount > 0,
            message: `Stack contains ${resourceCount} resources`,
            severity: 'error' as const
          });
        }
      } catch (error) {
        checks.push({
          name: 'stack-healthy',
          passed: false,
          message: `Failed to verify stack: ${error}`,
          severity: 'error' as const
        });
      }
    } else {
      checks.push({
        name: 'stack-healthy',
        passed: true,
        message: 'Deployment skipped (dry-run mode)',
        severity: 'info' as const
      });
    }

    // Check 4: Deployment time reasonable
    if (result?.data?.deploymentTime) {
      const minutes = result.data.deploymentTime / 1000 / 60;
      const isFast = minutes < 10;

      checks.push({
        name: 'deployment-time',
        passed: true,
        message: `Deployment took ${minutes.toFixed(2)} minutes`,
        severity: isFast ? 'info' as const : 'warning' as const
      });
    }

    // Check 5: Change set summary
    if (result?.data?.changeSetSummary) {
      const summary = result.data.changeSetSummary;
      const hasUnexpectedDeletes = summary.deleted > 0;

      checks.push({
        name: 'change-set-review',
        passed: !hasUnexpectedDeletes,
        message: hasUnexpectedDeletes
          ? `Warning: ${summary.deleted} resources were deleted`
          : 'No unexpected resource deletions',
        severity: hasUnexpectedDeletes ? 'warning' as const : 'info' as const
      });
    }

    return checks;
  }
}
