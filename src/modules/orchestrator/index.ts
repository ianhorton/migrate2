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
import { CheckpointManager } from './checkpoints';
import { Logger } from '../../utils/logger';

export class MigrationOrchestrator {
  private stateManager: StateManager;
  private checkpointManager: CheckpointManager;
  private logger: Logger;
  private executorsInitialized: boolean = false;

  constructor(workingDir?: string) {
    this.stateManager = new StateManager(workingDir);
    this.checkpointManager = new CheckpointManager();
    this.logger = new Logger('MigrationOrchestrator');
  }

  /**
   * Initialize step executors
   */
  private async ensureExecutorsInitialized(): Promise<void> {
    if (!this.executorsInitialized) {
      await StepExecutorFactory.initializeExecutors();
      this.executorsInitialized = true;
      this.logger.info('Step executors initialized');
    }
  }

  /**
   * Start a new migration
   */
  public async startMigration(
    config: MigrationConfig,
    options: OrchestratorOptions = {}
  ): Promise<MigrationState> {
    this.logger.info('Starting new migration', { config });

    // Initialize executors
    await this.ensureExecutorsInitialized();

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

    // Initialize executors
    await this.ensureExecutorsInitialized();

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
   * Execute migration steps with checkpoint support
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

      // Check for checkpoints BEFORE executing step
      const checkpoint = await this.checkpointManager.shouldTrigger(state, step);

      if (checkpoint) {
        this.logger.info(`Checkpoint triggered: ${checkpoint.name}`);
        console.log(`\n🛑 Checkpoint: ${checkpoint.name}\n`);
        console.log(`   ${checkpoint.description}\n`);

        const checkpointResult = await this.checkpointManager.executeCheckpoint(
          checkpoint,
          state
        );

        if (checkpointResult.action === 'pause') {
          this.logger.info('Migration paused at checkpoint');
          console.log(`\n⏸️  Migration paused: ${checkpointResult.message || 'User requested pause'}`);

          state.status = MigrationStatus.PAUSED;
          await this.stateManager.saveState(state);
          return state;
        }

        if (checkpointResult.action === 'abort') {
          this.logger.warn('Migration aborted at checkpoint');
          console.log(`\n🛑 Migration aborted: ${checkpointResult.message || 'User requested abort'}`);

          state.status = MigrationStatus.FAILED;
          state.error = new Error(checkpointResult.message || 'Aborted by checkpoint');
          await this.stateManager.saveState(state);
          return state;
        }

        // Apply modifications from checkpoint
        if (checkpointResult.modifications) {
          this.logger.info('Applying checkpoint modifications', checkpointResult.modifications);
          state = { ...state, ...checkpointResult.modifications };
          await this.stateManager.saveState(state);
        }
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
export { CheckpointManager } from './checkpoints';
