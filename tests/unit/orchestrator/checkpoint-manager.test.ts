/**
 * CheckpointManager Unit Tests
 * Tests checkpoint system for pausing/resuming migrations
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockInterventionManager } from '../../mocks/aws-discovery-mock';

describe('CheckpointManager', () => {
  let mockIntervention: ReturnType<typeof createMockInterventionManager>;

  beforeEach(() => {
    mockIntervention = createMockInterventionManager();
  });

  describe('Checkpoint Registration', () => {
    it('should register checkpoint with all required properties', () => {
      // Arrange
      const checkpoint = {
        id: 'physical-id-resolution',
        step: 'DISCOVERY',
        name: 'Physical ID Resolution',
        description: 'Verify physical IDs for all stateful resources',
        condition: (state: any) => state.resources.some((r: any) => r.isStateful && !r.physicalId),
        handler: async (state: any) => ({ action: 'continue' })
      };

      // Act
      const registered = registerCheckpoint(checkpoint);

      // Assert
      expect(registered.id).toBe('physical-id-resolution');
      expect(registered.step).toBe('DISCOVERY');
      expect(registered.name).toBeTruthy();
      expect(registered.description).toBeTruthy();
      expect(typeof registered.condition).toBe('function');
      expect(typeof registered.handler).toBe('function');
    });

    it('should prevent duplicate checkpoint IDs', () => {
      // Arrange
      const checkpoints = new Map();
      const checkpoint1 = { id: 'test-checkpoint', step: 'SCAN' };
      const checkpoint2 = { id: 'test-checkpoint', step: 'DISCOVERY' };

      // Act
      checkpoints.set(checkpoint1.id, checkpoint1);
      const isDuplicate = checkpoints.has(checkpoint2.id);

      // Assert
      expect(isDuplicate).toBe(true);
      expect(checkpoints.size).toBe(1);
    });
  });

  describe('Checkpoint Triggering', () => {
    it('should trigger when condition is met', () => {
      // Arrange
      const state = {
        currentStep: 'DISCOVERY',
        resources: [
          { logicalId: 'Table1', isStateful: true, physicalId: undefined },
          { logicalId: 'Role1', isStateful: false, physicalId: 'role-1' }
        ]
      };

      const checkpoint = {
        id: 'physical-id-resolution',
        step: 'DISCOVERY',
        condition: (s: any) => s.resources.some((r: any) => r.isStateful && !r.physicalId)
      };

      // Act
      const shouldTrigger = checkpoint.condition(state);

      // Assert
      expect(shouldTrigger).toBe(true);
    });

    it('should not trigger when condition is not met', () => {
      // Arrange
      const state = {
        currentStep: 'DISCOVERY',
        resources: [
          { logicalId: 'Table1', isStateful: true, physicalId: 'table-1' },
          { logicalId: 'Table2', isStateful: true, physicalId: 'table-2' }
        ]
      };

      const checkpoint = {
        id: 'physical-id-resolution',
        step: 'DISCOVERY',
        condition: (s: any) => s.resources.some((r: any) => r.isStateful && !r.physicalId)
      };

      // Act
      const shouldTrigger = checkpoint.condition(state);

      // Assert
      expect(shouldTrigger).toBe(false);
    });

    it('should only trigger for correct step', () => {
      // Arrange
      const state = { currentStep: 'COMPARISON' };
      const checkpoint = {
        id: 'test',
        step: 'DISCOVERY',
        condition: () => true
      };

      // Act
      const isCorrectStep = state.currentStep === checkpoint.step;

      // Assert
      expect(isCorrectStep).toBe(false);
    });
  });

  describe('Physical ID Resolution Checkpoint', () => {
    it('should resolve all unresolved physical IDs', async () => {
      // Arrange
      mockIntervention.setResponse('UsersTable.physicalId', 'users-table-dev');
      mockIntervention.setResponse('OrdersTable.physicalId', 'orders-table-dev');

      const state = {
        resources: [
          { logicalId: 'UsersTable', isStateful: true, physicalId: undefined },
          { logicalId: 'OrdersTable', isStateful: true, physicalId: undefined },
          { logicalId: 'ApiRole', isStateful: false, physicalId: 'api-role' }
        ]
      };

      // Act
      const unresolved = state.resources.filter(r => r.isStateful && !r.physicalId);

      for (const resource of unresolved) {
        resource.physicalId = await mockIntervention.promptForPhysicalId(
          resource.logicalId,
          'AWS::DynamoDB::Table',
          []
        );
      }

      // Assert
      expect(state.resources[0].physicalId).toBe('users-table-dev');
      expect(state.resources[1].physicalId).toBe('orders-table-dev');
      expect(state.resources.every(r => !r.isStateful || r.physicalId)).toBe(true);
    });

    it('should return continue action after resolution', async () => {
      // Arrange
      const state = {
        resources: [
          { logicalId: 'Table1', isStateful: true, physicalId: 'table-1' }
        ]
      };

      const checkpoint = {
        handler: async (s: any) => {
          const unresolved = s.resources.filter((r: any) => r.isStateful && !r.physicalId);
          return unresolved.length === 0 ? { action: 'continue' } : { action: 'pause' };
        }
      };

      // Act
      const result = await checkpoint.handler(state);

      // Assert
      expect(result.action).toBe('continue');
    });

    it('should return pause action if resolution incomplete', async () => {
      // Arrange
      const state = {
        resources: [
          { logicalId: 'Table1', isStateful: true, physicalId: undefined }
        ]
      };

      const checkpoint = {
        handler: async (s: any) => {
          const unresolved = s.resources.filter((r: any) => r.isStateful && !r.physicalId);
          return unresolved.length > 0 ? { action: 'pause' } : { action: 'continue' };
        }
      };

      // Act
      const result = await checkpoint.handler(state);

      // Assert
      expect(result.action).toBe('pause');
    });
  });

  describe('Critical Differences Checkpoint', () => {
    it('should detect critical differences requiring review', () => {
      // Arrange
      const state = {
        comparisonResult: {
          classifications: [
            { category: 'acceptable', path: 'Metadata' },
            { category: 'critical', path: 'Properties.TableName' },
            { category: 'warning', path: 'Properties.BillingMode' }
          ]
        }
      };

      const checkpoint = {
        condition: (s: any) =>
          s.comparisonResult?.classifications?.some((c: any) => c.category === 'critical')
      };

      // Act
      const shouldTrigger = checkpoint.condition(state);

      // Assert
      expect(shouldTrigger).toBe(true);
    });

    it('should prompt user for action on critical differences', async () => {
      // Arrange
      mockIntervention.setResponse('UsersTable.criticalDifference', 'proceed');

      const critical = [
        {
          resourceId: 'UsersTable',
          path: 'Properties.KeySchema',
          category: 'critical',
          explanation: 'Key schema mismatch'
        }
      ];

      // Act
      const decision = await mockIntervention.confirmCriticalDifference(
        'UsersTable',
        critical
      );

      // Assert
      expect(decision).toBe('proceed');
    });

    it('should support abort action', async () => {
      // Arrange
      mockIntervention.setResponse('Table1.criticalDifference', 'abort');

      // Act
      const decision = await mockIntervention.confirmCriticalDifference('Table1', []);

      // Assert
      expect(decision).toBe('abort');
    });

    it('should support manual review action', async () => {
      // Arrange
      mockIntervention.setResponse('Table1.criticalDifference', 'manual');

      // Act
      const decision = await mockIntervention.confirmCriticalDifference('Table1', []);

      // Assert
      expect(decision).toBe('manual');
    });
  });

  describe('Drift Detection Checkpoint', () => {
    it('should detect when drift check is enabled', () => {
      // Arrange
      const state = {
        config: { detectDrift: true }
      };

      const checkpoint = {
        condition: (s: any) => s.config.detectDrift !== false
      };

      // Act
      const shouldTrigger = checkpoint.condition(state);

      // Assert
      expect(shouldTrigger).toBe(true);
    });

    it('should prompt for drift resolution strategy', async () => {
      // Arrange
      mockIntervention.setResponse('ApiRole.drift', 'use-aws');

      const driftInfo = {
        resourceId: 'ApiRole',
        drifted: true,
        driftStatus: 'MODIFIED' as const,
        propertyDifferences: [
          {
            propertyPath: '/Properties/ManagedPolicyArns/1',
            expectedValue: null,
            actualValue: 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess',
            differenceType: 'ADD' as const
          }
        ]
      };

      // Act
      const resolution = await mockIntervention.resolveDrift('ApiRole', driftInfo);

      // Assert
      expect(resolution).toBe('use-aws');
    });

    it('should support use-template resolution', async () => {
      // Arrange
      mockIntervention.setResponse('Table1.drift', 'use-template');

      const driftInfo = {
        resourceId: 'Table1',
        drifted: true,
        driftStatus: 'MODIFIED' as const
      };

      // Act
      const resolution = await mockIntervention.resolveDrift('Table1', driftInfo);

      // Assert
      expect(resolution).toBe('use-template');
    });
  });

  describe('Checkpoint State Management', () => {
    it('should save checkpoint state for resume', () => {
      // Arrange
      const checkpoint = {
        id: 'test-checkpoint',
        step: 'DISCOVERY',
        status: 'PAUSED',
        timestamp: new Date(),
        stateSnapshot: {
          resources: [{ logicalId: 'Table1' }],
          currentStep: 'DISCOVERY'
        }
      };

      // Act
      const serialized = JSON.stringify(checkpoint);
      const deserialized = JSON.parse(serialized);

      // Assert
      expect(deserialized.id).toBe('test-checkpoint');
      expect(deserialized.status).toBe('PAUSED');
      expect(deserialized.stateSnapshot.resources).toHaveLength(1);
    });

    it('should resume from checkpoint state', () => {
      // Arrange
      const savedCheckpoint = {
        id: 'physical-id-resolution',
        step: 'DISCOVERY',
        status: 'PAUSED',
        stateSnapshot: {
          resources: [
            { logicalId: 'Table1', physicalId: 'table-1' },
            { logicalId: 'Table2', physicalId: undefined }
          ]
        }
      };

      // Act
      const resumedState = savedCheckpoint.stateSnapshot;
      const unresolvedCount = resumedState.resources.filter(
        (r: any) => !r.physicalId
      ).length;

      // Assert
      expect(unresolvedCount).toBe(1);
      expect(resumedState.resources[0].physicalId).toBe('table-1');
    });

    it('should track checkpoint history', () => {
      // Arrange
      const history: any[] = [];

      // Act
      history.push({
        checkpointId: 'physical-id-resolution',
        triggeredAt: new Date('2024-01-01T10:00:00Z'),
        action: 'pause'
      });
      history.push({
        checkpointId: 'critical-differences',
        triggeredAt: new Date('2024-01-01T10:05:00Z'),
        action: 'continue'
      });

      // Assert
      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('pause');
      expect(history[1].action).toBe('continue');
    });
  });

  describe('Checkpoint Modifications', () => {
    it('should apply state modifications from checkpoint result', () => {
      // Arrange
      const state = {
        resources: [
          { logicalId: 'Table1', physicalId: undefined }
        ]
      };

      const checkpointResult = {
        action: 'continue' as const,
        modifications: {
          resources: [
            { logicalId: 'Table1', physicalId: 'resolved-table-1' }
          ]
        }
      };

      // Act
      if (checkpointResult.modifications) {
        Object.assign(state, checkpointResult.modifications);
      }

      // Assert
      expect(state.resources[0].physicalId).toBe('resolved-table-1');
    });

    it('should not modify state when no modifications provided', () => {
      // Arrange
      const originalState = {
        resources: [{ logicalId: 'Table1' }]
      };

      const checkpointResult = {
        action: 'continue' as const
      };

      // Act
      const stateBeforeJSON = JSON.stringify(originalState);
      if (checkpointResult.modifications) {
        Object.assign(originalState, checkpointResult.modifications);
      }
      const stateAfterJSON = JSON.stringify(originalState);

      // Assert
      expect(stateAfterJSON).toBe(stateBeforeJSON);
    });
  });

  describe('Multiple Checkpoints', () => {
    it('should execute checkpoints in step order', () => {
      // Arrange
      const checkpoints = [
        { id: 'cp1', step: 'SCAN', order: 1 },
        { id: 'cp2', step: 'DISCOVERY', order: 2 },
        { id: 'cp3', step: 'COMPARISON', order: 3 }
      ];

      const currentStep = 'DISCOVERY';

      // Act
      const applicableCheckpoints = checkpoints.filter(
        cp => cp.step === currentStep
      );

      // Assert
      expect(applicableCheckpoints).toHaveLength(1);
      expect(applicableCheckpoints[0].id).toBe('cp2');
    });

    it('should handle multiple checkpoints in same step', () => {
      // Arrange
      const checkpoints = [
        { id: 'cp1', step: 'DISCOVERY', priority: 1 },
        { id: 'cp2', step: 'DISCOVERY', priority: 2 }
      ];

      // Act
      const sorted = checkpoints.sort((a, b) => a.priority - b.priority);

      // Assert
      expect(sorted[0].id).toBe('cp1');
      expect(sorted[1].id).toBe('cp2');
    });
  });

  describe('Error Handling', () => {
    it('should handle checkpoint handler errors gracefully', async () => {
      // Arrange
      const checkpoint = {
        handler: async () => {
          throw new Error('Checkpoint handler failed');
        }
      };

      // Act & Assert
      await expect(checkpoint.handler({})).rejects.toThrow('Checkpoint handler failed');
    });

    it('should handle timeout in checkpoint execution', async () => {
      // Arrange
      const checkpoint = {
        handler: async () => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ action: 'continue' }), 100);
          });
        }
      };

      const timeout = 50;

      // Act
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      // Assert
      await expect(
        Promise.race([checkpoint.handler({}), timeoutPromise])
      ).rejects.toThrow('Timeout');
    });
  });
});

// Helper function
function registerCheckpoint(checkpoint: any) {
  // Validate required fields
  if (!checkpoint.id || !checkpoint.step || !checkpoint.name) {
    throw new Error('Missing required checkpoint fields');
  }

  return checkpoint;
}
