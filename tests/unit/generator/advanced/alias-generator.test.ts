/**
 * AliasGenerator Unit Tests - Sprint 4 Phase 2 (RED)
 * Test-Driven Development: Writing tests FIRST
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AliasGenerator } from '../../../../src/modules/generator/advanced/alias-generator';
import { ClassifiedResource } from '../../../../src/types';

describe('AliasGenerator', () => {
  let classifiedResources: ClassifiedResource[];
  let options: any;

  beforeEach(() => {
    classifiedResources = [];
    options = { stage: 'dev' };
  });

  describe('shouldGenerateAlias()', () => {
    it('should generate alias for production function (priority 7)', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-prod-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, options);
      const result = generator.shouldGenerateAlias(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.priority).toBe(7); // Production priority
      expect(result.reason).toContain('Production');
    });

    it('should generate alias for multi-stage deployment (priority 8)', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const optionsWithServerless = {
        serverlessConfig: {
          provider: {
            stage: 'staging'
          }
        }
      };

      const generator = new AliasGenerator(classifiedResources, optionsWithServerless);
      const result = generator.shouldGenerateAlias(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.priority).toBe(8); // Multi-stage priority
      expect(result.reason).toContain('Multi-stage');
    });

    it('should generate alias for provisioned concurrency (priority 6)', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function',
          ProvisionedConcurrencyConfig: {
            ProvisionedConcurrentExecutions: 5
          }
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, options);
      const result = generator.shouldGenerateAlias(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.priority).toBe(6); // Provisioned concurrency priority
      expect(result.reason).toContain('Provisioned concurrency');
    });

    it('should not generate alias for simple dev function', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-dev-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, options);
      const result = generator.shouldGenerateAlias(lambdaResource);

      expect(result.shouldGenerate).toBe(false);
      expect(result.priority).toBe(0);
      expect(result.reason).toContain('$LATEST');
    });

    it('should generate alias when user explicitly enables (priority 4)', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const optionsWithOverride = {
        generateAliases: true
      };

      const generator = new AliasGenerator(classifiedResources, optionsWithOverride);
      const result = generator.shouldGenerateAlias(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.priority).toBe(4);
      expect(result.reason).toContain('User configuration');
    });
  });

  describe('generateAlias()', () => {
    it('should generate alias code with correct TypeScript syntax', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const optionsWithStage = { stage: 'prod' };
      const generator = new AliasGenerator(classifiedResources, optionsWithStage);
      const result = generator.generateAlias(lambdaResource, 'myFunction');

      expect(result.code).toContain('const myFunctionAlias = new Alias');
      expect(result.code).toContain("aliasName: 'prod'");
      expect(result.code).toContain('version: myFunction.currentVersion');
      expect(result.aliasVariableName).toBe('myFunctionAlias');
    });

    it('should include provisioned concurrency if configured', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function',
          ProvisionedConcurrencyConfig: {
            ProvisionedConcurrentExecutions: 10
          }
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, options);
      const result = generator.generateAlias(lambdaResource, 'myFunction');

      expect(result.code).toContain('provisionedConcurrentExecutions: 10');
    });

    it('should use stage from serverless.yml for alias name', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const optionsWithServerless = {
        serverlessConfig: {
          provider: {
            stage: 'staging'
          }
        }
      };

      const generator = new AliasGenerator(classifiedResources, optionsWithServerless);
      const result = generator.generateAlias(lambdaResource, 'myFunction');

      expect(result.code).toContain("aliasName: 'staging'");
    });

    it('should handle missing function name gracefully', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {},
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, options);

      // Should not throw error
      expect(() => {
        generator.generateAlias(lambdaResource, 'myFunction');
      }).not.toThrow();
    });

    it('should use "live" as default alias name when no stage specified', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function'
        },
        relatedResources: [],
        groupId: 'compute',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const generator = new AliasGenerator(classifiedResources, {});
      const result = generator.generateAlias(lambdaResource, 'myFunction');

      expect(result.code).toContain("aliasName: 'live'");
    });
  });
});
