/**
 * Unit Tests for ManagedPolicyDetector (Sprint 2: TDD Phase 1)
 * RED PHASE: Tests written BEFORE implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ManagedPolicyDetector } from '../../../src/modules/generator/utils/managed-policy-detector';
import { ClassifiedResource } from '../../../src/types';

describe('ManagedPolicyDetector - Sprint 2 Phase 1', () => {
  let detector: ManagedPolicyDetector;

  beforeEach(() => {
    detector = new ManagedPolicyDetector();
  });

  describe('Test 1: Basic structure', () => {
    it('should detect BasicExecutionRole pattern', () => {
      // RED: Write test first
      const lambdaRole: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'LambdaRole',
        Properties: {
          AssumeRolePolicyDocument: {
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
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(lambdaRole);
      expect(result).toBe('service-role/AWSLambdaBasicExecutionRole');
    });
  });

  describe('Test 2: Use Sprint 1 pre-detected equivalent', () => {
    it('should use pre-detected managedPolicyEquivalent', () => {
      const roleWithPreDetection: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'PreDetectedRole',
        Properties: {
          AssumeRolePolicyDocument: {
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
        },
        managedPolicyEquivalent: 'service-role/AWSLambdaBasicExecutionRole',
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithPreDetection);
      expect(result).toBe('service-role/AWSLambdaBasicExecutionRole');
    });
  });

  describe('Test 3: Reject roles with extra policies', () => {
    it('should reject roles with additional policies beyond BasicExecutionRole', () => {
      const roleWithExtra: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'RoleWithExtra',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          },
          Policies: [{
            PolicyName: 'lambda-policy',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                  Resource: '*'
                },
                {
                  Effect: 'Allow',
                  Action: ['s3:GetObject'],
                  Resource: '*'
                }
              ]
            }
          }]
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithExtra);
      expect(result).toBeUndefined();
    });
  });

  describe('Test 4: Reject roles with wrong service principal', () => {
    it('should reject roles with non-Lambda service principal', () => {
      const roleWithWrongPrincipal: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'ApiGatewayRole',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'apigateway.amazonaws.com' },
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
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithWrongPrincipal);
      expect(result).toBeUndefined();
    });
  });

  describe('Test 5: Handle missing properties', () => {
    it('should handle role with missing AssumeRolePolicyDocument', () => {
      const roleWithoutAssumePolicy: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'IncompleteRole',
        Properties: {
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
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithoutAssumePolicy);
      expect(result).toBeUndefined();
    });

    it('should handle role with no Policies array', () => {
      const roleWithoutPolicies: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'NoPoliciesRole',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          }
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithoutPolicies);
      expect(result).toBeUndefined();
    });
  });

  describe('Test 6: Handle multiple policies', () => {
    it('should reject role with multiple policy documents', () => {
      const roleWithMultiplePolicies: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'MultiPolicyRole',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          },
          Policies: [
            {
              PolicyName: 'logs-policy',
              PolicyDocument: {
                Statement: [{
                  Effect: 'Allow',
                  Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                  Resource: '*'
                }]
              }
            },
            {
              PolicyName: 'dynamodb-policy',
              PolicyDocument: {
                Statement: [{
                  Effect: 'Allow',
                  Action: ['dynamodb:GetItem'],
                  Resource: '*'
                }]
              }
            }
          ]
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithMultiplePolicies);
      expect(result).toBeUndefined();
    });
  });

  describe('Test 7: Handle explicit managed policy ARNs', () => {
    it('should return undefined when explicit ManagedPolicyArns present', () => {
      // This test ensures detector focuses on inline policies only
      const roleWithExplicitManaged: ClassifiedResource = {
        Type: 'AWS::IAM::Role',
        LogicalId: 'ExplicitManagedRole',
        Properties: {
          AssumeRolePolicyDocument: {
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          },
          ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'iam',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(roleWithExplicitManaged);
      expect(result).toBeUndefined();
    });
  });

  describe('Test 8: Return undefined for non-IAM resources', () => {
    it('should return undefined for non-IAM resource types', () => {
      const lambdaFunction: ClassifiedResource = {
        Type: 'AWS::Lambda::Function',
        LogicalId: 'MyFunction',
        Properties: {
          FunctionName: 'test-function'
        },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'compute',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      };

      const result = detector.detectManagedPolicy(lambdaFunction);
      expect(result).toBeUndefined();
    });
  });
});
