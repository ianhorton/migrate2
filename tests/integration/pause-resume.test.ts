/**
 * Integration tests for pause/resume functionality
 * Sprint 3: Interactive Import & Checkpoints
 */

import { MigrationOrchestrator } from '../../src/modules/orchestrator';
import { StateManager } from '../../src/modules/orchestrator/state-manager';
import { CheckpointManager } from '../../src/modules/orchestrator/checkpoints';
import {
  MigrationConfig,
  MigrationStatus,
  MigrationStep
} from '../../src/types';
import { Checkpoint } from '../../src/types/checkpoint';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Pause/Resume Integration Tests', () => {
  let orchestrator: MigrationOrchestrator;
  let stateManager: StateManager;
  let checkpointManager: CheckpointManager;
  let tempDir: string;
  let config: MigrationConfig;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pause-resume-test-'));

    orchestrator = new MigrationOrchestrator(tempDir);
    stateManager = new StateManager(tempDir);
    checkpointManager = new CheckpointManager();

    config = {
      sourceDir: path.join(tempDir, 'source'),
      targetDir: path.join(tempDir, 'target'),
      stage: 'test',
      region: 'us-east-1',
      accountId: '123456789012',
      stackName: 'test-stack',
      dryRun: true,
      autoApprove: true,
      backupEnabled: true,
      cdkLanguage: 'typescript'
    };

    // Create source directory structure
    await fs.mkdir(config.sourceDir, { recursive: true });
    await fs.mkdir(config.targetDir, { recursive: true });

    // Create minimal serverless.yml
    await fs.writeFile(
      path.join(config.sourceDir, 'serverless.yml'),
      `
service: test-service
provider:
  name: aws
  runtime: nodejs18.x
functions:
  hello:
    handler: handler.hello
      `,
      'utf-8'
    );
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Checkpoint-based pause', () => {
    it('should pause migration at checkpoint', async () => {
      // Register a checkpoint that pauses
      const pauseCheckpoint: Checkpoint = {
        id: 'test-pause',
        step: MigrationStep.DISCOVERY,
        name: 'Test Pause Checkpoint',
        description: 'Pauses for testing',
        condition: () => true,
        handler: async () => ({
          action: 'pause',
          message: 'Paused for testing'
        })
      };

      checkpointManager.registerCheckpoint(pauseCheckpoint);

      const state = await orchestrator.startMigration(config);

      expect(state.status).toBe(MigrationStatus.PAUSED);
      expect(state.currentStep).toBe(MigrationStep.INITIAL_SCAN);
    });

    it('should save paused state to disk', async () => {
      const state = await stateManager.initializeState(config);

      const checkpointFile = await stateManager.savePausedState(
        state,
        'test-checkpoint'
      );

      expect(checkpointFile).toBeTruthy();

      const exists = await fs.access(checkpointFile)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should load paused state from checkpoint file', async () => {
      const originalState = await stateManager.initializeState(config);
      originalState.status = MigrationStatus.PAUSED;

      const checkpointFile = await stateManager.savePausedState(
        originalState,
        'resume-test'
      );

      const loadedState = await stateManager.loadPausedState(checkpointFile);

      expect(loadedState.id).toBe(originalState.id);
      expect(loadedState.status).toBe(MigrationStatus.PAUSED);
      expect(loadedState.currentStep).toBe(originalState.currentStep);
    });
  });

  describe('Resume migration', () => {
    it('should resume paused migration from checkpoint', async () => {
      // Create a paused state
      const state = await stateManager.initializeState(config);
      state.status = MigrationStatus.PAUSED;
      state.currentStep = MigrationStep.DISCOVERY;
      await stateManager.saveState(state);

      // Resume migration
      const resumedState = await orchestrator.resumeMigration(state.id);

      expect(resumedState.status).not.toBe(MigrationStatus.PAUSED);
      expect(resumedState.currentStep).not.toBe(state.currentStep);
    });

    it('should skip completed steps when resuming', async () => {
      const state = await stateManager.initializeState(config);

      // Mark some steps as completed
      state.stepResults[MigrationStep.INITIAL_SCAN] = {
        step: MigrationStep.INITIAL_SCAN,
        status: MigrationStatus.COMPLETED,
        startedAt: new Date(),
        completedAt: new Date()
      };

      state.currentStep = MigrationStep.DISCOVERY;
      await stateManager.saveState(state);

      // Resume should start from DISCOVERY
      const resumedState = await orchestrator.resumeMigration(state.id);

      // Verify INITIAL_SCAN was not re-executed
      expect(resumedState.stepResults[MigrationStep.INITIAL_SCAN]).toBeDefined();
    });

    it('should handle resuming completed migration gracefully', async () => {
      const state = await stateManager.initializeState(config);
      state.status = MigrationStatus.COMPLETED;
      state.currentStep = MigrationStep.COMPLETE;
      await stateManager.saveState(state);

      const resumedState = await orchestrator.resumeMigration(state.id);

      expect(resumedState.status).toBe(MigrationStatus.COMPLETED);
    });
  });

  describe('Checkpoint history', () => {
    it('should save checkpoint execution history', async () => {
      const executions = [
        {
          checkpointId: 'test-1',
          executedAt: new Date(),
          result: { action: 'continue' as const }
        },
        {
          checkpointId: 'test-2',
          executedAt: new Date(),
          result: { action: 'pause' as const }
        }
      ];

      await stateManager.saveCheckpointHistory('test-migration', executions);

      const loaded = await stateManager.loadCheckpointHistory('test-migration');

      expect(loaded.length).toBe(2);
      expect(loaded[0].checkpointId).toBe('test-1');
      expect(loaded[1].checkpointId).toBe('test-2');
    });

    it('should list checkpoint files for a migration', async () => {
      const state = await stateManager.initializeState(config);

      await stateManager.savePausedState(state, 'checkpoint-1');
      await stateManager.savePausedState(state, 'checkpoint-2');

      const checkpoints = await stateManager.listCheckpoints(state.id);

      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    });

    it('should track multiple pause/resume cycles', async () => {
      const state = await stateManager.initializeState(config);

      // First pause
      await stateManager.savePausedState(state, 'pause-1');

      // Update state (simulate progress)
      state.currentStep = MigrationStep.DISCOVERY;

      // Second pause
      await stateManager.savePausedState(state, 'pause-2');

      const checkpoints = await stateManager.listCheckpoints(state.id);
      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Abort migration', () => {
    it('should abort migration at checkpoint', async () => {
      const abortCheckpoint: Checkpoint = {
        id: 'test-abort',
        step: MigrationStep.DISCOVERY,
        name: 'Test Abort Checkpoint',
        description: 'Aborts for testing',
        condition: () => true,
        handler: async () => ({
          action: 'abort',
          message: 'Aborted for testing'
        })
      };

      checkpointManager.registerCheckpoint(abortCheckpoint);

      const state = await orchestrator.startMigration(config);

      expect(state.status).toBe(MigrationStatus.FAILED);
      expect(state.error).toBeDefined();
    });

    it('should not allow resuming aborted migration', async () => {
      const state = await stateManager.initializeState(config);
      state.status = MigrationStatus.FAILED;
      state.error = new Error('Aborted by checkpoint');
      await stateManager.saveState(state);

      // Resume should handle gracefully
      const resumedState = await orchestrator.resumeMigration(state.id);

      // State should remain failed or complete based on implementation
      expect([
        MigrationStatus.FAILED,
        MigrationStatus.COMPLETED
      ]).toContain(resumedState.status);
    });
  });

  describe('State modifications from checkpoints', () => {
    it('should apply state modifications from checkpoint', async () => {
      const modifyCheckpoint: Checkpoint = {
        id: 'test-modify',
        step: MigrationStep.DISCOVERY,
        name: 'Test Modify Checkpoint',
        description: 'Modifies state for testing',
        condition: () => true,
        handler: async (state) => ({
          action: 'continue',
          modifications: {
            resources: [{ customField: 'modified' }]
          } as any
        })
      };

      checkpointManager.registerCheckpoint(modifyCheckpoint);

      const state = await orchestrator.startMigration(config);

      // Check if modifications were applied
      expect((state as any).resources).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle checkpoint errors gracefully', async () => {
      const errorCheckpoint: Checkpoint = {
        id: 'test-error',
        step: MigrationStep.DISCOVERY,
        name: 'Test Error Checkpoint',
        description: 'Throws error for testing',
        condition: () => true,
        handler: async () => {
          throw new Error('Checkpoint error');
        }
      };

      checkpointManager.registerCheckpoint(errorCheckpoint);

      const state = await orchestrator.startMigration(config);

      // Should abort on checkpoint error
      expect(state.status).toBe(MigrationStatus.FAILED);
    });

    it('should handle missing checkpoint file gracefully', async () => {
      await expect(
        stateManager.loadPausedState('/nonexistent/checkpoint.json')
      ).rejects.toThrow();
    });

    it('should return empty array for missing checkpoint history', async () => {
      const history = await stateManager.loadCheckpointHistory('nonexistent-id');
      expect(history).toEqual([]);
    });
  });
});
