# Sprint 2 Specification: Clean IAM Role Generation

**Sprint**: 2 of 5
**SPARC Phase**: Specification
**Goal**: Generate idiomatic IAM roles with managed policies and clean custom permissions
**Dependencies**: Sprint 1 (Resource Classification Enhancement)
**Target**: 60% code reduction for IAM roles

---

## 1. Requirements

### Must Have

#### 1.1 Managed Policy Detection and Usage
- **Detect** when an IAM role matches AWS managed policies
- **Generate** managed policy references instead of inline policies
- **Support** `service-role/AWSLambdaBasicExecutionRole` (Sprint 1 already detects this)
- **Validate** that managed policies provide equivalent permissions

**Acceptance**:
- IAM roles with BasicExecutionRole pattern generate `ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")`
- No inline policies generated for permissions covered by managed policies

#### 1.2 Custom Permission Generation
- **Use** `role.addToPolicy()` pattern for custom permissions
- **Generate** clean `PolicyStatement` objects with:
  - `actions`: Array of IAM actions
  - `effect`: `Effect.ALLOW` (or DENY if applicable)
  - `resources`: Construct references when possible
- **Group** related permissions together
- **Separate** custom permissions from managed policies

**Acceptance**:
- Custom permissions use `addToPolicy()` not inline policies
- Each permission has clear actions and resources
- Code is readable and maintainable

#### 1.3 Construct Reference Resolution
- **Replace** ARN strings with construct references
- **Resolve** `Fn::GetAtt`, `Ref`, `Fn::Sub` to TypeScript constructs
- **Use** resource ARN properties (e.g., `table.tableArn`, `bucket.bucketArn`)
- **Fall back** to string ARNs when construct not available
- **Handle** cross-stack references

**Acceptance**:
- DynamoDB table ARNs → `counterTable.tableArn`
- S3 bucket ARNs → `deploymentBucket.bucketArn`
- Lambda ARNs → `otherFunction.functionArn`
- Log group ARNs → `logGroup.logGroupArn`

#### 1.4 Code Size Reduction
- **Target**: 60% reduction in IAM role code size
- **Measure**: Compare lines of code before and after
- **Baseline**: Current generated code (25+ lines per role)
- **Goal**: Clean generated code (10 lines per role)

**Acceptance**:
- Measured reduction of ≥60% on real Serverless templates
- Readability improved (human review)
- Functionality preserved (integration tests pass)

#### 1.5 Multiple Policy Handling
- **Support** roles with both managed and inline policies
- **Merge** multiple inline policies into `addToPolicy()` calls
- **Deduplicate** permissions covered by managed policies
- **Preserve** all unique permissions

**Acceptance**:
- Roles with 2+ policies generate correctly
- No duplicate permissions
- All unique permissions preserved

### Should Have

#### 2.1 Policy Grouping and Organization
- **Group** related permissions together logically
- **Order** permissions by service (DynamoDB, S3, Logs, etc.)
- **Add** helpful comments for complex permissions
- **Separate** different resource types

**Acceptance**:
- DynamoDB permissions grouped together
- S3 permissions grouped together
- Comments explain non-obvious permissions

#### 2.2 Permission Optimization
- **Detect** overly broad permissions (e.g., `s3:*`)
- **Warn** when least privilege could be improved
- **Suggest** more specific actions when possible
- **Flag** wildcard resources

**Acceptance**:
- Warnings generated for `*` actions
- Suggestions provided for common patterns
- Code includes TODO comments for review

#### 2.3 Edge Case Handling
- **Handle** missing policy properties gracefully
- **Support** conditions in policy statements
- **Preserve** policy names and metadata
- **Handle** principals other than services

**Acceptance**:
- No crashes on malformed policies
- Conditions preserved in generated code
- Metadata retained where useful

### Nice to Have

#### 3.1 Managed Policy Expansion
- **Detect** additional managed policies:
  - `AWSLambdaVPCAccessExecutionRole`
  - `AWSXRayDaemonWriteAccess`
  - `CloudWatchLambdaInsightsExecutionRolePolicy`
- **Auto-detect** based on action patterns
- **Suggest** when custom policies match managed equivalents

#### 3.2 Least Privilege Suggestions
- **Analyze** permissions for over-privileges
- **Suggest** least privilege improvements
- **Recommend** resource-level restrictions
- **Flag** admin-level permissions

#### 3.3 Policy Testing
- **Generate** test cases for IAM policies
- **Validate** permissions are sufficient
- **Check** for missing permissions
- **Verify** least privilege compliance

---

## 2. Acceptance Criteria

### Success Metrics

#### 2.1 Code Quality
- **60%+ reduction** in IAM role code size
  - Baseline: 25-30 lines per role (current)
  - Target: 10-12 lines per role (Sprint 2)
- **100% test coverage** for IAMRoleGenerator
- **Zero inline policies** when managed policies available
- **90%+ construct references** (vs string ARNs)

#### 2.2 Functional Correctness
- **All permissions preserved** (no functionality loss)
- **IAM policies validate** with AWS IAM policy simulator
- **Generated code compiles** without errors
- **Integration tests pass** (deploy to AWS successfully)

#### 2.3 Developer Experience
- **Code is readable** (human review approval)
- **Intent is clear** (obvious what permissions do)
- **Easy to modify** (add/remove permissions)
- **Consistent patterns** (all roles follow same style)

### Verification Methods

#### 2.4 Automated Testing
- **Unit tests**: 20+ tests covering all scenarios
- **Integration tests**: 5+ real Serverless templates
- **Edge case tests**: 5+ unusual configurations
- **Regression tests**: Compare old vs new generated code

#### 2.5 Manual Review
- **Code review** by senior developer
- **Readability assessment** (5-point scale)
- **Maintainability check** (can modify easily?)
- **AWS deployment** (actually works in AWS?)

#### 2.6 Performance Benchmarks
- **Code size reduction** measured on 10+ templates
- **Generation speed** (should not slow down)
- **Memory usage** (should not increase significantly)

---

## 3. Edge Cases

### Scenario 1: Roles with Multiple Policies
**Input**: IAM role with 3 inline policies
```json
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "Policies": [
      { "PolicyName": "logs", "PolicyDocument": {...} },
      { "PolicyName": "dynamodb", "PolicyDocument": {...} },
      { "PolicyName": "s3", "PolicyDocument": {...} }
    ]
  }
}
```

**Expected Output**:
```typescript
const role = new Role(this, "LambdaRole", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

// DynamoDB permissions
role.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
  effect: Effect.ALLOW,
  resources: [counterTable.tableArn]
}));

// S3 permissions
role.addToPolicy(new PolicyStatement({
  actions: ["s3:GetObject", "s3:PutObject"],
  effect: Effect.ALLOW,
  resources: [deploymentBucket.bucketArn]
}));
```

**Test**: `should merge multiple policies into separate addToPolicy calls`

### Scenario 2: Roles with Both Managed and Inline Policies
**Input**: IAM role with managed policy ARN + inline policy
```json
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "ManagedPolicyArns": [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    ],
    "Policies": [
      { "PolicyName": "custom", "PolicyDocument": {...} }
    ]
  }
}
```

**Expected Output**:
```typescript
const role = new Role(this, "LambdaRole", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

role.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:Query"],
  effect: Effect.ALLOW,
  resources: [table.tableArn]
}));
```

**Test**: `should preserve explicit managed policies and add custom permissions`

### Scenario 3: Missing Policy Properties
**Input**: IAM role with incomplete policy
```json
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "AssumedRolePolicyDocument": {...}
    // No Policies property
  }
}
```

**Expected Output**:
```typescript
const role = new Role(this, "LambdaRole", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com")
});
```

**Test**: `should handle roles with no policies gracefully`

### Scenario 4: Complex Resource References
**Input**: Policy with `Fn::GetAtt`, `Fn::Sub`, and `Ref`
```json
{
  "Statement": [{
    "Resource": [
      { "Fn::GetAtt": ["CounterTable", "Arn"] },
      { "Fn::Sub": "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${TableName}/*" },
      { "Ref": "DeploymentBucket" }
    ]
  }]
}
```

**Expected Output**:
```typescript
role.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:*"],
  effect: Effect.ALLOW,
  resources: [
    counterTable.tableArn,
    `${counterTable.tableArn}/*`,
    deploymentBucket.bucketArn
  ]
}));
```

**Test**: `should resolve complex CloudFormation intrinsic functions`

### Scenario 5: Non-Lambda Roles
**Input**: IAM role for API Gateway, not Lambda
```json
{
  "Type": "AWS::IAM::Role",
  "Properties": {
    "AssumedRolePolicyDocument": {
      "Statement": [{
        "Principal": { "Service": "apigateway.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }
  }
}
```

**Expected Output**:
```typescript
const role = new Role(this, "ApiGatewayRole", {
  assumedBy: new ServicePrincipal("apigateway.amazonaws.com")
});
```

**Test**: `should handle non-Lambda service principals correctly`

---

## 4. API Design

### 4.1 Classes and Methods

#### IAMRoleGenerator
Primary class for generating clean IAM role code.

```typescript
export class IAMRoleGenerator {
  /**
   * Generates clean TypeScript CDK code for an IAM role
   *
   * @param resource - Classified IAM role resource from Sprint 1
   * @param context - Generator context with available resources
   * @returns TypeScript CDK code string
   */
  generateRole(
    resource: ClassifiedResource,
    context: GeneratorContext
  ): string;

  /**
   * Analyzes role permissions to separate managed vs custom
   *
   * @param resource - IAM role resource
   * @returns Object with managed policies and custom permissions
   */
  private analyzePermissions(
    resource: ClassifiedResource
  ): {
    managedPolicies: string[];
    customPermissions: PolicyStatement[];
  };

  /**
   * Generates role declaration with managed policies
   *
   * @param resource - IAM role resource
   * @param managedPolicies - Array of managed policy names
   * @returns TypeScript code for role declaration
   */
  private generateRoleDeclaration(
    resource: ClassifiedResource,
    managedPolicies: string[]
  ): string;

  /**
   * Generates addToPolicy calls for custom permissions
   *
   * @param resource - IAM role resource
   * @param permissions - Custom policy statements
   * @param context - Generator context
   * @returns TypeScript code for custom permissions
   */
  private generateCustomPermissions(
    resource: ClassifiedResource,
    permissions: PolicyStatement[],
    context: GeneratorContext
  ): string;

  /**
   * Resolves CloudFormation resource references to construct references
   *
   * @param resources - Array of resource ARN references
   * @param context - Generator context
   * @returns Array of TypeScript construct references
   */
  private resolveResourceReferences(
    resources: any[],
    context: GeneratorContext
  ): string[];

  /**
   * Checks if a policy is covered by managed policies
   *
   * @param policy - Policy document to check
   * @param managedPolicies - Managed policy names
   * @returns true if covered by managed policy
   */
  private isCoveredByManagedPolicy(
    policy: any,
    managedPolicies: string[]
  ): boolean;

  /**
   * Extracts IAM policies from role resource
   *
   * @param resource - IAM role resource
   * @returns Array of policy documents
   */
  private extractPolicies(
    resource: ClassifiedResource
  ): any[];

  /**
   * Converts logical ID to TypeScript variable name
   *
   * @param logicalId - CloudFormation logical ID
   * @returns Valid TypeScript variable name
   */
  private toVariableName(logicalId: string): string;

  /**
   * Extracts role name from resource properties
   *
   * @param resource - IAM role resource
   * @returns Role name string
   */
  private extractRoleName(
    resource: ClassifiedResource
  ): string;

  /**
   * Extracts assumed by service principal
   *
   * @param resource - IAM role resource
   * @returns Service principal string (e.g., "lambda.amazonaws.com")
   */
  private extractAssumedBy(
    resource: ClassifiedResource
  ): string;
}
```

#### PolicyStatement Interface
Represents a single IAM policy statement.

```typescript
interface PolicyStatement {
  actions: string[];
  effect: 'Allow' | 'Deny';
  resources: any[];
  conditions?: any;
}
```

#### GeneratorContext Interface
Context passed to generator with available resources.

```typescript
interface GeneratorContext {
  resources: ClassifiedResource[];
  resourceMap: Map<string, ClassifiedResource>;
  variableNames: Map<string, string>;
  imports: Set<string>;
}
```

### 4.2 Input/Output Contracts

#### Input: ClassifiedResource
From Sprint 1, includes:
- `LogicalId`: CloudFormation logical ID
- `Type`: "AWS::IAM::Role"
- `Properties`: Role properties including policies
- `managedPolicyEquivalent`: From Sprint 1 (e.g., "service-role/AWSLambdaBasicExecutionRole")
- `relatedResources`: Array of related resource IDs
- `groupId`: "iam"

#### Output: TypeScript Code String
Clean, formatted TypeScript CDK code:
```typescript
const lambdaRole = new Role(this, "IamRoleLambdaExecution", {
  roleName: "migration-sandbox-dev-us-east-1-lambdaRole",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

lambdaRole.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:UpdateItem"],
    effect: Effect.ALLOW,
    resources: [counterTable.tableArn]
  })
);
```

### 4.3 Integration Points

#### Integration with Sprint 1 (ResourceClassifier)
```typescript
// Sprint 1 provides classified resources
const classifier = new ResourceClassifier();
const classified = classifier.classifyResources([iamRole], 'IamRoleLambdaExecution');

// Sprint 2 uses classification metadata
const generator = new IAMRoleGenerator();
const code = generator.generateRole(classified[0], context);
```

#### Integration with Existing Generator
```typescript
// src/modules/generator/index.ts
import { IAMRoleGenerator } from './iam-role-generator';

class CDKGenerator {
  private iamGenerator = new IAMRoleGenerator();

  generateResources(resources: ClassifiedResource[]): string {
    return resources.map(resource => {
      if (resource.Type === 'AWS::IAM::Role') {
        return this.iamGenerator.generateRole(resource, this.context);
      }
      // ... other resource types
    }).join('\n\n');
  }
}
```

#### Integration with Code Cleaner (Sprint 3)
```typescript
// Sprint 3 will use IAM generator output
const rawCode = iamGenerator.generateRole(resource, context);
const cleanCode = codeCleaner.clean(rawCode); // Sprint 3
```

---

## 5. Test Strategy

### 5.1 Unit Tests (20+ tests)

#### Managed Policy Detection Tests (5 tests)
```typescript
describe('IAMRoleGenerator - Managed Policies', () => {
  test('should generate role with BasicExecutionRole managed policy', () => {
    const role = createMockLambdaRole();
    role.managedPolicyEquivalent = 'service-role/AWSLambdaBasicExecutionRole';

    const code = generator.generateRole(role, context);

    expect(code).toContain('ManagedPolicy.fromAwsManagedPolicyName');
    expect(code).toContain('AWSLambdaBasicExecutionRole');
    expect(code).not.toContain('inlinePolicies');
  });

  test('should not use managed policy when custom actions present', () => {
    const role = createMockLambdaRoleWithCustomActions();

    const code = generator.generateRole(role, context);

    expect(code).toContain('addToPolicy');
  });

  test('should handle explicit managed policy ARNs', () => {
    const role = createMockRoleWithManagedPolicyArn();

    const code = generator.generateRole(role, context);

    expect(code).toContain('ManagedPolicy.fromAwsManagedPolicyName');
  });

  test('should combine detected and explicit managed policies', () => {
    const role = createMockRoleWithBothManagedPolicies();

    const code = generator.generateRole(role, context);

    const managedPolicyCount = (code.match(/ManagedPolicy.fromAwsManagedPolicyName/g) || []).length;
    expect(managedPolicyCount).toBe(2);
  });

  test('should handle role with no managed policies', () => {
    const role = createMockRoleWithOnlyCustomPolicies();

    const code = generator.generateRole(role, context);

    expect(code).not.toContain('managedPolicies');
    expect(code).toContain('addToPolicy');
  });
});
```

#### Custom Permission Tests (5 tests)
```typescript
describe('IAMRoleGenerator - Custom Permissions', () => {
  test('should use addToPolicy for custom permissions', () => {
    const role = createMockLambdaRoleWithDynamoDB();

    const code = generator.generateRole(role, context);

    expect(code).toContain('.addToPolicy(');
    expect(code).toContain('new PolicyStatement({');
    expect(code).toContain('dynamodb:UpdateItem');
  });

  test('should generate multiple addToPolicy calls for multiple permissions', () => {
    const role = createMockRoleWithMultiplePermissions();

    const code = generator.generateRole(role, context);

    const addToPolicyCount = (code.match(/\.addToPolicy\(/g) || []).length;
    expect(addToPolicyCount).toBe(3);
  });

  test('should group permissions by service', () => {
    const role = createMockRoleWithMixedPermissions();

    const code = generator.generateRole(role, context);

    // DynamoDB permissions should come before S3
    const dynamoIndex = code.indexOf('dynamodb:');
    const s3Index = code.indexOf('s3:');
    expect(dynamoIndex).toBeLessThan(s3Index);
  });

  test('should handle permissions with conditions', () => {
    const role = createMockRoleWithConditionalPermissions();

    const code = generator.generateRole(role, context);

    expect(code).toContain('conditions:');
  });

  test('should preserve all unique permissions', () => {
    const role = createMockRoleWithUniquePermissions();

    const code = generator.generateRole(role, context);

    expect(code).toContain('dynamodb:GetItem');
    expect(code).toContain('dynamodb:PutItem');
    expect(code).toContain('s3:GetObject');
  });
});
```

#### Resource Reference Tests (5 tests)
```typescript
describe('IAMRoleGenerator - Resource References', () => {
  test('should resolve DynamoDB table ARN to construct reference', () => {
    const role = createMockRoleWithDynamoDBPermission();
    const context = createContextWithDynamoDBTable();

    const code = generator.generateRole(role, context);

    expect(code).toContain('counterTable.tableArn');
    expect(code).not.toContain('arn:aws:dynamodb');
  });

  test('should resolve S3 bucket ARN to construct reference', () => {
    const role = createMockRoleWithS3Permission();
    const context = createContextWithS3Bucket();

    const code = generator.generateRole(role, context);

    expect(code).toContain('deploymentBucket.bucketArn');
  });

  test('should handle Fn::GetAtt references', () => {
    const role = createMockRoleWithGetAttReference();

    const code = generator.generateRole(role, context);

    expect(code).toContain('counterTable.tableArn');
  });

  test('should handle Fn::Sub with template variables', () => {
    const role = createMockRoleWithFnSub();

    const code = generator.generateRole(role, context);

    // Should generate template literal or construct reference
    expect(code).toMatch(/`.*\$\{.*\}`|\.tableArn/);
  });

  test('should fall back to string ARN when construct unavailable', () => {
    const role = createMockRoleWithExternalResource();
    const context = createContextWithoutExternalResource();

    const code = generator.generateRole(role, context);

    expect(code).toContain('"arn:aws:');
  });
});
```

#### Edge Case Tests (5 tests)
```typescript
describe('IAMRoleGenerator - Edge Cases', () => {
  test('should handle role with no policies', () => {
    const role = createMockRoleWithoutPolicies();

    const code = generator.generateRole(role, context);

    expect(code).toContain('new Role(');
    expect(code).not.toContain('addToPolicy');
  });

  test('should handle API Gateway service principal', () => {
    const role = createMockApiGatewayRole();

    const code = generator.generateRole(role, context);

    expect(code).toContain('apigateway.amazonaws.com');
  });

  test('should handle role with both managed and inline policies', () => {
    const role = createMockRoleWithBothPolicyTypes();

    const code = generator.generateRole(role, context);

    expect(code).toContain('managedPolicies');
    expect(code).toContain('addToPolicy');
  });

  test('should handle malformed policy gracefully', () => {
    const role = createMockRoleWithMalformedPolicy();

    expect(() => generator.generateRole(role, context)).not.toThrow();
  });

  test('should deduplicate permissions covered by managed policies', () => {
    const role = createMockRoleWithDuplicatePermissions();
    role.managedPolicyEquivalent = 'service-role/AWSLambdaBasicExecutionRole';

    const code = generator.generateRole(role, context);

    // Should not contain logs:CreateLogStream since it's in BasicExecutionRole
    const logsCount = (code.match(/logs:CreateLogStream/g) || []).length;
    expect(logsCount).toBe(0);
  });
});
```

### 5.2 Integration Tests (5+ tests)

#### Real Serverless Template Tests
```typescript
describe('IAMRoleGenerator - Integration', () => {
  test('should generate clean IAM roles from Serverless template', async () => {
    const template = await loadFixture('serverless-counter-app.yml');
    const resources = await parseTemplate(template);
    const classified = classifier.classifyResources(resources);
    const iamRoles = classified.filter(r => r.Type === 'AWS::IAM::Role');

    const generatedCode = iamRoles.map(role =>
      generator.generateRole(role, context)
    ).join('\n\n');

    // Verify managed policies used
    expect(generatedCode).toContain('AWSLambdaBasicExecutionRole');

    // Verify addToPolicy pattern
    expect(generatedCode).toContain('.addToPolicy(');

    // Verify code reduction
    const oldGeneratorCode = oldGenerator.generateIAMRole(iamRoles[0]);
    const reduction = 1 - (generatedCode.length / oldGeneratorCode.length);
    expect(reduction).toBeGreaterThanOrEqual(0.6); // 60%+ reduction
  });

  test('should generate working CDK stack that compiles', async () => {
    const template = await loadFixture('complex-serverless-app.yml');
    const stack = await generateFullCDKStack(template);

    // Write to temp file and compile
    const tempDir = await createTempProject();
    await writeFile(`${tempDir}/lib/stack.ts`, stack);

    const { exitCode, stderr } = await exec('npx tsc --noEmit', { cwd: tempDir });

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
  });

  test('should deploy successfully to AWS', async () => {
    const template = await loadFixture('simple-lambda-app.yml');
    const stack = await generateFullCDKStack(template);

    const { success, errors } = await deployCDKStack(stack, 'test-sprint2-stack');

    expect(success).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('should preserve all permissions functionally', async () => {
    const originalTemplate = await loadCloudFormationTemplate('deployed-stack');
    const generatedStack = await generateCDKStack(originalTemplate);

    const originalPermissions = extractPermissions(originalTemplate);
    const generatedPermissions = extractPermissions(generatedStack);

    expect(generatedPermissions).toEqual(originalPermissions);
  });

  test('should handle complex multi-role template', async () => {
    const template = await loadFixture('multi-role-template.yml');
    const classified = await classifyResources(template);
    const roles = classified.filter(r => r.Type === 'AWS::IAM::Role');

    expect(roles.length).toBeGreaterThan(3);

    const code = roles.map(r => generator.generateRole(r, context));

    // All roles should compile
    expect(() => code.forEach(validateTypeScript)).not.toThrow();
  });
});
```

### 5.3 Coverage Targets

**Target**: 100% coverage of IAMRoleGenerator

**Metrics**:
- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

**Tools**:
- Jest with coverage
- Istanbul/nyc
- Codecov for tracking

---

## 6. Examples

### 6.1 Before (Current Generated Code)

```typescript
// ❌ Current: Verbose, 28 lines, inline policies
const iamRoleLambdaExecution = new iam.Role(this, 'IamRoleLambdaExecution', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  inlinePolicies: {
    lambdaPolicy: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogStream',
            'logs:CreateLogGroup'
          ],
          resources: [
            cdk.Fn.sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/migration-sandbox-counter:*')
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:PutLogEvents'
          ],
          resources: [
            cdk.Fn.sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/migration-sandbox-counter:*:*')
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:UpdateItem'
          ],
          resources: [
            cdk.Fn.sub('arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CounterTable')
          ]
        })
      ]
    })
  },
  path: '/',
  roleName: cdk.Fn.join('-', ['migration-sandbox', 'dev', cdk.Stack.of(this).region, 'lambdaRole'])
});
```

**Issues**:
- 28 lines of code
- Inline policies instead of managed policies
- String ARN substitutions instead of construct references
- Logs permissions should use BasicExecutionRole
- Hard to read and modify

### 6.2 After (Target Generated Code)

```typescript
// ✅ Sprint 2: Clean, 12 lines, managed policies + construct references
const iamRoleLambdaExecution = new Role(this, "IamRoleLambdaExecution", {
  roleName: `migration-sandbox-dev-${Stack.of(this).region}-lambdaRole`,
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

iamRoleLambdaExecution.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:UpdateItem"],
    effect: Effect.ALLOW,
    resources: [counterTable.tableArn]
  })
);
```

**Improvements**:
- 12 lines (57% reduction)
- Managed policy for logs permissions
- Construct reference (`counterTable.tableArn`)
- Clear, readable, maintainable
- Easy to add/remove permissions

### 6.3 Complex Example: Multiple Services

#### Before (Current)
```typescript
// ❌ 45+ lines, verbose, hard to understand
const role = new iam.Role(this, 'ComplexRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  inlinePolicies: {
    policy1: new iam.PolicyDocument({
      statements: [
        // 15 lines for DynamoDB permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
          resources: [
            cdk.Fn.sub('arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/Table1'),
            cdk.Fn.sub('arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/Table2')
          ]
        }),
        // 10 lines for S3 permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:PutObject'],
          resources: [
            cdk.Fn.sub('arn:${AWS::Partition}:s3:::my-bucket/*')
          ]
        }),
        // 10 lines for logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*']
        })
      ]
    })
  }
});
```

#### After (Sprint 2)
```typescript
// ✅ 18 lines, organized, clear
const complexRole = new Role(this, "ComplexRole", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

// DynamoDB permissions
complexRole.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
  effect: Effect.ALLOW,
  resources: [table1.tableArn, table2.tableArn]
}));

// S3 permissions
complexRole.addToPolicy(new PolicyStatement({
  actions: ["s3:GetObject", "s3:PutObject"],
  effect: Effect.ALLOW,
  resources: [`${myBucket.bucketArn}/*`]
}));
```

**Improvements**:
- 18 lines vs 45 lines (60% reduction)
- Grouped by service (DynamoDB, S3)
- Managed policy for logs
- Construct references throughout
- Easy to see what permissions do what

---

## 7. Non-Functional Requirements

### 7.1 Performance
- **Generation Speed**: No slower than current generator
- **Memory Usage**: No significant increase (<10%)
- **Compilation Time**: Generated code compiles as fast as before

### 7.2 Maintainability
- **Code Quality**: Follows TypeScript best practices
- **Documentation**: All public methods documented
- **Tests**: 100% coverage, clear test names
- **Error Messages**: Helpful error messages for debugging

### 7.3 Extensibility
- **New Managed Policies**: Easy to add new managed policy patterns
- **New Services**: Easy to add new service principals
- **Custom Patterns**: Easy to add custom permission patterns

### 7.4 Compatibility
- **CDK Versions**: Compatible with AWS CDK v2.x
- **TypeScript Versions**: Works with TypeScript 4.x and 5.x
- **Node Versions**: Works with Node 16, 18, 20

---

## 8. Implementation Timeline

### Phase 1: Foundation (Days 1-2)
- [ ] Create IAMRoleGenerator class skeleton
- [ ] Implement basic role declaration generation
- [ ] Write first 5 unit tests

### Phase 2: Managed Policies (Days 3-4)
- [ ] Implement managed policy detection
- [ ] Generate managed policy references
- [ ] Write managed policy tests

### Phase 3: Custom Permissions (Days 5-6)
- [ ] Implement addToPolicy generation
- [ ] Handle multiple permissions
- [ ] Write custom permission tests

### Phase 4: Resource References (Days 7-8)
- [ ] Implement resource reference resolution
- [ ] Handle Fn::GetAtt, Ref, Fn::Sub
- [ ] Write resource reference tests

### Phase 5: Integration (Days 9-10)
- [ ] Integrate with existing generator
- [ ] Write integration tests
- [ ] Test with real Serverless templates

### Phase 6: Polish (Days 11-12)
- [ ] Code review and refactoring
- [ ] Documentation
- [ ] Manual testing and verification

**Total**: ~12 days (2.5 weeks)

---

## 9. Risk Assessment

### High Risk
**Complex Resource References** (Fn::Sub with multiple variables)
- **Mitigation**: Start with simple cases, add complexity incrementally
- **Fallback**: Use string ARNs when unable to resolve

### Medium Risk
**Managed Policy Deduplication** (avoiding duplicate permissions)
- **Mitigation**: Comprehensive test coverage
- **Fallback**: Generate both managed and custom if uncertain

### Low Risk
**Performance Impact** (slower generation)
- **Mitigation**: Profile and optimize hot paths
- **Fallback**: Acceptable if < 10% slower

---

## 10. Success Definition

Sprint 2 is **COMPLETE** when:

✅ **All Must Have requirements implemented**
- Managed policy detection works
- Custom permissions use addToPolicy
- Resource references resolved
- 60%+ code reduction achieved
- Multiple policies handled

✅ **All tests passing**
- 20+ unit tests (100% coverage)
- 5+ integration tests
- Edge case tests
- Manual verification complete

✅ **Code quality approved**
- Human review: "Easy to understand"
- Compiles without errors
- Deploys to AWS successfully
- All permissions preserved

✅ **Documentation complete**
- API documentation
- Test documentation
- Examples provided
- Sprint completion report

---

## 11. Dependencies

### From Sprint 1 ✅
- `ClassifiedResource` interface
- `managedPolicyEquivalent` detection
- `relatedResources` mapping
- `groupId` classification

### For Sprint 3 (Code Cleaner)
Sprint 2 provides:
- Clean IAM role generation
- Reduced code size
- Better organization

Sprint 3 will further optimize:
- Remove remaining comments
- Optimize logical ID overrides
- Polish formatting

---

## 12. Out of Scope

The following are explicitly **NOT** part of Sprint 2:

❌ **Lambda function generation** (Sprint 5)
❌ **Code formatting/comments** (Sprint 3)
❌ **Advanced constructs** (Sprint 4)
❌ **NodejsFunction bundling** (Sprint 5)
❌ **Migration scripts** (separate epic)
❌ **CLI improvements** (separate epic)

---

## 13. Open Questions

### Q1: How to handle managed policies not detected by Sprint 1?
**Answer**: Add detection logic to IAMRoleGenerator for additional patterns (VPCAccess, XRay, etc.)

### Q2: Should we warn on overly permissive policies?
**Answer**: Yes (Should Have requirement), add warnings in generated code as TODO comments

### Q3: How to handle cross-stack references?
**Answer**: Generate string ARNs with TODO comment to manually update after stacks are linked

### Q4: Should we validate IAM policies?
**Answer**: Not in Sprint 2, defer to Sprint 3 or 4 for policy validation

### Q5: How to handle encrypted environment variables in policies?
**Answer**: Preserve as-is, don't try to resolve encrypted values

---

## 14. Approval Required

This specification requires approval from:
- [ ] **Tech Lead** - Architecture and design review
- [ ] **Senior Developer** - Implementation approach
- [ ] **QA Lead** - Test strategy review
- [ ] **Product Owner** - Requirements and acceptance criteria

**Status**: 🟡 Pending Approval

**Next Step**: Phase Gate 1 Review → Proceed to Pseudocode Phase

---

*Sprint 2 Specification - SPARC Methodology*
*Created: 2025-10-22*
*Phase: Specification (1 of 5)*
*Ready for Review: ✅*
