import { describe, it, expect, beforeEach } from '@jest/globals';
import { RemovalPolicyOptimizer } from '../../../../src/modules/generator/code-cleaner/removal-policy-optimizer';
import { ClassifiedResource } from '../../../../src/types';

describe('RemovalPolicyOptimizer', () => {
  let optimizer: RemovalPolicyOptimizer;
  let mockResources: ClassifiedResource[];

  beforeEach(() => {
    mockResources = [
      {
        LogicalId: 'StatefulTable',
        Type: 'AWS::DynamoDB::Table',
        Properties: {},
        needsImport: false,
        isStateful: true,
        isExplicit: true,
        relatedResources: [],
        groupId: 'databases',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: true, // Should be removed
        suppressComments: false
      },
      {
        LogicalId: 'StatelessFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {},
        needsImport: false,
        isStateful: false,
        isExplicit: true,
        relatedResources: [],
        groupId: 'compute',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: true, // Should be removed (not stateful)
        suppressComments: false
      },
      {
        LogicalId: 'ImportantBucket',
        Type: 'AWS::S3::Bucket',
        Properties: {},
        needsImport: false,
        isStateful: true,
        isExplicit: true,
        relatedResources: [],
        groupId: 'storage',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false, // Should keep policy
        suppressComments: false
      }
    ];

    optimizer = new RemovalPolicyOptimizer(mockResources);
  });

  describe('findPolicyCalls', () => {
    it('should find applyRemovalPolicy calls in code', () => {
      const code = `
        const table = new dynamodb.Table(this, 'StatefulTable', {});
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        const bucket = new s3.Bucket(this, 'ImportantBucket', {});
        bucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const policies = optimizer['findPolicyCalls'](code);

      expect(policies).toHaveLength(2);
      expect(policies[0]).toMatchObject({
        policy: 'RETAIN',
        fullMatch: expect.stringContaining('applyRemovalPolicy')
      });
      expect(policies[1]).toMatchObject({
        policy: 'RETAIN',
        fullMatch: expect.stringContaining('applyRemovalPolicy')
      });
    });

    it('should detect all policy types (RETAIN, DESTROY, SNAPSHOT)', () => {
      const code = `
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
        api.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        volume.applyRemovalPolicy(cdk.RemovalPolicy.SNAPSHOT);
      `;

      const policies = optimizer['findPolicyCalls'](code);

      expect(policies).toHaveLength(3);
      expect(policies[0].policy).toBe('RETAIN');
      expect(policies[1].policy).toBe('DESTROY');
      expect(policies[2].policy).toBe('SNAPSHOT');
    });
  });

  describe('getResourceForConstruct', () => {
    it('should map construct variable to resource by matching logical ID in code', () => {
      const code = `
        const table = new dynamodb.Table(this, 'StatefulTable', {});
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const resource = optimizer['getResourceForConstruct'](code, 'table');

      expect(resource).toBeDefined();
      expect(resource?.LogicalId).toBe('StatefulTable');
    });

    it('should return undefined for non-existent construct', () => {
      const code = `const table = new dynamodb.Table(this, 'StatefulTable', {});`;

      const resource = optimizer['getResourceForConstruct'](code, 'nonexistent');

      expect(resource).toBeUndefined();
    });
  });

  describe('shouldRemovePolicy', () => {
    it('should remove policy when suppressRemovalPolicy is true', () => {
      const resource = mockResources[0]; // StatefulTable with suppressRemovalPolicy: true

      const shouldRemove = optimizer['shouldRemovePolicy'](resource);

      expect(shouldRemove).toBe(true);
    });

    it('should keep policy when suppressRemovalPolicy is false (stateful resource)', () => {
      const resource = mockResources[2]; // ImportantBucket with suppressRemovalPolicy: false

      const shouldRemove = optimizer['shouldRemovePolicy'](resource);

      expect(shouldRemove).toBe(false);
    });

    it('should remove policy for non-stateful resources even if suppressRemovalPolicy is true', () => {
      const resource = mockResources[1]; // StatelessFunction

      const shouldRemove = optimizer['shouldRemovePolicy'](resource);

      expect(shouldRemove).toBe(true);
    });
  });

  describe('removeRelatedComments', () => {
    it('should remove comments associated with removal policy', () => {
      const code = `
        const table = new dynamodb.Table(this, 'StatefulTable', {});
        // Retain table for data safety
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const cleaned = optimizer['removeRelatedComments'](code, 'table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);');

      expect(cleaned).not.toContain('// Retain table for data safety');
      expect(cleaned).toContain('const table = new dynamodb.Table');
    });
  });

  describe('optimizeRemovalPolicies', () => {
    it('should achieve 80% reduction target for removal policies', () => {
      const code = `
        const table = new dynamodb.Table(this, 'StatefulTable', {});
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        const func = new lambda.Function(this, 'StatelessFunction', {});
        func.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        const bucket = new s3.Bucket(this, 'ImportantBucket', {});
        bucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const result = optimizer.optimizeRemovalPolicies(code);

      // StatefulTable policy should be removed (suppressRemovalPolicy: true)
      expect(result.code).not.toContain('table.applyRemovalPolicy');

      // StatelessFunction policy should be removed (not stateful)
      expect(result.code).not.toContain('func.applyRemovalPolicy');

      // ImportantBucket policy should remain (suppressRemovalPolicy: false, isStateful: true)
      expect(result.code).toContain('bucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)');

      // Verify metrics: 2 removed out of 3
      expect(result.metrics.policiesRemoved).toBeGreaterThanOrEqual(2);
      expect(result.metrics.totalPolicies).toBe(3);
      expect(result.metrics.reductionPercentage).toBeGreaterThanOrEqual(60);
    });

    it('should handle code with no removal policies', () => {
      const code = `
        const table = new dynamodb.Table(this, 'StatefulTable', {});
        const bucket = new s3.Bucket(this, 'ImportantBucket', {});
      `;

      const result = optimizer.optimizeRemovalPolicies(code);

      expect(result.code).toBe(code);
      expect(result.metrics.policiesRemoved).toBe(0);
      expect(result.metrics.totalPolicies).toBe(0);
    });

    it('should handle missing resource mapping gracefully', () => {
      const code = `
        const unknown = new something.Unknown(this, 'UnknownResource', {});
        unknown.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const result = optimizer.optimizeRemovalPolicies(code);

      // Keep policy when resource is not found (safety)
      expect(result.code).toContain('unknown.applyRemovalPolicy');
      expect(result.metrics.policiesKept).toBe(1);
    });
  });
});
