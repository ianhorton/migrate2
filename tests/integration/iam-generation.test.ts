import { describe, it, expect, beforeEach } from '@jest/globals';
import { IAMRoleGenerator } from '../../src/modules/generator/templates/l2-constructs/iam';
import { ClassifiedResource } from '../../src/types';

describe('IAM Generation Integration Tests', () => {
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
      }),
      createBaseResource('MyBucket', 'AWS::S3::Bucket', {
        BucketName: 'my-bucket'
      })
    ];
  });

  it('should generate Lambda role with BasicExecutionRole', () => {
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

    const generator = new IAMRoleGenerator(mockResources);
    const result = generator.generateRole(roleResource);

    // Should use managed policy by name, not ARN
    expect(result).toContain('iam.ManagedPolicy.fromAwsManagedPolicyName');
    expect(result).toContain('service-role/AWSLambdaBasicExecutionRole');

    // Should have Lambda service principal
    expect(result).toContain('assumedBy: new iam.ServicePrincipal(\'lambda.amazonaws.com\')');

    // Should be valid TypeScript syntax
    expect(result).toMatch(/const \w+ = new iam\.Role/);
    expect(result).toContain('});');
  });

  it('should generate custom role with DynamoDB permissions', () => {
    const roleResource = createBaseResource('DynamoDBRole', 'AWS::IAM::Role', {
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
          PolicyName: 'DynamoDBAccess',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
                Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
              }
            ]
          }
        }
      ]
    });

    const generator = new IAMRoleGenerator(mockResources);
    const result = generator.generateRole(roleResource);

    // Should have managed policy
    expect(result).toContain('managedPolicies');
    expect(result).toContain('AWSLambdaBasicExecutionRole');

    // Should have custom policy with construct reference
    expect(result).toContain('addToPolicy');
    expect(result).toContain('myTable.tableArn');
    expect(result).toContain('dynamodb:GetItem');
    expect(result).toContain('dynamodb:PutItem');
    expect(result).toContain('dynamodb:UpdateItem');

    // Should not use CloudFormation intrinsics
    expect(result).not.toContain('Fn::GetAtt');
  });

  it('should handle multi-service roles', () => {
    const roleResource = createBaseResource('MultiServiceRole', 'AWS::IAM::Role', {
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
          PolicyName: 'DynamoDBPolicy',
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
                Action: ['s3:GetObject', 's3:PutObject'],
                Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['MyBucket', 'Arn'] }, '/*']] }
              }
            ]
          }
        }
      ]
    });

    const generator = new IAMRoleGenerator(mockResources);
    const result = generator.generateRole(roleResource);

    // Should have both DynamoDB and S3 permissions
    expect(result).toContain('myTable.tableArn');
    expect(result).toContain('myBucket.bucketArn');
    expect(result).toContain('dynamodb:*');
    expect(result).toContain('s3:GetObject');
    expect(result).toContain('s3:PutObject');

    // Should have multiple addToPolicy calls
    const policyCount = (result.match(/addToPolicy/g) || []).length;
    expect(policyCount).toBe(2);
  });

  it('should preserve resource references', () => {
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
          PolicyName: 'ResourcePolicy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: 'dynamodb:Query',
                Resource: [
                  { 'Fn::GetAtt': ['MyTable', 'Arn'] },
                  { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['MyTable', 'Arn'] }, '/index/*']] }
                ]
              }
            ]
          }
        }
      ]
    });

    const generator = new IAMRoleGenerator(mockResources);
    const result = generator.generateRole(roleResource);

    // Should preserve table ARN reference
    expect(result).toContain('myTable.tableArn');

    // Should preserve index ARN reference
    expect(result).toContain('`${myTable.tableArn}/index/*`');

    // Should not contain CloudFormation functions
    expect(result).not.toContain('Fn::GetAtt');
    expect(result).not.toContain('Fn::Join');
  });

  it('should generate compilable TypeScript', () => {
    const roleResource = createBaseResource('CompilableRole', 'AWS::IAM::Role', {
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
          PolicyName: 'TableAccess',
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

    const generator = new IAMRoleGenerator(mockResources);
    const result = generator.generateRole(roleResource);

    // Should have proper TypeScript syntax
    expect(result).toMatch(/const \w+ = new iam\.Role\(this, '\w+', \{/);
    expect(result).toContain('assumedBy:');
    expect(result).toContain('managedPolicies: [');
    expect(result).toContain('});');

    // Should have proper method calls
    expect(result).toMatch(/\w+\.addToPolicy\(new iam\.PolicyStatement\(\{/);
    expect(result).toContain('actions: [');
    expect(result).toContain('resources: [');
    expect(result).toContain('}));');

    // Should not have syntax errors
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    expect(result).not.toContain('[object Object]');

    // Should have balanced brackets
    const openBraces = (result.match(/\{/g) || []).length;
    const closeBraces = (result.match(/\}/g) || []).length;
    expect(openBraces).toBe(closeBraces);

    const openBrackets = (result.match(/\[/g) || []).length;
    const closeBrackets = (result.match(/\]/g) || []).length;
    expect(openBrackets).toBe(closeBrackets);

    const openParens = (result.match(/\(/g) || []).length;
    const closeParens = (result.match(/\)/g) || []).length;
    expect(openParens).toBe(closeParens);
  });
});
