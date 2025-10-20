/**
 * Tests for ResourceClassifier
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ResourceClassifier } from '../../../src/modules/scanner/resource-classifier';
import { Resource } from '../../../src/types/migration';

describe('ResourceClassifier', () => {
  let classifier: ResourceClassifier;

  beforeEach(() => {
    classifier = new ResourceClassifier();
  });

  describe('classifyResource', () => {
    it('should classify DynamoDB table as IMPORT', () => {
      const resource = {
        type: 'AWS::DynamoDB::Table',
      };

      const action = classifier.classifyResource(resource);
      expect(action).toBe('IMPORT');
    });

    it('should classify S3 bucket as IMPORT', () => {
      const resource = {
        type: 'AWS::S3::Bucket',
      };

      const action = classifier.classifyResource(resource);
      expect(action).toBe('IMPORT');
    });

    it('should classify LogGroup as IMPORT', () => {
      const resource = {
        type: 'AWS::Logs::LogGroup',
      };

      const action = classifier.classifyResource(resource);
      expect(action).toBe('IMPORT');
    });

    it('should classify Lambda function as RECREATE', () => {
      const resource = {
        type: 'AWS::Lambda::Function',
      };

      const action = classifier.classifyResource(resource);
      expect(action).toBe('RECREATE');
    });

    it('should classify IAM role as RECREATE', () => {
      const resource = {
        type: 'AWS::IAM::Role',
      };

      const action = classifier.classifyResource(resource);
      expect(action).toBe('RECREATE');
    });

    it('should throw error if resource type is missing', () => {
      const resource = {};

      expect(() => classifier.classifyResource(resource)).toThrow(
        'Resource type is required'
      );
    });
  });

  describe('classifyResources', () => {
    it('should classify multiple resources correctly', () => {
      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Bucket1',
          physicalId: 'my-bucket',
          type: 'AWS::S3::Bucket',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
      ];

      const result = classifier.classifyResources(resources);

      expect(result.toImport).toHaveLength(2);
      expect(result.toRecreate).toHaveLength(1);
      expect(result.toImport.map((r) => r.type)).toEqual([
        'AWS::DynamoDB::Table',
        'AWS::S3::Bucket',
      ]);
      expect(result.toRecreate.map((r) => r.type)).toEqual([
        'AWS::Lambda::Function',
      ]);
    });

    it('should build dependency map', () => {
      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: ['Table1'],
        },
      ];

      const result = classifier.classifyResources(resources);

      expect(result.dependencies.get('Function1')).toEqual(['Table1']);
    });
  });

  describe('isStateful', () => {
    it('should return true for DynamoDB table', () => {
      expect(classifier.isStateful('AWS::DynamoDB::Table')).toBe(true);
    });

    it('should return true for S3 bucket', () => {
      expect(classifier.isStateful('AWS::S3::Bucket')).toBe(true);
    });

    it('should return false for Lambda function', () => {
      expect(classifier.isStateful('AWS::Lambda::Function')).toBe(false);
    });
  });

  describe('isStateless', () => {
    it('should return false for DynamoDB table', () => {
      expect(classifier.isStateless('AWS::DynamoDB::Table')).toBe(false);
    });

    it('should return true for Lambda function', () => {
      expect(classifier.isStateless('AWS::Lambda::Function')).toBe(true);
    });
  });

  describe('getRecommendedDeletionPolicy', () => {
    it('should recommend Retain for stateful resources', () => {
      const resource: Resource = {
        logicalId: 'Table1',
        physicalId: 'my-table',
        type: 'AWS::DynamoDB::Table',
        properties: {},
        classification: 'IMPORT',
        source: 'explicit',
        dependencies: [],
      };

      const policy = classifier.getRecommendedDeletionPolicy(resource);
      expect(policy).toBe('Retain');
    });

    it('should recommend Delete for stateless resources', () => {
      const resource: Resource = {
        logicalId: 'Function1',
        physicalId: 'my-function',
        type: 'AWS::Lambda::Function',
        properties: {},
        classification: 'RECREATE',
        source: 'explicit',
        dependencies: [],
      };

      const policy = classifier.getRecommendedDeletionPolicy(resource);
      expect(policy).toBe('Delete');
    });
  });
});
