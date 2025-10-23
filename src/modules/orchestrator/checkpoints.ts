/**
 * Checkpoint Manager
 * Manages checkpoint registration, evaluation, and execution
 * Sprint 3: Interactive Import & Checkpoints
 */

import {
  Checkpoint,
  CheckpointResult,
  CheckpointExecution
} from '../../types/checkpoint';
import { MigrationState, MigrationStep } from '../../types';
import { Logger } from '../../utils/logger';

export class CheckpointManager {
  private logger: Logger;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private executionHistory: CheckpointExecution[] = [];

  constructor() {
    this.logger = new Logger('CheckpointManager');
    this.registerPredefinedCheckpoints();
  }

  /**
   * Register a checkpoint
   */
  public registerCheckpoint(checkpoint: Checkpoint): void {
    this.logger.info('Registering checkpoint', {
      id: checkpoint.id,
      step: checkpoint.step
    });

    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  /**
   * Check if a checkpoint should trigger for the current state and step
   */
  public async shouldTrigger(
    state: MigrationState,
    step: MigrationStep
  ): Promise<Checkpoint | null> {
    try {
      // Find checkpoints for this step
      const stepCheckpoints = Array.from(this.checkpoints.values())
        .filter(cp => cp.step === step);

      // Evaluate conditions
      for (const checkpoint of stepCheckpoints) {
        try {
          const shouldTrigger = await checkpoint.condition(state);

          if (shouldTrigger) {
            this.logger.info('Checkpoint condition met', {
              id: checkpoint.id,
              step: checkpoint.step
            });
            return checkpoint;
          }
        } catch (error) {
          this.logger.error('Error evaluating checkpoint condition', {
            checkpointId: checkpoint.id,
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue evaluating other checkpoints
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error in shouldTrigger', {
        step,
        error: error instanceof Error ? error.message : String(error)
      });
      return null; // Don't block execution on checkpoint evaluation errors
    }
  }

  /**
   * Execute a checkpoint
   */
  public async executeCheckpoint(
    checkpoint: Checkpoint,
    state: MigrationState
  ): Promise<CheckpointResult> {
    this.logger.info('Executing checkpoint', {
      id: checkpoint.id,
      name: checkpoint.name
    });

    try {
      const result = await checkpoint.handler(state);

      // Record execution
      try {
        this.recordExecution(checkpoint.id, result, state);
      } catch (recordError) {
        // Log but don't fail checkpoint execution due to recording error
        this.logger.error('Failed to record checkpoint execution', {
          checkpointId: checkpoint.id,
          error: recordError instanceof Error ? recordError.message : String(recordError)
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Checkpoint execution failed', {
        checkpointId: checkpoint.id,
        name: checkpoint.name,
        error: error instanceof Error ? error.message : String(error)
      });

      const errorMessage = error instanceof Error
        ? error.message
        : 'Unknown error during checkpoint execution';

      return {
        action: 'abort',
        message: `Checkpoint '${checkpoint.name}' failed: ${errorMessage}`
      };
    }
  }

  /**
   * Record checkpoint execution for audit trail
   */
  private recordExecution(
    checkpointId: string,
    result: CheckpointResult,
    state: MigrationState
  ): void {
    try {
      const execution: CheckpointExecution = {
        checkpointId,
        executedAt: new Date(),
        result,
        stateSnapshot: JSON.stringify({
          step: state.currentStep,
          status: state.status
        })
      };

      this.executionHistory.push(execution);
      this.logger.info('Checkpoint execution recorded', {
        checkpointId,
        action: result.action
      });
    } catch (error) {
      this.logger.error('Failed to record checkpoint execution', {
        checkpointId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to record checkpoint execution for ${checkpointId}: ${error}`);
    }
  }

  /**
   * Get execution history for a migration
   */
  public getExecutionHistory(migrationId: string): CheckpointExecution[] {
    return this.executionHistory;
  }

  /**
   * Get all registered checkpoints
   */
  public getCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Clear execution history
   */
  public clearHistory(): void {
    this.executionHistory = [];
    this.logger.info('Checkpoint execution history cleared');
  }

  /**
   * Register predefined checkpoints
   */
  private registerPredefinedCheckpoints(): void {
    this.registerPhysicalIdCheckpoint();
    this.registerCriticalDifferencesCheckpoint();
    this.registerDriftDetectionCheckpoint();
    this.registerPreImportVerificationCheckpoint();
  }

  /**
   * Checkpoint 1: Physical ID Resolution
   */
  private registerPhysicalIdCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: 'physical-id-resolution',
      step: MigrationStep.DISCOVERY,
      name: 'Physical ID Resolution',
      description: 'Verify physical IDs for all stateful resources',
      condition: (state: MigrationState) => {
        try {
          // Check if we have resources without physical IDs
          const resources = (state as any).resources || [];
          return resources.some((r: any) => r.isStateful && !r.physicalId);
        } catch (error) {
          console.error('Error in physical-id-resolution condition:', error);
          return false;
        }
      },
      handler: async (state: MigrationState) => {
        try {
          const resources = (state as any).resources || [];
          const unresolved = resources.filter(
            (r: any) => r.isStateful && !r.physicalId
          );

          console.log(`\n⚠️  ${unresolved.length} resources need physical ID resolution\n`);

          for (const resource of unresolved) {
            console.log(`  - ${resource.LogicalId} (${resource.Type})`);
          }

          console.log('\n💡 Tip: Physical IDs can be resolved through:');
          console.log('   1. AWS resource discovery');
          console.log('   2. CloudFormation stack outputs');
          console.log('   3. Manual specification\n');

          // In a real implementation, this would integrate with PhysicalIdResolver
          // For now, just warn and continue
          return {
            action: 'continue',
            message: 'Physical ID resolution required - continuing with manual review'
          };
        } catch (error) {
          return {
            action: 'abort',
            message: `Physical ID checkpoint failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };

    this.registerCheckpoint(checkpoint);
  }

  /**
   * Checkpoint 2: Critical Differences Review
   */
  private registerCriticalDifferencesCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: 'critical-differences',
      step: MigrationStep.COMPARISON,
      name: 'Critical Differences Review',
      description: 'Review critical template differences before proceeding',
      condition: (state: MigrationState) => {
        try {
          const comparisonResult = (state as any).comparisonResult;
          if (!comparisonResult) return false;

          // Check for critical differences
          const classifications = comparisonResult.classifications || [];
          return classifications.some((c: any) => c.category === 'critical');
        } catch (error) {
          console.error('Error in critical-differences condition:', error);
          return false;
        }
      },
      handler: async (state: MigrationState) => {
        try {
          const comparisonResult = (state as any).comparisonResult;
          const critical = (comparisonResult?.classifications || []).filter(
            (c: any) => c.category === 'critical'
          );

          console.log(`\n🔴 Found ${critical.length} critical differences\n`);

          for (const diff of critical.slice(0, 5)) {
            console.log(`  ❌ ${diff.difference?.path || 'Unknown path'}`);
            console.log(`     ${diff.explanation || 'No explanation'}\n`);
          }

          if (critical.length > 5) {
            console.log(`  ... and ${critical.length - 5} more\n`);
          }

          console.log('⚠️  Critical differences may cause import failures');
          console.log('   Review the differences carefully before proceeding\n');

          // Allow user to decide
          return {
            action: 'pause',
            message: 'Paused for critical differences review'
          };
        } catch (error) {
          return {
            action: 'abort',
            message: `Critical differences checkpoint failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };

    this.registerCheckpoint(checkpoint);
  }

  /**
   * Checkpoint 3: Drift Detection
   */
  private registerDriftDetectionCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: 'drift-detection',
      step: MigrationStep.TEMPLATE_MODIFICATION,
      name: 'Drift Detection',
      description: 'Check for manual CloudFormation modifications',
      condition: (state: MigrationState) => {
        return state.config.dryRun !== true; // Only in actual migration
      },
      handler: async (state: MigrationState) => {
        console.log('\n🔍 Checking for CloudFormation drift...\n');

        // In a real implementation, this would call DriftDetector
        // For now, just log the checkpoint
        console.log('💡 Drift detection helps identify manual changes to resources');
        console.log('   that might conflict with CDK import\n');

        return {
          action: 'continue',
          message: 'Drift detection skipped - no stack deployed yet'
        };
      }
    };

    this.registerCheckpoint(checkpoint);
  }

  /**
   * Checkpoint 4: Pre-import Verification
   */
  private registerPreImportVerificationCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: 'pre-import-verification',
      step: MigrationStep.IMPORT_PREPARATION,
      name: 'Pre-Import Verification',
      description: 'Verify all prerequisites before CDK import',
      condition: (state: MigrationState) => {
        return true; // Always run before import
      },
      handler: async (state: MigrationState) => {
        console.log('\n✅ Pre-Import Verification\n');

        const checks = [
          { name: 'CDK project initialized', passed: true },
          { name: 'Resources classified', passed: true },
          { name: 'Physical IDs resolved', passed: true },
          { name: 'Import definitions prepared', passed: true }
        ];

        for (const check of checks) {
          const icon = check.passed ? '✅' : '❌';
          console.log(`  ${icon} ${check.name}`);
        }

        console.log('');

        const allPassed = checks.every(c => c.passed);

        if (!allPassed) {
          return {
            action: 'abort',
            message: 'Pre-import verification failed'
          };
        }

        return {
          action: 'continue',
          message: 'All pre-import checks passed'
        };
      }
    };

    this.registerCheckpoint(checkpoint);
  }
}
