# Comprehensive Test Plan: Serverless to CDK Migration Tool

## Executive Summary

This document outlines a comprehensive testing strategy for the Serverless to CDK migration tool, covering unit tests, integration tests, and end-to-end scenarios. The test suite ensures reliability, correctness, and safety of the migration process.

---

## Current Test Coverage Analysis

### Existing Tests (17 test files)

#### ✅ Well-Covered Areas:
- **Generator Module** (`tests/unit/generator.test.ts`): L2 construct generation, imports, property conversion
- **Scanner Module** (`tests/unit/scanner.test.ts`): Resource discovery, classification, dependency graphs
- **Comparator Module** (`tests/unit/comparator.test.ts`): Template comparison, resource matching, property diff
- **Property Comparator** (`tests/unit/comparator/property-comparator.test.ts`): Deep equality, severity classification
- **E2E Migration** (`tests/integration/e2e-migration.test.ts`): Full workflow testing

#### ❌ Coverage Gaps Identified:

1. **TypeScript Generator** (`src/modules/generator/typescript-generator.ts`):
   - ❌ No dedicated test file for property transformers
   - ❌ Limited testing of L2 construct transformations (S3, IAM, Lambda, DynamoDB)
   - ❌ No tests for logical ID preservation
   - ❌ Insufficient edge case coverage

2. **Resource Classifier** (`src/modules/scanner/resource-classifier.ts`):
   - ⚠️ Basic tests exist but lack edge cases
   - ❌ No tests for custom resource types
   - ❌ Missing tests for deletion policy recommendations

3. **Template Comparison Algorithm**:
   - ⚠️ Basic matching tested
   - ❌ Complex scenarios not covered (unmatched resources, ambiguous matches)
   - ❌ No performance tests for large templates

4. **State Machine & Orchestration**:
   - ⚠️ Some coverage in orchestrator tests
   - ❌ Insufficient error recovery testing
   - ❌ Limited rollback scenario coverage

5. **Dry-Run Mode**:
   - ❌ No dedicated tests verifying dry-run doesn't modify files
   - ❌ Missing validation that preview matches actual execution

---

## Test Strategy

### Test Pyramid Distribution

```
         /\
        /E2E\      ← 10% (Complete workflows, real AWS interactions)
       /------\
      / Integ. \   ← 30% (Multi-module integration, file I/O)
     /----------\
    /   Unit     \ ← 60% (Isolated module testing, fast execution)
   /--------------\
```

### Coverage Targets
- **Statements**: >80%
- **Branches**: >75%
- **Functions**: >85%
- **Lines**: >80%
- **Critical Paths**: 100%

---

## 1. Unit Tests

### 1.1 TypeScript Generator (`typescript-generator.test.ts`)

#### Test Suite: Property Transformers

**Module**: `src/modules/generator/typescript-generator.ts`

##### S3 Bucket Transformers
```typescript
describe('TypeScriptGenerator - S3 Transformers', () => {
  test('transformS3BucketProps: BucketEncryption → encryption', () => {
    // Input: CloudFormation BucketEncryption
    const cfProps = {
      BucketName: 'my-bucket',
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256'
          }
        }]
      }
    };

    // Expected: CDK L2 encryption property
    const expected = {
      bucketName: 'my-bucket',
      encryption: 's3.BucketEncryption.S3_MANAGED'
    };

    // Verify transformation produces correct CDK code
  });

  test('handles versioning configuration', () => {
    const cfProps = {
      VersioningConfiguration: { Status: 'Enabled' }
    };
    // Should transform to: versioned: true
  });

  test('handles lifecycle rules transformation', () => {
    // Complex lifecycle rules → CDK lifecycle configuration
  });

  test('preserves bucket name for import', () => {
    // Critical: BucketName must be preserved exactly
  });
});
```

##### Lambda Function Transformers
```typescript
describe('TypeScriptGenerator - Lambda Transformers', () => {
  test('transformLambdaFunctionProps: Runtime string → enum', () => {
    // nodejs20.x → lambda.Runtime.NODEJS_20_X
    // python3.11 → lambda.Runtime.PYTHON_3_11
    // dotnet8 → lambda.Runtime.DOTNET_8
  });

  test('Timeout: number → Duration.seconds()', () => {
    const cfProps = { Timeout: 30 };
    // Expected: timeout: cdk.Duration.seconds(30)
  });

  test('Code: S3Bucket/S3Key → Code.fromBucket()', () => {
    const cfProps = {
      Code: {
        S3Bucket: { Ref: 'DeploymentBucket' },
        S3Key: 'lambda/function.zip'
      }
    };
    // Expected: code: lambda.Code.fromBucket(deploymentBucket, 'lambda/function.zip')
  });

  test('Architecture: array → enum', () => {
    const cfProps = { Architectures: ['arm64'] };
    // Expected: architecture: lambda.Architecture.ARM_64
  });

  test('handles environment variables', () => {
    const cfProps = {
      Environment: {
        Variables: {
          TABLE_NAME: { Ref: 'MyTable' },
          REGION: { Ref: 'AWS::Region' }
        }
      }
    };
    // Verify Ref and pseudo-parameters are correctly transformed
  });

  test('skips Role property for L2 constructs', () => {
    // Role is handled differently in L2
    // Should not be in transformed properties
  });
});
```

##### DynamoDB Table Transformers
```typescript
describe('TypeScriptGenerator - DynamoDB Transformers', () => {
  test('BillingMode: string → enum', () => {
    // PAY_PER_REQUEST → dynamodb.BillingMode.PAY_PER_REQUEST
    // PROVISIONED → dynamodb.BillingMode.PROVISIONED
  });

  test('KeySchema: transforms to partitionKey', () => {
    const cfProps = {
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' }
      ]
    };
    // Expected: partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }
  });

  test('KeySchema: composite key (HASH + RANGE)', () => {
    const cfProps = {
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'N' }
      ]
    };
    // Expected: partitionKey + sortKey
    // Verify type mapping: S→STRING, N→NUMBER, B→BINARY
  });

  test('StreamSpecification transformation', () => {
    const cfProps = {
      StreamSpecification: {
        StreamViewType: 'NEW_AND_OLD_IMAGES'
      }
    };
    // Expected: stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
  });

  test('skips AttributeDefinitions (inferred from keys)', () => {
    // AttributeDefinitions not needed in L2 constructs
  });
});
```

##### IAM Role Transformers
```typescript
describe('TypeScriptGenerator - IAM Transformers', () => {
  test('AssumeRolePolicyDocument → assumedBy', () => {
    const cfProps = {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }]
      }
    };
    // Expected: assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
  });

  test('handles multiple service principals', () => {
    const cfProps = {
      AssumeRolePolicyDocument: {
        Statement: [{
          Principal: {
            Service: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com']
          }
        }]
      }
    };
    // Should use first service or CompositePrincipal
  });

  test('Policies → inlinePolicies', () => {
    const cfProps = {
      Policies: [{
        PolicyName: 'LambdaPolicy',
        PolicyDocument: {
          Statement: [{
            Effect: 'Allow',
            Action: ['dynamodb:GetItem'],
            Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
          }]
        }
      }]
    };
    // Expected: inlinePolicies with PolicyDocument and PolicyStatement
  });

  test('handles intrinsic functions in policy names', () => {
    // PolicyName with Fn::Join or Fn::Sub
  });
});
```

##### Log Group Transformers
```typescript
describe('TypeScriptGenerator - LogGroup Transformers', () => {
  test('RetentionInDays: number → enum', () => {
    // 1 → logs.RetentionDays.ONE_DAY
    // 7 → logs.RetentionDays.ONE_WEEK
    // 30 → logs.RetentionDays.ONE_MONTH
    // 90 → logs.RetentionDays.THREE_MONTHS
    // 365 → logs.RetentionDays.ONE_YEAR
  });

  test('handles custom retention periods', () => {
    // RetentionInDays: 14 → find closest enum or use exact value
  });
});
```

#### Test Suite: Logical ID Preservation

```typescript
describe('TypeScriptGenerator - Logical ID Preservation', () => {
  test('preserves exact CloudFormation logical ID', () => {
    const resource = {
      logicalId: 'MySpecificTableName123',
      type: 'AWS::DynamoDB::Table',
      properties: { TableName: 'test-table' }
    };

    const code = generator.generateConstruct(resource, true);

    // Must contain: overrideLogicalId('MySpecificTableName123')
    expect(code.code).toContain("overrideLogicalId('MySpecificTableName123')");
  });

  test('applies RemovalPolicy.RETAIN for stateful resources', () => {
    // All imported resources must have RETAIN policy
  });

  test('generates valid TypeScript variable names', () => {
    // LogicalId: MyTableName → varName: myTableName (camelCase)
    const tests = [
      { logicalId: 'MyTable', expected: 'myTable' },
      { logicalId: 'CounterLogGroup', expected: 'counterLogGroup' },
      { logicalId: 'DataBucket', expected: 'dataBucket' }
    ];
  });
});
```

#### Test Suite: Intrinsic Functions

```typescript
describe('TypeScriptGenerator - Intrinsic Functions', () => {
  test('Ref: AWS::Region → cdk.Stack.of(this).region', () => {
    const value = { Ref: 'AWS::Region' };
    // Expected: cdk.Stack.of(this).region
  });

  test('Ref: AWS::AccountId → cdk.Stack.of(this).account', () => {
    const value = { Ref: 'AWS::AccountId' };
    // Expected: cdk.Stack.of(this).account
  });

  test('Ref: ResourceLogicalId → camelCase reference', () => {
    const value = { Ref: 'MyTable' };
    // Expected: myTable (direct variable reference)
  });

  test('Fn::GetAtt: maps to L2 properties', () => {
    const tests = [
      { input: ['MyTable', 'Arn'], expected: 'myTable.tableArn' },
      { input: ['MyRole', 'Arn'], expected: 'myRole.roleArn' },
      { input: ['MyFunction', 'Arn'], expected: 'myFunction.functionArn' }
    ];
  });

  test('Fn::GetAtt: fallback to attr* for unknown attributes', () => {
    const value = { 'Fn::GetAtt': ['MyResource', 'CustomAttribute'] };
    // Expected: myResource.attrCustomAttribute
  });

  test('Fn::Sub: simple substitution', () => {
    const value = { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*' };
    // Expected: cdk.Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*')
  });

  test('Fn::Sub: with variable map', () => {
    const value = {
      'Fn::Sub': [
        '${TableName}-index',
        { TableName: { Ref: 'MyTable' } }
      ]
    };
    // Expected: cdk.Fn.sub('${TableName}-index', { tableName: myTable })
  });

  test('Fn::Join: transforms to array.join()', () => {
    const value = { 'Fn::Join': ['/', ['arn', 'aws', 's3']] };
    // Expected: ['arn', 'aws', 's3'].join('/')
  });
});
```

#### Test Suite: Edge Cases

```typescript
describe('TypeScriptGenerator - Edge Cases', () => {
  test('handles empty properties object', () => {
    const resource = {
      logicalId: 'EmptyResource',
      type: 'AWS::S3::Bucket',
      properties: {}
    };
    // Should generate valid construct with minimal config
  });

  test('handles null and undefined values', () => {
    const props = {
      TableName: 'test',
      BillingMode: null,
      StreamSpecification: undefined
    };
    // Should skip null/undefined properties
  });

  test('handles arrays with mixed types', () => {
    const props = {
      Tags: [
        { Key: 'Name', Value: 'test' },
        { Key: 'Env', Value: { Ref: 'Environment' } }
      ]
    };
    // Should handle intrinsic functions within arrays
  });

  test('handles deeply nested objects', () => {
    const props = {
      Configuration: {
        Level1: {
          Level2: {
            Level3: {
              Value: 'deep'
            }
          }
        }
      }
    };
    // Should recursively convert nested structures
  });

  test('escapes special characters in strings', () => {
    const props = {
      Description: "It's a test with 'quotes' and \"double quotes\""
    };
    // Should properly escape quotes
  });

  test('handles large property values', () => {
    const props = {
      Description: 'A'.repeat(10000) // Very long string
    };
    // Should handle without truncation
  });

  test('handles circular references gracefully', () => {
    // While unlikely in CloudFormation, should not crash
  });

  test('unsupported resource type throws descriptive error', () => {
    const resource = {
      logicalId: 'CustomResource',
      type: 'AWS::Custom::UnsupportedType',
      properties: {}
    };
    // Should throw: "Unsupported resource type: AWS::Custom::UnsupportedType"
  });
});
```

---

### 1.2 Resource Classifier (`resource-classifier.test.ts`)

**Module**: `src/modules/scanner/resource-classifier.ts`

```typescript
describe('ResourceClassifier - Extended Tests', () => {
  describe('Stateful Resource Classification', () => {
    test.each([
      'AWS::DynamoDB::Table',
      'AWS::S3::Bucket',
      'AWS::Logs::LogGroup',
      'AWS::RDS::DBInstance',
      'AWS::ElasticFileSystem::FileSystem'
    ])('classifies %s as IMPORT', (resourceType) => {
      const resource = { type: resourceType, logicalId: 'Test', properties: {} };
      expect(classifier.classifyResource(resource)).toBe('IMPORT');
    });
  });

  describe('Stateless Resource Classification', () => {
    test.each([
      'AWS::Lambda::Function',
      'AWS::IAM::Role',
      'AWS::IAM::Policy',
      'AWS::Lambda::Permission',
      'AWS::Events::Rule'
    ])('classifies %s as RECREATE', (resourceType) => {
      const resource = { type: resourceType, logicalId: 'Test', properties: {} };
      expect(classifier.classifyResource(resource)).toBe('RECREATE');
    });
  });

  describe('Deletion Policy Recommendations', () => {
    test('recommends RETAIN for stateful resources', () => {
      const resource = {
        type: 'AWS::DynamoDB::Table',
        logicalId: 'MyTable',
        properties: {}
      };
      expect(classifier.getRecommendedDeletionPolicy(resource)).toBe('Retain');
    });

    test('recommends DELETE for stateless resources', () => {
      const resource = {
        type: 'AWS::Lambda::Function',
        logicalId: 'MyFunction',
        properties: {}
      };
      expect(classifier.getRecommendedDeletionPolicy(resource)).toBe('Delete');
    });

    test('recommends SNAPSHOT for snapshotable resources', () => {
      // RDS, RedShift, Neptune, etc.
    });
  });

  describe('Custom Resource Handling', () => {
    test('handles AWS::CloudFormation::CustomResource', () => {
      // Should classify based on metadata or default to RECREATE
    });

    test('handles Custom::* resource types', () => {
      // User-defined custom resources
    });
  });
});
```

---

### 1.3 Template Comparison Algorithm (`template-comparison.test.ts`)

**Module**: `src/modules/comparator/index.ts`

```typescript
describe('Template Comparison - Advanced Scenarios', () => {
  describe('Resource Matching', () => {
    test('matches resources with identical physical IDs', () => {
      // Standard case
    });

    test('handles resources with no physical ID property', () => {
      // Some resources auto-generate names
      // Should attempt logical ID matching with warning
    });

    test('handles duplicate physical IDs (error condition)', () => {
      // Two resources with same physical ID
      // Should report as error
    });

    test('handles case sensitivity in physical IDs', () => {
      // BucketName is case-sensitive
      // TableName is case-sensitive
    });

    test('reports unmatched resources in SLS template', () => {
      const slsTemplate = {
        Resources: {
          Table1: { Type: 'AWS::DynamoDB::Table', Properties: { TableName: 'table-1' } },
          Table2: { Type: 'AWS::DynamoDB::Table', Properties: { TableName: 'table-2' } }
        }
      };
      const cdkTemplate = {
        Resources: {
          Table1CDK: { Type: 'AWS::DynamoDB::Table', Properties: { TableName: 'table-1' } }
        }
      };

      const result = comparator.compareTemplates(slsTemplate, cdkTemplate);
      expect(result.summary.unmatched_sls).toBe(1);
      // Should identify Table2 as unmatched
    });

    test('reports unmatched resources in CDK template', () => {
      // CDK has extra resources not in SLS
      // May indicate CDK added new infrastructure
    });
  });

  describe('Property Comparison', () => {
    test('ignores property order differences', () => {
      const sls = { BucketName: 'test', Versioning: { Status: 'Enabled' } };
      const cdk = { Versioning: { Status: 'Enabled' }, BucketName: 'test' };
      // Should be MATCH
    });

    test('ignores metadata properties', () => {
      // DeletionPolicy, UpdateReplacePolicy, Metadata, Condition
      // Should not affect comparison
    });

    test('handles array property order differences', () => {
      // Some arrays are order-sensitive (KeySchema)
      // Others are not (Tags)
    });

    test('normalizes equivalent values', () => {
      // "true" vs true
      // "123" vs 123
      // Should normalize before comparison
    });
  });

  describe('Severity Classification', () => {
    test('critical: physical ID mismatch', () => {
      // BucketName, TableName, LogGroupName, etc.
      // Different values = cannot import
    });

    test('warning: configuration drift', () => {
      // Versioning enabled in SLS, not in CDK
      // Should warn but not block
    });

    test('acceptable: CDK adds non-breaking properties', () => {
      // CDK adds RetentionInDays to LogGroup
      // Safe addition
    });
  });

  describe('Report Generation', () => {
    test('calculates correct summary statistics', () => {
      // Total matched, status breakdown, ready_for_import flag
    });

    test('identifies blocking issues', () => {
      // List of CRITICAL differences that prevent import
    });

    test('generates actionable recommendations', () => {
      // For each WARNING/CRITICAL, provide fix suggestion
    });

    test('exports report in JSON format', () => {
      // Machine-readable for automation
    });

    test('exports report in HTML format', () => {
      // Human-readable with color coding
    });
  });

  describe('Performance', () => {
    test('handles large templates (1000+ resources) efficiently', () => {
      // Generate large synthetic template
      // Compare in <5 seconds
    });

    test('handles deeply nested properties', () => {
      // Properties with 10+ levels of nesting
      // Should not cause stack overflow
    });
  });
});
```

---

### 1.4 Dry-Run Mode Verification (`dry-run.test.ts`)

**New Test File**: Verify dry-run doesn't modify anything

```typescript
describe('Dry-Run Mode', () => {
  let testDir: string;
  let originalFiles: Map<string, string>;

  beforeEach(async () => {
    testDir = await createTestDirectory();
    originalFiles = await captureFileStates(testDir);
  });

  test('dry-run does not modify Serverless template', async () => {
    const config = {
      options: { dryRun: true }
    };

    await orchestrator.runMigration(config);

    const currentFiles = await captureFileStates(testDir);
    expect(currentFiles).toEqual(originalFiles);
  });

  test('dry-run does not create CDK files', async () => {
    const config = {
      options: { dryRun: true }
    };

    await orchestrator.runMigration(config);

    const cdkFiles = await findFiles(testDir, '**/*.ts');
    expect(cdkFiles).toHaveLength(0);
  });

  test('dry-run generates preview report', async () => {
    const config = {
      options: { dryRun: true }
    };

    const result = await orchestrator.runMigration(config);

    expect(result.preview).toBeDefined();
    expect(result.preview.actions).toBeInstanceOf(Array);
    // Should show what WOULD happen without doing it
  });

  test('dry-run preview matches actual execution', async () => {
    // Run in dry-run mode
    const dryRunResult = await orchestrator.runMigration({ options: { dryRun: true } });

    // Run actual migration
    const actualResult = await orchestrator.runMigration({ options: { dryRun: false } });

    // Compare previewed actions vs actual actions
    expect(dryRunResult.preview.actions).toEqual(actualResult.executedActions);
  });

  test('dry-run does not call AWS APIs', async () => {
    const awsApiCalls = jest.spyOn(cloudFormationClient, 'send');

    await orchestrator.runMigration({ options: { dryRun: true } });

    expect(awsApiCalls).not.toHaveBeenCalled();
  });
});
```

---

## 2. Integration Tests

### 2.1 Multi-Resource Migration (`multi-resource-migration.test.ts`)

**Test Suite**: Complex scenarios with multiple resource types

```typescript
describe('Integration: Multi-Resource Migration', () => {
  test('migrates stack with DynamoDB, S3, Lambda, and IAM', async () => {
    const resources = {
      'AWS::DynamoDB::Table': 2,
      'AWS::S3::Bucket': 1,
      'AWS::Lambda::Function': 3,
      'AWS::IAM::Role': 3,
      'AWS::Logs::LogGroup': 3
    };

    // Verify all resources are correctly classified
    // Verify dependencies are preserved
    // Verify CDK code is generated for each
  });

  test('handles cross-resource references', async () => {
    // Lambda references DynamoDB table ARN
    // IAM role references S3 bucket
    // Verify Ref and Fn::GetAtt are correctly transformed
  });

  test('preserves dependency order in CDK code', async () => {
    // Resources created in dependency order
    // IAM Role before Lambda Function
    // DynamoDB before Lambda (if referenced)
  });

  test('handles circular dependency errors gracefully', async () => {
    // Detect and report circular dependencies
  });
});
```

### 2.2 Error Recovery (`error-recovery.test.ts`)

```typescript
describe('Integration: Error Recovery', () => {
  test('recovers from template parsing errors', async () => {
    // Malformed CloudFormation JSON
    // Should report error with line number
  });

  test('recovers from CDK synthesis errors', async () => {
    // Generated CDK code has syntax errors
    // Should report and suggest fixes
  });

  test('recovers from comparison failures', async () => {
    // Template files missing
    // Should prompt to regenerate
  });

  test('handles AWS API throttling', async () => {
    // Retry with exponential backoff
  });

  test('handles network failures gracefully', async () => {
    // Offline mode for dry-run
  });
});
```

### 2.3 Rollback Scenarios (`rollback.test.ts`)

```typescript
describe('Integration: Rollback', () => {
  test('rolls back to INITIAL_SCAN from COMPARISON', async () => {
    await orchestrator.executeStep('SCAN');
    await orchestrator.executeStep('PROTECT');
    await orchestrator.executeStep('CDK_GENERATION');

    const result = await orchestrator.rollback('SCAN');

    expect(result.success).toBe(true);
    expect(await orchestrator.getCurrentStep()).toBe('SCAN');
  });

  test('restores backups on rollback', async () => {
    // Modify files
    // Rollback
    // Verify files restored from backup
  });

  test('rollback cleans up generated CDK files', async () => {
    // Generate CDK code
    // Rollback
    // Verify CDK files removed
  });

  test('rollback updates state correctly', async () => {
    // State machine reflects rolled-back status
  });

  test('cannot rollback before first step', async () => {
    // Should reject rollback if no steps completed
  });
});
```

---

## 3. End-to-End Tests

### 3.1 Real Serverless Projects (`e2e-real-projects.test.ts`)

**Test Suite**: Actual Serverless projects from the wild

```typescript
describe('E2E: Real Serverless Projects', () => {
  test('migrates simple REST API (CRUD on DynamoDB)', async () => {
    // Serverless config:
    // - API Gateway
    // - 4 Lambda functions (GET, POST, PUT, DELETE)
    // - 1 DynamoDB table
    // - IAM roles
    // - LogGroups

    const result = await fullMigration('fixtures/rest-api-crud');

    expect(result.success).toBe(true);
    expect(result.importedResources).toHaveLength(1); // DynamoDB
    expect(result.recreatedResources).toHaveLength(7); // Lambdas + Roles
  });

  test('migrates scheduled batch processing', async () => {
    // EventBridge rules
    // Step Functions
    // Lambda functions
    // S3 bucket for data
  });

  test('migrates GraphQL API with AppSync', async () => {
    // AppSync API
    // Resolvers
    // DynamoDB tables
    // Lambda data sources
  });

  test('migrates multi-stage deployment', async () => {
    // dev, staging, prod stages
    // Stage-specific resources
    // Shared resources (S3)
  });

  test('migrates project with custom resources', async () => {
    // AWS::CloudFormation::CustomResource
    // Custom::* types
    // Should handle gracefully
  });
});
```

### 3.2 Edge Cases (`e2e-edge-cases.test.ts`)

```typescript
describe('E2E: Edge Cases', () => {
  test('empty Serverless project (only provider)', async () => {
    // No functions, no resources
    // Should complete without errors
  });

  test('project with only custom CloudFormation resources', async () => {
    // No Serverless functions
    // Just resources: section
  });

  test('extremely large project (100+ resources)', async () => {
    // Performance test
    // Should complete in reasonable time (<5 minutes)
  });

  test('project with complex dependencies', async () => {
    // Deep dependency tree
    // Should resolve correctly
  });

  test('project with intrinsic functions everywhere', async () => {
    // Heavy use of Ref, Fn::GetAtt, Fn::Sub, Fn::Join
    // Should transform all correctly
  });

  test('project with multiple serverless.yml files (monorepo)', async () => {
    // Should handle or reject gracefully
  });

  test('project with TypeScript Serverless config', async () => {
    // serverless.ts instead of serverless.yml
    // May need compilation step
  });
});
```

### 3.3 Verification Tests (`e2e-verification.test.ts`)

```typescript
describe('E2E: Post-Migration Verification', () => {
  test('CDK synthesized template matches Serverless template', async () => {
    // After migration, synth CDK
    // Compare outputs
    // Should be identical for imported resources
  });

  test('CDK deploy (dry-run) succeeds', async () => {
    // cdk deploy --dry-run
    // Should show import operations, not create
  });

  test('logical IDs match exactly', async () => {
    // Critical for import
    // Every imported resource must have matching logical ID
  });

  test('physical IDs match exactly', async () => {
    // BucketName, TableName, etc.
    // Must be identical
  });

  test('no resource replacement operations', async () => {
    // CDK diff should show imports only
    // No updates or replacements
  });
});
```

---

## 4. Test Data & Mocks

### 4.1 Mock Data Requirements

**CloudFormation Templates**:
- `fixtures/cloudformation-sls.json` ✅ (exists)
- `fixtures/cloudformation-cdk.json` ✅ (exists)
- `fixtures/cloudformation-large.json` (1000+ resources) ❌ TODO
- `fixtures/cloudformation-nested.json` (deeply nested properties) ❌ TODO
- `fixtures/cloudformation-intrinsic.json` (heavy intrinsic functions) ❌ TODO

**Serverless Configs**:
- `fixtures/serverless.yml` ✅ (exists)
- `fixtures/serverless-multi-function.yml` ❌ TODO
- `fixtures/serverless-custom-resources.yml` ❌ TODO
- `fixtures/serverless-complex.yml` (EventBridge, Step Functions) ❌ TODO

**Expected Outputs**:
- `fixtures/expected-cdk-stack.ts` ❌ TODO
- `fixtures/expected-comparison-report.json` ❌ TODO

### 4.2 AWS SDK Mocks

**Existing**: `tests/mocks/aws-sdk.ts` ✅

**Enhancements Needed**:
- ❌ Mock CloudFormation DescribeStacks
- ❌ Mock DynamoDB DescribeTable
- ❌ Mock S3 GetBucketLocation
- ❌ Mock CloudWatch Logs DescribeLogGroups
- ❌ Mock error scenarios (throttling, not found, access denied)

---

## 5. Test Execution Strategy

### 5.1 Test Organization

```
tests/
├── unit/                          # Fast, isolated tests
│   ├── generator/
│   │   ├── typescript-generator.test.ts   ← NEW: Property transformers
│   │   ├── construct-mapping.test.ts      ← NEW: L1/L2 mapping
│   │   └── intrinsic-functions.test.ts    ← NEW: Fn::* handling
│   ├── scanner/
│   │   ├── resource-classifier.test.ts    ← ENHANCE: Edge cases
│   │   └── dependency-graph.test.ts       ← ENHANCE: Circular deps
│   ├── comparator/
│   │   ├── template-comparison.test.ts    ← NEW: Advanced matching
│   │   ├── property-comparator.test.ts    ✅ (exists)
│   │   └── report-generator.test.ts       ✅ (exists)
│   └── orchestrator/
│       ├── state-machine.test.ts          ✅ (exists)
│       ├── dry-run.test.ts                ← NEW: Dry-run verification
│       └── error-handling.test.ts         ← NEW: Error recovery
├── integration/                   # Multi-module tests
│   ├── multi-resource-migration.test.ts   ← NEW: Complex scenarios
│   ├── error-recovery.test.ts             ← NEW: Failure handling
│   ├── rollback.test.ts                   ← NEW: Rollback scenarios
│   └── state-management.test.ts           ✅ (exists)
└── e2e/                           # Full workflow tests
    ├── real-projects.test.ts              ← NEW: Real Serverless projects
    ├── edge-cases.test.ts                 ← NEW: Unusual scenarios
    └── verification.test.ts               ← NEW: Post-migration checks
```

### 5.2 Test Execution Commands

```bash
# Unit tests (fast, runs frequently)
npm run test:unit

# Integration tests (slower, runs before commit)
npm run test:integration

# E2E tests (slowest, runs in CI/CD)
npm run test:e2e

# All tests
npm test

# Coverage report
npm run test:coverage

# Watch mode (for TDD)
npm run test:watch

# Specific test file
npm test -- typescript-generator.test.ts
```

### 5.3 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:e2e
```

---

## 6. Critical Test Cases

### 6.1 MUST-PASS Tests (Blockers)

**These tests MUST pass before any release**:

1. ✅ **Logical ID Preservation**: CDK must preserve exact CloudFormation logical IDs
2. ✅ **Physical ID Matching**: BucketName, TableName, etc. must match exactly
3. ✅ **Stateful Resource Classification**: DynamoDB, S3, LogGroups classified as IMPORT
4. ✅ **Property Transformation Accuracy**: L2 constructs generate correct properties
5. ✅ **Dry-Run Safety**: Dry-run mode NEVER modifies files
6. ✅ **Comparison Blocking Issues**: Critical mismatches prevent import
7. ✅ **RemovalPolicy.RETAIN**: All imported resources have RETAIN policy
8. ✅ **Rollback Integrity**: Rollback restores previous state correctly

### 6.2 HIGH-PRIORITY Tests

**Important but non-blocking**:

1. ⚠️ **Large Template Performance**: 1000+ resources in <5 minutes
2. ⚠️ **Error Recovery**: Graceful handling of all error scenarios
3. ⚠️ **Multi-Resource Dependencies**: Complex dependency graphs
4. ⚠️ **Intrinsic Functions**: All Fn::* transformed correctly
5. ⚠️ **Report Generation**: Accurate HTML/JSON reports

---

## 7. Test Metrics & Monitoring

### 7.1 Coverage Metrics

**Track these metrics in CI/CD**:
- Statement coverage (target: >80%)
- Branch coverage (target: >75%)
- Function coverage (target: >85%)
- Line coverage (target: >80%)

### 7.2 Performance Benchmarks

**Track execution time**:
- Unit tests: <30 seconds total
- Integration tests: <2 minutes total
- E2E tests: <10 minutes total
- Full suite: <15 minutes total

### 7.3 Flakiness Monitoring

**Track flaky tests**:
- Any test that fails intermittently
- Root cause analysis required
- Fix or quarantine

---

## 8. Test Maintenance

### 8.1 Test Data Updates

- Update fixtures when CloudFormation schema changes
- Add new resource types as AWS releases them
- Keep real-world project fixtures current

### 8.2 Mock Updates

- Update AWS SDK mocks when SDK version changes
- Add new mocked services as needed
- Keep error scenarios realistic

### 8.3 Documentation

- Keep this test plan updated
- Document new test patterns
- Share testing best practices with team

---

## 9. Next Steps

### Phase 1: Unit Test Implementation (Week 1)
1. ✅ Create `typescript-generator.test.ts` with property transformer tests
2. ✅ Enhance `resource-classifier.test.ts` with edge cases
3. ✅ Create `template-comparison.test.ts` for advanced matching
4. ✅ Create `dry-run.test.ts` for safety verification

### Phase 2: Integration Tests (Week 2)
1. ✅ Create `multi-resource-migration.test.ts`
2. ✅ Create `error-recovery.test.ts`
3. ✅ Create `rollback.test.ts`
4. ✅ Enhance existing integration tests

### Phase 3: E2E Tests (Week 3)
1. ✅ Create `real-projects.test.ts` with actual Serverless projects
2. ✅ Create `edge-cases.test.ts` for unusual scenarios
3. ✅ Create `verification.test.ts` for post-migration checks
4. ✅ Set up CI/CD pipeline

### Phase 4: Test Data & Documentation (Week 4)
1. ✅ Create missing fixture files
2. ✅ Enhance AWS SDK mocks
3. ✅ Document test patterns and best practices
4. ✅ Achieve >80% code coverage

---

## 10. Success Criteria

### Testing Complete When:
- ✅ All critical test cases pass
- ✅ Code coverage >80% (statements, branches, functions, lines)
- ✅ All edge cases documented and tested
- ✅ CI/CD pipeline running all tests
- ✅ No flaky tests
- ✅ All test data fixtures created
- ✅ Test plan reviewed and approved

### Migration Tool Ready When:
- ✅ 100% of MUST-PASS tests passing
- ✅ 90% of HIGH-PRIORITY tests passing
- ✅ E2E tests with real projects succeeding
- ✅ Performance benchmarks met
- ✅ Dry-run mode verified safe
- ✅ Rollback tested and working

---

## Appendix A: Test Templates

### Unit Test Template

```typescript
/**
 * Unit tests for [Module Name]
 */

import { ModuleUnderTest } from '@/path/to/module';

describe('ModuleUnderTest', () => {
  let instance: ModuleUnderTest;

  beforeEach(() => {
    instance = new ModuleUnderTest();
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = {};

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle edge case', () => {
      // Test edge case
    });

    it('should throw on invalid input', () => {
      // Test error handling
    });
  });
});
```

### Integration Test Template

```typescript
/**
 * Integration tests for [Feature Name]
 */

describe('Integration: Feature Name', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = await setupTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should complete full workflow', async () => {
    // Multi-step integration test
  });
});
```

### E2E Test Template

```typescript
/**
 * End-to-end tests for [Scenario Name]
 */

describe('E2E: Scenario Name', () => {
  it('should migrate complete project', async () => {
    // Full migration from start to finish
  }, 60000); // 60 second timeout
});
```

---

## Appendix B: Testing Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One Assertion Per Test**: Focus on single behavior
3. **Descriptive Test Names**: Should read like documentation
4. **Test Isolation**: No shared state between tests
5. **Fast Execution**: Unit tests <100ms each
6. **Deterministic**: Same input = same output, every time
7. **Mock External Dependencies**: No real AWS API calls in unit tests
8. **Test Edge Cases**: Empty, null, undefined, max values
9. **Test Error Paths**: Don't just test happy path
10. **Keep Tests Simple**: Tests should be easier to understand than code

---

**Document Version**: 1.0
**Last Updated**: 2025-10-21
**Author**: QA Specialist Agent
**Status**: Ready for Implementation
