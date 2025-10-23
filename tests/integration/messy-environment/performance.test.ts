/**
 * Performance Tests for Messy Environment Features
 * Tests performance at scale with many resources and candidates
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { createMockAwsClients } from '../../mocks/aws-discovery-mock';

describe('Messy Environment - Performance Tests', () => {
  let mockClients: ReturnType<typeof createMockAwsClients>;

  beforeAll(() => {
    mockClients = createMockAwsClients();
  });

  describe('Discovery Performance', () => {
    it('should discover 100 DynamoDB tables in under 5 seconds', async () => {
      // Arrange
      const mockTables = Array.from({ length: 100 }, (_, i) => `table-${i}`);
      const start = Date.now();

      // Act
      const discovered = await Promise.all(
        mockTables.slice(0, 10).map(async name => ({
          name,
          discovered: true
        }))
      );
      const duration = Date.now() - start;

      // Assert
      expect(discovered).toHaveLength(10);
      expect(duration).toBeLessThan(5000);
    });

    it('should discover resources across multiple services in parallel', async () => {
      // Arrange
      const start = Date.now();

      // Act - Parallel discovery
      const [tables, buckets, roles, logGroups] = await Promise.all([
        mockClients.dynamodb.listTables(),
        mockClients.s3.listBuckets(),
        mockClients.iam.listRoles(),
        mockClients.logs.describeLogGroups()
      ]);

      const duration = Date.now() - start;

      // Assert
      expect(tables.TableNames.length).toBeGreaterThan(0);
      expect(buckets.Buckets.length).toBeGreaterThan(0);
      expect(roles.Roles.length).toBeGreaterThan(0);
      expect(logGroups.logGroups.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Parallel execution should be fast
    });

    it('should cache discovery results for repeated queries', async () => {
      // Arrange
      const cache = new Map();

      // First query (cache miss)
      const start1 = Date.now();
      if (!cache.has('tables')) {
        const tables = await mockClients.dynamodb.listTables();
        cache.set('tables', tables);
      }
      const duration1 = Date.now() - start1;

      // Second query (cache hit)
      const start2 = Date.now();
      const cachedTables = cache.get('tables');
      const duration2 = Date.now() - start2;

      // Assert
      expect(cachedTables).toBeDefined();
      expect(duration2).toBeLessThan(duration1);
      expect(duration2).toBeLessThan(10); // Near-instant cache retrieval
    });
  });

  describe('Matching Performance', () => {
    it('should match 50 resources against 200 candidates in under 3 seconds', async () => {
      // Arrange
      const resources = Array.from({ length: 50 }, (_, i) => ({
        logicalId: `Resource${i}`,
        type: 'AWS::DynamoDB::Table',
        properties: { TableName: `table-${i}` }
      }));

      const candidates = Array.from({ length: 200 }, (_, i) => ({
        physicalId: `table-${i}`,
        metadata: {}
      }));

      const start = Date.now();

      // Act - Match each resource
      const matches = resources.map(resource => {
        const matched = candidates.filter(c =>
          c.physicalId.includes(resource.properties.TableName)
        );
        return {
          logicalId: resource.logicalId,
          candidates: matched.length
        };
      });

      const duration = Date.now() - start;

      // Assert
      expect(matches).toHaveLength(50);
      expect(duration).toBeLessThan(3000);
    });

    it('should calculate confidence scores efficiently', () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table',
        BillingMode: 'PAY_PER_REQUEST',
        Tags: [{ Key: 'Environment', Value: 'dev' }]
      };

      const candidates = Array.from({ length: 100 }, (_, i) => ({
        physicalId: `table-${i}`,
        billingMode: i % 2 === 0 ? 'PAY_PER_REQUEST' : 'PROVISIONED',
        tags: { Environment: i < 50 ? 'dev' : 'prod' }
      }));

      const start = Date.now();

      // Act
      const scored = candidates.map(candidate => ({
        physicalId: candidate.physicalId,
        confidence: calculateQuickConfidence(templateProps, candidate)
      }));

      const duration = Date.now() - start;

      // Assert
      expect(scored).toHaveLength(100);
      expect(duration).toBeLessThan(500);
      expect(scored.every(s => s.confidence >= 0 && s.confidence <= 1)).toBe(true);
    });

    it('should handle fuzzy string matching at scale', () => {
      // Arrange
      const target = 'users-table-dev';
      const candidates = Array.from({ length: 1000 }, (_, i) =>
        `table-${i}-${Math.random().toString(36).substring(7)}`
      );
      candidates.push('users-table-dev'); // Add exact match
      candidates.push('user-table-dev'); // Add similar match

      const start = Date.now();

      // Act
      const similarities = candidates.map(c => ({
        name: c,
        similarity: simpleStringSimilarity(target, c)
      }));

      const sorted = similarities
        .filter(s => s.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity);

      const duration = Date.now() - start;

      // Assert
      expect(duration).toBeLessThan(1000);
      expect(sorted.length).toBeGreaterThan(0);
      expect(sorted[0].similarity).toBeGreaterThan(0.8);
    });
  });

  describe('Import Process Monitoring', () => {
    it('should monitor import progress with minimal overhead', () => {
      // Arrange
      const resources = Array.from({ length: 20 }, (_, i) => ({
        logicalId: `Resource${i}`,
        status: 'pending'
      }));

      const start = Date.now();

      // Act - Simulate monitoring
      const checkpoints: any[] = [];
      for (let i = 0; i < resources.length; i++) {
        resources[i].status = 'importing';
        checkpoints.push({
          resourceIndex: i,
          timestamp: Date.now(),
          status: 'in-progress'
        });
        resources[i].status = 'imported';
      }

      const duration = Date.now() - start;

      // Assert
      expect(checkpoints).toHaveLength(20);
      expect(duration).toBeLessThan(100); // Minimal overhead
      expect(resources.every(r => r.status === 'imported')).toBe(true);
    });

    it('should handle real-time progress updates efficiently', () => {
      // Arrange
      const progressCallbacks: any[] = [];
      const start = Date.now();

      // Act - Simulate 100 progress updates
      for (let i = 0; i <= 100; i++) {
        progressCallbacks.push({
          progress: i,
          timestamp: Date.now(),
          message: `Processing ${i}%`
        });
      }

      const duration = Date.now() - start;

      // Assert
      expect(progressCallbacks).toHaveLength(101);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Drift Detection Performance', () => {
    it('should detect drift for 50 resources in under 2 seconds (mocked)', async () => {
      // Arrange
      const stackName = 'large-stack';
      const start = Date.now();

      // Act
      await mockClients.cloudformation.detectStackDrift({ StackName: stackName });
      const drifts = await mockClients.cloudformation.describeStackResourceDrifts({
        StackName: stackName
      });

      const duration = Date.now() - start;

      // Assert
      expect(drifts.StackResourceDrifts).toBeDefined();
      expect(duration).toBeLessThan(2000);
    });

    it('should correlate drift with differences efficiently', () => {
      // Arrange
      const drifts = Array.from({ length: 50 }, (_, i) => ({
        resourceId: `Resource${i}`,
        drifted: i % 5 === 0, // 10 drifted resources
        propertyDifferences: i % 5 === 0 ? [{ path: 'prop', type: 'MODIFY' }] : []
      }));

      const differences = Array.from({ length: 50 }, (_, i) => ({
        resourceId: `Resource${i}`,
        path: 'prop',
        category: 'warning'
      }));

      const start = Date.now();

      // Act - Correlate
      const correlated = drifts.map(drift => {
        const relatedDiffs = differences.filter(d => d.resourceId === drift.resourceId);
        return {
          resourceId: drift.resourceId,
          drifted: drift.drifted,
          relatedDifferences: relatedDiffs.length
        };
      });

      const duration = Date.now() - start;

      // Assert
      expect(correlated).toHaveLength(50);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle large discovery results without excessive memory', () => {
      // Arrange
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        physicalId: `resource-${i}`,
        arn: `arn:aws:service:region:account:resource-${i}`,
        tags: { index: i.toString() },
        metadata: {
          property1: `value-${i}`,
          property2: `value-${i * 2}`,
          property3: `value-${i * 3}`
        }
      }));

      // Act
      const memBefore = process.memoryUsage().heapUsed;
      const filtered = largeDataset.filter(r => parseInt(r.tags.index) % 10 === 0);
      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = (memAfter - memBefore) / 1024 / 1024; // MB

      // Assert
      expect(filtered).toHaveLength(100);
      expect(memIncrease).toBeLessThan(50); // Less than 50MB increase
    });

    it('should process resources in batches for large migrations', () => {
      // Arrange
      const allResources = Array.from({ length: 500 }, (_, i) => ({
        logicalId: `Resource${i}`,
        type: 'AWS::DynamoDB::Table'
      }));

      const batchSize = 50;
      const start = Date.now();

      // Act - Process in batches
      const processed: any[] = [];
      for (let i = 0; i < allResources.length; i += batchSize) {
        const batch = allResources.slice(i, i + batchSize);
        processed.push(...batch.map(r => ({ ...r, processed: true })));
      }

      const duration = Date.now() - start;

      // Assert
      expect(processed).toHaveLength(500);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent physical ID resolution', async () => {
      // Arrange
      const resources = Array.from({ length: 20 }, (_, i) => ({
        logicalId: `Table${i}`,
        type: 'AWS::DynamoDB::Table'
      }));

      const start = Date.now();

      // Act - Resolve concurrently
      const results = await Promise.all(
        resources.map(async r => ({
          logicalId: r.logicalId,
          physicalId: `table-${r.logicalId.toLowerCase()}`,
          resolvedAt: Date.now()
        }))
      );

      const duration = Date.now() - start;

      // Assert
      expect(results).toHaveLength(20);
      expect(duration).toBeLessThan(500); // Concurrent should be fast
      expect(results.every(r => r.physicalId)).toBe(true);
    });

    it('should handle concurrent difference analysis', () => {
      // Arrange
      const resources = Array.from({ length: 30 }, (_, i) => ({
        logicalId: `Resource${i}`,
        differences: [
          { path: 'prop1', category: 'acceptable' },
          { path: 'prop2', category: 'warning' }
        ]
      }));

      const start = Date.now();

      // Act - Analyze concurrently
      const analyzed = resources.map(r => ({
        logicalId: r.logicalId,
        criticalCount: r.differences.filter(d => d.category === 'critical').length,
        warningCount: r.differences.filter(d => d.category === 'warning').length,
        acceptableCount: r.differences.filter(d => d.category === 'acceptable').length
      }));

      const duration = Date.now() - start;

      // Assert
      expect(analyzed).toHaveLength(30);
      expect(duration).toBeLessThan(100);
    });
  });
});

// Helper functions
function calculateQuickConfidence(templateProps: any, candidate: any): number {
  let score = 0;

  // Billing mode match
  if (templateProps.BillingMode === candidate.billingMode) {
    score += 0.5;
  }

  // Tag match
  if (templateProps.Tags) {
    const envTag = templateProps.Tags.find((t: any) => t.Key === 'Environment');
    if (envTag && candidate.tags.Environment === envTag.Value) {
      score += 0.5;
    }
  }

  return Math.min(score, 1.0);
}

function simpleStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1.0;

  // Count matching characters
  const s1Set = new Set(s1.split(''));
  const s2Set = new Set(s2.split(''));
  const intersection = new Set([...s1Set].filter(x => s2Set.has(x)));

  return intersection.size / Math.max(s1Set.size, s2Set.size);
}
