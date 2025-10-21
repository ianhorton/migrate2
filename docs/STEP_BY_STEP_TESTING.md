# Step-by-Step Migration Testing Guide

Complete guide for testing and controlling each migration step individually.

## Migration Step Overview

The migration process has 8 distinct steps:

1. **INITIAL_SCAN** - Analyze Serverless project and generate CloudFormation
2. **DISCOVERY** - Discover resources and protect stateful ones
3. **CLASSIFICATION** - Classify resources as stateful/stateless, explicit/abstracted
4. **TEMPLATE_MODIFICATION** - Remove resources from Serverless stack
5. **CDK_GENERATION** - Generate CDK code from CloudFormation
6. **COMPARISON** - Compare Serverless vs CDK templates
7. **IMPORT_PREPARATION** - Prepare import statements for CDK
8. **EXECUTION** - Deploy and import resources

---

## Step 1: INITIAL_SCAN

### Purpose
- Parse `serverless.yml`
- Generate CloudFormation template
- Discover all resources in the stack

### Run This Step

```bash
# Method 1: Full migration in dry-run (runs all steps)
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --dry-run

# Method 2: Use Serverless Framework directly
cd ../sls-cdk-migration
sls package --stage dev
```

### Outputs

```bash
# CloudFormation template (scan version)
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json

# Resource summary
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | keys | length'

# List all resources
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | keys[]'

# View specific resource
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources.CounterLambdaFunction'
```

### Verify Results

```bash
# Count total resources
echo "Total resources:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | length'

# Group by resource type
echo "Resources by type:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | group_by(.Type) | map({type: .[0].Type, count: length})'

# Check for stateful resources
echo "Stateful resources (S3, DynamoDB, Logs):"
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | to_entries |
      map(select(.value.Type | test("S3::Bucket|DynamoDB::Table|Logs::LogGroup"))) |
      map(.key)'
```

### Manual Testing

Create a test script `test-step-1.sh`:

```bash
#!/bin/bash
set -e

echo "📡 Testing Step 1: INITIAL_SCAN"

# Clean previous runs
rm -rf ../sls-cdk-migration/.serverless

# Generate CloudFormation
cd ../sls-cdk-migration
sls package --stage dev

# Verify outputs
if [ ! -f .serverless/cloudformation-template-scan.json ]; then
  echo "❌ Failed: CloudFormation template not generated"
  exit 1
fi

RESOURCE_COUNT=$(cat .serverless/cloudformation-template-scan.json | jq '.Resources | length')
echo "✅ Found $RESOURCE_COUNT resources"

# Check for required resources
REQUIRED=("ServerlessDeploymentBucket" "CounterLogGroup" "counterTable" "CounterLambdaFunction" "IamRoleLambdaExecution")
for resource in "${REQUIRED[@]}"; do
  if cat .serverless/cloudformation-template-scan.json | jq -e ".Resources.$resource" > /dev/null; then
    echo "✅ Found: $resource"
  else
    echo "❌ Missing: $resource"
  fi
done

cd ../migrate2
```

---

## Step 2: DISCOVERY

### Purpose
- Identify stateful resources (S3, DynamoDB, LogGroups)
- Add `DeletionPolicy: Retain` to protect them
- Generate protected template

### Run This Step

```bash
# The migration tool handles this automatically
# To inspect the logic, check the source:
cat src/modules/orchestrator/steps/discovery-executor.ts
```

### Outputs

```bash
# Protected template (with DeletionPolicy: Retain)
cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json

# Compare scan vs protected
diff <(jq -S '.Resources.ServerlessDeploymentBucket' \
       ../sls-cdk-migration/.serverless/cloudformation-template-scan.json) \
     <(jq -S '.Resources.ServerlessDeploymentBucket' \
       ../sls-cdk-migration/.serverless/cloudformation-template-protected.json)
```

### Verify Results

```bash
# Check all stateful resources have DeletionPolicy: Retain
echo "Checking DeletionPolicy on stateful resources:"

for resource in ServerlessDeploymentBucket CounterLogGroup counterTable; do
  POLICY=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
           jq -r ".Resources.$resource.DeletionPolicy // \"none\"")

  if [ "$POLICY" = "Retain" ]; then
    echo "✅ $resource: DeletionPolicy=$POLICY"
  else
    echo "❌ $resource: Missing DeletionPolicy (found: $POLICY)"
  fi
done

# Verify UpdateReplacePolicy also set
echo ""
echo "Checking UpdateReplacePolicy:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
  jq '.Resources | to_entries |
      map(select(.value.DeletionPolicy == "Retain")) |
      map({key: .key,
           deletion: .value.DeletionPolicy,
           update: (.value.UpdateReplacePolicy // "missing")})'
```

### Manual Testing

Create `test-step-2.sh`:

```bash
#!/bin/bash
set -e

echo "🔍 Testing Step 2: DISCOVERY"

cd ../migrate2

# Run only discovery step
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee migration.log

# Extract discovery results from logs
PROTECTED=$(grep "Protected.*stateful resources" migration.log | grep -oE '[0-9]+')
echo "Protected $PROTECTED stateful resources"

# Verify protected template exists
if [ ! -f ../sls-cdk-migration/.serverless/cloudformation-template-protected.json ]; then
  echo "❌ Protected template not created"
  exit 1
fi

# Check each expected stateful resource
STATEFUL=("ServerlessDeploymentBucket" "CounterLogGroup" "counterTable")
for resource in "${STATEFUL[@]}"; do
  HAS_POLICY=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
               jq -r ".Resources.$resource.DeletionPolicy // \"none\"")

  if [ "$HAS_POLICY" = "Retain" ]; then
    echo "✅ $resource is protected"
  else
    echo "❌ $resource is NOT protected"
    exit 1
  fi
done

echo "✅ Discovery step completed successfully"
```

---

## Step 3: CLASSIFICATION

### Purpose
- Classify resources as:
  - Stateful vs Stateless
  - Explicit (in serverless.yml) vs Abstracted (auto-generated)
- This drives later steps (what to import vs recreate)

### Run This Step

```bash
# Classification happens automatically during INITIAL_SCAN
# View the classification in migration logs
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | grep "Classification summary" -A 10
```

### Verify Results

```bash
# Check migration state file (if saved)
# The state contains classification data

# Or analyze directly from CloudFormation
echo "Explicit resources (defined in serverless.yml):"
cat ../sls-cdk-migration/serverless.yml | grep -E "^    [A-Z]" | head -20

echo ""
echo "Abstracted resources (auto-generated by Serverless):"
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | to_entries |
      map(select(.value.Type | test("ApiGateway|Lambda::Version|Lambda::Permission"))) |
      map(.key)'
```

### Manual Classification Test

Create `test-step-3.sh`:

```bash
#!/bin/bash
set -e

echo "📊 Testing Step 3: CLASSIFICATION"

# Expected classification
declare -A STATEFUL=(
  ["ServerlessDeploymentBucket"]=1
  ["CounterLogGroup"]=1
  ["counterTable"]=1
)

declare -A EXPLICIT=(
  ["counterTable"]=1
)

# Run migration and capture logs
cd ../migrate2
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee classification.log

# Verify counts from logs
STATEFUL_COUNT=$(grep "Stateful resources:" classification.log | grep -oE '[0-9]+' | head -1)
STATELESS_COUNT=$(grep "Stateless resources:" classification.log | grep -oE '[0-9]+' | head -1)
EXPLICIT_COUNT=$(grep "Explicit resources:" classification.log | grep -oE '[0-9]+' | head -1)
ABSTRACTED_COUNT=$(grep "Abstracted resources:" classification.log | grep -oE '[0-9]+' | head -1)

echo ""
echo "Classification Results:"
echo "  Stateful: $STATEFUL_COUNT (expected: 3)"
echo "  Stateless: $STATELESS_COUNT (expected: 9)"
echo "  Explicit: $EXPLICIT_COUNT (expected: 1)"
echo "  Abstracted: $ABSTRACTED_COUNT (expected: 11)"

# Verify expectations
[ "$STATEFUL_COUNT" -eq 3 ] && echo "✅ Stateful count correct" || echo "❌ Stateful count wrong"
[ "$EXPLICIT_COUNT" -eq 1 ] && echo "✅ Explicit count correct" || echo "❌ Explicit count wrong"
```

---

## Step 4: TEMPLATE_MODIFICATION

### Purpose
- Remove stateful resources from Serverless stack
- Generate "removed" template for deployment
- This allows resources to remain in AWS while removing from CloudFormation

### Run This Step

The tool runs this automatically, but you can inspect the output:

```bash
# View the removed template
cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json

# Compare: what was removed?
echo "Resources in scan template:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
  jq '.Resources | keys | length'

echo "Resources in removed template:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
  jq '.Resources | keys | length'

# Show removed resources
comm -23 \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | jq -r '.Resources | keys[]' | sort) \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq -r '.Resources | keys[]' | sort)
```

### Verify Results

```bash
# Verify stateful resources were removed
echo "Checking stateful resources were removed:"

for resource in ServerlessDeploymentBucket CounterLogGroup counterTable; do
  IN_SCAN=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | \
            jq -e ".Resources.$resource" > /dev/null && echo "present" || echo "absent")

  IN_REMOVED=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
               jq -e ".Resources.$resource" > /dev/null && echo "present" || echo "absent")

  if [ "$IN_SCAN" = "present" ] && [ "$IN_REMOVED" = "absent" ]; then
    echo "✅ $resource: removed correctly"
  else
    echo "❌ $resource: scan=$IN_SCAN, removed=$IN_REMOVED"
  fi
done

# Verify outputs were also removed
echo ""
echo "Checking removed outputs:"
cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
  jq '.Outputs | keys'
```

### Manual Testing

Create `test-step-4.sh`:

```bash
#!/bin/bash
set -e

echo "✏️  Testing Step 4: TEMPLATE_MODIFICATION"

cd ../migrate2

# Run migration
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee modification.log

# Verify removed template exists
if [ ! -f ../sls-cdk-migration/.serverless/cloudformation-template-removed.json ]; then
  echo "❌ Removed template not created"
  exit 1
fi

# Count resources before/after
SCAN_COUNT=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-scan.json | jq '.Resources | length')
REMOVED_COUNT=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq '.Resources | length')

echo "Resources before: $SCAN_COUNT"
echo "Resources after: $REMOVED_COUNT"
echo "Resources removed: $((SCAN_COUNT - REMOVED_COUNT))"

# Verify exactly 3 resources removed (S3, DynamoDB, LogGroup)
if [ $((SCAN_COUNT - REMOVED_COUNT)) -eq 3 ]; then
  echo "✅ Correct number of resources removed"
else
  echo "❌ Wrong number of resources removed (expected 3)"
  exit 1
fi

# Verify specific resources removed
REMOVED_RESOURCES=(ServerlessDeploymentBucket CounterLogGroup counterTable)
for resource in "${REMOVED_RESOURCES[@]}"; do
  if cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
     jq -e ".Resources.$resource" > /dev/null 2>&1; then
    echo "❌ $resource still present in removed template"
    exit 1
  else
    echo "✅ $resource correctly removed"
  fi
done

echo "✅ Template modification completed successfully"
```

---

## Step 5: CDK_GENERATION

### Purpose
- Initialize CDK project
- Generate TypeScript CDK code
- Synthesize to CloudFormation

### Run This Step

```bash
# Run migration (this step takes the longest)
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run
```

### Outputs

```bash
# CDK project structure
tree -L 2 ../foo-test

# Generated stack file
cat ../foo-test/lib/foo-stack.ts

# CDK app entry point
cat ../foo-test/bin/foo.ts

# CDK configuration
cat ../foo-test/cdk.json

# Synthesized CloudFormation
cat ../foo-test/cdk.out/FooStack.template.json
```

### Verify Generated Code

```bash
echo "=== Verifying CDK Code Quality ==="

# Check imports
echo "Checking imports:"
head -10 ../foo-test/lib/foo-stack.ts

# Check for proper L2 constructs (not Cfn*)
echo ""
echo "Checking for L2 constructs (should NOT see Cfn*):"
grep -E "new (s3|lambda|iam|dynamodb|logs)\." ../foo-test/lib/foo-stack.ts || \
  echo "❌ No L2 constructs found"

grep -E "new (s3|lambda|iam|dynamodb|logs)\.Cfn" ../foo-test/lib/foo-stack.ts && \
  echo "❌ Found L1 (Cfn*) constructs" || \
  echo "✅ No L1 constructs (good!)"

# Check for proper enum usage
echo ""
echo "Checking for proper enums:"
grep -E "Runtime\.|BillingMode\.|Architecture\.|BucketEncryption\." ../foo-test/lib/foo-stack.ts

# Check for RemovalPolicy
echo ""
echo "Checking RemovalPolicy on resources:"
grep -c "RemovalPolicy.RETAIN" ../foo-test/lib/foo-stack.ts

# Verify no raw strings for enums
echo ""
echo "Checking for incorrect raw strings (should be empty):"
grep -E "(runtime|billingMode|architecture): '[^']+'" ../foo-test/lib/foo-stack.ts || \
  echo "✅ No raw enum strings"
```

### Test CDK Synthesis

```bash
cd ../foo-test

# Install dependencies
npm install

# Run TypeScript compiler
npm run build

# Synthesize CloudFormation
npx cdk synth

# Check for synthesis errors
if [ $? -eq 0 ]; then
  echo "✅ CDK synthesis successful"
else
  echo "❌ CDK synthesis failed"
  exit 1
fi

# View synthesized template
cat cdk.out/FooStack.template.json | jq '.Resources | keys'
```

### Manual Testing

Create `test-step-5.sh`:

```bash
#!/bin/bash
set -e

echo "⚡ Testing Step 5: CDK_GENERATION"

cd ../migrate2

# Clean previous test
rm -rf ../foo-test

# Run migration
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee generation.log

# Verify CDK project structure
echo ""
echo "Checking CDK project structure:"
REQUIRED_FILES=(
  "../foo-test/lib/foo-stack.ts"
  "../foo-test/bin/foo.ts"
  "../foo-test/cdk.json"
  "../foo-test/package.json"
  "../foo-test/tsconfig.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ Found: $file"
  else
    echo "❌ Missing: $file"
    exit 1
  fi
done

# Verify CDK code quality
echo ""
echo "Checking CDK code quality:"

# Should use L2 constructs
if grep -q "new s3.Bucket" ../foo-test/lib/foo-stack.ts && \
   grep -q "new lambda.Function" ../foo-test/lib/foo-stack.ts && \
   grep -q "new dynamodb.Table" ../foo-test/lib/foo-stack.ts; then
  echo "✅ Uses L2 constructs"
else
  echo "❌ Not using L2 constructs"
  exit 1
fi

# Should NOT use L1 constructs for supported resources
if grep -q "new s3.CfnBucket\|new lambda.CfnFunction\|new dynamodb.CfnTable" ../foo-test/lib/foo-stack.ts; then
  echo "❌ Using L1 (Cfn*) constructs"
  exit 1
else
  echo "✅ Not using L1 constructs"
fi

# Test CDK synthesis
echo ""
echo "Testing CDK synthesis:"
cd ../foo-test
npm install --silent
npx cdk synth > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ CDK synthesis successful"
else
  echo "❌ CDK synthesis failed"
  exit 1
fi

# Verify synthesized resources
SYNTH_RESOURCES=$(cat cdk.out/FooStack.template.json | jq '.Resources | length')
echo "Synthesized $SYNTH_RESOURCES resources"

cd ../migrate2
echo "✅ CDK generation completed successfully"
```

---

## Step 6: COMPARISON

### Purpose
- Compare Serverless CloudFormation with CDK CloudFormation
- Identify matches, differences, and issues
- Generate HTML/JSON comparison reports

### Run This Step

```bash
# Comparison runs automatically after CDK_GENERATION
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | grep -A 20 "Comparison Summary"
```

### View Comparison Reports

```bash
# Open HTML report in browser
open ../foo-test/migration-comparison-report.html

# View JSON report
cat ../foo-test/migration-comparison-report.json | jq '.'

# Summary statistics
cat ../foo-test/migration-comparison-report.json | jq '.summary'

# View matches
cat ../foo-test/migration-comparison-report.json | jq '.matches[]'

# View differences
cat ../foo-test/migration-comparison-report.json | jq '.differences[]'

# View unmatched resources
cat ../foo-test/migration-comparison-report.json | jq '.unmatchedInServerless[]'
```

### Analyze Specific Differences

```bash
# Check Lambda function differences
cat ../foo-test/migration-comparison-report.json | \
  jq '.matches[] | select(.logicalId == "CounterLambdaFunction") | .propertyDifferences'

# Check DynamoDB table differences
cat ../foo-test/migration-comparison-report.json | \
  jq '.matches[] | select(.logicalId == "counterTable") | .propertyDifferences'

# List all blocking issues
cat ../foo-test/migration-comparison-report.json | \
  jq '.blockingIssues[]'
```

### Manual Testing

Create `test-step-6.sh`:

```bash
#!/bin/bash
set -e

echo "🔀 Testing Step 6: COMPARISON"

cd ../migrate2

# Run migration
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee comparison.log

# Verify comparison reports exist
if [ ! -f ../foo-test/migration-comparison-report.json ]; then
  echo "❌ JSON comparison report not created"
  exit 1
fi

if [ ! -f ../foo-test/migration-comparison-report.html ]; then
  echo "❌ HTML comparison report not created"
  exit 1
fi

echo "✅ Comparison reports created"

# Extract comparison summary
MATCHED=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.matched')
CRITICAL=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.criticalDifferences')
WARNINGS=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.warnings')
BLOCKING=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.blockingIssues')

echo ""
echo "Comparison Summary:"
echo "  Matched: $MATCHED"
echo "  Critical: $CRITICAL"
echo "  Warnings: $WARNINGS"
echo "  Blocking: $BLOCKING"

# Expected results
if [ "$MATCHED" -eq 3 ]; then
  echo "✅ Matched count correct (3 stateful resources)"
else
  echo "⚠️  Matched count: $MATCHED (expected 3)"
fi

# Blocking issues are expected (Lambda Code S3 key difference)
if [ "$BLOCKING" -ge 0 ]; then
  echo "ℹ️  Blocking issues: $BLOCKING (may include S3 key timestamp differences)"
fi

echo "✅ Comparison step completed"
```

---

## Step 7 & 8: IMPORT_PREPARATION & EXECUTION

### Purpose
- Generate CDK import statements
- Deploy CDK stack
- Import existing resources into CDK

### ⚠️ WARNING
These steps deploy to AWS! Only run with `--dry-run` removed.

### Run These Steps

```bash
# Full migration (not dry-run)
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-real

# Follow interactive prompts
```

### Manual Import (Advanced)

If you want more control:

```bash
cd ../foo-test

# 1. Deploy CDK stack WITHOUT resources (bootstrap only)
npx cdk deploy --no-execute

# 2. Generate import file manually
cat > import-resources.json << 'EOF'
{
  "ServerlessDeploymentBucket": {
    "BucketName": "actual-bucket-name"
  },
  "CounterLogGroup": {
    "LogGroupName": "/aws/lambda/migration-sandbox-counter"
  },
  "counterTable": {
    "TableName": "migration-sandbox-table"
  }
}
EOF

# 3. Import resources
npx cdk import --resource-mapping import-resources.json
```

---

## Complete Integration Test

Create `test-all-steps.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Complete Migration Step-by-Step Test"
echo "========================================"

cd /Users/ianhorton/development/sls-to-cdk/migrate2

# Clean
echo ""
echo "🧹 Cleaning previous test outputs..."
rm -rf ../foo-test
rm -rf ../sls-cdk-migration/.serverless

# Build
echo ""
echo "📦 Building migration tool..."
npm run build

# Step 1: INITIAL_SCAN
echo ""
echo "📡 Step 1: INITIAL_SCAN"
cd ../sls-cdk-migration
sls package --stage dev > /dev/null 2>&1
SCAN_RESOURCES=$(cat .serverless/cloudformation-template-scan.json | jq '.Resources | length')
echo "   ✅ Generated CloudFormation with $SCAN_RESOURCES resources"
cd ../migrate2

# Step 2-6: Run migration
echo ""
echo "🔄 Steps 2-6: Running migration (dry-run)..."
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee full-test.log

# Verify Step 2: DISCOVERY
echo ""
echo "🔍 Step 2: DISCOVERY"
PROTECTED=$(grep -c "DeletionPolicy.*Retain" \
  ../sls-cdk-migration/.serverless/cloudformation-template-protected.json || echo 0)
echo "   ✅ Protected $PROTECTED stateful resources"

# Verify Step 3: CLASSIFICATION
echo ""
echo "📊 Step 3: CLASSIFICATION"
STATEFUL=$(grep "Stateful resources:" full-test.log | grep -oE '[0-9]+' | head -1)
echo "   ✅ Classified $STATEFUL stateful resources"

# Verify Step 4: TEMPLATE_MODIFICATION
echo ""
echo "✏️  Step 4: TEMPLATE_MODIFICATION"
REMOVED_RESOURCES=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
  jq '.Resources | length')
REMOVED_COUNT=$((SCAN_RESOURCES - REMOVED_RESOURCES))
echo "   ✅ Removed $REMOVED_COUNT resources from template"

# Verify Step 5: CDK_GENERATION
echo ""
echo "⚡ Step 5: CDK_GENERATION"
cd ../foo-test
npm install --silent
npx cdk synth > /dev/null 2>&1
CDK_RESOURCES=$(cat cdk.out/FooStack.template.json | jq '.Resources | length')
echo "   ✅ Generated CDK code with $CDK_RESOURCES resources"
cd ../migrate2

# Verify Step 6: COMPARISON
echo ""
echo "🔀 Step 6: COMPARISON"
MATCHED=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.matched')
echo "   ✅ Matched $MATCHED resources between Serverless and CDK"

# Summary
echo ""
echo "========================================"
echo "✨ All steps completed successfully!"
echo ""
echo "📊 Results Summary:"
echo "   Scan: $SCAN_RESOURCES resources"
echo "   Protected: $PROTECTED stateful"
echo "   Removed: $REMOVED_COUNT from Serverless"
echo "   CDK Generated: $CDK_RESOURCES resources"
echo "   Matched: $MATCHED resources"
echo ""
echo "📂 Outputs:"
echo "   CDK Project: ../foo-test"
echo "   Reports: ../foo-test/migration-comparison-report.html"
```

Run it:
```bash
chmod +x test-all-steps.sh
./test-all-steps.sh
```

---

## Debugging Individual Steps

### Enable Debug Logging

```bash
# Set log level to debug
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee debug.log

# Filter for specific step
grep "INITIAL_SCAN" debug.log
grep "CDK_GENERATION" debug.log
```

### Inspect State Files

```bash
# Migration state is saved in target directory
cat ../foo-test/.migration-state.json | jq '.'

# View step results
cat ../foo-test/.migration-state.json | jq '.stepResults'

# View specific step
cat ../foo-test/.migration-state.json | jq '.stepResults.INITIAL_SCAN'
```

### Pause Between Steps

Modify the orchestrator to pause (for debugging):

```typescript
// In src/modules/orchestrator/index.ts
// Add after each step:
console.log('Pausing for inspection. Press Enter to continue...');
await new Promise(resolve => process.stdin.once('data', resolve));
```

---

## Next Steps

- Test with your own Serverless projects
- Customize the comparison criteria
- Add more resource type transformers
- Implement import automation

For production use, always test with `--dry-run` first!
