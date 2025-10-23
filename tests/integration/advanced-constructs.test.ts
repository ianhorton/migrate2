/**
 * Advanced Constructs Integration Tests - Sprint 4 Phase 7
 * End-to-end tests for complete workflow
 */

import { describe, it, expect } from '@jest/globals';
import { AdvancedConstructsGenerator } from '../../src/modules/generator/templates/l2-constructs/advanced';
import { ClassifiedResource } from '../../src/types';

describe('Advanced Constructs Integration', () => {
  it('should generate full stack for production Lambda with HTTP event', () => {
    // Input: Production Lambda with http event
    const lambdaResource: ClassifiedResource = {
      LogicalId: 'ApiFunction',
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: 'api-function',
        Tags: [
          { Key: 'environment', Value: 'production' }
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

    const options = {
      stage: 'production',
      serverlessConfig: {
        functions: {
          'api-function': {
            events: [
              { http: { path: '/api', method: 'GET' } }
            ]
          }
        }
      }
    };

    const generator = new AdvancedConstructsGenerator([lambdaResource], options);
    const result = generator.generateAdvancedConstructs(lambdaResource, 'apiFunction');

    // Should generate all three constructs
    expect(result.hasAlias).toBe(true);
    expect(result.hasFunctionUrl).toBe(true);
    expect(result.hasCloudFrontSuggestion).toBe(true);

    // Verify generated code
    expect(result.code).toContain('new Alias');
    expect(result.code).toContain('addFunctionUrl');
    expect(result.code).toContain('CloudFront Distribution (SUGGESTED)');

    // Verify console suggestions
    expect(result.consoleSuggestions.length).toBeGreaterThan(0);
  });

  it('should generate Function URL for HTTP endpoint without alias (dev)', () => {
    // Input: Development Lambda with http event (no alias triggers)
    const lambdaResource: ClassifiedResource = {
      LogicalId: 'DevApiFunction',
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: 'dev-api-function'
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

    const options = {
      serverlessConfig: {
        functions: {
          'dev-api-function': {
            events: [
              { http: { path: '/api', method: 'GET' } }
            ]
          }
        }
      }
    };

    const generator = new AdvancedConstructsGenerator([lambdaResource], options);
    const result = generator.generateAdvancedConstructs(lambdaResource, 'devApiFunction');

    // Should generate Function URL (HTTP event), but no alias (not production/multi-stage)
    expect(result.hasFunctionUrl).toBe(true);
    expect(result.hasCloudFrontSuggestion).toBe(false);

    // Verify generated code - Function URL on raw function (no alias)
    expect(result.code).toContain('addFunctionUrl');
    expect(result.code).not.toContain('CloudFront');
  });

  it('should suggest CloudFront for high-memory production function', () => {
    // Input: High-memory production Lambda with Function URL
    const lambdaResource: ClassifiedResource = {
      LogicalId: 'HighMemoryFunction',
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: 'high-memory-function',
        MemorySize: 1024,
        Timeout: 30,
        Tags: [
          { Key: 'environment', Value: 'production' }
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

    const options = {
      stage: 'production',
      serverlessConfig: {
        functions: {
          'high-memory-function': {
            events: [
              { httpApi: { path: '/process', method: 'POST' } }
            ]
          }
        }
      }
    };

    const generator = new AdvancedConstructsGenerator([lambdaResource], options);
    const result = generator.generateAdvancedConstructs(lambdaResource, 'highMemoryFunction');

    // Should suggest CloudFront for caching benefits
    expect(result.hasCloudFrontSuggestion).toBe(true);
    expect(result.code).toContain('CloudFront Distribution (SUGGESTED)');
    // Console message mentions production (reason is in CloudFrontSuggester.shouldSuggestCloudFront)
    expect(result.consoleSuggestions[0]).toContain('Production Recommendation');
  });

  it('should handle webhook pattern with NONE auth', () => {
    // Input: Webhook function (should get public Function URL)
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

    const options = {};

    const generator = new AdvancedConstructsGenerator([lambdaResource], options);
    const result = generator.generateAdvancedConstructs(lambdaResource, 'githubWebhook');

    // Should generate Function URL with NONE auth
    expect(result.hasFunctionUrl).toBe(true);
    expect(result.code).toContain('FunctionUrlAuthType.NONE');
    expect(result.code).toContain('WARNING');
    expect(result.code).toContain('publicly accessible');
  });

  it('should handle SQS-triggered Lambda (no advanced constructs)', () => {
    // Input: SQS-triggered Lambda (no HTTP access)
    const lambdaResource: ClassifiedResource = {
      LogicalId: 'SqsProcessor',
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: 'sqs-processor'
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

    const options = {
      serverlessConfig: {
        functions: {
          'sqs-processor': {
            events: [
              { sqs: { arn: 'arn:aws:sqs:us-east-1:123456789012:my-queue' } }
            ]
          }
        }
      }
    };

    const generator = new AdvancedConstructsGenerator([lambdaResource], options);
    const result = generator.generateAdvancedConstructs(lambdaResource, 'sqsProcessor');

    // Should NOT generate any advanced constructs
    expect(result.hasAlias).toBe(false);
    expect(result.hasFunctionUrl).toBe(false);
    expect(result.hasCloudFrontSuggestion).toBe(false);
    expect(result.code).toBe('');
  });
});
