# Serverless Framework to AWS CDK Migration Tool - Technical Specification

## Table of Contents

1. [Purpose & Scope](#purpose--scope)
2. [Functional Requirements](#functional-requirements)
3. [Migration Architecture](#migration-architecture)
4. [Migration Steps](#migration-steps)
5. [Resource Handling](#resource-handling)
6. [Code Generation Rules](#code-generation-rules)
7. [Validation & Safety](#validation--safety)
8. [Success Criteria](#success-criteria)
9. [Known Limitations](#known-limitations)

---

## Purpose & Scope

### What This Tool Does

The Serverless-to-CDK Migration Tool automates the process of migrating AWS infrastructure from the Serverless Framework to AWS Cloud Development Kit (CDK). It analyzes existing Serverless applications, generates equivalent CDK code, and safely imports stateful resources without data loss or service interruption.

### Why This Tool Exists

**Problem Statement:**
- Organizations need to migrate from Serverless Framework to CDK for better infrastructure control
- Manual migration is error-prone and risks data loss in stateful resources (databases, S3 buckets)
- Direct re-deployment would destroy and recreate resources, losing all data

**Solution:**
- Automated resource discovery and classification
- Safe resource import using CDK's import capabilities
- Template comparison to ensure parity before migration
- Dry-run mode for risk-free testing

### Key Features

- **Zero-downtime migration** for stateful resources
- **Automated resource discovery** including Serverless-abstracted resources
- **L2 construct generation** with proper property transformations
- **Template comparison** with blocking issue detection
- **State machine orchestration** with rollback support
- **Dry-run mode** for safe testing

---

## Functional Requirements

### FR-1: Resource Discovery

**Description:** The tool must discover ALL resources defined in a Serverless application, including both explicitly defined and framework-abstracted resources.

**Requirements:**
- FR-1.1: Parse `serverless.yml` configuration
- FR-1.2: Generate CloudFormation template using Serverless Framework
- FR-1.3: Discover all resources in generated template
- FR-1.4: Identify resource dependencies
- FR-1.5: Extract physical resource IDs from AWS

**Acceptance Criteria:**
```yaml
Given: A Serverless application with 10 Lambda functions and 3 DynamoDB tables
When: Resource discovery is executed
Then:
  - All 10 Lambda functions are discovered
  - All 3 DynamoDB tables are discovered
  - IAM roles, log groups, and API Gateway resources are discovered
  - Physical IDs are retrieved from AWS
```

### FR-2: Resource Classification

**Description:** Resources must be classified as stateful (import) or stateless (recreate) to determine migration strategy.

**Requirements:**
- FR-2.1: Classify resources by type
- FR-2.2: Mark stateful resources for import
- FR-2.3: Mark stateless resources for recreation
- FR-2.4: Build dependency graph

**Stateful Resource Types:**
```typescript
STATEFUL_RESOURCE_TYPES = [
  'AWS::DynamoDB::Table',
  'AWS::S3::Bucket',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::Logs::LogGroup',
  'AWS::ECS::Cluster',
  'AWS::EFS::FileSystem',
  'AWS::ElastiCache::CacheCluster',
  'AWS::ElastiCache::ReplicationGroup',
]
```

**Stateless Resource Types:**
```typescript
STATELESS_RESOURCE_TYPES = [
  'AWS::Lambda::Function',
  'AWS::Lambda::Version',
  'AWS::Lambda::Permission',
  'AWS::IAM::Role',
  'AWS::IAM::Policy',
  'AWS::ApiGateway::RestApi',
  'AWS::ApiGateway::Deployment',
  'AWS::ApiGateway::Stage',
  'AWS::ApiGatewayV2::Api',
  'AWS::ApiGatewayV2::Stage',
  'AWS::CloudWatch::Alarm',
  'AWS::Events::Rule',
  'AWS::SNS::Topic',
  'AWS::SQS::Queue',
]
```

### FR-3: CDK Code Generation

**Description:** Generate production-ready CDK TypeScript code from CloudFormation resources.

**Requirements:**
- FR-3.1: Use L2 constructs where available
- FR-3.2: Preserve logical IDs for resource import
- FR-3.3: Transform CloudFormation properties to CDK format
- FR-3.4: Apply RemovalPolicy.RETAIN to all resources
- FR-3.5: Generate proper import statements
- FR-3.6: Handle cross-resource references
- FR-3.7: Support CloudFormation intrinsic functions

**Example Output:**
```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class MigratedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AWS::DynamoDB::Table: my-table-dev
    // IMPORTANT: This resource will be imported, not created
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'my-app-users-dev',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });
    usersTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    (usersTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('UsersTable');
  }
}
```

### FR-4: Template Comparison

**Description:** Compare Serverless-generated and CDK-generated CloudFormation templates to ensure parity.

**Requirements:**
- FR-4.1: Match resources by logical ID
- FR-4.2: Compare resource properties
- FR-4.3: Classify differences by severity (MATCH, ACCEPTABLE, WARNING, CRITICAL)
- FR-4.4: Identify blocking issues
- FR-4.5: Generate comparison reports (JSON and HTML)

**Comparison Statuses:**
- **MATCH**: Properties are identical
- **ACCEPTABLE**: Differences are CDK-specific or safe (e.g., DeletionPolicy)
- **WARNING**: Differences may cause issues but won't block import
- **CRITICAL**: Differences will cause import failure

**Example Report:**
```json
{
  "summary": {
    "matched": 15,
    "status": {
      "MATCH": 10,
      "ACCEPTABLE": 3,
      "WARNING": 2,
      "CRITICAL": 0
    },
    "unmatched_sls": 2,
    "unmatched_cdk": 1
  },
  "ready_for_import": true,
  "blocking_issues": []
}
```

### FR-5: Resource Import

**Description:** Import existing AWS resources into CDK stack without recreating them.

**Requirements:**
- FR-5.1: Create import mapping file
- FR-5.2: Support interactive import mode
- FR-5.3: Support automatic import mode with `--auto-approve`
- FR-5.4: Verify imported resources in CloudFormation
- FR-5.5: Handle import errors gracefully

### FR-6: Migration Verification

**Description:** Verify migration was successful and resources are healthy.

**Requirements:**
- FR-6.1: Check CloudFormation stack health
- FR-6.2: Detect stack drift
- FR-6.3: Verify all resources exist
- FR-6.4: Run smoke tests
- FR-6.5: Report any issues found

### FR-7: Dry-Run Mode

**Description:** Allow users to test migration without making any AWS changes.

**Requirements:**
- FR-7.1: Generate all code and templates
- FR-7.2: Synthesize CDK stack
- FR-7.3: Run comparison
- FR-7.4: Skip actual deployment/import
- FR-7.5: Provide clear indication of dry-run status

---

## Migration Architecture

### State Machine

The migration process follows a linear state machine with 9 sequential steps:

```typescript
enum MigrationStep {
  INITIAL_SCAN           // Parse serverless.yml, generate CloudFormation
  DISCOVERY              // Discover all resources (explicit + abstracted)
  CLASSIFICATION         // Classify stateful vs stateless
  TEMPLATE_MODIFICATION  // Remove Serverless stack (if needed)
  CDK_GENERATION         // Generate CDK code
  COMPARISON             // Compare templates
  IMPORT_PREPARATION     // Prepare resource import
  VERIFICATION           // Verify migration success
  COMPLETE               // Migration complete
}
```

**State Transitions:**
- Steps must execute sequentially (no skipping)
- Each step validates prerequisites before execution
- Completed steps can be resumed
- Rollback support for critical steps

### Orchestrator Pattern

```typescript
class MigrationOrchestrator {
  - StateManager: Persists migration state
  - StepExecutorFactory: Creates step executors
  - MigrationStateMachine: Validates transitions

  + startMigration(config): Begins new migration
  + resumeMigration(stateId): Resumes from saved state
  + rollback(stateId, targetStep): Rolls back to previous step
  + getProgress(stateId): Returns current progress
}
```

### Step Executor Pattern

Each step implements `BaseStepExecutor`:

```typescript
abstract class BaseStepExecutor {
  abstract validatePrerequisites(state): boolean
  abstract executeStep(state): Promise<StepResult>
  abstract executeRollback(state): Promise<void>
  abstract runValidationChecks(state): ValidationCheck[]
}
```

---

## Migration Steps

### Step 1: INITIAL_SCAN

**Purpose:** Parse Serverless configuration and generate CloudFormation template.

**Implementation:** `ScanExecutor`

**Actions:**
1. Validate `serverless.yml` exists
2. Parse Serverless configuration
3. Run `serverless package` to generate CloudFormation
4. Save template to `.serverless/cloudformation-template-scan.json`
5. Discover all resources in template
6. Calculate resource counts

**Prerequisites:**
- Serverless Framework installed
- Valid `serverless.yml` in source directory
- AWS credentials configured

**Output:**
```typescript
{
  serverlessConfig: ParsedServerlessConfig,
  cloudFormationTemplate: CloudFormationTemplate,
  inventory: ResourceInventory,
  resourceCount: {
    total: number,
    explicit: number,
    abstracted: number,
    stateful: number,
    stateless: number
  }
}
```

**Validation Checks:**
- ✓ Serverless config exists
- ✓ CloudFormation template generated
- ✓ Resources discovered
- ✓ Stateful resources identified
- ⚠ AWS credentials available

### Step 2: DISCOVERY

**Purpose:** Discover all resources including framework-abstracted ones.

**Implementation:** Resources are discovered during INITIAL_SCAN, this is a passthrough step.

**Classification:**
- **Explicit resources:** Defined in `serverless.yml` under `resources.Resources`
- **Abstracted resources:** Generated by Serverless Framework (Lambda, IAM roles, API Gateway)

### Step 3: CLASSIFICATION

**Purpose:** Classify resources as stateful (import) or stateless (recreate).

**Implementation:** `ClassifyExecutor`

**Actions:**
1. Read inventory from INITIAL_SCAN
2. Mark stateful resources (DynamoDB, S3, RDS, etc.)
3. Mark stateless resources (Lambda, IAM, API Gateway)
4. Log classification summary

**Output:**
```typescript
{
  inventory: ResourceInventory,
  classification: {
    stateful: Resource[],
    stateless: Resource[],
    explicit: Resource[],
    abstracted: Resource[]
  }
}
```

### Step 4: TEMPLATE_MODIFICATION

**Purpose:** Remove the existing Serverless stack if needed.

**Implementation:** `RemoveExecutor`

**Actions:**
1. Check if Serverless stack exists in AWS
2. Optionally remove stack (if `--remove-serverless` flag)
3. Preserve stateful resources using DeletionPolicy: Retain

**Safety:**
- Only removes if explicitly requested
- Always sets DeletionPolicy: Retain on stateful resources
- Dry-run mode skips actual removal

### Step 5: CDK_GENERATION

**Purpose:** Generate CDK TypeScript code from CloudFormation template.

**Implementation:** `GenerateExecutor`

**Actions:**
1. Initialize CDK project (`cdk init`)
2. Generate CDK constructs using TypeScriptGenerator
3. Write stack file to `lib/<stack-name>-stack.ts`
4. Install dependencies (`npm install`)
5. Synthesize CDK stack (`cdk synth`)
6. Save synthesized template to `cdk.out`

**Stack Naming:**
- Derives stack name from target directory
- Example: `foo-test` → `FooTestStack`

**Output:**
```typescript
{
  cdkCode: GeneratedCode,
  projectPath: string,
  synthesized: boolean,
  templatePath: string
}
```

**Validation Checks:**
- ✓ CDK project initialized
- ✓ CDK code generated
- ✓ CDK synthesis successful
- ✓ Synthesized template valid

### Step 6: COMPARISON

**Purpose:** Compare Serverless and CDK CloudFormation templates.

**Implementation:** `CompareExecutor`

**Actions:**
1. Load Serverless template from `.serverless/cloudformation-template-update-stack.json`
2. Load CDK template from `cdk.out/<stack>.template.json`
3. Match resources by logical ID
4. Compare properties for each resource
5. Generate comparison report (HTML + JSON)
6. Identify blocking issues

**Comparison Logic:**
```typescript
// Match resources by logical ID
matches = matchResources(slsTemplate, cdkTemplate)

// Compare each matched resource
for (match of matches) {
  differences = compareProperties(match.sls, match.cdk)

  for (diff of differences) {
    if (diff.severity === 'CRITICAL') {
      blockingIssues.push(diff)
    }
  }
}

ready_for_import = blockingIssues.length === 0
```

**Blocking Issue Examples:**
- Resource type mismatch
- Required property missing
- Property type conflict
- Deletion policy change (Retain → Delete)

**Output:**
```typescript
{
  report: ComparisonReport,
  reportPath: string,
  readyForImport: boolean,
  blockingIssues: string[]
}
```

**Report Files:**
- `migration-comparison-report.html` (visual report)
- `migration-comparison-report.json` (raw data)

### Step 7: IMPORT_PREPARATION

**Purpose:** Import existing AWS resources into CDK stack.

**Implementation:** `ImportExecutor`

**Actions:**
1. Create import mapping file (`import-mapping.json`)
2. Run `cdk import` (interactive or automatic)
3. Map logical IDs to physical resource IDs
4. Verify import success
5. Get stack ID from CloudFormation

**Import Modes:**

**Interactive:**
```bash
$ cdk import
# Prompts user for each resource:
# Enter physical ID for UsersTable [AWS::DynamoDB::Table]: my-app-users-dev
```

**Automatic:**
```bash
$ cdk import --auto-approve
# Uses physical IDs from discovery phase
```

**Import Mapping Format:**
```json
[
  {
    "LogicalResourceId": "UsersTable",
    "PhysicalResourceId": "my-app-users-dev",
    "ResourceType": "AWS::DynamoDB::Table"
  }
]
```

**Output:**
```typescript
{
  importedResources: string[],
  importMethod: 'interactive' | 'automatic',
  importOutput: string,
  stackId: string
}
```

### Step 8: VERIFICATION

**Purpose:** Verify migration was successful and resources are healthy.

**Implementation:** `VerifyExecutor`

**Actions:**
1. Check CloudFormation stack health
2. Detect stack drift
3. Verify all resources exist
4. Run smoke tests
5. Report any issues

**Drift Detection:**
```typescript
// Initiate drift detection
detectionId = await cloudformation.detectStackDrift({ StackName })

// Wait for completion
await waitForDriftDetection(detectionId)

// Get drift results
driftResult = await cloudformation.describeStackDriftDetectionStatus({ detectionId })

if (driftResult.StackDriftStatus === 'DRIFTED') {
  // Get drifted resources
  drifted = await cloudformation.describeStackResourceDrifts({
    StackName,
    StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED']
  })
}
```

**Output:**
```typescript
{
  driftStatus: 'IN_SYNC' | 'DRIFTED' | 'NOT_SUPPORTED',
  driftedResources: string[],
  resourcesVerified: number,
  allResourcesExist: boolean,
  stackHealth: string,
  issues: string[]
}
```

### Step 9: COMPLETE

**Purpose:** Mark migration as complete.

**Actions:**
1. Update state to COMPLETED
2. Record completion timestamp
3. Save final state

---

## Resource Handling

### Stateful Resources

**Strategy:** Import without modification

**Why:** Preserve data and avoid downtime

**Resources:**
- DynamoDB Tables
- S3 Buckets
- RDS Databases
- Log Groups
- ECS Clusters
- EFS File Systems
- ElastiCache Clusters

**CDK Code Pattern:**
```typescript
const table = new dynamodb.Table(this, 'UsersTable', {
  tableName: 'my-app-users-dev',  // Physical ID
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
});
table.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
(table.node.defaultChild as cdk.CfnResource).overrideLogicalId('UsersTable');
```

**Key Properties:**
- `applyRemovalPolicy(RETAIN)`: Prevent accidental deletion
- `overrideLogicalId()`: Match CloudFormation logical ID for import

### Stateless Resources

**Strategy:** Recreate (not imported)

**Why:** No data loss risk, often cheaper to recreate

**Resources:**
- Lambda Functions
- IAM Roles/Policies
- API Gateway
- CloudWatch Alarms
- EventBridge Rules
- SNS Topics
- SQS Queues

**Migration Approach:**
1. Generate CDK code
2. Deploy new resources
3. Delete old resources
4. Update references

### Logical ID Preservation

**Critical Requirement:** Logical IDs must match exactly for resource import.

**Implementation:**
```typescript
// Override logical ID to match CloudFormation
(resource.node.defaultChild as cdk.CfnResource).overrideLogicalId('OriginalLogicalId');
```

**Why:**
- CloudFormation identifies resources by logical ID
- Import fails if logical IDs don't match
- Changing logical ID triggers resource replacement

### Dependency Handling

**Discovery:**
```typescript
// Extract dependencies from CloudFormation intrinsics
findRefs(properties) {
  if (properties.Ref) {
    dependencies.add(properties.Ref)
  }
  if (properties['Fn::GetAtt']) {
    dependencies.add(properties['Fn::GetAtt'][0])
  }
}
```

**Resolution:**
```typescript
// Reference other resources by variable name
const role = new iam.Role(this, 'LambdaRole', { ... });
const func = new lambda.Function(this, 'MyFunction', {
  role: role,  // CDK resolves reference automatically
  ...
});
```

---

## Code Generation Rules

### L2 Construct Usage

**Strategy:** Use L2 constructs when available, fall back to L1 (CfnXxx) when necessary.

**L2 Benefits:**
- Type-safe properties
- Sensible defaults
- Helper methods (e.g., `grantRead()`, `grantInvoke()`)
- Better TypeScript experience

**L1 Fallback:**
- Used when L2 doesn't support all properties
- Direct mapping from CloudFormation
- More verbose but complete

**Example Mapping:**
```typescript
CONSTRUCT_MAPPING = {
  'AWS::DynamoDB::Table': {
    l1Class: 'CfnTable',
    l2Class: 'Table',          // ✓ Use L2
    module: 'dynamodb',
    modulePath: 'aws-dynamodb'
  },
  'AWS::Lambda::Function': {
    l1Class: 'CfnFunction',
    l2Class: 'Function',       // ✓ Use L2
    module: 'lambda',
    modulePath: 'aws-lambda'
  },
  'AWS::CustomResource': {
    l1Class: 'CfnCustomResource',
    l2Class: undefined,        // ✗ No L2, use L1
    module: 'cloudformation',
    modulePath: 'aws-cloudformation'
  }
}
```

### Property Transformations

#### S3 Bucket

**CloudFormation:**
```json
{
  "Type": "AWS::S3::Bucket",
  "Properties": {
    "BucketName": "my-bucket",
    "BucketEncryption": {
      "ServerSideEncryptionConfiguration": [...]
    }
  }
}
```

**CDK L2:**
```typescript
new s3.Bucket(this, 'MyBucket', {
  bucketName: 'my-bucket',
  encryption: s3.BucketEncryption.S3_MANAGED
});
```

**Transformation:**
```typescript
transformS3BucketProps(properties) {
  if (properties.BucketEncryption) {
    return { encryption: 's3.BucketEncryption.S3_MANAGED' };
  }
}
```

#### IAM Role

**CloudFormation:**
```json
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "AssumeRolePolicyDocument": {
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    },
    "Policies": [...]
  }
}
```

**CDK L2:**
```typescript
new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  inlinePolicies: {
    lambdaPolicy: new iam.PolicyDocument({
      statements: [...]
    })
  }
});
```

**Transformation:**
```typescript
transformIAMRoleProps(properties) {
  const doc = properties.AssumeRolePolicyDocument;
  const service = doc.Statement[0].Principal.Service;

  return {
    assumedBy: `new iam.ServicePrincipal('${service}')`,
    inlinePolicies: convertPolicies(properties.Policies)
  };
}
```

#### Lambda Function

**CloudFormation:**
```json
{
  "Type": "AWS::Lambda::Function",
  "Properties": {
    "FunctionName": "my-function",
    "Runtime": "nodejs20.x",
    "Timeout": 30,
    "Code": {
      "S3Bucket": { "Ref": "ServerlessDeploymentBucket" },
      "S3Key": "path/to/code.zip"
    }
  }
}
```

**CDK L2:**
```typescript
new lambda.Function(this, 'MyFunction', {
  functionName: 'my-function',
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: cdk.Duration.seconds(30),
  code: lambda.Code.fromBucket(deploymentBucket, 'path/to/code.zip')
});
```

**Transformation:**
```typescript
transformLambdaFunctionProps(properties) {
  return {
    runtime: convertRuntime(properties.Runtime),     // 'nodejs20.x' → lambda.Runtime.NODEJS_20_X
    timeout: `cdk.Duration.seconds(${properties.Timeout})`,
    code: `lambda.Code.fromBucket(${bucket}, '${key}')`
  };
}
```

#### DynamoDB Table

**CloudFormation:**
```json
{
  "Type": "AWS::DynamoDB::Table",
  "Properties": {
    "TableName": "users-table",
    "BillingMode": "PAY_PER_REQUEST",
    "KeySchema": [
      { "AttributeName": "id", "KeyType": "HASH" },
      { "AttributeName": "timestamp", "KeyType": "RANGE" }
    ],
    "AttributeDefinitions": [...]
  }
}
```

**CDK L2:**
```typescript
new dynamodb.Table(this, 'UsersTable', {
  tableName: 'users-table',
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: {
    name: 'id',
    type: dynamodb.AttributeType.STRING
  },
  sortKey: {
    name: 'timestamp',
    type: dynamodb.AttributeType.STRING
  }
});
```

**Transformation:**
```typescript
transformDynamoDBTableProps(properties) {
  const keySchema = properties.KeySchema;
  const partitionKey = keySchema.find(k => k.KeyType === 'HASH');
  const sortKey = keySchema.find(k => k.KeyType === 'RANGE');

  return {
    billingMode: `dynamodb.BillingMode.${properties.BillingMode}`,
    partitionKey: `{ name: '${partitionKey.AttributeName}', type: dynamodb.AttributeType.STRING }`,
    sortKey: sortKey ? `{ name: '${sortKey.AttributeName}', type: dynamodb.AttributeType.STRING }` : undefined
  };
}
```

### Intrinsic Function Conversion

#### Ref

**CloudFormation:**
```json
{ "Ref": "MyBucket" }
```

**CDK:**
```typescript
myBucket  // Direct variable reference
```

#### Fn::GetAtt

**CloudFormation:**
```json
{ "Fn::GetAtt": ["MyRole", "Arn"] }
```

**CDK:**
```typescript
myRole.roleArn  // L2 property
```

**Attribute Mapping:**
```typescript
const attributeMap = {
  'Arn': 'roleArn',
  'RoleArn': 'roleArn',
  'FunctionArn': 'functionArn',
  'BucketArn': 'bucketArn',
  'TableArn': 'tableArn'
};
```

#### Fn::Sub

**CloudFormation:**
```json
{ "Fn::Sub": "arn:aws:s3:::${BucketName}/*" }
```

**CDK:**
```typescript
cdk.Fn.sub('arn:aws:s3:::${BucketName}/*')
```

#### Fn::Join

**CloudFormation:**
```json
{ "Fn::Join": ["-", ["prefix", { "Ref": "Stage" }, "suffix"]] }
```

**CDK:**
```typescript
['prefix', stage, 'suffix'].join('-')
```

### Property Naming Convention

**CloudFormation uses PascalCase:**
```json
{
  "TableName": "users",
  "BillingMode": "PAY_PER_REQUEST"
}
```

**CDK uses camelCase:**
```typescript
{
  tableName: 'users',
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
}
```

**Conversion:**
```typescript
toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

// PascalCase → camelCase
'TableName' → 'tableName'
'BillingMode' → 'billingMode'
```

---

## Validation & Safety

### Dry-Run Mode

**Purpose:** Test migration without making AWS changes.

**Enabled by:**
```typescript
config.dryRun = true
```

**Behavior:**

| Step | Dry-Run Action |
|------|---------------|
| INITIAL_SCAN | ✓ Full execution |
| DISCOVERY | ✓ Full execution |
| CLASSIFICATION | ✓ Full execution |
| TEMPLATE_MODIFICATION | ⊘ Skip stack removal |
| CDK_GENERATION | ✓ Full execution (including synth) |
| COMPARISON | ✓ Full execution |
| IMPORT_PREPARATION | ⊘ Skip actual import |
| VERIFICATION | ⊘ Skip verification |
| COMPLETE | ✓ Mark as complete |

**Output:**
- All code and templates generated
- Comparison report available
- No AWS resources modified
- Safe for testing

### Comparison Validation

**Blocking Checks:**

1. **Resource Type Match**
   ```typescript
   if (sls.Type !== cdk.Type) {
     return { severity: 'CRITICAL', message: 'Type mismatch' };
   }
   ```

2. **Required Properties**
   ```typescript
   const required = ['TableName', 'KeySchema'];
   for (const prop of required) {
     if (!cdk.Properties[prop]) {
       return { severity: 'CRITICAL', message: `Missing ${prop}` };
     }
   }
   ```

3. **Deletion Policy**
   ```typescript
   if (sls.DeletionPolicy === 'Retain' && cdk.DeletionPolicy === 'Delete') {
     return { severity: 'CRITICAL', message: 'Deletion policy downgrade' };
   }
   ```

**Acceptable Differences:**

```typescript
const ACCEPTABLE_DIFFERENCES = [
  'Metadata',              // CDK adds metadata
  'DependsOn',            // CDK manages dependencies
  'UpdateReplacePolicy',  // CDK-specific
  'Description',          // Cosmetic
  'Tags'                  // Tag format may differ
];
```

**Warning Differences:**

```typescript
const WARNING_DIFFERENCES = [
  'Timeout',              // May differ slightly
  'MemorySize',          // May differ slightly
  'Environment'          // Variable values may differ
];
```

### Validation Checks

Each step runs validation checks after execution:

```typescript
interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}
```

**Example Checks:**

**INITIAL_SCAN:**
- ✓ Serverless config exists
- ✓ CloudFormation generated
- ✓ Resources discovered
- ⚠ AWS credentials available

**CDK_GENERATION:**
- ✓ CDK project initialized
- ✓ CDK code generated
- ✓ CDK synthesis successful
- ✓ Synthesized template valid

**COMPARISON:**
- ✓ Comparison completed
- ✓ Report saved
- ✓ Ready for import
- ✓ No blocking issues

**VERIFICATION:**
- ✓ Stack health OK
- ✓ No drift detected
- ✓ All resources exist
- ✓ No issues found

### Backup & Rollback

**Backup Strategy:**
```typescript
// Automatic backups before critical steps
if (config.backupEnabled && isCriticalStep(step)) {
  await stateManager.createBackup(state, `pre-${step}`);
}

const CRITICAL_STEPS = [
  MigrationStep.TEMPLATE_MODIFICATION,
  MigrationStep.IMPORT_PREPARATION,
  MigrationStep.VERIFICATION
];
```

**Rollback Support:**
```typescript
async rollback(stateId: string, targetStep: MigrationStep) {
  const state = await stateManager.loadState(stateId);
  const currentIndex = getStepIndex(state.currentStep);
  const targetIndex = getStepIndex(targetStep);

  // Roll back steps in reverse order
  for (let i = currentIndex; i > targetIndex; i--) {
    const step = allSteps[i];
    const executor = getExecutor(step);
    await executor.rollback(state);
  }

  return await stateManager.rollbackToStep(state, targetStep);
}
```

**Rollback Limitations:**
- Read-only steps (SCAN, COMPARISON) don't need rollback
- Resource import rollback requires manual stack deletion
- DeletionPolicy: Retain protects data during rollback

---

## Success Criteria

### Migration Success

A migration is considered successful when:

1. **All resources discovered**
   - ✓ All explicit resources found
   - ✓ All abstracted resources found
   - ✓ Physical IDs retrieved from AWS

2. **CDK code generated correctly**
   - ✓ Valid TypeScript syntax
   - ✓ CDK synthesis succeeds
   - ✓ All resources represented
   - ✓ L2 constructs used where available

3. **Template comparison passes**
   - ✓ All resources matched
   - ✓ No critical differences
   - ✓ Blocking issues count = 0
   - ✓ `ready_for_import` = true

4. **Resources imported successfully**
   - ✓ All stateful resources imported
   - ✓ CloudFormation stack created
   - ✓ Stack status = `IMPORT_COMPLETE`
   - ✓ No import errors

5. **Verification passes**
   - ✓ Stack health = `*_COMPLETE`
   - ✓ Drift status = `IN_SYNC`
   - ✓ All resources exist
   - ✓ No verification issues

### Quality Metrics

**Resource Match Rate:**
```typescript
matchRate = (matchedResources / totalResources) * 100

// Success thresholds:
matchRate >= 95%  // Excellent
matchRate >= 85%  // Good
matchRate >= 70%  // Acceptable
matchRate < 70%   // Review required
```

**Comparison Quality:**
```typescript
// Ideal distribution:
MATCH: 70-90%
ACCEPTABLE: 10-20%
WARNING: 0-10%
CRITICAL: 0%
```

**Import Success Rate:**
```typescript
importRate = (importedResources / statefulResources) * 100

// Must be 100% for success
importRate === 100%
```

### Failure Scenarios

**Migration fails if:**

1. **Blocking comparison issues**
   ```typescript
   report.blocking_issues.length > 0
   report.ready_for_import === false
   ```

2. **Import errors**
   ```typescript
   importResult.importedResources.length < expectedCount
   stackStatus.includes('FAILED')
   ```

3. **Verification failures**
   ```typescript
   verifyResult.stackHealth.includes('FAILED')
   verifyResult.allResourcesExist === false
   ```

4. **Critical drift**
   ```typescript
   driftStatus === 'DRIFTED' && criticalResourcesDrifted
   ```

---

## Known Limitations

### Resource Type Support

**Fully Supported:**
- DynamoDB Tables
- S3 Buckets
- Lambda Functions
- IAM Roles/Policies
- CloudWatch Log Groups
- API Gateway (REST & HTTP)

**Partially Supported:**
- Custom Resources (L1 only)
- CloudFront Distributions (complex properties)
- Step Functions (intricate state machines)

**Not Supported:**
- Serverless plugins (must be reimplemented)
- Custom Serverless variables
- Framework-specific features (e.g., `serverless-offline`)

### Property Transformation Limitations

1. **Complex Nested Properties**
   - Some deeply nested CloudFormation properties may not transform perfectly
   - Manual review recommended for complex resources

2. **Custom Property Values**
   - Hard-coded values may need adjustment
   - Environment-specific values should use CDK context

3. **IAM Policy Complexity**
   - Very complex policies may need manual refinement
   - Condition keys and advanced features may require L1

### Migration Limitations

1. **No Cross-Stack References**
   - Tool migrates single stack at a time
   - Cross-stack imports must be handled manually

2. **No Blue-Green Deployment**
   - Migration is in-place
   - Brief downtime possible for some resources

3. **No Automatic Testing**
   - Unit tests must be written separately
   - Integration tests recommended post-migration

4. **Serverless Plugin Logic**
   - Custom plugins must be reimplemented in CDK
   - No automatic conversion of plugin functionality

### AWS Limitations

1. **Resource Import Constraints**
   - Not all resource types support import
   - Some properties cannot be changed during import

2. **CloudFormation Limits**
   - 500 resource limit per stack
   - Template size limits (1 MB)

3. **Drift Detection**
   - Not all resource types support drift detection
   - Drift detection can be slow for large stacks

### Edge Cases

1. **Circular Dependencies**
   - May require manual refactoring
   - Tool detects but cannot auto-resolve

2. **Physical ID Conflicts**
   - If physical IDs are not unique across accounts
   - Manual mapping may be required

3. **Resource State Changes**
   - If resources modified during migration
   - Drift detection will flag issues

---

## Appendices

### A. Configuration Options

```typescript
interface MigrationConfig {
  sourceDir: string;           // Serverless app directory
  targetDir: string;           // CDK project directory
  stage: string;               // Deployment stage (dev, prod)
  region: string;              // AWS region
  stackName: string;           // CloudFormation stack name
  cdkLanguage: 'typescript' | 'python';
  dryRun: boolean;             // Test mode
  autoApprove: boolean;        // Skip import prompts
  backupEnabled: boolean;      // Create backups
  removeServerless: boolean;   // Remove old stack
}
```

### B. State Schema

```typescript
interface MigrationState {
  id: string;
  config: MigrationConfig;
  currentStep: MigrationStep;
  status: MigrationStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  stepResults: Record<MigrationStep, StepResult>;
  backups: Backup[];
  error?: Error;
}
```

### C. CLI Commands

```bash
# Start new migration
migrate start --source ./serverless-app --target ./cdk-app --stage dev

# Resume migration
migrate resume --state-id <id>

# Dry run
migrate start --source ./app --target ./cdk --dry-run

# Auto-approve import
migrate start --source ./app --target ./cdk --auto-approve

# Rollback
migrate rollback --state-id <id> --to COMPARISON

# Get progress
migrate progress --state-id <id>

# List migrations
migrate list
```

### D. Error Codes

| Code | Description |
|------|-------------|
| E001 | Serverless config not found |
| E002 | CloudFormation generation failed |
| E003 | Resource discovery failed |
| E004 | CDK synthesis failed |
| E005 | Template comparison failed |
| E006 | Blocking issues detected |
| E007 | Resource import failed |
| E008 | Stack verification failed |
| E009 | Invalid state transition |
| E010 | Prerequisites not met |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-XX | Initial specification |

---

**Document Status:** Draft
**Last Updated:** 2024-01-XX
**Author:** Generated from codebase analysis
