import { describe, it, expect, beforeEach } from '@jest/globals';
import { CodeFormatter } from '../../../../src/modules/generator/code-cleaner/code-formatter';
import { ClassifiedResource } from '../../../../src/types';

describe('CodeFormatter', () => {
  let formatter: CodeFormatter;
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
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
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
        suppressLogicalIdOverride: false,
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
        relatedResources: ['ProcessFunction'],
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

    formatter = new CodeFormatter(mockResources);
  });

  describe('extractConstructs', () => {
    it('should extract construct definitions from code', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {
          tableName: 'users',
          partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
        });

        const func = new lambda.Function(this, 'ProcessFunction', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler',
          code: lambda.Code.fromAsset('lambda')
        });
      `;

      const constructs = formatter['extractConstructs'](code);

      expect(constructs).toHaveLength(2);
      expect(constructs[0]).toMatchObject({
        logicalId: 'UsersTable',
        variableName: 'table',
        code: expect.stringContaining('new dynamodb.Table')
      });
      expect(constructs[1]).toMatchObject({
        logicalId: 'ProcessFunction',
        variableName: 'func',
        code: expect.stringContaining('new lambda.Function')
      });
    });
  });

  describe('groupConstructs', () => {
    it('should group constructs by groupId', () => {
      const constructs = [
        {
          logicalId: 'UsersTable',
          variableName: 'table',
          code: 'const table = new dynamodb.Table(...);',
          groupId: 'databases',
          isStateful: true,
          originalIndex: 0
        },
        {
          logicalId: 'ProcessFunction',
          variableName: 'func',
          code: 'const func = new lambda.Function(...);',
          groupId: 'compute',
          isStateful: false,
          originalIndex: 1
        },
        {
          logicalId: 'ApiGateway',
          variableName: 'api',
          code: 'const api = new apigateway.RestApi(...);',
          groupId: 'api',
          isStateful: false,
          originalIndex: 2
        }
      ];

      const grouped = formatter['groupConstructs'](constructs);

      expect(grouped.has('databases')).toBe(true);
      expect(grouped.has('compute')).toBe(true);
      expect(grouped.has('api')).toBe(true);
      expect(grouped.get('databases')).toHaveLength(1);
      expect(grouped.get('databases')?.[0].logicalId).toBe('UsersTable');
    });
  });

  describe('sortConstructsInGroup', () => {
    it('should sort stateful resources first', () => {
      const constructs = [
        {
          logicalId: 'ProcessFunction',
          variableName: 'func',
          code: 'const func = new lambda.Function(...);',
          groupId: 'mixed',
          isStateful: false,
          originalIndex: 0
        },
        {
          logicalId: 'UsersTable',
          variableName: 'table',
          code: 'const table = new dynamodb.Table(...);',
          groupId: 'mixed',
          isStateful: true,
          originalIndex: 1
        },
        {
          logicalId: 'ApiGateway',
          variableName: 'api',
          code: 'const api = new apigateway.RestApi(...);',
          groupId: 'mixed',
          isStateful: false,
          originalIndex: 2
        }
      ];

      const sorted = formatter['sortConstructsInGroup'](constructs);

      // Stateful resources should come first
      expect(sorted[0].isStateful).toBe(true);
      expect(sorted[0].logicalId).toBe('UsersTable');

      // Then stateless resources in order
      expect(sorted[1].isStateful).toBe(false);
      expect(sorted[2].isStateful).toBe(false);
    });

    it('should maintain code order within same statefulness category', () => {
      const constructs = [
        {
          logicalId: 'Function1',
          variableName: 'func1',
          code: 'const func1 = new lambda.Function(...);',
          groupId: 'compute',
          isStateful: false,
          originalIndex: 0
        },
        {
          logicalId: 'Function2',
          variableName: 'func2',
          code: 'const func2 = new lambda.Function(...);',
          groupId: 'compute',
          isStateful: false,
          originalIndex: 1
        }
      ];

      const sorted = formatter['sortConstructsInGroup'](constructs);

      // Should maintain original order for same category
      expect(sorted[0].logicalId).toBe('Function1');
      expect(sorted[1].logicalId).toBe('Function2');
    });
  });

  describe('generateSectionHeader', () => {
    it('should generate section headers with resource count', () => {
      const header = formatter['generateSectionHeader']('databases', 2);

      expect(header.toLowerCase()).toContain('database'); // Case-insensitive check
      expect(header).toContain('2');
      expect(header).toMatch(/\/\//); // Should be a comment
    });
  });

  describe('generateSummary', () => {
    it('should generate stack summary with resource counts', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});
        const func = new lambda.Function(this, 'ProcessFunction', {});
        const api = new apigateway.RestApi(this, 'ApiGateway', {});
      `;

      const summary = formatter['generateSummary'](code);

      expect(summary).toContain('Stack Summary');
      expect(summary).toMatch(/Total Resources:\s*\d+/); // Match "Total Resources: 3"
      expect(summary).toMatch(/Resource Groups:\s*\d+/); // Match "Resource Groups: 3"
    });
  });

  describe('optimizeBlankLines', () => {
    it('should optimize blank lines (max 2 consecutive)', () => {
      const code = `
        const table = new dynamodb.Table(this, 'UsersTable', {});



        const func = new lambda.Function(this, 'ProcessFunction', {});
      `;

      const optimized = formatter['optimizeBlankLines'](code);

      // Should have max 2 consecutive newlines
      expect(optimized).not.toMatch(/\n{4,}/);
      expect(optimized).toContain('\n\n');
    });
  });

  describe('organizeImports', () => {
    it('should organize imports by module', () => {
      const code = `
        import * as lambda from 'aws-cdk-lib/aws-lambda';
        import * as cdk from 'aws-cdk-lib';
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
        import * as apigateway from 'aws-cdk-lib/aws-apigateway';
      `;

      const organized = formatter['organizeImports'](code);

      // Core imports should come first
      const lines = organized.split('\n').filter(l => l.trim());
      const cdkImportIndex = lines.findIndex(l => l.includes("'aws-cdk-lib'"));
      const serviceImportIndex = lines.findIndex(l => l.includes('/aws-lambda'));

      expect(cdkImportIndex).toBeLessThan(serviceImportIndex);
    });

    it('should sort service imports alphabetically', () => {
      const code = `
        import * as lambda from 'aws-cdk-lib/aws-lambda';
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
        import * as apigateway from 'aws-cdk-lib/aws-apigateway';
      `;

      const organized = formatter['organizeImports'](code);
      const lines = organized.split('\n').filter(l => l.trim());

      // Extract import module names
      const apiIndex = lines.findIndex(l => l.includes('/aws-apigateway'));
      const dynamoIndex = lines.findIndex(l => l.includes('/aws-dynamodb'));
      const lambdaIndex = lines.findIndex(l => l.includes('/aws-lambda'));

      // Should be sorted: api < dynamo < lambda
      expect(apiIndex).toBeLessThan(dynamoIndex);
      expect(dynamoIndex).toBeLessThan(lambdaIndex);
    });
  });

  describe('formatCode', () => {
    it('should format code with sections and headers', () => {
      const code = `
        import * as cdk from 'aws-cdk-lib';
        import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
        import * as lambda from 'aws-cdk-lib/aws-lambda';

        const table = new dynamodb.Table(this, 'UsersTable', {
          tableName: 'users',
          partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
        });

        const func = new lambda.Function(this, 'ProcessFunction', {
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'index.handler'
        });
      `;

      const result = formatter.formatCode(code);

      // Should have section headers
      expect(result.code).toMatch(/\/\/.*databases/i);
      expect(result.code).toMatch(/\/\/.*compute/i);

      // Should have summary
      expect(result.code).toMatch(/Stack Summary/i);

      // Should have metrics
      expect(result.metrics.totalSections).toBeGreaterThanOrEqual(2);
      expect(result.metrics.totalResources).toBe(2);
    });

    it('should handle constructs without classification gracefully', () => {
      const code = `
        const unknown = new custom.UnknownConstruct(this, 'UnknownResource', {});
      `;

      // Should not throw
      expect(() => formatter.formatCode(code)).not.toThrow();

      const result = formatter.formatCode(code);
      expect(result.code).toBeDefined();
    });
  });
});
