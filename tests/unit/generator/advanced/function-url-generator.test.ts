/**
 * FunctionUrlGenerator Unit Tests - Sprint 4 Phase 3 (RED)
 * Test-Driven Development: Writing tests FIRST
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FunctionUrlGenerator } from '../../../../src/modules/generator/advanced/function-url-generator';
import { ClassifiedResource } from '../../../../src/types';

describe('FunctionUrlGenerator', () => {
  let classifiedResources: ClassifiedResource[];
  let options: any;

  beforeEach(() => {
    classifiedResources = [];
    options = {};
  });

  describe('shouldGenerateUrl()', () => {
    it('should generate URL for http events', () => {
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

      const optionsWithConfig = {
        serverlessConfig: {
          functions: {
            'my-function': {
              events: [
                { http: { path: '/api', method: 'GET' } }
              ]
            }
          }
        }
      };

      const generator = new FunctionUrlGenerator(classifiedResources, optionsWithConfig);
      const result = generator.shouldGenerateUrl(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.reason).toContain('HTTP');
    });

    it('should generate URL for httpApi events', () => {
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

      const optionsWithConfig = {
        serverlessConfig: {
          functions: {
            'my-function': {
              events: [
                { httpApi: { path: '/api', method: 'POST' } }
              ]
            }
          }
        }
      };

      const generator = new FunctionUrlGenerator(classifiedResources, optionsWithConfig);
      const result = generator.shouldGenerateUrl(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.reason).toContain('HTTP');
    });

    it('should generate URL for webhook pattern', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'GithubWebhook',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'github-webhook'
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.shouldGenerateUrl(lambdaResource);

      expect(result.shouldGenerate).toBe(true);
      expect(result.reason).toContain('Webhook');
    });

    it('should not generate URL for non-HTTP Lambda', () => {
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.shouldGenerateUrl(lambdaResource);

      expect(result.shouldGenerate).toBe(false);
      expect(result.reason).toContain('No HTTP access');
    });

    it('should determine AWS_IAM auth type by default', () => {
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.generateFunctionUrl('myFunctionAlias', lambdaResource);

      expect(result.code).toContain('FunctionUrlAuthType.AWS_IAM');
    });

    it('should determine NONE auth for public endpoints (webhook)', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'GithubWebhook',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'github-webhook'
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.generateFunctionUrl('githubWebhookAlias', lambdaResource);

      expect(result.code).toContain('FunctionUrlAuthType.NONE');
    });

    it('should determine CORS from serverless config', () => {
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

      const optionsWithCors = {
        serverlessConfig: {
          functions: {
            'my-function': {
              events: [
                { http: { path: '/api', method: 'GET', cors: true } }
              ]
            }
          }
        }
      };

      const generator = new FunctionUrlGenerator(classifiedResources, optionsWithCors);
      const result = generator.generateFunctionUrl('myFunctionAlias', lambdaResource);

      expect(result.code).toContain('cors:');
      expect(result.code).toContain('allowedOrigins');
    });

    it('should generate Function URL code', () => {
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.generateFunctionUrl('myFunctionAlias', lambdaResource);

      expect(result.code).toContain('.addFunctionUrl(');
      expect(result.code).toContain('myFunctionAlias.addFunctionUrl');
      expect(result.urlOutputName).toBe('MyFunctionUrl');
    });

    it('should generate security warning for NONE auth', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'PublicFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'public-api-function'
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.generateFunctionUrl('publicFunctionAlias', lambdaResource);

      expect(result.code).toContain('WARNING');
      expect(result.code).toContain('publicly accessible');
    });

    it('should generate CfnOutput for URL', () => {
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);
      const result = generator.generateFunctionUrl('myFunctionAlias', lambdaResource);

      expect(result.code).toContain('new CfnOutput');
      expect(result.code).toContain('value:');
      expect(result.code).toContain('.url');
    });

    it('should handle missing events gracefully', () => {
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

      const generator = new FunctionUrlGenerator(classifiedResources, options);

      // Should not throw
      expect(() => {
        generator.shouldGenerateUrl(lambdaResource);
      }).not.toThrow();
    });
  });
});
