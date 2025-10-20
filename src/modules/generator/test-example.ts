/**
 * Quick test example for Generator Module
 * This demonstrates how the generator works
 */

import { Generator, GeneratorConfig } from './index';
import { Resource } from '../../types';

// Example: Generate CDK code from CloudFormation resources
async function testGenerator() {
  const generator = new Generator();

  // Sample resources
  const resources: Resource[] = [
    {
      logicalId: 'UsersTable',
      type: 'AWS::DynamoDB::Table',
      properties: {
        TableName: 'users-table',
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' }
        ],
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES'
        }
      },
      metadata: {
        classification: 'IMPORT',
        isStateful: true
      }
    },
    {
      logicalId: 'DataBucket',
      type: 'AWS::S3::Bucket',
      properties: {
        BucketName: 'my-data-bucket',
        VersioningConfiguration: {
          Status: 'Enabled'
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [{
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256'
            }
          }]
        }
      },
      metadata: {
        classification: 'IMPORT',
        isStateful: true
      }
    },
    {
      logicalId: 'MyLogGroup',
      type: 'AWS::Logs::LogGroup',
      properties: {
        LogGroupName: '/aws/lambda/my-function',
        RetentionInDays: 7
      },
      metadata: {
        classification: 'IMPORT',
        isStateful: true
      }
    }
  ];

  // Configuration
  const config: GeneratorConfig = {
    stackName: 'MyMigratedStack',
    useL2Constructs: true,
    cdkVersion: '2.100.0',
    includeComments: true
  };

  // Generate code
  const generated = await generator.generate(resources, config);

  console.log('=== GENERATED STACK CODE ===');
  console.log(generated.stackCode);
  console.log('\n=== GENERATED APP CODE ===');
  console.log(generated.appCode);
  console.log('\n=== IMPORTS ===');
  console.log(generated.imports.join('\n'));
  console.log('\n=== CONSTRUCTS ===');
  generated.constructs.forEach((construct) => {
    console.log(`\n${construct.name} (${construct.resourceType}):`);
    console.log(construct.code);
  });
}

// Run if executed directly
if (require.main === module) {
  testGenerator().catch(console.error);
}

export { testGenerator };
