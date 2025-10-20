/**
 * Tests for State Manager
 */

import { StateManager } from '../../src/modules/orchestrator/state-manager';
import { MigrationConfig, MigrationStep, MigrationStatus } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('StateManager', () => {
  let stateManager: StateManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '.test-state');
    stateManager = new StateManager(testDir);
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  describe('initializeState', () => {
    it('should create new migration state', async () => {
      const config: MigrationConfig = {
        sourceDir: './test-source',
        targetDir: './test-target',
        stage: 'dev',
        region: 'us-east-1',
        accountId: '123456789012',
        stackName: 'test-stack',
        dryRun: false,
        autoApprove: false,
        backupEnabled: true,
        cdkLanguage: 'typescript'
      };

      const state = await stateManager.initializeState(config);

      expect(state.id).toBeDefined();
      expect(state.currentStep).toBe(MigrationStep.INITIAL_SCAN);
      expect(state.status).toBe(MigrationStatus.PENDING);
      expect(state.config).toEqual(config);
    });
  });

  describe('saveState and loadState', () => {
    it('should save and load state', async () => {
      const config: MigrationConfig = {
        sourceDir: './test',
        targetDir: './output',
        stage: 'dev',
        region: 'us-east-1',
        accountId: '123456789012',
        stackName: 'test',
        dryRun: false,
        autoApprove: false,
        backupEnabled: true,
        cdkLanguage: 'typescript'
      };

      const originalState = await stateManager.initializeState(config);
      const loadedState = await stateManager.loadState();

      expect(loadedState.id).toBe(originalState.id);
      expect(loadedState.currentStep).toBe(originalState.currentStep);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', async () => {
      const config: MigrationConfig = {
        sourceDir: './test',
        targetDir: './output',
        stage: 'dev',
        region: 'us-east-1',
        accountId: '123456789012',
        stackName: 'test',
        dryRun: false,
        autoApprove: false,
        backupEnabled: true,
        cdkLanguage: 'typescript'
      };

      const state = await stateManager.initializeState(config);
      const progress = stateManager.getProgress(state);

      expect(progress.percentage).toBe(0);
      expect(progress.completedSteps).toBe(0);
      expect(progress.totalSteps).toBeGreaterThan(0);
    });
  });
});
