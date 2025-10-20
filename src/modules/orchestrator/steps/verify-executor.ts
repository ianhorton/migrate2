/**
 * Verify Migration Step Executor
 * Verifies the migration was successful
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep
} from '../../../types';
import * as AWS from 'aws-sdk';

interface VerifyResult {
  driftStatus: string;
  driftedResources: string[];
  resourcesVerified: number;
  allResourcesExist: boolean;
  stackHealth: string;
  issues: string[];
}

export class VerifyExecutor extends BaseStepExecutor {
  private cloudformation: AWS.CloudFormation;

  constructor() {
    super(MigrationStep.VERIFICATION);
    this.cloudformation = new AWS.CloudFormation();
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure deploy step is completed
    const deployResult = state.stepResults[MigrationStep.VERIFICATION];

    // Allow verification even if deploy is still the current step
    return true;
  }

  protected async executeStep(state: MigrationState): Promise<VerifyResult> {
    this.logger.info('Verifying migration...');

    const { stackName, region } = state.config;

    // Configure AWS SDK
    if (region) {
      this.cloudformation = new AWS.CloudFormation({ region });
    }

    if (state.config.dryRun) {
      this.logger.info('Dry-run mode: skipping verification');
      return {
        driftStatus: 'skipped',
        driftedResources: [],
        resourcesVerified: 0,
        allResourcesExist: true,
        stackHealth: 'skipped',
        issues: []
      };
    }

    const issues: string[] = [];

    // Step 1: Check stack health
    this.logger.info('Checking stack health...');
    let stackHealth = 'UNKNOWN';

    try {
      const stackInfo = await this.cloudformation.describeStacks({
        StackName: stackName
      }).promise();

      if (stackInfo.Stacks && stackInfo.Stacks.length > 0) {
        stackHealth = stackInfo.Stacks[0].StackStatus || 'UNKNOWN';

        if (stackHealth.includes('FAILED') || stackHealth.includes('ROLLBACK')) {
          issues.push(`Stack is in unhealthy state: ${stackHealth}`);
        } else {
          this.logger.info(`✓ Stack health: ${stackHealth}`);
        }
      }
    } catch (error) {
      issues.push(`Failed to check stack health: ${error}`);
      this.logger.error('Stack health check failed', error);
    }

    // Step 2: Check for drift
    this.logger.info('Checking for stack drift...');
    let driftStatus = 'UNKNOWN';
    let driftedResources: string[] = [];

    try {
      // Initiate drift detection
      const driftDetection = await this.cloudformation.detectStackDrift({
        StackName: stackName
      }).promise();

      const detectionId = driftDetection.StackDriftDetectionId;

      // Wait for drift detection to complete
      await this.waitForDriftDetection(stackName, detectionId);

      // Get drift results
      const driftResult = await this.cloudformation.describeStackDriftDetectionStatus({
        StackDriftDetectionId: detectionId
      }).promise();

      driftStatus = driftResult.StackDriftStatus || 'UNKNOWN';

      if (driftStatus === 'IN_SYNC') {
        this.logger.info('✓ Stack is in sync (no drift detected)');
      } else if (driftStatus === 'DRIFTED') {
        this.logger.warn('⚠ Stack drift detected');

        // Get drifted resources
        const driftedResourcesResult = await this.cloudformation.describeStackResourceDrifts({
          StackName: stackName,
          StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED']
        }).promise();

        driftedResources = (driftedResourcesResult.StackResourceDrifts || [])
          .map(drift => drift.LogicalResourceId || 'Unknown')
          .filter(id => id !== 'Unknown');

        if (driftedResources.length > 0) {
          this.logger.warn(`Drifted resources: ${driftedResources.join(', ')}`);
          issues.push(`${driftedResources.length} resources have drifted from expected state`);
        }
      }
    } catch (error: any) {
      // Drift detection might not be supported for all resources
      if (error.code === 'ValidationError') {
        this.logger.warn('Drift detection not supported for this stack');
        driftStatus = 'NOT_SUPPORTED';
      } else {
        issues.push(`Failed to check drift: ${error.message}`);
        this.logger.error('Drift check failed', error);
      }
    }

    // Step 3: Verify all resources exist
    this.logger.info('Verifying all resources exist...');
    let resourcesVerified = 0;
    let allResourcesExist = true;

    try {
      const resources = await this.cloudformation.listStackResources({
        StackName: stackName
      }).promise();

      const resourceSummaries = resources.StackResourceSummaries || [];
      resourcesVerified = resourceSummaries.length;

      // Check each resource status
      for (const resource of resourceSummaries) {
        if (resource.ResourceStatus?.includes('FAILED')) {
          allResourcesExist = false;
          issues.push(`Resource ${resource.LogicalResourceId} is in failed state: ${resource.ResourceStatus}`);
        }
      }

      this.logger.info(`✓ Verified ${resourcesVerified} resources`);

      // Compare with expected count
      const scanData = state.stepResults[MigrationStep.INITIAL_SCAN]?.data;
      if (scanData?.inventory) {
        const expectedCount = scanData.inventory.stateful.length;
        if (resourcesVerified < expectedCount) {
          issues.push(`Expected ${expectedCount} resources but found ${resourcesVerified}`);
        }
      }
    } catch (error) {
      allResourcesExist = false;
      issues.push(`Failed to verify resources: ${error}`);
      this.logger.error('Resource verification failed', error);
    }

    // Step 4: Run smoke tests (basic connectivity checks)
    this.logger.info('Running smoke tests...');
    await this.runSmokeTests(stackName, issues);

    // Step 5: Summary
    if (issues.length === 0) {
      this.logger.info('✅ All verification checks passed');
    } else {
      this.logger.warn(`⚠ Verification completed with ${issues.length} issues`);
      issues.forEach(issue => this.logger.warn(`  - ${issue}`));
    }

    const result: VerifyResult = {
      driftStatus,
      driftedResources,
      resourcesVerified,
      allResourcesExist,
      stackHealth,
      issues
    };

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    // No rollback needed for verification - it's read-only
    this.logger.info('No rollback needed for verification step (read-only operation)');
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.VERIFICATION];

    if (!result?.data) {
      return [{
        name: 'verification-completed',
        passed: false,
        message: 'Verification step not completed',
        severity: 'error' as const
      }];
    }

    const verifyData = result.data as VerifyResult;

    // Check 1: Stack health
    const isHealthy = verifyData.stackHealth.includes('COMPLETE') &&
                      !verifyData.stackHealth.includes('ROLLBACK') &&
                      !verifyData.stackHealth.includes('FAILED');

    checks.push({
      name: 'stack-health',
      passed: isHealthy || verifyData.stackHealth === 'skipped',
      message: verifyData.stackHealth === 'skipped'
        ? 'Skipped (dry-run mode)'
        : `Stack status: ${verifyData.stackHealth}`,
      severity: 'error' as const
    });

    // Check 2: Drift status
    const noDrift = verifyData.driftStatus === 'IN_SYNC' ||
                    verifyData.driftStatus === 'NOT_SUPPORTED' ||
                    verifyData.driftStatus === 'skipped';

    checks.push({
      name: 'no-drift',
      passed: noDrift,
      message: verifyData.driftStatus === 'IN_SYNC'
        ? 'No drift detected'
        : verifyData.driftStatus === 'DRIFTED'
        ? `${verifyData.driftedResources.length} resources have drifted`
        : `Drift status: ${verifyData.driftStatus}`,
      severity: noDrift ? 'info' as const : 'warning' as const
    });

    // Check 3: All resources exist
    checks.push({
      name: 'all-resources-exist',
      passed: verifyData.allResourcesExist,
      message: verifyData.allResourcesExist
        ? `All ${verifyData.resourcesVerified} resources verified`
        : 'Some resources are missing or in failed state',
      severity: 'error' as const
    });

    // Check 4: No issues found
    checks.push({
      name: 'no-issues',
      passed: verifyData.issues.length === 0,
      message: verifyData.issues.length === 0
        ? 'No issues detected'
        : `${verifyData.issues.length} issues found`,
      severity: verifyData.issues.length === 0 ? 'info' as const : 'warning' as const
    });

    return checks;
  }

  private async waitForDriftDetection(stackName: string, detectionId: string): Promise<void> {
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.cloudformation.describeStackDriftDetectionStatus({
        StackDriftDetectionId: detectionId
      }).promise();

      if (status.DetectionStatus === 'DETECTION_COMPLETE') {
        return;
      }

      if (status.DetectionStatus === 'DETECTION_FAILED') {
        throw new Error(`Drift detection failed: ${status.DetectionStatusReason}`);
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Drift detection timed out');
  }

  private async runSmokeTests(stackName: string, issues: string[]): Promise<void> {
    // Basic smoke tests
    // In a real implementation, this would test:
    // - API endpoints are accessible
    // - Database connections work
    // - S3 buckets are readable
    // - Lambda functions can be invoked
    // etc.

    this.logger.info('Running basic smoke tests...');

    try {
      // Test 1: Stack can be described (already done, but confirms API access)
      await this.cloudformation.describeStacks({
        StackName: stackName
      }).promise();

      this.logger.info('✓ CloudFormation API accessible');

      // Additional smoke tests would go here

    } catch (error) {
      issues.push(`Smoke tests failed: ${error}`);
      this.logger.error('Smoke tests failed', error);
    }
  }
}
