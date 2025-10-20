# Generator Module - Usage Examples

## Basic Usage

```typescript
import { Generator, GeneratorConfig } from './modules/generator';
import { Resource } from './types';

// Create generator instance
const generator = new Generator();

// Define resources to convert
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
    }
  }
];

// Configure generation
const config: GeneratorConfig = {
  stackName: 'MyMigratedStack',
  useL2Constructs: true,
  cdkVersion: '2.100.0',
  includeComments: true
};

// Generate CDK code
const generated = await generator.generate(resources, config);

// Output files
console.log('Stack Code:', generated.stackCode);
console.log('App Code:', generated.appCode);
console.log('CDK Config:', generated.cdkConfig);
console.log('Package.json:', generated.packageJson);
```

## Generated Stack Code Example

```typescript
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * MyMigratedStack - Migrated from Serverless Framework
 *
 * This stack contains resources that were imported from an existing
 * Serverless Framework application. All resources have RemovalPolicy.RETAIN
 * to prevent accidental deletion.
 */
export class MyMigratedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AWS::DynamoDB::Table: users-table
    // IMPORTANT: This resource will be imported, not created
    const usersTable = new dynamodb.CfnTable(this, 'UsersTable', {
      tableName: 'users-table',
      billingMode: 'PAY_PER_REQUEST',
      attributeDefinitions: [
        {
          attributeName: 'id',
          attributeType: 'S'
        }
      ],
      keySchema: [
        {
          attributeName: 'id',
          keyType: 'HASH'
        }
      ],
      streamSpecification: {
        streamViewType: 'NEW_AND_OLD_IMAGES'
      }
    });
    usersTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // AWS::S3::Bucket: my-data-bucket
    // IMPORTANT: This resource will be imported, not created
    const dataBucket = new s3.CfnBucket(this, 'DataBucket', {
      bucketName: 'my-data-bucket',
      versioningConfiguration: {
        status: 'Enabled'
      },
      bucketEncryption: {
        serverSideEncryptionConfiguration: [
          {
            serverSideEncryptionByDefault: {
              sseAlgorithm: 'AES256'
            }
          }
        ]
      }
    });
    dataBucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
  }
}
```

## CloudFormation Intrinsic Functions

The generator handles all CloudFormation intrinsic functions:

### Ref

```typescript
// CloudFormation
{
  "Role": { "Ref": "MyRole" }
}

// Generated CDK
{
  role: myRole.ref
}
```

### Fn::GetAtt

```typescript
// CloudFormation
{
  "TableArn": { "Fn::GetAtt": ["UsersTable", "Arn"] }
}

// Generated CDK
{
  tableArn: usersTable.attrArn
}
```

### Fn::Sub

```typescript
// CloudFormation
{
  "Value": { "Fn::Sub": "arn:aws:s3:::${BucketName}/*" }
}

// Generated CDK
{
  value: cdk.Fn.sub('arn:aws:s3:::${BucketName}/*')
}
```

### Fn::Join

```typescript
// CloudFormation
{
  "Path": { "Fn::Join": ["/", ["api", "v1", "users"]] }
}

// Generated CDK
{
  path: ['api', 'v1', 'users'].join('/')
}
```

## Individual Construct Generation

```typescript
// Generate a single construct
const resource: Resource = {
  logicalId: 'MyLogGroup',
  type: 'AWS::Logs::LogGroup',
  properties: {
    LogGroupName: '/aws/lambda/my-function',
    RetentionInDays: 7
  }
};

const construct = await generator.generateConstruct(resource, config);

console.log(construct.code);
// Output:
//     const myLogGroup = new logs.CfnLogGroup(this, 'MyLogGroup', {
//       logGroupName: '/aws/lambda/my-function',
//       retentionInDays: 7
//     });
//     myLogGroup.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
```

## Property Conversion

```typescript
// Convert properties independently
const properties = {
  TableName: 'users',
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  }
};

const converted = generator.convertProperties(
  properties,
  'AWS::DynamoDB::Table'
);

console.log(converted);
// Output:
//       tableName: 'users',
//       billingMode: 'PAY_PER_REQUEST',
//       streamSpecification: {
//         streamViewType: 'NEW_AND_OLD_IMAGES'
//       }
```

## Import Statement Generation

```typescript
const resources: Resource[] = [
  { type: 'AWS::DynamoDB::Table', ... },
  { type: 'AWS::S3::Bucket', ... },
  { type: 'AWS::Lambda::Function', ... }
];

const imports = generator.generateImports(resources);

console.log(imports);
// Output:
// [
//   "import * as cdk from 'aws-cdk-lib';",
//   "import { Construct } from 'constructs';",
//   "import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';",
//   "import * as lambda from 'aws-cdk-lib/aws-lambda';",
//   "import * as s3 from 'aws-cdk-lib/aws-s3';"
// ]
```

## Supported Resource Types

- `AWS::DynamoDB::Table` (L1: CfnTable, L2: Table)
- `AWS::S3::Bucket` (L1: CfnBucket, L2: Bucket)
- `AWS::Logs::LogGroup` (L1: CfnLogGroup, L2: LogGroup)
- `AWS::Lambda::Function` (L1: CfnFunction, L2: Function)
- `AWS::IAM::Role` (L1: CfnRole, L2: Role)

## Error Handling

```typescript
try {
  const generated = await generator.generate(resources, config);
} catch (error) {
  if (error instanceof GeneratorError) {
    console.error('Generator error:', error.code, error.message);
    console.error('Details:', error.details);
  }
}
```

## Generated File Structure

```
cdk-project/
├── bin/
│   └── app.ts              # CDK app entry point
├── lib/
│   └── my-migrated-stack.ts # Stack definition
├── cdk.json                # CDK configuration
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```
