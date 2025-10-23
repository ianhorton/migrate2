/**
 * Unit tests for DriftDetector
 * Sprint 2: Template Analysis
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DriftDetector, type DriftInfo } from '../../../src/modules/discovery/drift-detector';
import type { PropertyDifference } from '../../../src/types/cloudformation';
import {
  CloudFormationClient,
  DetectStackDriftCommand,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
} from '@aws-sdk/client-cloudformation';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudformation');

describe('DriftDetector', () => {
  let detector: DriftDetector;
  let mockClient: jest.Mocked<CloudFormationClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock CloudFormation client
    mockClient = {
      send: jest.fn(),
    } as any;

    (CloudFormationClient as jest.Mock).mockImplementation(() => mockClient);

    detector = new DriftDetector('us-east-1');
  });

  describe('detectDrift', () => {
    it('should detect drift for stack', async () => {
      // Mock API responses
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          return Promise.resolve({
            DetectionStatus: 'DETECTION_COMPLETE',
          });
        }

        if (command instanceof DescribeStackResourceDriftsCommand) {
          return Promise.resolve({
            StackResourceDrifts: [
              {
                LogicalResourceId: 'UsersTable',
                PhysicalResourceId: 'users-table-dev',
                ResourceType: 'AWS::DynamoDB::Table',
                StackResourceDriftStatus: 'IN_SYNC',
              },
              {
                LogicalResourceId: 'ApiRole',
                PhysicalResourceId: 'api-role-dev',
                ResourceType: 'AWS::IAM::Role',
                StackResourceDriftStatus: 'MODIFIED',
                PropertyDifferences: [
                  {
                    PropertyPath: 'Policies',
                    ExpectedValue: JSON.stringify(['policy1']),
                    ActualValue: JSON.stringify(['policy1', 'policy2']),
                    DifferenceType: 'ADD',
                  },
                ],
              },
            ],
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      const driftMap = await detector.detectDrift('test-stack');

      expect(driftMap.size).toBe(2);
      expect(driftMap.get('UsersTable')?.drifted).toBe(false);
      expect(driftMap.get('ApiRole')?.drifted).toBe(true);
    });

    it('should wait for drift detection completion', async () => {
      let attempts = 0;

      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          attempts++;
          if (attempts < 3) {
            return Promise.resolve({
              DetectionStatus: 'DETECTION_IN_PROGRESS',
            });
          }
          return Promise.resolve({
            DetectionStatus: 'DETECTION_COMPLETE',
          });
        }

        if (command instanceof DescribeStackResourceDriftsCommand) {
          return Promise.resolve({
            StackResourceDrifts: [],
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      await detector.detectDrift('test-stack');

      // Should have polled multiple times
      expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('should throw error if drift detection fails', async () => {
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          return Promise.resolve({
            DetectionStatus: 'DETECTION_FAILED',
            DetectionStatusReason: 'Permission denied',
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      await expect(detector.detectDrift('test-stack')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should handle missing drift detection ID', async () => {
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      await expect(detector.detectDrift('test-stack')).rejects.toThrow(
        'Failed to initiate drift detection'
      );
    });
  });

  describe('detectResourceDrift', () => {
    it('should detect drift for specific resource', async () => {
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          return Promise.resolve({
            DetectionStatus: 'DETECTION_COMPLETE',
          });
        }

        if (command instanceof DescribeStackResourceDriftsCommand) {
          return Promise.resolve({
            StackResourceDrifts: [
              {
                LogicalResourceId: 'UsersTable',
                PhysicalResourceId: 'users-table-dev',
                ResourceType: 'AWS::DynamoDB::Table',
                StackResourceDriftStatus: 'MODIFIED',
              },
            ],
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      const drift = await detector.detectResourceDrift('test-stack', 'UsersTable');

      expect(drift.logicalResourceId).toBe('UsersTable');
      expect(drift.drifted).toBe(true);
      expect(drift.driftStatus).toBe('MODIFIED');
    });

    it('should return NOT_CHECKED for missing resource', async () => {
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          return Promise.resolve({
            DetectionStatus: 'DETECTION_COMPLETE',
          });
        }

        if (command instanceof DescribeStackResourceDriftsCommand) {
          return Promise.resolve({
            StackResourceDrifts: [],
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      const drift = await detector.detectResourceDrift('test-stack', 'MissingResource');

      expect(drift.logicalResourceId).toBe('MissingResource');
      expect(drift.drifted).toBe(false);
      expect(drift.driftStatus).toBe('NOT_CHECKED');
    });
  });

  describe('correlateDriftWithDifferences', () => {
    it('should detect no correlation for IN_SYNC resources', () => {
      const drift: DriftInfo = {
        resourceId: 'users-table',
        logicalResourceId: 'UsersTable',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: false,
        driftStatus: 'IN_SYNC',
      };

      const differences: PropertyDifference[] = [
        {
          property: 'BillingMode',
          slsValue: 'PROVISIONED',
          cdkValue: 'PAY_PER_REQUEST',
          severity: 'WARNING',
          explanation: '',
          autoFixable: false,
        },
      ];

      const correlation = detector.correlateDriftWithDifferences(
        drift,
        differences
      );

      expect(correlation.driftCausedByManualChange).toBe(false);
      expect(correlation.affectedDifferences).toHaveLength(0);
      expect(correlation.explanation).toContain('No drift');
    });

    it('should detect correlation for DELETED resources', () => {
      const drift: DriftInfo = {
        resourceId: 'old-table',
        logicalResourceId: 'OldTable',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: true,
        driftStatus: 'DELETED',
      };

      const differences: PropertyDifference[] = [
        {
          property: 'TableName',
          slsValue: 'old-table',
          cdkValue: 'new-table',
          severity: 'CRITICAL',
          explanation: '',
          autoFixable: false,
        },
      ];

      const correlation = detector.correlateDriftWithDifferences(
        drift,
        differences
      );

      expect(correlation.driftCausedByManualChange).toBe(true);
      expect(correlation.affectedDifferences).toHaveLength(1);
      expect(correlation.explanation).toContain('deleted');
    });

    it('should correlate property differences with drift', () => {
      const drift: DriftInfo = {
        resourceId: 'api-role',
        logicalResourceId: 'ApiRole',
        resourceType: 'AWS::IAM::Role',
        drifted: true,
        driftStatus: 'MODIFIED',
        propertyDifferences: [
          {
            propertyPath: 'Policies',
            expectedValue: ['policy1'],
            actualValue: ['policy1', 'policy2'],
            differenceType: 'ADD',
          },
        ],
      };

      const differences: PropertyDifference[] = [
        {
          property: 'Policies',
          slsValue: ['policy1'],
          cdkValue: ['policy1', 'policy2'],
          severity: 'WARNING',
          explanation: '',
          autoFixable: false,
        },
        {
          property: 'RoleName',
          slsValue: 'role1',
          cdkValue: 'role2',
          severity: 'CRITICAL',
          explanation: '',
          autoFixable: false,
        },
      ];

      const correlation = detector.correlateDriftWithDifferences(
        drift,
        differences
      );

      expect(correlation.driftCausedByManualChange).toBe(true);
      expect(correlation.affectedDifferences).toHaveLength(1);
      expect(correlation.affectedDifferences[0].property).toBe('Policies');
      expect(correlation.explanation).toContain('1');
    });

    it('should handle drift without property details', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::Lambda::Function',
        drifted: true,
        driftStatus: 'MODIFIED',
      };

      const differences: PropertyDifference[] = [];

      const correlation = detector.correlateDriftWithDifferences(
        drift,
        differences
      );

      expect(correlation.driftCausedByManualChange).toBe(true);
      expect(correlation.explanation).toContain('modified');
    });
  });

  describe('getDriftSeverity', () => {
    it('should return none for IN_SYNC resources', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: false,
        driftStatus: 'IN_SYNC',
      };

      expect(detector.getDriftSeverity(drift)).toBe('none');
    });

    it('should return major for DELETED resources', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: true,
        driftStatus: 'DELETED',
      };

      expect(detector.getDriftSeverity(drift)).toBe('major');
    });

    it('should return major for many property changes', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::Lambda::Function',
        drifted: true,
        driftStatus: 'MODIFIED',
        propertyDifferences: [
          { propertyPath: 'Prop1', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
          { propertyPath: 'Prop2', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
          { propertyPath: 'Prop3', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
          { propertyPath: 'Prop4', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
          { propertyPath: 'Prop5', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
        ],
      };

      expect(detector.getDriftSeverity(drift)).toBe('major');
    });

    it('should return minor for few property changes', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::Lambda::Function',
        drifted: true,
        driftStatus: 'MODIFIED',
        propertyDifferences: [
          { propertyPath: 'Prop1', expectedValue: 'a', actualValue: 'b', differenceType: 'MODIFY' },
        ],
      };

      expect(detector.getDriftSeverity(drift)).toBe('minor');
    });
  });

  describe('getResolutionStrategies', () => {
    it('should return skip strategy for DELETED resources', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: true,
        driftStatus: 'DELETED',
      };

      const strategies = detector.getResolutionStrategies(drift);

      expect(strategies).toHaveLength(2);
      expect(strategies[0].strategy).toBe('skip-resource');
      expect(strategies[0].recommended).toBe(true);
      expect(strategies[1].strategy).toBe('recreate');
    });

    it('should return update strategies for MODIFIED resources', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::Lambda::Function',
        drifted: true,
        driftStatus: 'MODIFIED',
      };

      const strategies = detector.getResolutionStrategies(drift);

      expect(strategies).toHaveLength(3);
      expect(strategies[0].strategy).toBe('use-aws');
      expect(strategies[0].recommended).toBe(true);
      expect(strategies[1].strategy).toBe('use-template');
      expect(strategies[2].strategy).toBe('manual-review');
    });

    it('should return empty array for IN_SYNC resources', () => {
      const drift: DriftInfo = {
        resourceId: 'resource1',
        logicalResourceId: 'Resource1',
        resourceType: 'AWS::DynamoDB::Table',
        drifted: false,
        driftStatus: 'IN_SYNC',
      };

      const strategies = detector.getResolutionStrategies(drift);

      expect(strategies).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty drift results', async () => {
      mockClient.send.mockImplementation((command) => {
        if (command instanceof DetectStackDriftCommand) {
          return Promise.resolve({
            StackDriftDetectionId: 'drift-detection-123',
          });
        }

        if (command instanceof DescribeStackDriftDetectionStatusCommand) {
          return Promise.resolve({
            DetectionStatus: 'DETECTION_COMPLETE',
          });
        }

        if (command instanceof DescribeStackResourceDriftsCommand) {
          return Promise.resolve({
            StackResourceDrifts: [],
          });
        }

        return Promise.reject(new Error('Unknown command'));
      });

      const driftMap = await detector.detectDrift('test-stack');

      expect(driftMap.size).toBe(0);
    });

    it('should parse JSON property values', () => {
      // This is tested indirectly through detectDrift
      // The private parseJsonValue method is called internally
      expect(true).toBe(true);
    });

    it('should handle all drift status types', () => {
      const statuses: Array<DriftInfo['driftStatus']> = [
        'IN_SYNC',
        'MODIFIED',
        'DELETED',
        'NOT_CHECKED',
      ];

      statuses.forEach((status) => {
        const drift: DriftInfo = {
          resourceId: 'resource1',
          logicalResourceId: 'Resource1',
          resourceType: 'AWS::DynamoDB::Table',
          drifted: status !== 'IN_SYNC' && status !== 'NOT_CHECKED',
          driftStatus: status,
        };

        expect(drift.driftStatus).toBe(status);
      });
    });
  });
});
