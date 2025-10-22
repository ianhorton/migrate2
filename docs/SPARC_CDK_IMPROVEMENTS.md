# SPARC: Improving CDK Code Generation Quality

## Problem Statement

Our migration tool generates **correct but verbose** CDK code that differs significantly from **idiomatic human-written** CDK code. This makes the generated code harder to maintain, understand, and modify.

## Comparison Analysis

### Generated Code Issues (Current)

```typescript
// ❌ Problem 1: Verbose logical ID preservation
const counterLogGroup = new logs.LogGroup(this, 'CounterLogGroup', {
  logGroupName: '/aws/lambda/migration-sandbox-counter'
});
counterLogGroup.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
(counterLogGroup.node.defaultChild as cdk.CfnResource).overrideLogicalId('CounterLogGroup');
```

```typescript
// ❌ Problem 2: Verbose IAM role with inline policies
const iamRoleLambdaExecution = new iam.Role(this, 'IamRoleLambdaExecution', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  inlinePolicies: {
    lambdaPolicy: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:CreateLogGroup'],
          resources: [cdk.Fn.sub('arn:${AWS::Partition}:logs:...')]
        })
      ]
    })
  },
  path: '/',
  roleName: ['migration-sandbox', 'dev', cdk.Stack.of(this).region, 'lambdaRole'].join('-')
});
```

```typescript
// ❌ Problem 3: S3-based Lambda code (not bundleable)
const counterLambdaFunction = new lambda.Function(this, 'CounterLambdaFunction', {
  code: lambda.Code.fromBucket(serverlessDeploymentBucket, 'serverless/...zip'),
  handler: 'handler.router',
  runtime: lambda.Runtime.NODEJS_20_X,
  // ... lots more config
});
```

### Human-Written Code (Target)

```typescript
// ✅ Clean and concise
const logGroup = new LogGroup(this, "CdkMigrationLogGroup", {
  logGroupName: '/aws/lambda/migration-sandbox-counter'
});
```

```typescript
// ✅ Idiomatic IAM role with managed policies
const lambdaRole = new Role(this, "CdkMigrationLambdaRole", {
  roleName: `migration-sandbox-cdk-lambda-role`,
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

lambdaRole.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:UpdateItem"],
    effect: Effect.ALLOW,
    resources: [counterDDB.tableArn]
  })
);
```

```typescript
// ✅ NodejsFunction with local code bundling
const handler = new NodejsFunction(this, "CdkMigrationLambda", {
  entry: "src/handler.mjs",
  handler: "index.router",
  logGroup,
  role: lambdaRole,
  runtime: Runtime.NODEJS_20_X,
  bundling: {
    format: OutputFormat.ESM,
    // ... clean bundling config
  }
});
```

## Key Differences to Address

### 1. **Excessive Comments**
- **Generated**: "IMPORTANT: This resource will be imported, not created" everywhere
- **Target**: Minimal, purposeful comments only
- **Impact**: Visual clutter, harder to read

### 2. **Logical ID Preservation**
- **Generated**: `overrideLogicalId()` on every resource
- **Target**: No logical ID overrides (unless necessary for import)
- **Impact**: 3 extra lines per resource, breaks CDK idioms

### 3. **Removal Policies**
- **Generated**: `applyRemovalPolicy(RETAIN)` on every resource
- **Target**: Only on stateful resources that need protection
- **Impact**: Unnecessary code, unclear intent

### 4. **IAM Role Patterns**
- **Generated**: Verbose inline policies with ARN substitutions
- **Target**: Managed policies + `addToPolicy()` for custom permissions
- **Impact**: 20+ lines vs 5 lines for same functionality

### 5. **Lambda Functions**
- **Generated**: `lambda.Function` with S3 code reference
- **Target**: `NodejsFunction` with local bundling
- **Impact**: Cannot modify code locally, not maintainable

### 6. **Missing Higher-Level Constructs**
- **Generated**: Basic L2 constructs only
- **Target**: Aliases, Function URLs, CloudFront, proper bundling
- **Impact**: Missing production-ready features

### 7. **Import vs Create Confusion**
- **Generated**: Everything looks like it will be imported
- **Target**: Clear separation between imported and created resources
- **Impact**: Unclear migration strategy

---

## SPARC Phase 1: Specification

### Acceptance Criteria

**Must Have**:
1. ✅ Use `NodejsFunction` for Lambda functions with local code
2. ✅ Use managed IAM policies + `addToPolicy()` pattern
3. ✅ Remove unnecessary `overrideLogicalId()` calls
4. ✅ Apply `RemovalPolicy.RETAIN` only to stateful resources
5. ✅ Reduce comments to essential information only
6. ✅ Generate references between resources (not hardcoded ARNs)

**Should Have**:
7. ✅ Group related resources together logically
8. ✅ Use construct references instead of string ARNs
9. ✅ Add optional higher-level constructs (Aliases, URLs)
10. ✅ Generate bundling configuration for Lambda

**Nice to Have**:
11. 💡 Detect and suggest CloudFront for function URLs
12. 💡 Auto-generate monitoring dashboards
13. 💡 Suggest cost optimization opportunities

### Code Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lines per Lambda | 12 | 8 |
| Lines per IAM Role | 25+ | 10 |
| Comments per resource | 3 | 0-1 |
| Logical ID overrides | Every resource | Only for imports |
| Removal policies | Every resource | Stateful only |
| Lambda bundling | S3 reference | Local with config |

---

## SPARC Phase 2: Pseudocode

### Algorithm: Generate Cleaner CDK Code

```
FUNCTION generateCleanerCDKCode(resources, config):

  # Step 1: Classify resources by type and purpose
  statefulResources = filter(resources, isStateful)
  statelessResources = filter(resources, isStateless)
  importedResources = filter(resources, needsImport)
  createdResources = filter(resources, willBeCreated)

  # Step 2: Generate in logical groups
  output = []

  # Group 1: Stateful imported resources (DynamoDB, S3, etc.)
  FOR EACH resource IN statefulResources:
    IF resource.needsImport:
      output.add(generateImportResource(resource))
    ELSE:
      output.add(generateCleanL2Construct(resource))

  # Group 2: IAM roles (with clean patterns)
  FOR EACH role IN filter(resources, isIAMRole):
    output.add(generateCleanIAMRole(role))

  # Group 3: Lambda functions (with bundling)
  FOR EACH lambda IN filter(resources, isLambda):
    output.add(generateNodejsFunction(lambda))

  # Group 4: Higher-level constructs (optional)
  IF config.includeAdvanced:
    output.add(generateAliases())
    output.add(generateFunctionURLs())
    output.add(suggestCloudFront())

  RETURN output


FUNCTION generateCleanL2Construct(resource):
  # Use minimal configuration
  construct = {
    type: resource.type,
    id: cleanConstructId(resource.logicalId),
    props: essentialPropsOnly(resource.properties)
  }

  # Only add removal policy if stateful
  IF isStateful(resource):
    construct.removalPolicy = RemovalPolicy.RETAIN

  # Only override logical ID if needed for import
  IF resource.needsImport:
    construct.logicalIdOverride = resource.logicalId

  RETURN construct


FUNCTION generateCleanIAMRole(role):
  # Start with managed policies
  managedPolicies = detectManagedPolicies(role.policies)

  # Extract custom permissions
  customPermissions = extractCustomPermissions(role.policies)

  # Generate clean role
  output = `
    const ${role.name} = new Role(this, "${role.id}", {
      roleName: "${role.name}",
      assumedBy: new ServicePrincipal("${role.service}"),
      managedPolicies: ${managedPolicies}
    });
  `

  # Add custom permissions cleanly
  FOR EACH permission IN customPermissions:
    output += `
    ${role.name}.addToPolicy(
      new PolicyStatement({
        actions: ${permission.actions},
        effect: Effect.ALLOW,
        resources: ${generateResourceReferences(permission.resources)}
      })
    );
    `

  RETURN output


FUNCTION generateNodejsFunction(lambda):
  # Detect source code location
  sourceEntry = detectLambdaSource(lambda)

  # Generate with bundling config
  output = `
    const ${lambda.name} = new NodejsFunction(this, "${lambda.id}", {
      entry: "${sourceEntry}",
      handler: "${lambda.handler}",
      runtime: Runtime.${lambda.runtime},
      architecture: Architecture.${lambda.architecture},
      memorySize: ${lambda.memory},
      timeout: Duration.seconds(${lambda.timeout}),
      logGroup: ${lambda.logGroupRef},
      role: ${lambda.roleRef},
      bundling: {
        format: OutputFormat.ESM,
        minify: false,
        sourceMap: false
      }
    });
  `

  RETURN output


FUNCTION generateResourceReferences(resources):
  # Use construct references instead of ARN strings
  references = []

  FOR EACH resource IN resources:
    IF isConstructInStack(resource):
      references.add(`${constructName}.${arnProperty}`)
    ELSE:
      references.add(`"${resource.arn}"`)

  RETURN references
```

---

## SPARC Phase 3: Architecture

### Module Changes Required

```
src/modules/generator/
├── index.ts (existing - needs refactor)
├── templates/
│   ├── stack-template.ts (existing)
│   ├── l2-constructs/          # ← NEW
│   │   ├── dynamodb.ts          # Clean DynamoDB patterns
│   │   ├── lambda.ts            # NodejsFunction patterns
│   │   ├── iam.ts               # Managed policies + addToPolicy
│   │   ├── logs.ts              # LogGroup patterns
│   │   └── s3.ts                # S3 patterns
│   ├── advanced/                # ← NEW
│   │   ├── aliases.ts           # Lambda aliases
│   │   ├── function-urls.ts     # Function URL patterns
│   │   └── cloudfront.ts        # CloudFront suggestions
│   └── helpers/                 # ← NEW
│       ├── resource-grouping.ts # Group resources logically
│       ├── reference-resolver.ts # Resolve construct references
│       └── import-detector.ts   # Detect import vs create
└── code-cleaner/                # ← NEW
    ├── comment-reducer.ts       # Remove unnecessary comments
    ├── logical-id-optimizer.ts  # Only override when needed
    └── removal-policy-optimizer.ts # Only apply to stateful
```

### Data Flow

```
CloudFormation Template
        ↓
┌───────────────────┐
│ Resource Scanner  │
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Resource          │ ← NEW: Classify import vs create
│ Classifier        │ ← NEW: Detect patterns for clean code
└────────┬──────────┘
         ↓
┌───────────────────┐
│ L2 Construct      │ ← ENHANCED: Use clean patterns
│ Mapper            │ ← ENHANCED: Detect higher-level constructs
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Reference         │ ← NEW: Resolve cross-references
│ Resolver          │ ← NEW: Generate construct refs not ARNs
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Code Generator    │ ← ENHANCED: Use clean templates
│                   │ ← ENHANCED: Reduce verbosity
└────────┬──────────┘
         ↓
┌───────────────────┐
│ Code Cleaner      │ ← NEW: Remove unnecessary code
│                   │ ← NEW: Optimize patterns
└────────┬──────────┘
         ↓
    Clean CDK Code
```

---

## SPARC Phase 4: Refinement Plan

### Sprint 1: Resource Classification Enhancement
**Goal**: Better classify resources for clean generation

**Tasks**:
1. Add `needsImport` flag to resource metadata
2. Detect managed IAM policies vs custom policies
3. Identify Lambda source code locations
4. Group related resources (Lambda + Role + LogGroup)

**Tests**:
- ✅ Correctly identifies imported vs created resources
- ✅ Detects BasicExecutionRole pattern
- ✅ Groups Lambda with its dependencies

### Sprint 2: Clean IAM Role Generation
**Goal**: Generate idiomatic IAM roles

**Tasks**:
1. Create managed policy detector
2. Implement `addToPolicy()` pattern generator
3. Replace inline policies with cleaner pattern
4. Generate resource references not ARN strings

**Tests**:
- ✅ Uses managed policies when possible
- ✅ Generates addToPolicy() for custom permissions
- ✅ 50%+ reduction in IAM role code

### Sprint 3: NodejsFunction Generation
**Goal**: Generate bundleable Lambda functions

**Tasks**:
1. Detect Lambda source file locations
2. Generate NodejsFunction instead of Function
3. Add bundling configuration
4. Reference local code not S3

**Tests**:
- ✅ Generates NodejsFunction with entry point
- ✅ Includes bundling configuration
- ✅ Can run `cdk synth` and bundle locally

### Sprint 4: Code Cleaner
**Goal**: Remove unnecessary verbosity

**Tasks**:
1. Remove "IMPORTANT: imported" comments
2. Only override logical IDs for imports
3. Only apply RETAIN to stateful resources
4. Reduce blank lines and formatting

**Tests**:
- ✅ 70%+ reduction in comments
- ✅ Logical ID overrides only where needed
- ✅ Code passes lint and format checks

### Sprint 5: Higher-Level Constructs (Optional)
**Goal**: Add production-ready features

**Tasks**:
1. Generate Lambda aliases
2. Generate Function URLs
3. Suggest CloudFront distributions
4. Add monitoring constructs

**Tests**:
- ✅ Generates working aliases
- ✅ Function URLs are accessible
- ✅ Suggestions are actionable

---

## Success Metrics

### Code Quality
- **Lines of code**: 50-70% reduction
- **Comments**: 90% reduction
- **Readability**: Human-approved ✅
- **Maintainability**: Easy to modify ✅

### Functional
- **Still works**: All tests pass ✅
- **Imports correctly**: Resources imported successfully ✅
- **Deploys**: `cdk deploy` works ✅
- **Bundles**: `cdk synth` bundles Lambda code ✅

### Developer Experience
- **Time to understand**: < 5 minutes
- **Time to modify**: < 10 minutes
- **Confidence to deploy**: High

---

## Decisions Made ✅

1. **Scope**: All 5 sprints matter - comprehensive improvement
2. **Backward compatibility**: Not needed - replacing old generator entirely
3. **Lambda code**: On back burner - solve last (Sprint 5)
4. **Testing strategy**: All three - unit tests, integration tests, manual review
5. **Timeline**: As long as it takes - quality over speed

## Revised Sprint Order

1. **Sprint 1**: Resource Classification (foundation)
2. **Sprint 2**: Clean IAM Roles (highest impact)
3. **Sprint 3**: Code Cleaner (polish)
4. **Sprint 4**: Advanced Constructs (production features)
5. **Sprint 5**: Lambda Bundling (on back burner)

## Next Steps

1. ✅ **Decisions confirmed** - all 5 sprints approved
2. 🟡 **Create detailed implementation plan** - see IMPLEMENTATION_PLAN_CDK_IMPROVEMENTS.md
3. 🔴 **Set up test infrastructure** - fixtures and test data
4. 🔴 **Begin Sprint 1** - Resource classification enhancement

---

*Generated using SPARC methodology - approved and ready for implementation*
