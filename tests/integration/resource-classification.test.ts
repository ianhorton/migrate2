/**
 * Integration Tests for Resource Classification (Sprint 1)
 * Tests the full classification pipeline with real CloudFormation templates
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ResourceClassifier } from '../../src/modules/generator/resource-classifier';
import { CloudFormationResource, ClassifiedResource } from '../../src/types';
import * as path from 'path';
import * as fs from 'fs';

describe('Resource Classification Integration', () => {
  let classifier: ResourceClassifier;

  beforeEach(() => {
    classifier = new ResourceClassifier();
  });

  describe('Real Serverless Template Classification', () => {
    it('should classify typical Serverless stack correctly', () => {
      // Simulate a typical Serverless Framework generated template
      const template: Record<string, CloudFormationResource> = {
        'ServerlessDeploymentBucket': {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [{
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256'
                }
              }]
            }
          }
        },
        'CounterTable': {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: 'migration-sandbox-table',
            AttributeDefinitions: [{
              AttributeName: 'key',
              AttributeType: 'S'
            }],
            KeySchema: [{
              AttributeName: 'key',
              KeyType: 'HASH'
            }],
            BillingMode: 'PAY_PER_REQUEST'
          }
        },
        'CounterLogGroup': {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/migration-sandbox-counter'
          }
        },
        'IamRoleLambdaExecution': {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumedRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com'
                },
                Action: 'sts:AssumeRole'
              }]
            },
            Policies: [{
              PolicyName: 'lambda-execution-policy',
              PolicyDocument: {
                Statement: [{
                  Effect: 'Allow',
                  Action: [
                    'logs:CreateLogStream',
                    'logs:CreateLogGroup',
                    'logs:PutLogEvents'
                  ],
                  Resource: '*'
                }]
              }
            }]
          }
        },
        'CounterLambdaFunction': {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'migration-sandbox-counter',
            Handler: 'handler.router',
            Runtime: 'nodejs20.x',
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] }
          }
        }
      };

      // Classify all resources
      const classified: ClassifiedResource[] = [];
      for (const [logicalId, resource] of Object.entries(template)) {
        const result = classifier.classifyResources([resource], logicalId);
        classified.push(result[0]);
      }

      // Verify stateful resources
      const statefulResources = classified.filter(r => r.isStateful);
      expect(statefulResources).toHaveLength(3); // S3, DynamoDB, LogGroup

      const statefulTypes = statefulResources.map(r => r.Type);
      expect(statefulTypes).toContain('AWS::S3::Bucket');
      expect(statefulTypes).toContain('AWS::DynamoDB::Table');
      expect(statefulTypes).toContain('AWS::Logs::LogGroup');

      // Verify stateful resources need import
      statefulResources.forEach(r => {
        expect(r.needsImport).toBe(true);
        expect(r.suppressLogicalIdOverride).toBe(false);
        expect(r.suppressRemovalPolicy).toBe(false);
        expect(r.suppressComments).toBe(false);
      });

      // Verify stateless resources
      const statelessResources = classified.filter(r => !r.isStateful);
      expect(statelessResources).toHaveLength(2); // IAM Role, Lambda

      statelessResources.forEach(r => {
        expect(r.needsImport).toBe(false);
        expect(r.suppressLogicalIdOverride).toBe(true);
        expect(r.suppressRemovalPolicy).toBe(true);
        expect(r.suppressComments).toBe(true);
      });

      // Verify managed policy detection
      const iamRole = classified.find(r => r.LogicalId === 'IamRoleLambdaExecution');
      expect(iamRole?.managedPolicyEquivalent).toBe('service-role/AWSLambdaBasicExecutionRole');

      // Verify grouping
      const groups = classified.map(r => r.groupId);
      expect(groups).toContain('storage');   // S3
      expect(groups).toContain('databases'); // DynamoDB
      expect(groups).toContain('logging');   // LogGroup
      expect(groups).toContain('iam');       // IAM Role
      expect(groups).toContain('compute');   // Lambda
    });

    it('should properly resolve resource relationships', () => {
      const template: Record<string, CloudFormationResource> = {
        'TestLogGroup': {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/test-function'
          }
        },
        'TestRole': {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumedRolePolicyDocument: {}
          }
        },
        'TestFunction': {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'test-function',
            Role: { 'Fn::GetAtt': ['TestRole', 'Arn'] }
          }
        }
      };

      // Classify all resources
      const classified: ClassifiedResource[] = [];
      for (const [logicalId, resource] of Object.entries(template)) {
        const result = classifier.classifyResources([resource], logicalId);
        classified.push(result[0]);
      }

      // Find relationships for Lambda function
      const lambda = classified.find(r => r.LogicalId === 'TestFunction')!;
      const withRelationships = classifier.findRelatedResources(lambda, classified);

      // Should find both Role and LogGroup
      expect(withRelationships.relatedResources).toHaveLength(2);
      expect(withRelationships.relatedResources).toContain('TestRole');
      expect(withRelationships.relatedResources).toContain('TestLogGroup');
    });
  });

  describe('Classification Metrics', () => {
    it('should meet Sprint 1 success criteria', () => {
      // Create a representative stack
      const resources: Record<string, CloudFormationResource> = {
        'Bucket1': { Type: 'AWS::S3::Bucket', Properties: {} },
        'Table1': { Type: 'AWS::DynamoDB::Table', Properties: {} },
        'LogGroup1': { Type: 'AWS::Logs::LogGroup', Properties: {} },
        'Role1': { Type: 'AWS::IAM::Role', Properties: {} },
        'Lambda1': { Type: 'AWS::Lambda::Function', Properties: {} }
      };

      // Classify all
      const classified: ClassifiedResource[] = [];
      for (const [logicalId, resource] of Object.entries(resources)) {
        const result = classifier.classifyResources([resource], logicalId);
        classified.push(result[0]);
      }

      // Success Criteria #1: All resources have classification metadata
      classified.forEach(r => {
        expect(r).toHaveProperty('needsImport');
        expect(r).toHaveProperty('isStateful');
        expect(r).toHaveProperty('groupId');
        expect(r).toHaveProperty('relatedResources');
        expect(r).toHaveProperty('suppressLogicalIdOverride');
        expect(r).toHaveProperty('suppressRemovalPolicy');
        expect(r).toHaveProperty('suppressComments');
      });

      // Success Criteria #2: Stateful detection is 100% accurate
      const stateful = classified.filter(r => r.isStateful);
      expect(stateful).toHaveLength(3); // S3, DynamoDB, LogGroup
      stateful.forEach(r => {
        expect(['AWS::S3::Bucket', 'AWS::DynamoDB::Table', 'AWS::Logs::LogGroup'])
          .toContain(r.Type);
      });

      // Success Criteria #3: Groups are logical
      const groupMapping = {
        'Bucket1': 'storage',
        'Table1': 'databases',
        'LogGroup1': 'logging',
        'Role1': 'iam',
        'Lambda1': 'compute'
      };

      classified.forEach(r => {
        expect(r.groupId).toBe(groupMapping[r.LogicalId as keyof typeof groupMapping]);
      });

      // Success Criteria #4: Optimization flags are correct
      const stateless = classified.filter(r => !r.isStateful);
      stateless.forEach(r => {
        expect(r.suppressLogicalIdOverride).toBe(true);
        expect(r.suppressRemovalPolicy).toBe(true);
        expect(r.suppressComments).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle resources without properties', () => {
      const resource: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {}
      };

      const result = classifier.classifyResources([resource], 'MinimalLambda');

      expect(result[0].LogicalId).toBe('MinimalLambda');
      expect(result[0].groupId).toBe('compute');
      expect(result[0].isStateful).toBe(false);
    });

    it('should handle resources with complex Role references', () => {
      const resourceWithRef: CloudFormationResource = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Role: { Ref: 'MyRole' }
        }
      };

      const allResources = [
        { ...resourceWithRef, LogicalId: 'TestLambda' },
        {
          Type: 'AWS::IAM::Role',
          Properties: {},
          LogicalId: 'MyRole'
        } as ClassifiedResource
      ];

      const result = classifier.findRelatedResources(
        allResources[0] as ClassifiedResource,
        allResources as ClassifiedResource[]
      );

      expect(result.relatedResources).toContain('MyRole');
    });

    it('should handle IAM roles with multiple policies', () => {
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
          Policies: [
            {
              PolicyName: 'basic-execution',
              PolicyDocument: {
                Statement: [{
                  Effect: 'Allow',
                  Action: ['logs:CreateLogStream', 'logs:CreateLogGroup', 'logs:PutLogEvents'],
                  Resource: '*'
                }]
              }
            },
            {
              PolicyName: 'dynamodb-access',
              PolicyDocument: {
                Statement: [{
                  Effect: 'Allow',
                  Action: ['dynamodb:UpdateItem'],
                  Resource: '*'
                }]
              }
            }
          ]
        }
      };

      const result = classifier.classifyResources([role], 'ComplexRole');

      // Should NOT match BasicExecutionRole because it has extra policies
      expect(result[0].managedPolicyEquivalent).toBeUndefined();
    });
  });
});
