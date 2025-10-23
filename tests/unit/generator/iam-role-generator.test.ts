import { describe, it, expect, beforeEach } from '@jest/globals';
import { IAMRoleGenerator } from '../../../src/modules/generator/templates/l2-constructs/iam';
import { ClassifiedResource } from '../../../src/types';

describe('IAMRoleGenerator', () => {
  let generator: IAMRoleGenerator;
  let mockResources: ClassifiedResource[];

  // Helper to create base resource
  const createBaseResource = (logicalId: string, type: string, properties: any): ClassifiedResource => ({
    Type: type,
    LogicalId: logicalId,
    Properties: properties,
    needsImport: false,
    isStateful: false,
    isExplicit: true,
    relatedResources: [],
    groupId: 'default'
  });

  beforeEach(() => {
    mockResources = [
      createBaseResource('MyLambda', 'AWS::Lambda::Function', {
        FunctionName: 'my-function',
        Handler: 'index.handler',
        Runtime: 'nodejs18.x',
        Role: { 'Fn::GetAtt': ['MyLambdaRole', 'Arn'] }
      }),
      createBaseResource('MyTable', 'AWS::DynamoDB::Table', {
        TableName: 'my-table',
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST'
      })
    ];
    generator = new IAMRoleGenerator(mockResources);
  });

  describe('generateRole', () => {
    it('should generate role with managed policy', () => {
      const roleResource = createBaseResource('MyLambdaRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        ]
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('const myLambdaRole = new iam.Role');
      expect(result).toContain('assumedBy: new iam.ServicePrincipal(\'lambda.amazonaws.com\')');
      expect(result).toContain('managedPolicies: [');
      expect(result).toContain('iam.ManagedPolicy.fromAwsManagedPolicyName(\'service-role/AWSLambdaBasicExecutionRole\')');
      expect(result).not.toContain('Arn');
    });

    it('should analyze permissions correctly', () => {
      const roleResource = createBaseResource('CustomRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        ],
        Policies: [
          {
            PolicyName: 'CustomPolicy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
                  Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
                }
              ]
            }
          }
        ]
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('managedPolicies: [');
      expect(result).toContain('AWSLambdaBasicExecutionRole');
      expect(result).toContain('customRole.addToPolicy');
      expect(result).toContain('myTable.tableArn');
    });

    it('should generate role declaration', () => {
      const roleResource = createBaseResource('SimpleRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'ec2.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('const simpleRole = new iam.Role(this, \'SimpleRole\', {');
      expect(result).toContain('assumedBy: new iam.ServicePrincipal(\'ec2.amazonaws.com\')');
      expect(result).toContain('});');
    });

    it('should generate custom permissions', () => {
      const roleResource = createBaseResource('DynamoRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'DynamoAccess',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['dynamodb:Query', 'dynamodb:Scan'],
                  Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
                }
              ]
            }
          }
        ]
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('dynamoRole.addToPolicy(new iam.PolicyStatement({');
      expect(result).toContain('actions: [\'dynamodb:Query\', \'dynamodb:Scan\']');
      expect(result).toContain('resources: [myTable.tableArn]');
      expect(result).toContain('}));');
    });

    it('should use construct references not ARNs', () => {
      const roleResource = createBaseResource('RefRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'TableAccess',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 'dynamodb:*',
                  Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
                }
              ]
            }
          }
        ]
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('myTable.tableArn');
      expect(result).not.toContain('Fn::GetAtt');
      expect(result).not.toContain('\'Arn\'');
    });

    it('should respect suppressLogicalIdOverride flag', () => {
      const roleResource = createBaseResource('MyRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });
      roleResource.Metadata = { suppressLogicalIdOverride: true };

      const result = generator.generateRole(roleResource);

      expect(result).not.toContain('Fn::Sub');
      expect(result).not.toContain('${AWS::StackName}');
      expect(result).not.toContain('overrideLogicalId');
    });

    it('should respect suppressRemovalPolicy flag', () => {
      const roleResource = createBaseResource('RetainRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });
      roleResource.Metadata = { suppressRemovalPolicy: true };

      const result = generator.generateRole(roleResource);

      expect(result).not.toContain('removalPolicy');
      expect(result).not.toContain('RemovalPolicy');
    });

    it('should respect suppressComments flag', () => {
      const roleResource = createBaseResource('NoCommentRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });
      roleResource.Metadata = { suppressComments: true };

      const result = generator.generateRole(roleResource);

      expect(result).not.toContain('//');
      expect(result).not.toContain('/*');
      expect(result).not.toContain('*/');
    });

    it('should handle multiple policies', () => {
      const roleResource = createBaseResource('MultiPolicyRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'DynamoPolicy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 'dynamodb:*',
                  Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
                }
              ]
            }
          },
          {
            PolicyName: 'S3Policy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 's3:GetObject',
                  Resource: 'arn:aws:s3:::my-bucket/*'
                }
              ]
            }
          }
        ]
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('myTable.tableArn');
      expect(result).toContain('\'s3:GetObject\'');
      expect(result).toContain('\'arn:aws:s3:::my-bucket/*\'');
      const policyStatementCount = (result.match(/addToPolicy/g) || []).length;
      expect(policyStatementCount).toBe(2);
    });

    it('should handle non-Lambda principals', () => {
      const roleResource = createBaseResource('EC2Role', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'ec2.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });

      const result = generator.generateRole(roleResource);

      expect(result).toContain('new iam.ServicePrincipal(\'ec2.amazonaws.com\')');
      expect(result).not.toContain('lambda.amazonaws.com');
    });

    it('should handle missing properties gracefully', () => {
      const roleResource = createBaseResource('MinimalRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        }
      });

      const result = generator.generateRole(roleResource);

      expect(result).toBeTruthy();
      expect(result).toContain('const minimalRole = new iam.Role');
      expect(result).toContain('assumedBy: new iam.ServicePrincipal(\'lambda.amazonaws.com\')');
    });

    it('should achieve 60% code reduction', () => {
      const roleResource = createBaseResource('OptimizedRole', 'AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        ],
        Policies: [
          {
            PolicyName: 'CustomPolicy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 'dynamodb:*',
                  Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
                }
              ]
            }
          }
        ]
      });

      const result = generator.generateRole(roleResource);

      // CloudFormation equivalent would be ~50 lines (AssumeRolePolicyDocument JSON, ManagedPolicyArns array, Policies with full PolicyDocument)
      // CDK should be ~20 lines (Role constructor + managed policy + addToPolicy)
      const cdkLines = result.split('\n').filter(line => line.trim().length > 0).length;

      expect(cdkLines).toBeLessThanOrEqual(20);
      expect(cdkLines).toBeGreaterThanOrEqual(10);

      // Verify it's concise but complete
      expect(result).toContain('new iam.Role');
      expect(result).toContain('managedPolicies');
      expect(result).toContain('addToPolicy');
    });
  });
});
