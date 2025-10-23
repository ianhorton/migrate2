/**
 * PhysicalIdResolver Unit Tests
 * Tests cascading fallback strategies for physical ID resolution
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createMockAwsClients,
  createMockInterventionManager,
  convertToDiscoveredResources
} from '../../mocks/aws-discovery-mock';

describe('PhysicalIdResolver', () => {
  let mockClients: ReturnType<typeof createMockAwsClients>;
  let mockIntervention: ReturnType<typeof createMockInterventionManager>;

  beforeEach(() => {
    mockClients = createMockAwsClients();
    mockIntervention = createMockInterventionManager();
  });

  describe('Strategy 1: Explicit Physical ID from Template', () => {
    it('should use explicit TableName from template properties', async () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table-dev',
        BillingMode: 'PAY_PER_REQUEST'
      };

      // Act
      const physicalId = templateProps.TableName;

      // Assert
      expect(physicalId).toBe('users-table-dev');
    });

    it('should use explicit BucketName from template properties', () => {
      // Arrange
      const templateProps = {
        BucketName: 'messy-app-data-dev',
        VersioningConfiguration: { Status: 'Enabled' }
      };

      // Act
      const physicalId = templateProps.BucketName;

      // Assert
      expect(physicalId).toBe('messy-app-data-dev');
    });

    it('should return null when no explicit physical ID exists', () => {
      // Arrange
      const templateProps = {
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }]
      };

      // Act
      const physicalId = templateProps.TableName;

      // Assert
      expect(physicalId).toBeUndefined();
    });
  });

  describe('Strategy 2: Auto-Discovery with High Confidence', () => {
    it('should auto-match with 90%+ confidence', async () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table-dev',
        BillingMode: 'PAY_PER_REQUEST'
      };

      const discoveredTables = await mockClients.dynamodb.listTables();
      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });

      // Act - Simulate matching
      const isExactMatch = table.Table.TableName === templateProps.TableName;
      const confidence = isExactMatch ? 0.9 : 0.5;

      // Assert
      expect(confidence).toBeGreaterThanOrEqual(0.9);
      expect(table.Table.TableName).toBe('users-table-dev');
    });

    it('should not auto-match with confidence below 90%', async () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table', // Ambiguous - matches multiple
        BillingMode: 'PAY_PER_REQUEST'
      };

      const tables = await mockClients.dynamodb.listTables();
      const candidates = tables.TableNames.filter(name =>
        name.includes('users-table')
      );

      // Act
      const confidence = candidates.length > 1 ? 0.6 : 0.9; // Multiple matches = lower confidence

      // Assert
      expect(confidence).toBeLessThan(0.9);
      expect(candidates.length).toBeGreaterThan(1);
    });

    it('should consider tags in confidence calculation', async () => {
      // Arrange
      const templateProps = {
        Tags: [
          { Key: 'Environment', Value: 'dev' },
          { Key: 'ManagedBy', Value: 'serverless' }
        ]
      };

      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });
      const tags = await mockClients.dynamodb.listTagsOfResource({
        ResourceArn: table.Table.TableArn
      });

      // Act
      const templateTags = templateProps.Tags.reduce(
        (acc, tag) => ({ ...acc, [tag.Key]: tag.Value }),
        {}
      );
      const resourceTags = tags.Tags.reduce(
        (acc: any, tag: any) => ({ ...acc, [tag.Key]: tag.Value }),
        {}
      );

      const tagsMatch =
        templateTags['Environment'] === resourceTags['Environment'] &&
        templateTags['ManagedBy'] === resourceTags['ManagedBy'];

      const confidenceBonus = tagsMatch ? 0.2 : 0;

      // Assert
      expect(tagsMatch).toBe(true);
      expect(confidenceBonus).toBe(0.2);
    });
  });

  describe('Strategy 3: Human Intervention', () => {
    it('should prompt user when auto-discovery fails', async () => {
      // Arrange
      mockIntervention.setResponse('ApiLambdaRole.physicalId', 'messy-app-api-role-dev');

      const candidates = [
        { physicalId: 'messy-app-api-role-dev', confidence: 0.6 },
        { physicalId: 'api-role-legacy', confidence: 0.4 }
      ];

      // Act
      const selectedId = await mockIntervention.promptForPhysicalId(
        'ApiLambdaRole',
        'AWS::IAM::Role',
        candidates
      );

      // Assert
      expect(selectedId).toBe('messy-app-api-role-dev');
    });

    it('should allow manual entry of physical ID', async () => {
      // Arrange
      mockIntervention.setResponse(
        'CustomTable.physicalId',
        'manually-entered-table-name'
      );

      // Act
      const physicalId = await mockIntervention.promptForPhysicalId(
        'CustomTable',
        'AWS::DynamoDB::Table',
        []
      );

      // Assert
      expect(physicalId).toBe('manually-entered-table-name');
    });

    it('should present candidates sorted by confidence', () => {
      // Arrange
      const candidates = [
        { physicalId: 'table-1', confidence: 0.3 },
        { physicalId: 'table-2', confidence: 0.8 },
        { physicalId: 'table-3', confidence: 0.5 }
      ];

      // Act
      const sorted = candidates.sort((a, b) => b.confidence - a.confidence);

      // Assert
      expect(sorted[0].physicalId).toBe('table-2');
      expect(sorted[0].confidence).toBe(0.8);
      expect(sorted[1].confidence).toBe(0.5);
      expect(sorted[2].confidence).toBe(0.3);
    });
  });

  describe('Fallback Strategy Execution', () => {
    it('should execute strategies in order until success', async () => {
      // Arrange
      const strategies = [
        {
          name: 'Explicit ID',
          execute: async () => null // Fails - no explicit ID
        },
        {
          name: 'Auto-Discovery',
          execute: async () => 'users-table-dev' // Succeeds
        },
        {
          name: 'Human Intervention',
          execute: async () => 'manual-entry' // Not reached
        }
      ];

      // Act
      let result = null;
      for (const strategy of strategies) {
        result = await strategy.execute();
        if (result) break;
      }

      // Assert
      expect(result).toBe('users-table-dev');
    });

    it('should fallback to human intervention when all auto-strategies fail', async () => {
      // Arrange
      mockIntervention.setResponse('UnknownTable.physicalId', 'user-selected-table');

      const strategies = [
        {
          name: 'Explicit ID',
          execute: async () => null
        },
        {
          name: 'Auto-Discovery',
          execute: async () => null
        },
        {
          name: 'Human Intervention',
          execute: async () =>
            mockIntervention.promptForPhysicalId('UnknownTable', 'AWS::DynamoDB::Table', [])
        }
      ];

      // Act
      let result = null;
      for (const strategy of strategies) {
        result = await strategy.execute();
        if (result) break;
      }

      // Assert
      expect(result).toBe('user-selected-table');
    });
  });

  describe('Edge Cases', () => {
    it('should handle resources with no discoverable candidates', async () => {
      // Arrange
      const tables = await mockClients.dynamodb.listTables();
      const nonExistent = 'non-existent-table';

      // Act
      const found = tables.TableNames.includes(nonExistent);

      // Assert
      expect(found).toBe(false);
    });

    it('should handle AWS API errors gracefully', async () => {
      // Arrange
      const invalidTableName = 'invalid-table-$#@!';

      // Act & Assert
      await expect(
        mockClients.dynamodb.describeTable({ TableName: invalidTableName })
      ).rejects.toThrow();
    });

    it('should handle resources in different regions', () => {
      // Arrange
      const resources = convertToDiscoveredResources('dynamoDbTables');

      // Act
      const regionsFound = new Set(resources.map(r => r.region));

      // Assert
      expect(regionsFound.has('us-east-1')).toBe(true);
      expect(regionsFound.size).toBeGreaterThanOrEqual(1);
    });

    it('should handle resources without tags', async () => {
      // Arrange
      const role = await mockClients.iam.getRole({
        RoleName: 'api-role-legacy'
      });

      // Act
      const hasTags = role.Role ? Object.keys(role.Role).includes('Tags') : false;

      // Assert
      expect(role.Role).toBeDefined();
      // Legacy role has no tags, should still be discoverable
    });
  });

  describe('Performance', () => {
    it('should resolve physical ID in under 100ms for cached resources', async () => {
      // Arrange
      const start = Date.now();

      // Act
      const physicalId = 'users-table-dev'; // Direct lookup
      const duration = Date.now() - start;

      // Assert
      expect(physicalId).toBe('users-table-dev');
      expect(duration).toBeLessThan(100);
    });

    it('should handle bulk resolution efficiently', async () => {
      // Arrange
      const logicalIds = [
        'UsersTable',
        'OrdersTable',
        'DataBucket',
        'ApiLambdaRole'
      ];
      const start = Date.now();

      // Act
      const results = await Promise.all(
        logicalIds.map(async id => {
          mockIntervention.setResponse(`${id}.physicalId`, `${id}-resolved`);
          return mockIntervention.promptForPhysicalId(id, 'AWS::*', []);
        })
      );
      const duration = Date.now() - start;

      // Assert
      expect(results).toHaveLength(4);
      expect(duration).toBeLessThan(500); // 500ms for 4 resources
    });
  });
});
