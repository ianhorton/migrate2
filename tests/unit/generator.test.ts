/**
 * Generator Module Tests
 * Tests CDK code generation from CloudFormation templates
 */

import { GeneratorModule } from '@/modules/generator';

describe('GeneratorModule', () => {
  let generator: GeneratorModule;

  beforeEach(() => {
    generator = new GeneratorModule();
  });

  describe('generateCDKStack', () => {
    it('should generate TypeScript CDK stack', () => {
      const resources = [
        {
          logicalId: 'MyTable',
          type: 'AWS::DynamoDB::Table',
          properties: {
            TableName: 'test-table',
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST'
          }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: true,
        preserveLogicalIds: true
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result).toHaveProperty('mainFile');
      expect(result).toHaveProperty('imports');
      expect(result).toHaveProperty('constructs');
      expect(result.mainFile).toContain('export class TestStack');
      expect(result.mainFile).toContain('import * as cdk');
    });

    it('should include all required imports', () => {
      const resources = [
        {
          logicalId: 'MyTable',
          type: 'AWS::DynamoDB::Table',
          properties: { TableName: 'test-table' }
        },
        {
          logicalId: 'MyBucket',
          type: 'AWS::S3::Bucket',
          properties: { BucketName: 'test-bucket' }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: false,
        preserveLogicalIds: false
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result.imports).toContain('import * as dynamodb from \'aws-cdk-lib/aws-dynamodb\';');
      expect(result.imports).toContain('import * as s3 from \'aws-cdk-lib/aws-s3\';');
    });

    it('should use L2 constructs when configured', () => {
      const resources = [
        {
          logicalId: 'MyTable',
          type: 'AWS::DynamoDB::Table',
          properties: {
            TableName: 'test-table',
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST'
          }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: false,
        preserveLogicalIds: false
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result.mainFile).toContain('new dynamodb.Table(');
      expect(result.mainFile).toContain('partitionKey:');
    });

    it('should use L1 (CloudFormation) constructs when configured', () => {
      const resources = [
        {
          logicalId: 'MyTable',
          type: 'AWS::DynamoDB::Table',
          properties: {
            TableName: 'test-table',
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }]
          }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: false,
        includeComments: false,
        preserveLogicalIds: false
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result.mainFile).toContain('new dynamodb.CfnTable(');
      expect(result.mainFile).toContain('keySchema:');
    });

    it('should include comments when configured', () => {
      const resources = [
        {
          logicalId: 'MyTable',
          type: 'AWS::DynamoDB::Table',
          properties: { TableName: 'test-table' }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: true,
        preserveLogicalIds: false
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result.mainFile).toContain('//');
    });
  });

  describe('generateConstruct - DynamoDB', () => {
    it('should generate DynamoDB Table construct', () => {
      const resource = {
        logicalId: 'CounterTable',
        type: 'AWS::DynamoDB::Table',
        properties: {
          TableName: 'counter-table',
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          BillingMode: 'PAY_PER_REQUEST',
          StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' }
        }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('new dynamodb.Table');
      expect(code).toContain('tableName: \'counter-table\'');
      expect(code).toContain('partitionKey:');
      expect(code).toContain('billingMode: dynamodb.BillingMode.PAY_PER_REQUEST');
      expect(code).toContain('stream:');
    });

    it('should handle composite keys (hash + sort)', () => {
      const resource = {
        logicalId: 'MyTable',
        type: 'AWS::DynamoDB::Table',
        properties: {
          TableName: 'my-table',
          AttributeDefinitions: [
            { AttributeName: 'pk', AttributeType: 'S' },
            { AttributeName: 'sk', AttributeType: 'S' }
          ],
          KeySchema: [
            { AttributeName: 'pk', KeyType: 'HASH' },
            { AttributeName: 'sk', KeyType: 'RANGE' }
          ],
          BillingMode: 'PAY_PER_REQUEST'
        }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('partitionKey:');
      expect(code).toContain('sortKey:');
      expect(code).toContain('pk');
      expect(code).toContain('sk');
    });

    it('should add retention policy', () => {
      const resource = {
        logicalId: 'MyTable',
        type: 'AWS::DynamoDB::Table',
        properties: { TableName: 'my-table' }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('removalPolicy: cdk.RemovalPolicy.RETAIN');
    });
  });

  describe('generateConstruct - S3', () => {
    it('should generate S3 Bucket construct', () => {
      const resource = {
        logicalId: 'DataBucket',
        type: 'AWS::S3::Bucket',
        properties: {
          BucketName: 'data-bucket',
          VersioningConfiguration: { Status: 'Enabled' },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true
          }
        }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('new s3.Bucket');
      expect(code).toContain('bucketName: \'data-bucket\'');
      expect(code).toContain('versioned: true');
      expect(code).toContain('blockPublicAccess:');
    });
  });

  describe('generateConstruct - CloudWatch Logs', () => {
    it('should generate LogGroup construct', () => {
      const resource = {
        logicalId: 'MyLogGroup',
        type: 'AWS::Logs::LogGroup',
        properties: {
          LogGroupName: '/aws/lambda/my-function',
          RetentionInDays: 7
        }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('new logs.LogGroup');
      expect(code).toContain('logGroupName: \'/aws/lambda/my-function\'');
      expect(code).toContain('retention: logs.RetentionDays.ONE_WEEK');
    });

    it('should handle different retention periods', () => {
      const testCases = [
        { days: 1, expected: 'ONE_DAY' },
        { days: 7, expected: 'ONE_WEEK' },
        { days: 30, expected: 'ONE_MONTH' },
        { days: 365, expected: 'ONE_YEAR' }
      ];

      for (const { days, expected } of testCases) {
        const resource = {
          logicalId: 'MyLogGroup',
          type: 'AWS::Logs::LogGroup',
          properties: {
            LogGroupName: '/test',
            RetentionInDays: days
          }
        };

        const code = generator.generateConstruct(resource, 'typescript');
        expect(code).toContain(expected);
      }
    });
  });

  describe('generateConstruct - Lambda', () => {
    it('should generate Lambda Function construct', () => {
      const resource = {
        logicalId: 'MyFunction',
        type: 'AWS::Lambda::Function',
        properties: {
          FunctionName: 'my-function',
          Runtime: 'nodejs18.x',
          Handler: 'index.handler',
          Code: { S3Bucket: 'code-bucket', S3Key: 'function.zip' },
          MemorySize: 1024,
          Timeout: 30,
          Environment: {
            Variables: {
              TABLE_NAME: 'my-table'
            }
          }
        }
      };

      const code = generator.generateConstruct(resource, 'typescript');

      expect(code).toContain('new lambda.Function');
      expect(code).toContain('functionName: \'my-function\'');
      expect(code).toContain('runtime: lambda.Runtime.NODEJS_18_X');
      expect(code).toContain('handler: \'index.handler\'');
      expect(code).toContain('memorySize: 1024');
      expect(code).toContain('timeout: cdk.Duration.seconds(30)');
    });
  });

  describe('convertProperties', () => {
    it('should convert CloudFormation properties to CDK', () => {
      const cfProperties = {
        TableName: 'my-table',
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }]
      };

      const cdkProperties = generator.convertProperties(
        cfProperties,
        'AWS::DynamoDB::Table',
        'typescript'
      );

      expect(cdkProperties).toContain('tableName:');
      expect(cdkProperties).toContain('billingMode:');
    });

    it('should handle intrinsic functions', () => {
      const cfProperties = {
        TableName: { Ref: 'TableNameParameter' },
        BillingMode: { 'Fn::Sub': '${BillingModeParam}' }
      };

      const cdkProperties = generator.convertProperties(
        cfProperties,
        'AWS::DynamoDB::Table',
        'typescript'
      );

      expect(cdkProperties).toContain('cdk.Fn.ref');
      expect(cdkProperties).toContain('cdk.Fn.sub');
    });
  });

  describe('generateImports', () => {
    it('should generate import statements for resources', () => {
      const resources = [
        { type: 'AWS::DynamoDB::Table' },
        { type: 'AWS::S3::Bucket' },
        { type: 'AWS::Logs::LogGroup' }
      ];

      const imports = generator.generateImports(resources, 'typescript');

      expect(imports).toContain('import * as dynamodb');
      expect(imports).toContain('import * as s3');
      expect(imports).toContain('import * as logs');
    });

    it('should not duplicate imports', () => {
      const resources = [
        { type: 'AWS::DynamoDB::Table' },
        { type: 'AWS::DynamoDB::Table' }
      ];

      const imports = generator.generateImports(resources, 'typescript');

      const matches = imports.match(/import \* as dynamodb/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('Integration - Full Stack Generation', () => {
    it('should generate complete stack file', () => {
      const resources = [
        {
          logicalId: 'CounterTable',
          type: 'AWS::DynamoDB::Table',
          properties: {
            TableName: 'counter-table',
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST'
          }
        },
        {
          logicalId: 'CounterLogGroup',
          type: 'AWS::Logs::LogGroup',
          properties: {
            LogGroupName: '/aws/lambda/counter',
            RetentionInDays: 7
          }
        },
        {
          logicalId: 'DataBucket',
          type: 'AWS::S3::Bucket',
          properties: {
            BucketName: 'data-bucket',
            VersioningConfiguration: { Status: 'Enabled' }
          }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'MigrationStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: true,
        preserveLogicalIds: true
      };

      const result = generator.generateCDKStack(resources, config);

      // Should have complete stack structure
      expect(result.mainFile).toContain('export class MigrationStack extends cdk.Stack');
      expect(result.mainFile).toContain('constructor(scope: Construct');

      // Should have all resources
      expect(result.mainFile).toContain('CounterTable');
      expect(result.mainFile).toContain('CounterLogGroup');
      expect(result.mainFile).toContain('DataBucket');

      // Should be valid TypeScript (basic check)
      expect(result.mainFile).toContain('import');
      expect(result.mainFile).toContain('}');

      // Should have all necessary imports
      expect(result.imports).toContain('dynamodb');
      expect(result.imports).toContain('logs');
      expect(result.imports).toContain('s3');
    });

    it('should preserve logical IDs when configured', () => {
      const resources = [
        {
          logicalId: 'MySpecificTableName',
          type: 'AWS::DynamoDB::Table',
          properties: { TableName: 'test' }
        }
      ];

      const config = {
        language: 'typescript' as const,
        stackName: 'TestStack',
        cdkVersion: '2.0.0',
        useL2Constructs: true,
        includeComments: false,
        preserveLogicalIds: true
      };

      const result = generator.generateCDKStack(resources, config);

      expect(result.mainFile).toContain('MySpecificTableName');
    });
  });
});
