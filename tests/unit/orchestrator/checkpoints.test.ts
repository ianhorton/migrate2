/**
 * Unit tests for CheckpointManager
 * Sprint 3: Interactive Import & Checkpoints
 */

import { CheckpointManager } from '../../../src/modules/orchestrator/checkpoints';
import { Checkpoint, CheckpointResult } from '../../../src/types/checkpoint';
import { MigrationState, MigrationStep, MigrationStatus } from '../../../src/types';

describe('CheckpointManager', () => {
  let checkpointManager: CheckpointManager;
  let mockState: MigrationState;

  beforeEach(() => {
    checkpointManager = new CheckpointManager();

    mockState = {
      id: 'test-migration-123',
      currentStep: MigrationStep.DISCOVERY,
      status: MigrationStatus.IN_PROGRESS,
      config: {
        sourceDir: '/source',
        targetDir: '/target',
        stage: 'dev',
        region: 'us-east-1',
        accountId: '123456789012',
        stackName: 'test-stack',
        dryRun: false,
        autoApprove: false,
        backupEnabled: true,
        cdkLanguage: 'typescript'
      },
      stepResults: {} as any,
      startedAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('registerCheckpoint', () => {
    it('should register a new checkpoint', () => {
      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        step: MigrationStep.DISCOVERY,
        name: 'Test Checkpoint',
        description: 'Test checkpoint description',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      checkpointManager.registerCheckpoint(checkpoint);

      const checkpoints = checkpointManager.getCheckpoints();
      expect(checkpoints).toContainEqual(checkpoint);
    });

    it('should allow multiple checkpoints for the same step', () => {
      const checkpoint1: Checkpoint = {
        id: 'checkpoint-1',
        step: MigrationStep.DISCOVERY,
        name: 'Checkpoint 1',
        description: 'First checkpoint',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      const checkpoint2: Checkpoint = {
        id: 'checkpoint-2',
        step: MigrationStep.DISCOVERY,
        name: 'Checkpoint 2',
        description: 'Second checkpoint',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      checkpointManager.registerCheckpoint(checkpoint1);
      checkpointManager.registerCheckpoint(checkpoint2);

      const checkpoints = checkpointManager.getCheckpoints();
      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('shouldTrigger', () => {
    it('should trigger checkpoint when condition is met', async () => {
      const checkpoint: Checkpoint = {
        id: 'trigger-test',
        step: MigrationStep.DISCOVERY,
        name: 'Trigger Test',
        description: 'Test triggering',
        condition: (state) => state.currentStep === MigrationStep.DISCOVERY,
        handler: async () => ({ action: 'continue' })
      };

      checkpointManager.registerCheckpoint(checkpoint);

      const triggered = await checkpointManager.shouldTrigger(
        mockState,
        MigrationStep.DISCOVERY
      );

      expect(triggered).toEqual(checkpoint);
    });

    it('should not trigger checkpoint when condition is not met', async () => {
      const checkpoint: Checkpoint = {
        id: 'no-trigger-test',
        step: MigrationStep.DISCOVERY,
        name: 'No Trigger Test',
        description: 'Test not triggering',
        condition: () => false,
        handler: async () => ({ action: 'continue' })
      };

      checkpointManager.registerCheckpoint(checkpoint);

      const triggered = await checkpointManager.shouldTrigger(
        mockState,
        MigrationStep.DISCOVERY
      );

      expect(triggered).toBeNull();
    });

    it('should return null for steps with no checkpoints', async () => {
      const triggered = await checkpointManager.shouldTrigger(
        mockState,
        MigrationStep.CDK_GENERATION
      );

      expect(triggered).toBeNull();
    });

    it('should handle async conditions', async () => {
      const checkpoint: Checkpoint = {
        id: 'async-condition',
        step: MigrationStep.DISCOVERY,
        name: 'Async Condition Test',
        description: 'Test async condition',
        condition: async (state) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return state.status === MigrationStatus.IN_PROGRESS;
        },
        handler: async () => ({ action: 'continue' })
      };

      checkpointManager.registerCheckpoint(checkpoint);

      const triggered = await checkpointManager.shouldTrigger(
        mockState,
        MigrationStep.DISCOVERY
      );

      expect(triggered).toEqual(checkpoint);
    });
  });

  describe('executeCheckpoint', () => {
    it('should execute checkpoint handler and return result', async () => {
      const expectedResult: CheckpointResult = {
        action: 'continue',
        message: 'Test completed'
      };

      const checkpoint: Checkpoint = {
        id: 'execute-test',
        step: MigrationStep.DISCOVERY,
        name: 'Execute Test',
        description: 'Test execution',
        condition: () => true,
        handler: async () => expectedResult
      };

      const result = await checkpointManager.executeCheckpoint(checkpoint, mockState);

      expect(result).toEqual(expectedResult);
    });

    it('should record execution in history', async () => {
      const checkpoint: Checkpoint = {
        id: 'history-test',
        step: MigrationStep.DISCOVERY,
        name: 'History Test',
        description: 'Test history recording',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      await checkpointManager.executeCheckpoint(checkpoint, mockState);

      const history = checkpointManager.getExecutionHistory(mockState.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].checkpointId).toBe('history-test');
    });

    it('should handle checkpoint handler errors', async () => {
      const checkpoint: Checkpoint = {
        id: 'error-test',
        step: MigrationStep.DISCOVERY,
        name: 'Error Test',
        description: 'Test error handling',
        condition: () => true,
        handler: async () => {
          throw new Error('Handler failed');
        }
      };

      const result = await checkpointManager.executeCheckpoint(checkpoint, mockState);

      expect(result.action).toBe('abort');
      expect(result.message).toContain('Handler failed');
    });

    it('should support state modifications', async () => {
      const modifications = {
        status: MigrationStatus.PAUSED
      };

      const checkpoint: Checkpoint = {
        id: 'modify-test',
        step: MigrationStep.DISCOVERY,
        name: 'Modify Test',
        description: 'Test state modifications',
        condition: () => true,
        handler: async () => ({
          action: 'continue',
          modifications
        })
      };

      const result = await checkpointManager.executeCheckpoint(checkpoint, mockState);

      expect(result.modifications).toEqual(modifications);
    });
  });

  describe('predefined checkpoints', () => {
    it('should have physical ID resolution checkpoint registered', () => {
      const checkpoints = checkpointManager.getCheckpoints();
      const physicalIdCheckpoint = checkpoints.find(
        cp => cp.id === 'physical-id-resolution'
      );

      expect(physicalIdCheckpoint).toBeDefined();
      expect(physicalIdCheckpoint?.step).toBe(MigrationStep.DISCOVERY);
    });

    it('should have critical differences checkpoint registered', () => {
      const checkpoints = checkpointManager.getCheckpoints();
      const criticalDiffCheckpoint = checkpoints.find(
        cp => cp.id === 'critical-differences'
      );

      expect(criticalDiffCheckpoint).toBeDefined();
      expect(criticalDiffCheckpoint?.step).toBe(MigrationStep.COMPARISON);
    });

    it('should have drift detection checkpoint registered', () => {
      const checkpoints = checkpointManager.getCheckpoints();
      const driftCheckpoint = checkpoints.find(
        cp => cp.id === 'drift-detection'
      );

      expect(driftCheckpoint).toBeDefined();
      expect(driftCheckpoint?.step).toBe(MigrationStep.TEMPLATE_MODIFICATION);
    });

    it('should have pre-import verification checkpoint registered', () => {
      const checkpoints = checkpointManager.getCheckpoints();
      const preImportCheckpoint = checkpoints.find(
        cp => cp.id === 'pre-import-verification'
      );

      expect(preImportCheckpoint).toBeDefined();
      expect(preImportCheckpoint?.step).toBe(MigrationStep.IMPORT_PREPARATION);
    });

    it('should trigger physical ID checkpoint for unresolved resources', async () => {
      const stateWithResources = {
        ...mockState,
        resources: [
          {
            LogicalId: 'MyTable',
            Type: 'AWS::DynamoDB::Table',
            isStateful: true,
            physicalId: undefined
          }
        ]
      } as any;

      const checkpoint = await checkpointManager.shouldTrigger(
        stateWithResources,
        MigrationStep.DISCOVERY
      );

      expect(checkpoint?.id).toBe('physical-id-resolution');
    });

    it('should trigger critical differences checkpoint for critical issues', async () => {
      const stateWithCriticalDiffs = {
        ...mockState,
        currentStep: MigrationStep.COMPARISON,
        comparisonResult: {
          classifications: [
            { category: 'critical', explanation: 'Critical difference found' }
          ]
        }
      } as any;

      const checkpoint = await checkpointManager.shouldTrigger(
        stateWithCriticalDiffs,
        MigrationStep.COMPARISON
      );

      expect(checkpoint?.id).toBe('critical-differences');
    });

    it('should execute pre-import verification checkpoint', async () => {
      const checkpoints = checkpointManager.getCheckpoints();
      const preImportCheckpoint = checkpoints.find(
        cp => cp.id === 'pre-import-verification'
      );

      if (!preImportCheckpoint) {
        throw new Error('Pre-import checkpoint not found');
      }

      const result = await checkpointManager.executeCheckpoint(
        preImportCheckpoint,
        mockState
      );

      expect(result.action).toBe('continue');
    });
  });

  describe('getExecutionHistory', () => {
    it('should return execution history', async () => {
      const checkpoint: Checkpoint = {
        id: 'history-test',
        step: MigrationStep.DISCOVERY,
        name: 'History Test',
        description: 'Test',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      await checkpointManager.executeCheckpoint(checkpoint, mockState);
      await checkpointManager.executeCheckpoint(checkpoint, mockState);

      const history = checkpointManager.getExecutionHistory(mockState.id);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0]).toHaveProperty('checkpointId');
      expect(history[0]).toHaveProperty('executedAt');
      expect(history[0]).toHaveProperty('result');
    });
  });

  describe('clearHistory', () => {
    it('should clear execution history', async () => {
      const checkpoint: Checkpoint = {
        id: 'clear-test',
        step: MigrationStep.DISCOVERY,
        name: 'Clear Test',
        description: 'Test',
        condition: () => true,
        handler: async () => ({ action: 'continue' })
      };

      await checkpointManager.executeCheckpoint(checkpoint, mockState);

      let history = checkpointManager.getExecutionHistory(mockState.id);
      expect(history.length).toBeGreaterThan(0);

      checkpointManager.clearHistory();

      history = checkpointManager.getExecutionHistory(mockState.id);
      expect(history.length).toBe(0);
    });
  });
});
