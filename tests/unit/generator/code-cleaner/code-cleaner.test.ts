import { describe, it, expect, beforeEach } from '@jest/globals';
import { CodeCleaner } from '../../../../src/modules/generator/code-cleaner';
import { ClassifiedResource } from '../../../../src/types';

describe('CodeCleaner - Main Pipeline', () => {
  let cleaner: CodeCleaner;
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
        suppressLogicalIdOverride: true, // Will be removed
        suppressRemovalPolicy: true, // Will be removed
        suppressComments: true
      },
      {
        LogicalId: 'ProcessFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {},
        needsImport: false,
        isStateful: false,
        isExplicit: true,
        relatedResources: ['UsersTable'],
        groupId: 'compute',
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      }
    ];

    cleaner = new CodeCleaner(mockResources);
  });

  describe('cleanCode', () => {
    it('should run full pipeline (all phases)', () => {
      const code = `
        import * as cdk from 'aws-cdk-lib';
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
        import * as lambda from 'aws-cdk-lib/aws-lambda';

        // Create DynamoDB table for storing user data
        const table = new dynamodb.Table(this, 'UsersTable', {
          tableName: 'users',
          partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
        });
        table.overrideLogicalId('UsersTable');
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

        // Lambda function to process events
        const func = new lambda.Function(this, 'ProcessFunction', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler'
        });
        func.overrideLogicalId('ProcessFunction');
        func.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const result = cleaner.cleanCode(code);

      // Should remove suppressible comments
      expect(result.code).not.toContain('// Create DynamoDB table for storing user data');
      expect(result.code).not.toContain('// Lambda function to process events');

      // Should remove overrides (suppressLogicalIdOverride: true)
      expect(result.code).not.toContain('table.overrideLogicalId');
      expect(result.code).not.toContain('func.overrideLogicalId');

      // Should remove policies (suppressRemovalPolicy: true, or isStateful: false)
      expect(result.code).not.toContain('table.applyRemovalPolicy');
      expect(result.code).not.toContain('func.applyRemovalPolicy');

      // Should format with sections
      expect(result.code).toMatch(/\/\/.*[Dd]atabase/);
      expect(result.code).toMatch(/\/\/.*[Cc]ompute/);

      // Should have organized imports
      const lines = result.code.split('\n');
      const firstServiceImport = lines.findIndex(l => l.includes('/aws-'));
      expect(firstServiceImport).toBeGreaterThan(-1);

      // Should have metrics
      expect(result.metrics).toBeDefined();
    });

    it('should track metrics from all phases', () => {
      const code = `
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

        // Comment 1
        const table = new dynamodb.Table(this, 'UsersTable', {});
        table.overrideLogicalId('UsersTable');
        table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      `;

      const result = cleaner.cleanCode(code);

      expect(result.metrics.comments).toBeDefined();
      expect(result.metrics.comments.totalComments).toBeGreaterThan(0);
      expect(result.metrics.comments.commentsRemoved).toBeGreaterThan(0);

      expect(result.metrics.logicalIds).toBeDefined();
      expect(result.metrics.logicalIds.totalOverrides).toBeGreaterThan(0);

      expect(result.metrics.removalPolicies).toBeDefined();
      expect(result.metrics.removalPolicies.totalPolicies).toBeGreaterThan(0);

      expect(result.metrics.formatting).toBeDefined();
      expect(result.metrics.formatting.totalResources).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', () => {
      const invalidCode = `this is not valid TypeScript code at all`;

      // Should not throw, but handle gracefully
      expect(() => cleaner.cleanCode(invalidCode)).not.toThrow();

      const result = cleaner.cleanCode(invalidCode);
      expect(result.code).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should respect options flags when provided', () => {
      const customCleaner = new CodeCleaner(mockResources, {
        skipCommentReduction: true,
        skipLogicalIdOptimization: false,
        skipRemovalPolicyOptimization: false,
        skipFormatting: true // Skip formatting to keep comments
      });

      const code = `
        // Comment that should be kept
        const table = new dynamodb.Table(this, 'UsersTable', {});
        table.overrideLogicalId('UsersTable');
      `;

      const result = customCleaner.cleanCode(code);

      // Comment should remain (skipCommentReduction: true, skipFormatting: true)
      expect(result.code).toContain('// Comment that should be kept');

      // Override should be removed (skipLogicalIdOptimization: false)
      expect(result.code).not.toContain('table.overrideLogicalId');
    });

    it('should work with empty resource array', () => {
      const emptyCleaner = new CodeCleaner([]);

      const code = `
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
        const table = new dynamodb.Table(this, 'SomeTable', {});
      `;

      const result = emptyCleaner.cleanCode(code);

      // Should still format and organize
      expect(result.code).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.formatting.totalResources).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('should return aggregated metrics after cleaning', () => {
      const code = `
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

        // Comment
        const table = new dynamodb.Table(this, 'UsersTable', {});
        table.overrideLogicalId('UsersTable');
      `;

      cleaner.cleanCode(code);
      const metrics = cleaner.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.comments).toBeDefined();
      expect(metrics.logicalIds).toBeDefined();
      expect(metrics.removalPolicies).toBeDefined();
      expect(metrics.formatting).toBeDefined();

      // Should have summary
      expect(metrics.totalReductionPercentage).toBeDefined();
    });
  });
});
