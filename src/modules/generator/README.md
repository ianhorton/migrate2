# Generator Module

The Generator Module converts CloudFormation resources to CDK TypeScript code.

## Features

- **L1 Construct Generation**: Generates low-level CloudFormation constructs
- **Property Conversion**: Converts CloudFormation properties to CDK format
- **Intrinsic Function Support**: Handles Ref, GetAtt, Sub, Join, Select
- **Import Generation**: Automatically generates required import statements
- **Stack Structure**: Creates complete CDK stack files
- **Project Files**: Generates app.ts, cdk.json, and package.json

## Usage

```typescript
import { Generator, GeneratorConfig } from './modules/generator';

const generator = new Generator();

const config: GeneratorConfig = {
  stackName: 'MyMigratedStack',
  useL2Constructs: true,
  cdkVersion: '2.100.0'
};

const code = await generator.generate(resources, config);

console.log(code.stackCode);
console.log(code.appCode);
console.log(code.cdkConfig);
console.log(code.packageJson);
```

## Supported Resource Types

- AWS::DynamoDB::Table
- AWS::S3::Bucket
- AWS::Logs::LogGroup
- AWS::Lambda::Function
- AWS::IAM::Role

## Generated Files

### Stack File (lib/my-migrated-stack.ts)
Contains all CDK construct definitions with RemovalPolicy.RETAIN.

### App File (bin/app.ts)
Entry point for CDK application.

### CDK Config (cdk.json)
CDK configuration with feature flags.

### Package.json
Dependencies and scripts for the CDK project.

## Property Conversion

CloudFormation properties are converted to camelCase:
- `TableName` → `tableName`
- `BucketName` → `bucketName`
- `LogGroupName` → `logGroupName`

## Intrinsic Functions

Supported intrinsic functions:
- `{ Ref: "ResourceId" }` → `resourceId.ref`
- `{ "Fn::GetAtt": ["Resource", "Attr"] }` → `resource.attrAttr`
- `{ "Fn::Sub": "template" }` → `cdk.Fn.sub('template')`
- `{ "Fn::Join": [",", [...]] }` → `[...].join(',')`

## RemovalPolicy

All generated constructs include:
```typescript
resource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
```

This prevents accidental deletion of imported resources.
