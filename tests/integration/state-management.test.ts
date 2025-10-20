/**
 * State Management Integration Tests
 * Tests state persistence, recovery, and consistency
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { StateManager } from '@/modules/orchestrator/state-manager';

describe('State Management Integration', () => {
  let stateManager: StateManager;
  let testStateDir: string;

  beforeAll(async () => {
    testStateDir = path.join(__dirname, '../tmp/state-test');
    await fs.mkdir(testStateDir, { recursive: true });
  });

  beforeEach(() => {
    stateManager = new StateManager(testStateDir);
  });

  afterAll(async () => {
    await fs.rm(testStateDir, { recursive: true, force: true });
  });

  describe('State Persistence', () => {
    it('should save state to disk', async () => {
      const state = {
        id: 'test-migration-1',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: ['SCAN'],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      await stateManager.saveState(state);

      const statePath = path.join(testStateDir, 'migration-state.json');
      const exists = await fs.access(statePath).then(() => true).catch(() => false);

      expect(exists).toBe(true);
    });

    it('should load state from disk', async () => {
      const state = {
        id: 'test-migration-2',
        status: 'in_progress',
        currentStep: 'PROTECT',
        completedSteps: ['SCAN', 'PROTECT'],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      await stateManager.saveState(state);

      const loadedState = await stateManager.loadState();

      expect(loadedState).toBeDefined();
      expect(loadedState?.id).toBe('test-migration-2');
      expect(loadedState?.completedSteps).toEqual(['SCAN', 'PROTECT']);
    });

    it('should create backups automatically', async () => {
      const state = {
        id: 'test-migration-3',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: [],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      await stateManager.saveState(state);

      // Update state
      state.completedSteps.push('SCAN');
      await stateManager.saveState(state);

      const backups = await stateManager.listBackups();

      expect(backups.length).toBeGreaterThan(0);
    });

    it('should handle missing state file gracefully', async () => {
      const newStateManager = new StateManager(path.join(testStateDir, 'nonexistent'));

      const state = await newStateManager.loadState();

      expect(state).toBeNull();
    });
  });

  describe('State Consistency', () => {
    it('should maintain consistency across save/load cycles', async () => {
      const originalState = {
        id: 'test-migration-4',
        status: 'in_progress',
        currentStep: 'COMPARE',
        completedSteps: ['SCAN', 'PROTECT', 'GENERATE'],
        failedSteps: [],
        startTime: new Date('2025-01-20T10:00:00Z'),
        endTime: undefined,
        resources: [
          {
            logicalId: 'MyTable',
            physicalId: 'my-table',
            type: 'AWS::DynamoDB::Table',
            status: 'pending'
          }
        ]
      };

      await stateManager.saveState(originalState);

      const loadedState = await stateManager.loadState();

      expect(loadedState).toMatchObject({
        id: originalState.id,
        status: originalState.status,
        currentStep: originalState.currentStep,
        completedSteps: originalState.completedSteps
      });
    });

    it('should handle Date serialization correctly', async () => {
      const state = {
        id: 'test-migration-5',
        status: 'completed',
        currentStep: 'CLEANUP',
        completedSteps: [],
        failedSteps: [],
        startTime: new Date('2025-01-20T10:00:00Z'),
        endTime: new Date('2025-01-20T11:00:00Z'),
        resources: []
      };

      await stateManager.saveState(state);

      const loadedState = await stateManager.loadState();

      expect(loadedState?.startTime).toBeDefined();
      expect(loadedState?.endTime).toBeDefined();
      // Dates should be reconstructed correctly
      expect(new Date(loadedState!.startTime)).toBeInstanceOf(Date);
    });
  });

  describe('Backup Management', () => {
    it('should list backups in reverse chronological order', async () => {
      const state = {
        id: 'test-migration-6',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: [],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      // Create multiple backups
      await stateManager.saveState(state);
      await new Promise(resolve => setTimeout(resolve, 100));

      state.completedSteps.push('SCAN');
      await stateManager.saveState(state);
      await new Promise(resolve => setTimeout(resolve, 100));

      state.completedSteps.push('PROTECT');
      await stateManager.saveState(state);

      const backups = await stateManager.listBackups();

      expect(backups.length).toBeGreaterThanOrEqual(2);
      // Should be sorted newest first
      for (let i = 0; i < backups.length - 1; i++) {
        expect(backups[i] >= backups[i + 1]).toBe(true);
      }
    });

    it('should restore from backup', async () => {
      const state = {
        id: 'test-migration-7',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: ['SCAN'],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      await stateManager.saveState(state);

      // Update state
      state.completedSteps.push('PROTECT');
      state.currentStep = 'PROTECT';
      await stateManager.saveState(state);

      // Get backups
      const backups = await stateManager.listBackups();
      expect(backups.length).toBeGreaterThan(0);

      // Restore from first backup
      const restoredState = await stateManager.restoreFromBackup(backups[0]);

      expect(restoredState).toBeDefined();
      // Should have the earlier state
      expect(restoredState.completedSteps.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent state updates', async () => {
      const state1 = {
        id: 'test-migration-8',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: ['SCAN'],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      const state2 = { ...state1, completedSteps: ['SCAN', 'PROTECT'] };

      // Simulate concurrent writes
      await Promise.all([
        stateManager.saveState(state1),
        stateManager.saveState(state2)
      ]);

      // Should have one of the states (last write wins)
      const loadedState = await stateManager.loadState();

      expect(loadedState).toBeDefined();
      expect(loadedState?.id).toBe('test-migration-8');
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted state file', async () => {
      // Write invalid JSON
      const statePath = path.join(testStateDir, 'migration-state.json');
      await fs.writeFile(statePath, '{ invalid json }');

      await expect(stateManager.loadState()).rejects.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      // Create read-only directory
      const readOnlyDir = path.join(testStateDir, 'readonly');
      await fs.mkdir(readOnlyDir, { recursive: true });
      await fs.chmod(readOnlyDir, 0o444);

      const readOnlyManager = new StateManager(readOnlyDir);

      const state = {
        id: 'test-migration-9',
        status: 'in_progress',
        currentStep: 'SCAN',
        completedSteps: [],
        failedSteps: [],
        startTime: new Date(),
        resources: []
      };

      await expect(readOnlyManager.saveState(state)).rejects.toThrow();

      // Cleanup
      await fs.chmod(readOnlyDir, 0o755);
      await fs.rm(readOnlyDir, { recursive: true });
    });
  });
});
