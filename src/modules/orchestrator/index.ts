/**
 * Migration Orchestrator
 * Coordinates the entire migration process through the state machine
 */

import {
  MigrationState,
  MigrationStep,
  MigrationStatus,
  MigrationConfig,
  OrchestratorOptions,
  StepResult
} from '../../types';
import { MigrationStateMachine } from './state-machine';
import { StateManager } from './state-manager';
import { StepExecutorFactory } from './step-executor';
import { Logger } from '../../utils/logger';

export class MigrationOrchestrator {
  private stateManager: StateManager;
  private logger: Logger;

  constructor(workingDir?: string) {
    this.stateManager = new StateManager(workingDir);
    this.logger = new Logger('MigrationOrchestrator');
  }

  /**
   * Start a new migration
   */
  public async startMigration(
    config: MigrationConfig,
    options: OrchestratorOptions = {}
  ): Promise<MigrationState> {
    this.logger.info('Starting new migration', { config });

    // Initialize state
    let state = await this.stateManager.initializeState(config);

    // Create initial backup
    if (config.backupEnabled) {
      await this.stateManager.createBackup(state, 'initial');
    }

    // Execute migration steps
    state = await this.executeMigration(state, options);

    return state;
  }

  /**
   * Resume an existing migration
   */
  public async resumeMigration(
    stateId: string,
    options: OrchestratorOptions = {}
  ): Promise<MigrationState> {
    this.logger.info('Resuming migration', { stateId });

    let state = await this.stateManager.loadState(stateId);

    if (state.status === MigrationStatus.COMPLETED) {
      this.logger.info('Migration already completed');
      return state;
    }

    // Resume from specific step if provided
    if (options.resumeFrom) {
      state.currentStep = options.resumeFrom;
      state.status = MigrationStatus.IN_PROGRESS;
      await this.stateManager.saveState(state);
    }

    state = await this.executeMigration(state, options);

    return state;
  }

  /**
   * Rollback migration to a specific step
   */
  public async rollback(
    stateId: string,
    targetStep: MigrationStep
  ): Promise<MigrationState> {
    this.logger.info('Rolling back migration', { stateId, targetStep });

    const state = await this.stateManager.loadState(stateId);

    // Get steps to rollback (in reverse order)
    const currentIndex = MigrationStateMachine.getStepIndex(state.currentStep);
    const targetIndex = MigrationStateMachine.getStepIndex(targetStep);
    const allSteps = MigrationStateMachine.getAllSteps();

    for (let i = currentIndex; i > targetIndex; i--) {
      const step = allSteps[i];
      const executor = StepExecutorFactory.getExecutor(step);

      this.logger.info(`Rolling back step: ${step}`);
      await executor.rollback(state);
    }

    // Update state
    const rolledBackState = await this.stateManager.rollbackToStep(state, targetStep);

    this.logger.info('Rollback completed');
    return rolledBackState;
  }

  /**
   * Get migration progress
   */
  public async getProgress(stateId?: string): Promise<{
    state: MigrationState;
    progress: ReturnType<StateManager['getProgress']>;
  }> {
    const state = await this.stateManager.loadState(stateId);
    const progress = this.stateManager.getProgress(state);
    return { state, progress };
  }

  /**
   * List all migrations
   */
  public async listMigrations() {
    return this.stateManager.listStates();
  }

  /**
   * Execute migration steps
   */
  private async executeMigration(
    state: MigrationState,
    options: OrchestratorOptions
  ): Promise<MigrationState> {
    const allSteps = MigrationStateMachine.getAllSteps();
    const skipSteps = new Set(options.skipSteps || []);

    for (const step of allSteps) {
      // Skip if already completed
      const stepResult = state.stepResults[step];
      if (stepResult && stepResult.status === MigrationStatus.COMPLETED) {
        continue;
      }

      // Skip if in skip list
      if (skipSteps.has(step)) {
        this.logger.info(`Skipping step: ${step}`);
        continue;
      }

      // Break if we've reached the end
      if (step === MigrationStep.COMPLETE) {
        state.currentStep = MigrationStep.COMPLETE;
        state.status = MigrationStatus.COMPLETED;
        state.completedAt = new Date();
        await this.stateManager.saveState(state);
        break;
      }

      // Execute step
      try {
        const result = await this.executeStep(state, step, options);
        state = await this.stateManager.updateStepResult(state, result);

        // Call progress callback
        if (options.onProgress) {
          const progress = MigrationStateMachine.calculateProgress(step);
          options.onProgress(step, progress);
        }

        // Call step complete callback
        if (options.onStepComplete) {
          options.onStepComplete(result);
        }

        // Stop if step failed and not in dry-run mode
        if (result.status === MigrationStatus.FAILED && !state.config.dryRun) {
          this.logger.error(`Step failed: ${step}`, result.error);
          break;
        }

      } catch (error) {
        this.logger.error(`Error executing step: ${step}`, error);
        state.status = MigrationStatus.FAILED;
        state.error = error as Error;
        await this.stateManager.saveState(state);
        break;
      }
    }

    return state;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    state: MigrationState,
    step: MigrationStep,
    options: OrchestratorOptions
  ): Promise<StepResult> {
    this.logger.info(`Executing step: ${step}`);

    const executor = StepExecutorFactory.getExecutor(step);

    // Check if step can be executed
    if (!executor.canExecute(state)) {
      throw new Error(`Cannot execute step ${step}: prerequisites not met`);
    }

    // Create backup before critical steps
    if (state.config.backupEnabled && this.isCriticalStep(step)) {
      await this.stateManager.createBackup(state, `pre-${step}`);
    }

    // Execute step
    const result = await executor.execute(state);

    return result;
  }

  /**
   * Check if a step is critical (requires backup)
   */
  private isCriticalStep(step: MigrationStep): boolean {
    const criticalSteps = [
      MigrationStep.TEMPLATE_MODIFICATION,
      MigrationStep.IMPORT_PREPARATION,
      MigrationStep.VERIFICATION
    ];
    return criticalSteps.includes(step);
  }
}

export { MigrationStateMachine } from './state-machine';
export { StateManager } from './state-manager';
export { StepExecutorFactory, BaseStepExecutor } from './step-executor';
