# CDK Construct Mappings and Code Generation Patterns

## Complete CloudFormation to CDK Mapping Reference

### DynamoDB Table

**CloudFormation → CDK L1:**
```typescript
// CloudFormation
{
  "Type": "AWS::DynamoDB::Table",
  "Properties": {
    "TableName": "users-table",
    "BillingMode": "PAY_PER_REQUEST",
    "AttributeDefinitions": [
      { "AttributeName": "id", "AttributeType": "S" },
      { "AttributeName": "gsi1pk", "AttributeType": "S" }
    ],
    "KeySchema": [
      { "AttributeName": "id", "KeyType": "HASH" }
    ],
    "GlobalSecondaryIndexes": [{
      "IndexName": "gsi1",
      "KeySchema": [{ "AttributeName": "gsi1pk", "KeyType": "HASH" }],
      "Projection": { "ProjectionType": "ALL" }
    }],
    "StreamSpecification": {
      "StreamViewType": "NEW_AND_OLD_IMAGES"
    },
    "PointInTimeRecoverySpecification": {
      "PointInTimeRecoveryEnabled": true
    }
  }
}

// CDK L1
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

const table = new dynamodb.CfnTable(this, 'UsersTable', {
  tableName: 'users-table',
  billingMode: 'PAY_PER_REQUEST',
  attributeDefinitions: [
    { attributeName: 'id', attributeType: 'S' },
    { attributeName: 'gsi1pk', attributeType: 'S' }
  ],
  keySchema: [
    { attributeName: 'id', keyType: 'HASH' }
  ],
  globalSecondaryIndexes: [{
    indexName: 'gsi1',
    keySchema: [{ attributeName: 'gsi1pk', keyType: 'HASH' }],
    projection: { projectionType: 'ALL' }
  }],
  streamSpecification: {
    streamViewType: 'NEW_AND_OLD_IMAGES'
  },
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: true
  }
});

table.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

**Property Mapping:**
- `TableName` → `tableName`
- `BillingMode` → `billingMode`
- `AttributeDefinitions` → `attributeDefinitions`
- `KeySchema` → `keySchema`
- `GlobalSecondaryIndexes` → `globalSecondaryIndexes`
- `StreamSpecification` → `streamSpecification`

### S3 Bucket

**CloudFormation → CDK L1:**
```typescript
// CloudFormation
{
  "Type": "AWS::S3::Bucket",
  "Properties": {
    "BucketName": "my-bucket",
    "VersioningConfiguration": {
      "Status": "Enabled"
    },
    "BucketEncryption": {
      "ServerSideEncryptionConfiguration": [{
        "ServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }]
    },
    "PublicAccessBlockConfiguration": {
      "BlockPublicAcls": true,
      "BlockPublicPolicy": true,
      "IgnorePublicAcls": true,
      "RestrictPublicBuckets": true
    },
    "LifecycleConfiguration": {
      "Rules": [{
        "Id": "DeleteOldVersions",
        "Status": "Enabled",
        "NoncurrentVersionExpirationInDays": 30
      }]
    }
  }
}

// CDK L1
import * as s3 from 'aws-cdk-lib/aws-s3';

const bucket = new s3.CfnBucket(this, 'MyBucket', {
  bucketName: 'my-bucket',
  versioningConfiguration: {
    status: 'Enabled'
  },
  bucketEncryption: {
    serverSideEncryptionConfiguration: [{
      serverSideEncryptionByDefault: {
        sseAlgorithm: 'AES256'
      }
    }]
  },
  publicAccessBlockConfiguration: {
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true
  },
  lifecycleConfiguration: {
    rules: [{
      id: 'DeleteOldVersions',
      status: 'Enabled',
      noncurrentVersionExpirationInDays: 30
    }]
  }
});

bucket.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

### CloudWatch LogGroup

**CloudFormation → CDK L1:**
```typescript
// CloudFormation
{
  "Type": "AWS::Logs::LogGroup",
  "Properties": {
    "LogGroupName": "/aws/lambda/my-function",
    "RetentionInDays": 7,
    "KmsKeyId": "arn:aws:kms:us-east-1:123456789:key/abc-123"
  }
}

// CDK L1
import * as logs from 'aws-cdk-lib/aws-logs';

const logGroup = new logs.CfnLogGroup(this, 'MyLogGroup', {
  logGroupName: '/aws/lambda/my-function',
  retentionInDays: 7,
  kmsKeyId: 'arn:aws:kms:us-east-1:123456789:key/abc-123'
});

logGroup.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

### Lambda Function

**CloudFormation → CDK L1:**
```typescript
// CloudFormation
{
  "Type": "AWS::Lambda::Function",
  "Properties": {
    "FunctionName": "my-function",
    "Runtime": "nodejs18.x",
    "Handler": "index.handler",
    "Role": { "Fn::GetAtt": ["MyRole", "Arn"] },
    "Code": {
      "S3Bucket": "deployment-bucket",
      "S3Key": "function.zip"
    },
    "MemorySize": 256,
    "Timeout": 30,
    "Environment": {
      "Variables": {
        "TABLE_NAME": "my-table"
      }
    },
    "TracingConfig": {
      "Mode": "Active"
    },
    "ReservedConcurrentExecutions": 5
  }
}

// CDK L1
import * as lambda from 'aws-cdk-lib/aws-lambda';

const fn = new lambda.CfnFunction(this, 'MyFunction', {
  functionName: 'my-function',
  runtime: 'nodejs18.x',
  handler: 'index.handler',
  role: myRole.attrArn,
  code: {
    s3Bucket: 'deployment-bucket',
    s3Key: 'function.zip'
  },
  memorySize: 256,
  timeout: 30,
  environment: {
    variables: {
      TABLE_NAME: 'my-table'
    }
  },
  tracingConfig: {
    mode: 'Active'
  },
  reservedConcurrentExecutions: 5
});
```

### IAM Role

**CloudFormation → CDK L1:**
```typescript
// CloudFormation
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "RoleName": "my-lambda-role",
    "AssumeRolePolicyDocument": {
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }]
    },
    "ManagedPolicyArns": [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    ],
    "Policies": [{
      "PolicyName": "DynamoDBAccess",
      "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Action": [
            "dynamodb:PutItem",
            "dynamodb:GetItem"
          ],
          "Resource": "arn:aws:dynamodb:us-east-1:123:table/my-table"
        }]
      }
    }]
  }
}

// CDK L1
import * as iam from 'aws-cdk-lib/aws-iam';

const role = new iam.CfnRole(this, 'MyLambdaRole', {
  roleName: 'my-lambda-role',
  assumeRolePolicyDocument: {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: {
        Service: 'lambda.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }]
  },
  managedPolicyArns: [
    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
  ],
  policies: [{
    policyName: 'DynamoDBAccess',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: [
          'dynamodb:PutItem',
          'dynamodb:GetItem'
        ],
        Resource: 'arn:aws:dynamodb:us-east-1:123:table/my-table'
      }]
    }
  }]
});
```

## Code Generation Templates

### Stack Template

```typescript
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
{{IMPORTS}}

export class {{STACK_NAME}} extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

{{CONSTRUCTS}}
  }
}
```

### App Template

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { {{STACK_NAME}} } from '../lib/{{STACK_FILE}}';

const app = new cdk.App();

new {{STACK_NAME}}(app, '{{STACK_ID}}', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
```

### Import Generation

```typescript
function generateImports(resourceTypes: Set<string>): string {
  const imports = new Set<string>();

  for (const resourceType of resourceTypes) {
    const mapping = resourceTypeToModule[resourceType];
    if (mapping) {
      imports.add(`import * as ${mapping.module} from 'aws-cdk-lib/${mapping.path}';`);
    }
  }

  return Array.from(imports).sort().join('\n');
}

const resourceTypeToModule = {
  'AWS::DynamoDB::Table': { module: 'dynamodb', path: 'aws-dynamodb' },
  'AWS::S3::Bucket': { module: 's3', path: 'aws-s3' },
  'AWS::Logs::LogGroup': { module: 'logs', path: 'aws-logs' },
  'AWS::Lambda::Function': { module: 'lambda', path: 'aws-lambda' },
  'AWS::IAM::Role': { module: 'iam', path: 'aws-iam' },
  // ... more mappings
};
```

### Construct Generation

```typescript
function generateConstruct(resource: Resource): string {
  const constructClass = getConstructClass(resource.Type);
  const properties = convertProperties(resource.Properties, resource.Type);

  return `
    // ${resource.Type}: ${resource.Properties[getPhysicalIdProperty(resource.Type)]}
    const ${toCamelCase(resource.logicalId)} = new ${constructClass}(this, '${resource.logicalId}', {
${properties}
    });
    ${toCamelCase(resource.logicalId)}.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
  `.trim();
}
```

## Property Conversion Rules

### Primitive Types
```typescript
function convertPrimitive(value: any): string {
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  return 'undefined';
}
```

### Arrays
```typescript
function convertArray(arr: any[]): string {
  const items = arr.map(item => convertValue(item));
  return `[${items.join(', ')}]`;
}
```

### Objects
```typescript
function convertObject(obj: any, indent: number = 4): string {
  const spaces = ' '.repeat(indent);
  const entries = Object.entries(obj).map(([key, value]) => {
    return `${spaces}${key}: ${convertValue(value, indent + 2)}`;
  });
  return `{\n${entries.join(',\n')}\n${' '.repeat(indent - 2)}}`;
}
```

### CloudFormation Intrinsic Functions
```typescript
function convertIntrinsic(value: any): string {
  if (value.Ref) {
    return `${toCamelCase(value.Ref)}.ref`;
  }

  if (value['Fn::GetAtt']) {
    const [resource, attribute] = value['Fn::GetAtt'];
    return `${toCamelCase(resource)}.attr${attribute}`;
  }

  if (value['Fn::Sub']) {
    // Handle variable substitution
    return convertSub(value['Fn::Sub']);
  }

  if (value['Fn::Join']) {
    const [delimiter, parts] = value['Fn::Join'];
    return `[${parts.map(p => convertValue(p)).join(', ')}].join('${delimiter}')`;
  }

  return JSON.stringify(value);
}
```
