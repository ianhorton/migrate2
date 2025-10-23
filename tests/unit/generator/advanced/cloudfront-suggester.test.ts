/**
 * CloudFrontSuggester Unit Tests - Sprint 4 Phase 4 (RED)
 * Test-Driven Development: Writing tests FIRST
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CloudFrontSuggester } from '../../../../src/modules/generator/advanced/cloudfront-suggester';
import { ClassifiedResource } from '../../../../src/types';

describe('CloudFrontSuggester', () => {
  let classifiedResources: ClassifiedResource[];
  let options: any;

  beforeEach(() => {
    classifiedResources = [];
    options = {};
  });

  describe('shouldSuggestCloudFront()', () => {
    it('should suggest CloudFront for production + Function URL', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-prod-function',
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const result = generator.shouldSuggestCloudFront(lambdaResource, true);

      expect(result.shouldSuggest).toBe(true);
      expect(result.reason).toContain('Production');
    });

    it('should suggest CloudFront for custom domain', () => {
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

      const optionsWithDomain = {
        serverlessConfig: {
          custom: {
            customDomain: {
              domainName: 'api.example.com'
            }
          }
        }
      };

      const generator = new CloudFrontSuggester(classifiedResources, optionsWithDomain);
      const result = generator.shouldSuggestCloudFront(lambdaResource, true);

      expect(result.shouldSuggest).toBe(true);
      expect(result.reason).toContain('Custom domain');
    });

    it('should not suggest CloudFront for development', () => {
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const result = generator.shouldSuggestCloudFront(lambdaResource, true);

      expect(result.shouldSuggest).toBe(false);
      expect(result.reason).toContain('CloudFront not needed');
    });

    it('should not suggest CloudFront without Function URL', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-prod-function',
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const result = generator.shouldSuggestCloudFront(lambdaResource, false); // No Function URL

      expect(result.shouldSuggest).toBe(false);
    });

    it('should suggest CloudFront for high-traffic function', () => {
      const lambdaResource: ClassifiedResource = {
        LogicalId: 'MyFunction',
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'my-function',
          MemorySize: 1024,
          Timeout: 30
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const result = generator.shouldSuggestCloudFront(lambdaResource, true);

      expect(result.shouldSuggest).toBe(true);
      expect(result.reason).toContain('High-memory');
    });

    it('should respect user override', () => {
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
        suggestCloudFront: true
      };

      const generator = new CloudFrontSuggester(classifiedResources, optionsWithOverride);
      const result = generator.shouldSuggestCloudFront(lambdaResource, true);

      expect(result.shouldSuggest).toBe(true);
      expect(result.reason).toContain('User configuration');
    });
  });

  describe('generateSuggestion()', () => {
    it('should generate commented CloudFront code', () => {
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const code = generator.generateSuggestion('myFunctionUrl', 'my-function');

      expect(code).toContain('CloudFront Distribution (SUGGESTED)');
      expect(code).toContain('//');
      expect(code).toContain('const');
      expect(code).toContain('new Distribution');
    });

    it('should include setup instructions in comment', () => {
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

      const generator = new CloudFrontSuggester(classifiedResources, options);
      const code = generator.generateSuggestion('myFunctionUrl', 'my-function');

      expect(code).toContain('Prerequisites:');
      expect(code).toContain('ACM certificate');
      expect(code).toContain('UPDATE THIS');
    });
  });

  describe('generateConsoleSuggestion()', () => {
    it('should generate clear console message', () => {
      const generator = new CloudFrontSuggester(classifiedResources, options);
      const message = generator.generateConsoleSuggestion('my-function');

      expect(message).toContain('Production Recommendation');
      expect(message).toContain('my-function');
      expect(message).toContain('Custom Domain');
      expect(message).toContain('Performance');
      expect(message).toContain('Security');
    });
  });
});
