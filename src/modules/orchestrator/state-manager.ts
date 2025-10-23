/**
 * State Manager for Migration Process
 * Handles state persistence, restoration, and rollback
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationState, MigrationStatus, MigrationStep, StepResult, MigrationConfig } from '../../types';
import { CheckpointExecution } from '../../types/checkpoint';
import { MigrationStateMachine } from './state-machine';

export class StateManager {
  private readonly stateDir: string;
  private readonly stateFile: string;
  private readonly backupDir: string;
  private readonly checkpointDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.stateDir = path.join(workingDir, '.migration-state');
    this.stateFile = path.join(this.stateDir, 'state.json');
    this.backupDir = path.join(this.stateDir, 'backups');
    this.checkpointDir = path.join(this.stateDir, 'checkpoints');
  }

  /**
   * Initialize a new migration state
   */
  public async initializeState(config: MigrationConfig): Promise<MigrationState> {
    await this.ensureStateDirectory();

    const state: MigrationState = {
      id: this.generateStateId(),
      currentStep: MigrationStep.INITIAL_SCAN,
      status: MigrationStatus.PENDING,
      config,
      stepResults: {} as Record<MigrationStep, StepResult>,
      startedAt: new Date(),
      updatedAt: new Date()
    };

    await this.saveState(state);
    return state;
  }

  /**
   * Load existing migration state
   */
  public async loadState(stateId?: string): Promise<MigrationState> {
    const filePath = stateId
      ? path.join(this.stateDir, `state-${stateId}.json`)
      : this.stateFile;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const state = JSON.parse(content, (key, value) => {
        // Convert date strings back to Date objects
        if (key.endsWith('At') && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });
      return state as MigrationState;
    } catch (error) {
      throw new Error(`Failed to load state from ${filePath}: ${error}`);
    }
  }

  /**
   * Save current state to disk
   */
  public async saveState(state: MigrationState): Promise<void> {
    await this.ensureStateDirectory();

    state.updatedAt = new Date();
    const content = JSON.stringify(state, null, 2);

    await fs.writeFile(this.stateFile, content, 'utf-8');

    // Also save with state ID for history
    const historicalFile = path.join(this.stateDir, `state-${state.id}.json`);
    await fs.writeFile(historicalFile, content, 'utf-8');
  }

  /**
   * Update state with step result
   */
  public async updateStepResult(
    state: MigrationState,
    stepResult: StepResult
  ): Promise<MigrationState> {
    state.stepResults[stepResult.step] = stepResult;

    // Update current step if completed
    if (stepResult.status === MigrationStatus.COMPLETED) {
      const nextStep = MigrationStateMachine.getNextStep(stepResult.step);
      if (nextStep) {
        state.currentStep = nextStep;
        state.status = MigrationStatus.IN_PROGRESS;
      } else {
        state.currentStep = MigrationStep.COMPLETE;
        state.status = MigrationStatus.COMPLETED;
        state.completedAt = new Date();
      }
    } else if (stepResult.status === MigrationStatus.FAILED) {
      state.status = MigrationStatus.FAILED;
      state.error = stepResult.error;
    }

    await this.saveState(state);
    return state;
  }

  /**
   * Create a backup of the current state
   */
  public async createBackup(state: MigrationState, label?: string): Promise<string> {
    await this.ensureBackupDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupLabel = label || state.currentStep;
    const backupFile = path.join(
      this.backupDir,
      `backup-${state.id}-${backupLabel}-${timestamp}.json`
    );

    await fs.writeFile(backupFile, JSON.stringify(state, null, 2), 'utf-8');
    return backupFile;
  }

  /**
   * Restore state from backup
   */
  public async restoreFromBackup(backupFile: string): Promise<MigrationState> {
    try {
      const content = await fs.readFile(backupFile, 'utf-8');
      const state = JSON.parse(content) as MigrationState;
      await this.saveState(state);
      return state;
    } catch (error) {
      throw new Error(`Failed to restore from backup ${backupFile}: ${error}`);
    }
  }

  /**
   * Rollback to a specific step
   */
  public async rollbackToStep(
    state: MigrationState,
    targetStep: MigrationStep
  ): Promise<MigrationState> {
    const targetIndex = MigrationStateMachine.getStepIndex(targetStep);
    const currentIndex = MigrationStateMachine.getStepIndex(state.currentStep);

    if (targetIndex >= currentIndex) {
      throw new Error('Can only rollback to previous steps');
    }

    // Create backup before rollback
    await this.createBackup(state, `pre-rollback-${targetStep}`);

    // Clear results for steps after target
    const allSteps = MigrationStateMachine.getAllSteps();
    for (let i = targetIndex + 1; i < allSteps.length; i++) {
      delete state.stepResults[allSteps[i]];
    }

    state.currentStep = targetStep;
    state.status = MigrationStatus.ROLLED_BACK;
    state.updatedAt = new Date();

    await this.saveState(state);
    return state;
  }

  /**
   * List all available state files
   */
  public async listStates(): Promise<{ id: string; file: string; modifiedAt: Date }[]> {
    await this.ensureStateDirectory();

    try {
      const files = await fs.readdir(this.stateDir);
      const stateFiles = files.filter(f => f.startsWith('state-') && f.endsWith('.json'));

      const states = await Promise.all(
        stateFiles.map(async (file) => {
          const filePath = path.join(this.stateDir, file);
          const stats = await fs.stat(filePath);
          const id = file.replace('state-', '').replace('.json', '');
          return { id, file: filePath, modifiedAt: stats.mtime };
        })
      );

      return states.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    } catch (error) {
      return [];
    }
  }

  /**
   * List all backups for a state
   */
  public async listBackups(stateId?: string): Promise<string[]> {
    await this.ensureBackupDirectory();

    try {
      const files = await fs.readdir(this.backupDir);
      let backups = files.filter(f => f.startsWith('backup-') && f.endsWith('.json'));

      if (stateId) {
        backups = backups.filter(f => f.includes(stateId));
      }

      return backups.map(f => path.join(this.backupDir, f));
    } catch (error) {
      return [];
    }
  }

  /**
   * Clean up old states and backups
   */
  public async cleanup(keepDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    // Clean up old state files
    const states = await this.listStates();
    for (const state of states) {
      if (state.modifiedAt < cutoffDate) {
        await fs.unlink(state.file);
      }
    }

    // Clean up old backups
    const backups = await this.listBackups();
    for (const backup of backups) {
      const stats = await fs.stat(backup);
      if (stats.mtime < cutoffDate) {
        await fs.unlink(backup);
      }
    }
  }

  /**
   * Get current migration progress
   */
  public getProgress(state: MigrationState): {
    currentStep: MigrationStep;
    percentage: number;
    completedSteps: number;
    totalSteps: number;
    remainingSteps: MigrationStep[];
  } {
    const allSteps = MigrationStateMachine.getAllSteps();
    const completedSteps = MigrationStateMachine.getCompletedSteps(state);
    const remainingSteps = MigrationStateMachine.getStepsRemaining(state.currentStep);

    return {
      currentStep: state.currentStep,
      percentage: MigrationStateMachine.calculateProgress(state.currentStep),
      completedSteps: completedSteps.length,
      totalSteps: allSteps.length,
      remainingSteps
    };
  }

  private async ensureStateDirectory(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  private async ensureBackupDirectory(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  private generateStateId(): string {
    return `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save paused state with checkpoint information
   */
  public async savePausedState(
    state: MigrationState,
    checkpointId: string
  ): Promise<string> {
    await this.ensureCheckpointDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const checkpointFile = path.join(
      this.checkpointDir,
      `checkpoint-${state.id}-${checkpointId}-${timestamp}.json`
    );

    const checkpointData = {
      state,
      checkpointId,
      pausedAt: new Date(),
      resumable: true
    };

    await fs.writeFile(
      checkpointFile,
      JSON.stringify(checkpointData, null, 2),
      'utf-8'
    );

    return checkpointFile;
  }

  /**
   * Load paused state from checkpoint
   */
  public async loadPausedState(checkpointFile: string): Promise<MigrationState> {
    try {
      const content = await fs.readFile(checkpointFile, 'utf-8');
      const checkpointData = JSON.parse(content);

      // Convert date strings back to Date objects
      const state = checkpointData.state as MigrationState;
      state.startedAt = new Date(state.startedAt);
      state.updatedAt = new Date(state.updatedAt);
      if (state.completedAt) {
        state.completedAt = new Date(state.completedAt);
      }

      return state;
    } catch (error) {
      throw new Error(`Failed to load paused state from ${checkpointFile}: ${error}`);
    }
  }

  /**
   * List all checkpoint files for a migration
   */
  public async listCheckpoints(stateId?: string): Promise<string[]> {
    await this.ensureCheckpointDirectory();

    try {
      const files = await fs.readdir(this.checkpointDir);
      let checkpoints = files.filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));

      if (stateId) {
        checkpoints = checkpoints.filter(f => f.includes(stateId));
      }

      return checkpoints.map(f => path.join(this.checkpointDir, f));
    } catch (error) {
      return [];
    }
  }

  /**
   * Save checkpoint execution history
   */
  public async saveCheckpointHistory(
    stateId: string,
    executions: CheckpointExecution[]
  ): Promise<void> {
    await this.ensureCheckpointDirectory();

    const historyFile = path.join(
      this.checkpointDir,
      `history-${stateId}.json`
    );

    await fs.writeFile(
      historyFile,
      JSON.stringify(executions, null, 2),
      'utf-8'
    );
  }

  /**
   * Load checkpoint execution history
   */
  public async loadCheckpointHistory(stateId: string): Promise<CheckpointExecution[]> {
    const historyFile = path.join(
      this.checkpointDir,
      `history-${stateId}.json`
    );

    try {
      const content = await fs.readFile(historyFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return [];
    }
  }

  private async ensureCheckpointDirectory(): Promise<void> {
    await fs.mkdir(this.checkpointDir, { recursive: true });
  }
}
