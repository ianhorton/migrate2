# Migration Testing Checklist

## Step-by-Step Verification

| Step | What It Does | Key Output | Verification Command | Expected Result |
|------|-------------|------------|---------------------|-----------------|
| **1. INITIAL_SCAN** | Parse serverless.yml, generate CloudFormation | `.serverless/cloudformation-template-update-stack.json` (Serverless)<br>`.serverless/cloudformation-template-scan.json` (Migration tool) | `cat ../sls-cdk-migration/.serverless/cloudformation-template-update-stack.json \| jq '.Resources \| length'` | 12 resources |
| **2. DISCOVERY** | Protect stateful resources with DeletionPolicy | `.serverless/cloudformation-template-protected.json` | `cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json \| jq '[.Resources[] \| select(.DeletionPolicy == "Retain")] \| length'` | 3 protected resources |
| **3. CLASSIFICATION** | Classify stateful/stateless, explicit/abstracted | Migration logs | `npm run migrate ... 2>&1 \| grep "Classification summary" -A 5` | 3 stateful, 9 stateless |
| **4. TEMPLATE_MODIFICATION** | Remove stateful resources from Serverless | `.serverless/cloudformation-template-removed.json` | `cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json \| jq '.Resources \| length'` | 9 resources (12 - 3) |
| **5. CDK_GENERATION** | Generate TypeScript CDK code | `lib/foo-stack.ts` | `cd ../foo && npx cdk synth > /dev/null 2>&1 && echo "✅ SUCCESS" \|\| echo "❌ FAILED"` | ✅ SUCCESS |
| **6. COMPARISON** | Compare Serverless vs CDK templates | `migration-comparison-report.json` | `cat ../foo/migration-comparison-report.json \| jq '.summary.matched'` | 3 matched |

## Detailed Checks Per Step

### Step 1: INITIAL_SCAN ✅

**Quick Check:**
```bash
./test-step-1.sh
```

**Manual Verification:**
```bash
# 1. Template exists (Serverless creates update-stack or create-stack)
ls -lh ../sls-cdk-migration/.serverless/cloudformation-template-*.json

# 2. Set template file variable (use whichever exists)
TEMPLATE_FILE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# 3. Contains 12 resources
cat "$TEMPLATE_FILE" | jq '.Resources | length'

# 4. All required resources present
for r in ServerlessDeploymentBucket CounterLogGroup counterTable CounterLambdaFunction IamRoleLambdaExecution; do
  cat "$TEMPLATE_FILE" | jq -e ".Resources.$r" > /dev/null && echo "✅ $r" || echo "❌ $r"
done
```

**Note:** When running `sls package` directly, Serverless creates either:
- `cloudformation-template-update-stack.json` (for existing stacks)
- `cloudformation-template-create-stack.json` (for new stacks)

The migration tool reads this and saves it as `cloudformation-template-scan.json` for consistency.

**Expected Output:**
```
✅ ServerlessDeploymentBucket
✅ CounterLogGroup
✅ counterTable
✅ CounterLambdaFunction
✅ IamRoleLambdaExecution
```

---

### Step 2: DISCOVERY ✅

**Quick Check:**
```bash
cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
  jq '.Resources | to_entries | map(select(.value.DeletionPolicy == "Retain")) | map(.key)'
```

**Expected Output:**
```json
[
  "ServerlessDeploymentBucket",
  "CounterLogGroup",
  "counterTable"
]
```

**Detailed Verification:**
```bash
# Each stateful resource should have BOTH policies
for r in ServerlessDeploymentBucket CounterLogGroup counterTable; do
  echo "Checking $r:"
  cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
    jq ".Resources.$r | {DeletionPolicy, UpdateReplacePolicy}"
done
```

---

### Step 3: CLASSIFICATION ✅

**Quick Check:**
```bash
npm run migrate -- --source ../sls-cdk-migration --target ../foo --dry-run 2>&1 | \
  grep -A 5 "Classification summary"
```

**Expected Output:**
```
Classification summary:
  Stateful resources: 3
  Stateless resources: 9
  Explicit resources: 1
  Abstracted resources: 11
```

---

### Step 4: TEMPLATE_MODIFICATION ✅

**Quick Check:**
```bash
# Get the original template file
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# Show removed resources
comm -23 \
  <(cat "$ORIGINAL" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq -r '.Resources | keys[]' | sort)
```

**Expected Output:**
```
CounterLogGroup
ServerlessDeploymentBucket
counterTable
```

**Verification:**
```bash
# Count before/after
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
SCAN=$(cat "$ORIGINAL" | jq '.Resources | length')
REMOVED=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq '.Resources | length')
echo "Before: $SCAN resources"
echo "After: $REMOVED resources"
echo "Removed: $((SCAN - REMOVED)) resources"
```

**Expected:** 12 → 9 (removed 3)

---

### Step 5: CDK_GENERATION ✅

**Quick Check:**
```bash
cd ../foo
npm install --silent
npx cdk synth > /dev/null 2>&1 && echo "✅ CDK synthesis PASSED" || echo "❌ CDK synthesis FAILED"
```

**Code Quality Checks:**

1. **L2 Constructs (should exist):**
```bash
grep -E "new (s3|lambda|dynamodb|iam|logs)\.(Bucket|Function|Table|Role|LogGroup)" ../foo/lib/foo-stack.ts
```

Expected output:
```typescript
const serverlessDeploymentBucket = new s3.Bucket(this, 'ServerlessDeploymentBucket', {
const counterLogGroup = new logs.LogGroup(this, 'CounterLogGroup', {
const iamRoleLambdaExecution = new iam.Role(this, 'IamRoleLambdaExecution', {
const counterLambdaFunction = new lambda.Function(this, 'CounterLambdaFunction', {
const counterTable = new dynamodb.Table(this, 'counterTable', {
```

2. **No L1 Constructs (should be empty):**
```bash
grep -E "Cfn(Bucket|Function|Table|Role|LogGroup)" ../foo/lib/foo-stack.ts || echo "✅ No L1 constructs"
```

3. **Proper Enums:**
```bash
echo "Runtime:"
grep "Runtime\." ../foo/lib/foo-stack.ts

echo "Architecture:"
grep "Architecture\." ../foo/lib/foo-stack.ts

echo "BillingMode:"
grep "BillingMode\." ../foo/lib/foo-stack.ts

echo "BucketEncryption:"
grep "BucketEncryption\." ../foo/lib/foo-stack.ts

echo "Duration:"
grep "Duration\." ../foo/lib/foo-stack.ts
```

Expected:
```typescript
runtime: lambda.Runtime.NODEJS_20_X
architecture: lambda.Architecture.ARM_64
billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
encryption: s3.BucketEncryption.S3_MANAGED
timeout: cdk.Duration.seconds(6)
```

4. **RemovalPolicy on all resources:**
```bash
grep -c "RemovalPolicy.RETAIN" ../foo/lib/foo-stack.ts
```

Expected: `3` (one for each stateful resource)

---

### Step 6: COMPARISON ✅

**Quick Check:**
```bash
cat ../foo/migration-comparison-report.json | jq '.summary'
```

**Expected Output:**
```json
{
  "matched": 3,
  "totalServerlessResources": 12,
  "totalCdkResources": 7,
  "matches": 3,
  "acceptableDifferences": 1,
  "criticalDifferences": 1,
  "warnings": 0,
  "blockingIssues": 1,
  "unmatchedInServerless": 9,
  "unmatchedInCdk": 4
}
```

**Detailed Analysis:**

1. **Matched Resources:**
```bash
cat ../foo/migration-comparison-report.json | jq '.matches[] | .logicalId'
```

Expected:
```json
"ServerlessDeploymentBucket"
"CounterLogGroup"
"counterTable"
```

2. **Differences (minor):**
```bash
cat ../foo/migration-comparison-report.json | jq '.matches[] | {resource: .logicalId, differences: .propertyDifferences | length}'
```

3. **Blocking Issues (expected for Lambda):**
```bash
cat ../foo/migration-comparison-report.json | jq '.blockingIssues[]'
```

Expected: Lambda Code S3 key timestamp difference (safe to ignore)

---

## Complete Test Run

```bash
# Run all tests
./test-all-steps.sh

# Should output:
# ✅ Step 1: INITIAL_SCAN - 12 resources discovered
# ✅ Step 2: DISCOVERY - 3 stateful resources protected
# ✅ Step 3: CLASSIFICATION - 3 stateful, 9 stateless
# ✅ Step 4: TEMPLATE_MODIFICATION - 3 resources removed
# ✅ Step 5: CDK_GENERATION - CDK synthesis successful
# ✅ Step 6: COMPARISON - 3 resources matched
```

## Troubleshooting

### CDK Synthesis Fails

1. Check TypeScript errors:
```bash
cd ../foo
npx cdk synth 2>&1 | head -50
```

2. Check for L1 constructs:
```bash
grep "Cfn" ../foo/lib/foo-stack.ts
```

3. Check for missing enums:
```bash
grep -E "(runtime|billingMode|architecture): '[^']'" ../foo/lib/foo-stack.ts
```

### Comparison Shows Critical Differences

1. View differences:
```bash
cat ../foo/migration-comparison-report.json | jq '.differences'
```

2. Compare specific resource:
```bash
# Original
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources.CounterLambdaFunction'

# Generated
cat ../foo/cdk.out/FooStack.template.json | \
  jq '.Resources.CounterLambdaFunction'
```

### Missing Resources

1. Check what was removed:
```bash
comm -23 \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)
```

2. Check what was added:
```bash
comm -13 \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)
```

## Success Criteria

✅ All steps complete without errors
✅ CDK synthesis succeeds
✅ 3 stateful resources matched
✅ Generated code uses L2 constructs
✅ All enums properly converted
✅ RemovalPolicy.RETAIN on all stateful resources
✅ No critical blocking issues (except Lambda Code timestamp)

## Next Steps After Successful Test

1. ✅ Review `migration-comparison-report.html`
2. ✅ Verify Lambda Code S3 key is the only blocking issue
3. ✅ Test CDK diff: `cd ../foo && npx cdk diff`
4. ⚠️  Deploy to test environment (remove `--dry-run`)
5. ⚠️  Import resources with `cdk import`
6. ✅ Verify application still works
7. ✅ Decommission Serverless stack
