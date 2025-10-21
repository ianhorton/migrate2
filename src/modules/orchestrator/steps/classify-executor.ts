/**
 * Classification Step Executor
 * Resources are already classified by Scanner, this step is a passthrough
 */

import { BaseStepExecutor } from '../step-executor';
import { MigrationState, MigrationStep, MigrationStatus } from '../../../types';

export class ClassifyExecutor extends BaseStepExecutor {
  constructor() {
    super(MigrationStep.CLASSIFICATION);
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Requires scan to be completed
    const scanResult = state.stepResults[MigrationStep.INITIAL_SCAN];
    return scanResult && scanResult.status === MigrationStatus.COMPLETED;
  }

  protected async executeStep(state: MigrationState): Promise<any> {
    this.logger.info('Resources already classified during scan');

    // Get scan data
    const scanResult = state.stepResults[MigrationStep.INITIAL_SCAN];
    const inventory = scanResult?.data?.inventory;

    this.logger.info(`Classification summary:`);
    this.logger.info(`  Stateful resources: ${inventory?.stateful?.length || 0}`);
    this.logger.info(`  Stateless resources: ${inventory?.stateless?.length || 0}`);
    this.logger.info(`  Explicit resources: ${inventory?.explicit?.length || 0}`);
    this.logger.info(`  Abstracted resources: ${inventory?.abstracted?.length || 0}`);

    // Return the inventory from scan
    return {
      inventory,
      classification: {
        stateful: inventory?.stateful || [],
        stateless: inventory?.stateless || [],
        explicit: inventory?.explicit || [],
        abstracted: inventory?.abstracted || []
      }
    };
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    // No rollback needed - classification is a read-only operation
    this.logger.info('No rollback needed for classification');
  }

  protected async runValidationChecks(state: MigrationState) {
    const result = state.stepResults[MigrationStep.CLASSIFICATION];
    const inventory = result?.data?.inventory;

    return [
      {
        name: 'inventory-exists',
        passed: !!inventory,
        message: inventory ? 'Resource inventory available' : 'Resource inventory missing',
        severity: 'error' as const
      },
      {
        name: 'resources-classified',
        passed: !!(inventory?.stateful && inventory?.stateless),
        message: 'Resources classified into stateful and stateless categories',
        severity: 'error' as const
      }
    ];
  }
}
