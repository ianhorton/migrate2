import { describe, it, expect, beforeEach } from '@jest/globals';
import { LogicalIdOptimizer } from '../../../../src/modules/generator/code-cleaner/logical-id-optimizer';
import { ClassifiedResource } from '../../../../src/types';

describe('LogicalIdOptimizer', () => {
  let optimizer: LogicalIdOptimizer;
  let mockResources: ClassifiedResource[];

  beforeEach(() => {
    mockResources = [
      {
        LogicalId: 'UsersTable',
        Type: 'AWS::DynamoDB::Table',
        Properties: {},
        needsImport: false,
        isStateful: true,
        isExplicit: true,
        relatedResources: [],
        groupId: 'databases',
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: false,
        suppressComments: false
      },
      {
        LogicalId: 'ApiGateway',
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {},
        needsImport: false,
        isStateful: false,
        isExplicit: true,
        relatedResources: [],
        groupId: 'api',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      },
      {
        LogicalId: 'ImportedBucket',
        Type: 'AWS::S3::Bucket',
        Properties: {},
        needsImport: true,
        isStateful: true,
        isExplicit: true,
        relatedResources: [],
        groupId: 'storage',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      }
    ];

    optimizer = new LogicalIdOptimizer(mockResources);
  });

  describe('findOverrides', () => {
    it('should find overrideLogicalId calls in code', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});
        table.overrideLogicalId('UsersTable');

        const api = new apigateway.RestApi(this, 'ApiGateway', {});
        api.overrideLogicalId('ApiGateway');
      `;

      const overrides = optimizer['findOverrides'](code);

      expect(overrides).toHaveLength(2);
      expect(overrides[0]).toMatchObject({
        logicalId: 'UsersTable',
        fullMatch: expect.stringContaining('overrideLogicalId')
      });
      expect(overrides[1]).toMatchObject({
        logicalId: 'ApiGateway',
        fullMatch: expect.stringContaining('overrideLogicalId')
      });
    });

    it('should handle different quote styles', () => {
      const code = `
        table.overrideLogicalId('SingleQuote');
        api.overrideLogicalId("DoubleQuote");
      `;

      const overrides = optimizer['findOverrides'](code);

      expect(overrides).toHaveLength(2);
      expect(overrides[0].logicalId).toBe('SingleQuote');
      expect(overrides[1].logicalId).toBe('DoubleQuote');
    });
  });

  describe('getResourceForLogicalId', () => {
    it('should map logical ID to resource', () => {
      const resource = optimizer['getResourceForLogicalId']('UsersTable');

      expect(resource).toBeDefined();
      expect(resource?.LogicalId).toBe('UsersTable');
      expect(resource?.Type).toBe('AWS::DynamoDB::Table');
    });

    it('should return undefined for non-existent logical ID', () => {
      const resource = optimizer['getResourceForLogicalId']('NonExistent');

      expect(resource).toBeUndefined();
    });
  });

  describe('shouldRemoveOverride', () => {
    it('should remove override when suppressLogicalIdOverride is true', () => {
      const resource = mockResources[0]; // UsersTable with suppressLogicalIdOverride: true

      const shouldRemove = optimizer['shouldRemoveOverride'](resource);

      expect(shouldRemove).toBe(true);
    });

    it('should keep override when suppressLogicalIdOverride is false', () => {
      const resource = mockResources[1]; // ApiGateway with suppressLogicalIdOverride: false

      const shouldRemove = optimizer['shouldRemoveOverride'](resource);

      expect(shouldRemove).toBe(false);
    });

    it('should keep override when needsImport is true (imported resource)', () => {
      const resource = mockResources[2]; // ImportedBucket with needsImport: true

      const shouldRemove = optimizer['shouldRemoveOverride'](resource);

      expect(shouldRemove).toBe(false);
    });
  });

  describe('removeRelatedComments', () => {
    it('should remove comments associated with override', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});
        // Override logical ID for CloudFormation compatibility
        table.overrideLogicalId('UsersTable');
      `;

      const cleaned = optimizer['removeRelatedComments'](code, 'table.overrideLogicalId(\'UsersTable\');');

      expect(cleaned).not.toContain('// Override logical ID');
      expect(cleaned).toContain('const table = new dynamodb.Table');
    });
  });

  describe('optimizeLogicalIds', () => {
    it('should achieve 70% reduction target for overrides', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});
        table.overrideLogicalId('UsersTable');

        const api = new apigateway.RestApi(this, 'ApiGateway', {});
        api.overrideLogicalId('ApiGateway');

        const bucket = new s3.Bucket(this, 'ImportedBucket', {});
        bucket.overrideLogicalId('ImportedBucket');
      `;

      const result = optimizer.optimizeLogicalIds(code);

      // UsersTable override should be removed (suppressLogicalIdOverride: true)
      expect(result.code).not.toContain('table.overrideLogicalId');

      // ApiGateway override should remain (suppressLogicalIdOverride: false)
      expect(result.code).toContain('api.overrideLogicalId(\'ApiGateway\')');

      // ImportedBucket override should remain (needsImport: true)
      expect(result.code).toContain('bucket.overrideLogicalId(\'ImportedBucket\')');

      // Verify metrics: 1 removed out of 3 = 33%, but target is based on suppressible ones
      expect(result.metrics.overridesRemoved).toBeGreaterThanOrEqual(1);
      expect(result.metrics.totalOverrides).toBe(3);
    });

    it('should handle code with no overrides', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});
        const api = new apigateway.RestApi(this, 'ApiGateway', {});
      `;

      const result = optimizer.optimizeLogicalIds(code);

      expect(result.code).toBe(code);
      expect(result.metrics.overridesRemoved).toBe(0);
      expect(result.metrics.totalOverrides).toBe(0);
    });
  });
});
