/**
 * Unit Tests for ResourceClassifier (Sprint 1: TDD)
 * Tests written BEFORE implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ResourceClassifier } from '../../../src/modules/generator/resource-classifier';
import { CloudFormationResource, ClassifiedResource } from '../../../src/types';

describe('ResourceClassifier - Sprint 1', () => {
  let classifier: ResourceClassifier;

  beforeEach(() => {
    classifier = new ResourceClassifier();
  });

  describe('classifyResources', () => {
    it('should add classification metadata to all resources', () => {
      const resources: CloudFormationResource[] = [
        {
          Type: 'AWS::DynamoDB::Table',
          Properties: { TableName: 'test-table' }
        }
      ];

      const result = classifier.classifyResources(resources, 'TestLogicalId');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('needsImport');
      expect(result[0]).toHaveProperty('isStateful');
      expect(result[0]).toHaveProperty('groupId');
      expect(result[0]).toHaveProperty('relatedResources');
    });

    it('should set LogicalId from parameter', () => {
      const resources: CloudFormationResource[] = [
        {
          Type: 'AWS::Lambda::Function',
          Properties: { FunctionName: 'test' }
        }
      ];

      const result = classifier.classifyResources(resources, 'MyLambdaFunction');

      expect(result[0].LogicalId).toBe('MyLambdaFunction');
    });
  });

  describe('Stateful Resource Detection', () => {
    it('should detect DynamoDB tables as stateful', () => {
      const dynamoDB: CloudFormationResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: { TableName: 'users' }
      };

      const result = classifier.classifyResources([dynamoDB], 'UsersTable');

      expect(result[0].isStateful).toBe(true);
      expect(result[0].needsImport).toBe(true);
    });

    it('should detect S3 buckets as stateful', () => {
      const s3: CloudFormationResource = {
        Type: 'AWS::S3::Bucket',
        Properties: { BucketName: 'my-bucket' }
      };

      const result = classifier.classifyResources([s3], 'MyBucket');

      expect(result[0].isStateful).toBe(true);
      expect(result[0].needsImport).toBe(true);
    });

    it('should detect LogGroups as stateful', () => {
      const logGroup: CloudFormationResource = {
        Type: 'AWS::Logs::LogGroup',
        Properties: { LogGroupName: '/aws/lambda/test' }
      };

      const result = classifier.classifyResources([logGroup], 'TestLogGroup');

      expect(result[0].isStateful).toBe(true);
      expect(result[0].needsImport).toBe(true);
    });

    it('should detect Lambda functions as stateless', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: { FunctionName: 'test' }
      };

      const result = classifier.classifyResources([lambda], 'TestFunction');

      expect(result[0].isStateful).toBe(false);
      expect(result[0].needsImport).toBe(false);
    });

    it('should detect IAM roles as stateless', () => {
      const role: CloudFormationResource = {
        Type: 'AWS::IAM::Role',
        Properties: { RoleName: 'test-role' }
      };

      const result = classifier.classifyResources([role], 'TestRole');

      expect(result[0].isStateful).toBe(false);
      expect(result[0].needsImport).toBe(false);
    });
  });

  describe('Managed Policy Detection', () => {
    it('should detect BasicExecutionRole pattern in IAM role', () => {
      const role: CloudFormationResource = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumedRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          },
          Policies: [{
            PolicyName: 'lambda-policy',
            PolicyDocument: {
              Statement: [{
                Effect: 'Allow',
                Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                Resource: '*'
              }]
            }
          }]
        }
      };

      const result = classifier.classifyResources([role], 'LambdaRole');

      expect(result[0].managedPolicyEquivalent).toBe(
        'service-role/AWSLambdaBasicExecutionRole'
      );
    });

    it('should not set managedPolicyEquivalent for custom IAM policies', () => {
      const role: CloudFormationResource = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumedRolePolicyDocument: {},
          Policies: [{
            PolicyName: 'custom-policy',
            PolicyDocument: {
              Statement: [{
                Effect: 'Allow',
                Action: ['s3:*'],
                Resource: '*'
              }]
            }
          }]
        }
      };

      const result = classifier.classifyResources([role], 'CustomRole');

      expect(result[0].managedPolicyEquivalent).toBeUndefined();
    });

    it('should not set managedPolicyEquivalent for non-IAM resources', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([lambda], 'TestLambda');

      expect(result[0].managedPolicyEquivalent).toBeUndefined();
    });
  });

  describe('Resource Relationships', () => {
    it('should find Lambda role relationship', () => {
      const resources: CloudFormationResource[] = [
        {
          Type: 'AWS::IAM::Role',
          Properties: { RoleName: 'test-role' }
        },
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'test-fn',
            Role: { 'Fn::GetAtt': ['TestRole', 'Arn'] }
          }
        }
      ];

      const allClassified = resources.map((r, i) =>
        classifier.classifyResources([r], i === 0 ? 'TestRole' : 'TestFunction')[0]
      );

      const lambdaClassified = classifier.findRelatedResources(
        allClassified[1],
        allClassified
      );

      expect(lambdaClassified.relatedResources).toContain('TestRole');
    });

    it('should find Lambda LogGroup relationship', () => {
      const resources: CloudFormationResource[] = [
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: { LogGroupName: '/aws/lambda/test-fn' }
        },
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'test-fn'
          }
        }
      ];

      const allClassified = resources.map((r, i) =>
        classifier.classifyResources([r], i === 0 ? 'TestLogGroup' : 'TestFunction')[0]
      );

      const lambdaClassified = classifier.findRelatedResources(
        allClassified[1],
        allClassified
      );

      expect(lambdaClassified.relatedResources).toContain('TestLogGroup');
    });

    it('should return empty array when no relationships found', () => {
      const resources: CloudFormationResource[] = [
        {
          Type: 'AWS::DynamoDB::Table',
          Properties: { TableName: 'standalone' }
        }
      ];

      const classified = classifier.classifyResources(resources, 'StandaloneTable');
      const result = classifier.findRelatedResources(classified[0], classified);

      expect(result.relatedResources).toEqual([]);
    });
  });

  describe('Resource Grouping', () => {
    it('should group DynamoDB tables as "databases"', () => {
      const dynamoDB: CloudFormationResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {}
      };

      const result = classifier.classifyResources([dynamoDB], 'TestTable');

      expect(result[0].groupId).toBe('databases');
    });

    it('should group S3 buckets as "storage"', () => {
      const s3: CloudFormationResource = {
        Type: 'AWS::S3::Bucket',
        Properties: {}
      };

      const result = classifier.classifyResources([s3], 'TestBucket');

      expect(result[0].groupId).toBe('storage');
    });

    it('should group IAM roles as "iam"', () => {
      const role: CloudFormationResource = {
        Type: 'AWS::IAM::Role',
        Properties: {}
      };

      const result = classifier.classifyResources([role], 'TestRole');

      expect(result[0].groupId).toBe('iam');
    });

    it('should group Lambda functions as "compute"', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([lambda], 'TestLambda');

      expect(result[0].groupId).toBe('compute');
    });

    it('should group LogGroups as "logging"', () => {
      const logGroup: CloudFormationResource = {
        Type: 'AWS::Logs::LogGroup',
        Properties: {}
      };

      const result = classifier.classifyResources([logGroup], 'TestLogGroup');

      expect(result[0].groupId).toBe('logging');
    });

    it('should group CloudFront as "cdn"', () => {
      const cf: CloudFormationResource = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {}
      };

      const result = classifier.classifyResources([cf], 'TestDistribution');

      expect(result[0].groupId).toBe('cdn');
    });

    it('should group unknown types as "other"', () => {
      const unknown: CloudFormationResource = {
        Type: 'AWS::Unknown::Resource',
        Properties: {}
      };

      const result = classifier.classifyResources([unknown], 'UnknownResource');

      expect(result[0].groupId).toBe('other');
    });
  });

  describe('Code Optimization Flags', () => {
    it('should suppress logical ID override for new resources', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([lambda], 'NewLambda');

      // Stateless resources don't need import, so can suppress logical ID
      expect(result[0].suppressLogicalIdOverride).toBe(true);
    });

    it('should NOT suppress logical ID override for imported resources', () => {
      const dynamoDB: CloudFormationResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {}
      };

      const result = classifier.classifyResources([dynamoDB], 'ImportedTable');

      // Stateful resources need import, so must keep logical ID
      expect(result[0].suppressLogicalIdOverride).toBe(false);
    });

    it('should suppress removal policy for stateless resources', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([lambda], 'TestLambda');

      expect(result[0].suppressRemovalPolicy).toBe(true);
    });

    it('should NOT suppress removal policy for stateful resources', () => {
      const dynamoDB: CloudFormationResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {}
      };

      const result = classifier.classifyResources([dynamoDB], 'TestTable');

      expect(result[0].suppressRemovalPolicy).toBe(false);
    });

    it('should suppress comments for new resources', () => {
      const lambda: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([lambda], 'NewLambda');

      // New resources don't need "will be imported" comments
      expect(result[0].suppressComments).toBe(true);
    });

    it('should NOT suppress comments for imported resources', () => {
      const dynamoDB: CloudFormationResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {}
      };

      const result = classifier.classifyResources([dynamoDB], 'ImportedTable');

      // Imported resources should keep warning comments
      expect(result[0].suppressComments).toBe(false);
    });
  });
});
