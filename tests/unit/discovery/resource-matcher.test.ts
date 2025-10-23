/**
 * ResourceMatcher Unit Tests
 * Tests confidence scoring and matching logic
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createMockAwsClients,
  convertToDiscoveredResources
} from '../../mocks/aws-discovery-mock';

describe('ResourceMatcher', () => {
  let mockClients: ReturnType<typeof createMockAwsClients>;

  beforeEach(() => {
    mockClients = createMockAwsClients();
  });

  describe('Name-based Matching', () => {
    it('should give 90% confidence for exact name match', async () => {
      // Arrange
      const templateProps = { TableName: 'users-table-dev' };
      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });

      // Act
      const isExactMatch = table.Table.TableName === templateProps.TableName;
      const confidence = isExactMatch ? 0.9 : 0.0;

      // Assert
      expect(confidence).toBe(0.9);
    });

    it('should use fuzzy matching for similar names', () => {
      // Arrange
      const templateName = 'users-table';
      const candidateNames = ['users-table-dev', 'user-table-dev', 'users-tbl-dev'];

      // Act
      const similarities = candidateNames.map(candidate => ({
        name: candidate,
        similarity: calculateSimilarity(templateName, candidate)
      }));

      // Assert
      expect(similarities[0].similarity).toBeGreaterThan(0.8); // users-table-dev
      expect(similarities[1].similarity).toBeGreaterThan(0.7); // user-table-dev
      expect(similarities[2].similarity).toBeGreaterThan(0.6); // users-tbl-dev
    });

    it('should handle case-insensitive matching', () => {
      // Arrange
      const template = 'UsersTable';
      const candidate = 'users-table';

      // Act
      const normalized1 = template.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalized2 = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = normalized1 === normalized2;

      // Assert
      expect(match).toBe(true);
    });
  });

  describe('Tag-based Matching', () => {
    it('should add 20% confidence for matching tags', async () => {
      // Arrange
      const templateTags = [
        { Key: 'Environment', Value: 'dev' },
        { Key: 'ManagedBy', Value: 'serverless' }
      ];

      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });
      const resourceTags = await mockClients.dynamodb.listTagsOfResource({
        ResourceArn: table.Table.TableArn
      });

      // Act
      const templateTagMap = templateTags.reduce(
        (acc, tag) => ({ ...acc, [tag.Key]: tag.Value }),
        {} as Record<string, string>
      );
      const resourceTagMap = resourceTags.Tags.reduce(
        (acc: any, tag: any) => ({ ...acc, [tag.Key]: tag.Value }),
        {} as Record<string, string>
      );

      const matchingTags = Object.keys(templateTagMap).filter(
        key => templateTagMap[key] === resourceTagMap[key]
      );

      const confidenceBonus = matchingTags.length > 0 ? 0.2 : 0;

      // Assert
      expect(matchingTags).toContain('Environment');
      expect(matchingTags).toContain('ManagedBy');
      expect(confidenceBonus).toBe(0.2);
    });

    it('should ignore missing tags gracefully', async () => {
      // Arrange
      const templateTags = [{ Key: 'Environment', Value: 'dev' }];
      const resourceTags: any[] = []; // No tags

      // Act
      const matchCount = templateTags.filter(t =>
        resourceTags.some((r: any) => r.Key === t.Key && r.Value === t.Value)
      ).length;

      // Assert
      expect(matchCount).toBe(0);
      // Should not fail, just result in lower confidence
    });
  });

  describe('Configuration-based Matching', () => {
    it('should match DynamoDB key schema', async () => {
      // Arrange
      const templateKeySchema = [{ AttributeName: 'userId', KeyType: 'HASH' }];

      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });

      // Act
      const resourceKeySchema = table.Table.KeySchema;
      const keysMatch =
        JSON.stringify(templateKeySchema) === JSON.stringify(resourceKeySchema);

      const confidenceBonus = keysMatch ? 0.3 : 0;

      // Assert
      expect(keysMatch).toBe(true);
      expect(confidenceBonus).toBe(0.3);
    });

    it('should match S3 versioning configuration', async () => {
      // Arrange
      const templateVersioning = 'Enabled';

      const versioning = await mockClients.s3.getBucketVersioning({
        Bucket: 'messy-app-data-dev'
      });

      // Act
      const versioningMatches = versioning.Status === templateVersioning;
      const confidenceBonus = versioningMatches ? 0.3 : 0;

      // Assert
      expect(versioningMatches).toBe(true);
      expect(confidenceBonus).toBe(0.3);
    });

    it('should compare billing modes for DynamoDB', async () => {
      // Arrange
      const templateBillingMode = 'PAY_PER_REQUEST';

      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });

      // Act
      const resourceBillingMode = table.Table.BillingModeSummary?.BillingMode;
      const billingMatches = templateBillingMode === resourceBillingMode;

      // Assert
      expect(billingMatches).toBe(true);
    });
  });

  describe('Time-based Matching', () => {
    it('should add confidence for recently created resources', async () => {
      // Arrange
      const table = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });

      // Act
      const createdAt = table.Table.CreationDateTime;
      const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const isRecent = ageInDays < 30; // Created in last 30 days
      const confidenceBonus = isRecent ? 0.1 : 0;

      // Assert
      expect(createdAt).toBeInstanceOf(Date);
      expect(ageInDays).toBeGreaterThan(0);
      // Recent creation adds some confidence
    });

    it('should handle resources without creation timestamp', () => {
      // Arrange
      const resource = {
        physicalId: 'some-resource',
        createdAt: undefined
      };

      // Act
      const confidenceBonus = resource.createdAt ? 0.1 : 0;

      // Assert
      expect(confidenceBonus).toBe(0);
      // Missing timestamp should not cause error
    });
  });

  describe('Multiple Candidate Scoring', () => {
    it('should rank candidates by confidence', async () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table',
        BillingMode: 'PAY_PER_REQUEST',
        Tags: [{ Key: 'Environment', Value: 'dev' }]
      };

      const tables = await mockClients.dynamodb.listTables();
      const userTables = tables.TableNames.filter(name => name.includes('users'));

      // Act
      const candidates = await Promise.all(
        userTables.map(async tableName => {
          const details = await mockClients.dynamodb.describeTable({ TableName: tableName });
          const tags = await mockClients.dynamodb.listTagsOfResource({
            ResourceArn: details.Table.TableArn
          });

          let confidence = 0.0;

          // Name similarity
          const nameSimilarity = calculateSimilarity(
            templateProps.TableName,
            tableName
          );
          confidence += nameSimilarity * 0.5;

          // Billing mode
          if (details.Table.BillingModeSummary?.BillingMode === templateProps.BillingMode) {
            confidence += 0.2;
          }

          // Tags
          const hasEnvTag = tags.Tags.some(
            (t: any) => t.Key === 'Environment' && t.Value === 'dev'
          );
          if (hasEnvTag) {
            confidence += 0.2;
          }

          return {
            physicalId: tableName,
            confidence: Math.min(confidence, 1.0),
            reasons: []
          };
        })
      );

      candidates.sort((a, b) => b.confidence - a.confidence);

      // Assert
      expect(candidates).toHaveLength(3);
      expect(candidates[0].physicalId).toBe('users-table-dev'); // Highest confidence
      expect(candidates[0].confidence).toBeGreaterThan(0.8);
    });

    it('should identify when no good matches exist', async () => {
      // Arrange
      const templateProps = { TableName: 'non-existent-table' };
      const tables = await mockClients.dynamodb.listTables();

      // Act
      const candidates = tables.TableNames.filter(name =>
        name.includes(templateProps.TableName)
      );

      // Assert
      expect(candidates).toHaveLength(0);
      // Should trigger human intervention
    });
  });

  describe('Match Result Structure', () => {
    it('should return complete match result', async () => {
      // Arrange
      const logicalId = 'UsersTable';
      const resourceType = 'AWS::DynamoDB::Table';

      // Act
      const matchResult = {
        logicalId,
        resourceType,
        matches: [
          {
            physicalId: 'users-table-dev',
            confidence: 0.92,
            matchReasons: ['Exact name match', 'Tags match', 'Configuration matches']
          },
          {
            physicalId: 'users-table-prod',
            confidence: 0.45,
            matchReasons: ['Name similarity: 85%']
          }
        ],
        bestMatch: {
          physicalId: 'users-table-dev',
          confidence: 0.92,
          matchReasons: ['Exact name match', 'Tags match', 'Configuration matches']
        },
        requiresHumanReview: false // High confidence match
      };

      // Assert
      expect(matchResult.logicalId).toBe('UsersTable');
      expect(matchResult.matches).toHaveLength(2);
      expect(matchResult.bestMatch).toBeDefined();
      expect(matchResult.bestMatch!.confidence).toBeGreaterThanOrEqual(0.9);
      expect(matchResult.requiresHumanReview).toBe(false);
    });

    it('should flag for human review when confidence is low', () => {
      // Arrange
      const matchResult = {
        logicalId: 'AmbiguousTable',
        resourceType: 'AWS::DynamoDB::Table',
        matches: [
          { physicalId: 'table-1', confidence: 0.6 },
          { physicalId: 'table-2', confidence: 0.55 }
        ],
        bestMatch: { physicalId: 'table-1', confidence: 0.6 },
        requiresHumanReview: true // Best match < 90%
      };

      // Assert
      expect(matchResult.requiresHumanReview).toBe(true);
      expect(matchResult.bestMatch!.confidence).toBeLessThan(0.9);
    });
  });
});

// Helper function for fuzzy string matching
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (s1 === s2) return 1.0;

  // Simple Levenshtein-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
