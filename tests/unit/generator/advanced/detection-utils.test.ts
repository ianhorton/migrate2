/**
 * DetectionUtils Unit Tests - Sprint 4 Phase 1 (RED)
 * Test-Driven Development: Writing tests FIRST
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DetectionUtils } from '../../../../src/modules/generator/advanced/utils/detection-utils';
import { ClassifiedResource } from '../../../../src/types';

describe('DetectionUtils', () => {
  describe('hasHttpEvents()', () => {
    it('should detect http event from serverless config', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              { http: { path: '/api', method: 'GET' } }
            ]
          }
        }
      };

      const result = DetectionUtils.hasHttpEvents(lambdaResource, serverlessConfig);
      expect(result).toBe(true);
    });

    it('should detect httpApi event from serverless config', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              { httpApi: { path: '/api', method: 'POST' } }
            ]
          }
        }
      };

      const result = DetectionUtils.hasHttpEvents(lambdaResource, serverlessConfig);
      expect(result).toBe(true);
    });

    it('should return false for non-HTTP events', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              { sqs: { arn: 'arn:aws:sqs:us-east-1:123456789012:my-queue' } }
            ]
          }
        }
      };

      const result = DetectionUtils.hasHttpEvents(lambdaResource, serverlessConfig);
      expect(result).toBe(false);
    });

    it('should handle missing serverless config gracefully', () => {
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

      const result = DetectionUtils.hasHttpEvents(lambdaResource, null);
      expect(result).toBe(false);
    });

    it('should handle empty events array', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: []
          }
        }
      };

      const result = DetectionUtils.hasHttpEvents(lambdaResource, serverlessConfig);
      expect(result).toBe(false);
    });

    it('should handle malformed serverless config', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': null
        }
      };

      const result = DetectionUtils.hasHttpEvents(lambdaResource, serverlessConfig);
      expect(result).toBe(false);
    });
  });

  describe('isProductionFunction()', () => {
    it('should detect production from stage parameter', () => {
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

      const result = DetectionUtils.isProductionFunction(lambdaResource, 'production');
      expect(result).toBe(true);
    });

    it('should detect production from function name', () => {
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

      const result = DetectionUtils.isProductionFunction(lambdaResource);
      expect(result).toBe(true);
    });

    it('should detect production from tags', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function',
          Tags: [
            { Key: 'Environment', Value: 'production' }
          ]
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

      const result = DetectionUtils.isProductionFunction(lambdaResource);
      expect(result).toBe(true);
    });

    it('should return false for dev function', () => {
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

      const result = DetectionUtils.isProductionFunction(lambdaResource, 'dev');
      expect(result).toBe(false);
    });
  });

  describe('hasCustomDomain()', () => {
    it('should detect custom domain in serverless config', () => {
      const serverlessConfig = {
        custom: {
          customDomain: {
            domainName: 'api.example.com'
          }
        }
      };

      const result = DetectionUtils.hasCustomDomain(serverlessConfig);
      expect(result).toBe(true);
    });

    it('should detect provider domain in serverless config', () => {
      const serverlessConfig = {
        provider: {
          domain: 'api.example.com'
        }
      };

      const result = DetectionUtils.hasCustomDomain(serverlessConfig);
      expect(result).toBe(true);
    });

    it('should return false if no domain configured', () => {
      const serverlessConfig = {
        provider: {
          stage: 'prod'
        }
      };

      const result = DetectionUtils.hasCustomDomain(serverlessConfig);
      expect(result).toBe(false);
    });
  });

  describe('extractEventConfig()', () => {
    it('should extract http event configuration', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              {
                http: {
                  path: '/api',
                  method: 'GET',
                  authorizer: 'my-authorizer',
                  cors: true
                }
              }
            ]
          }
        }
      };

      const result = DetectionUtils.extractEventConfig(lambdaResource, serverlessConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'http',
        path: '/api',
        method: 'GET',
        authorizer: 'my-authorizer',
        cors: true
      });
    });

    it('should extract httpApi event configuration', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              {
                httpApi: {
                  path: '/api',
                  method: 'POST'
                }
              }
            ]
          }
        }
      };

      const result = DetectionUtils.extractEventConfig(lambdaResource, serverlessConfig);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('httpApi');
      expect(result[0].path).toBe('/api');
      expect(result[0].method).toBe('POST');
    });

    it('should handle multiple events', () => {
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

      const serverlessConfig = {
        functions: {
          'my-function': {
            events: [
              { http: { path: '/api', method: 'GET' } },
              { httpApi: { path: '/api/v2', method: 'POST' } },
              { sqs: { arn: 'arn:aws:sqs:us-east-1:123456789012:my-queue' } }
            ]
          }
        }
      };

      const result = DetectionUtils.extractEventConfig(lambdaResource, serverlessConfig);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('http');
      expect(result[1].type).toBe('httpApi');
      expect(result[2].type).toBe('other');
    });
  });

  describe('getFunctionName()', () => {
    it('should get function name from resource properties', () => {
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

      const result = DetectionUtils.getFunctionName(lambdaResource);
      expect(result).toBe('my-function');
    });

    it('should fallback to LogicalId if FunctionName not present', () => {
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

      const result = DetectionUtils.getFunctionName(lambdaResource);
      expect(result).toBe('MyFunction');
    });

    it('should return "unknown" if no name available', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: '',
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

      const result = DetectionUtils.getFunctionName(lambdaResource);
      expect(result).toBe('unknown');
    });
  });
});
