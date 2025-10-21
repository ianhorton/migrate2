# Quick Testing Guide - Granular Step Control

## Quick Start - Test All Steps

```bash
# Run complete automated test
./test-all-steps.sh
```

## Test Individual Steps

### Step 1: Initial Scan Only
```bash
./test-step-1.sh

# Or manually:
cd ../sls-cdk-migration
sls package --stage dev

# Serverless creates either update-stack or create-stack
TEMPLATE=$(ls .serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
cat "$TEMPLATE" | jq '.Resources | keys'
```

### Steps 2-6: Full Migration (Dry-Run)
```bash
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --dry-run
```

## Inspect Outputs After Each Step

### After Step 1 (INITIAL_SCAN)
```bash
# Find the Serverless-generated template
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# View all resources discovered
cat "$TEMPLATE" | jq '.Resources | keys'

# Count resources by type
cat "$TEMPLATE" | jq '[.Resources[].Type] | group_by(.) | map({type: .[0], count: length})'

# Note: The migration tool copies this to cloudformation-template-scan.json
```

### After Step 2 (DISCOVERY)
```bash
# Check which resources got DeletionPolicy: Retain
cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | \
  jq '.Resources | to_entries |
      map(select(.value.DeletionPolicy == "Retain")) |
      map(.key)'
```

### After Step 3 (CLASSIFICATION)
```bash
# View classification from logs
npm run migrate -- --source ../sls-cdk-migration --target ../foo --dry-run 2>&1 | \
  grep "Classification summary" -A 5
```

### After Step 4 (TEMPLATE_MODIFICATION)
```bash
# Get original template
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# See what resources were removed
diff \
  <(cat "$ORIGINAL" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq -r '.Resources | keys[]' | sort)
```

### After Step 5 (CDK_GENERATION)
```bash
# View generated CDK code
cat ../foo/lib/foo-stack.ts

# Test CDK synthesis
cd ../foo
npx cdk synth

# View synthesized template
cat cdk.out/FooStack.template.json | jq '.Resources | keys'
```

### After Step 6 (COMPARISON)
```bash
# View comparison summary
cat ../foo/migration-comparison-report.json | jq '.summary'

# Open HTML report
open ../foo/migration-comparison-report.html

# View matches
cat ../foo/migration-comparison-report.json | jq '.matches[]'

# View differences
cat ../foo/migration-comparison-report.json | jq '.differences[]'
```

## Verify Specific Resources

### Check S3 Bucket
```bash
# Original (Serverless)
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
cat "$TEMPLATE" | jq '.Resources.ServerlessDeploymentBucket'

# Generated (CDK)
cat ../foo/cdk.out/FooStack.template.json | \
  jq '.Resources.ServerlessDeploymentBucket'

# In code
grep -A 5 "ServerlessDeploymentBucket" ../foo/lib/foo-stack.ts
```

### Check Lambda Function
```bash
# Original
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
cat "$TEMPLATE" | jq '.Resources.CounterLambdaFunction'

# Generated
cat ../foo/cdk.out/FooStack.template.json | \
  jq '.Resources.CounterLambdaFunction'

# In code
grep -A 10 "CounterLambdaFunction" ../foo/lib/foo-stack.ts
```

### Check DynamoDB Table
```bash
# Original
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
cat "$TEMPLATE" | jq '.Resources.counterTable'

# Generated
cat ../foo/cdk.out/FooStack.template.json | \
  jq '.Resources.counterTable'

# In code
grep -A 10 "counterTable" ../foo/lib/foo-stack.ts
```

## Common Inspection Commands

### Resource Counts
```bash
# Get original Serverless template
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

echo "Scan:" $(cat "$ORIGINAL" | jq '.Resources | length')
echo "Protected:" $([ -f ../sls-cdk-migration/.serverless/cloudformation-template-protected.json ] && cat ../sls-cdk-migration/.serverless/cloudformation-template-protected.json | jq '.Resources | length' || echo "N/A")
echo "Removed:" $([ -f ../sls-cdk-migration/.serverless/cloudformation-template-removed.json ] && cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | jq '.Resources | length' || echo "N/A")
echo "CDK:" $([ -f ../foo/cdk.out/FooStack.template.json ] && cat ../foo/cdk.out/FooStack.template.json | jq '.Resources | length' || echo "N/A")
```

### Resource Types
```bash
# Get original template
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# Group by type in scan template
cat "$ORIGINAL" | jq -r '.Resources | to_entries | map(.value.Type) | unique | .[]'

# Group by type in CDK template
cat ../foo/cdk.out/FooStack.template.json | \
  jq -r '.Resources | to_entries | map(.value.Type) | unique | .[]'
```

### Find Differences
```bash
# Get original template
ORIGINAL=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)

# Resources only in Serverless
comm -23 \
  <(cat "$ORIGINAL" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)

# Resources only in CDK
comm -13 \
  <(cat "$ORIGINAL" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)

# Resources in both
comm -12 \
  <(cat "$ORIGINAL" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)
```

## Validate Code Quality

### Check for L2 Constructs (Good)
```bash
grep -E "new (s3|lambda|dynamodb|iam|logs)\.(Bucket|Function|Table|Role|LogGroup)" \
  ../foo/lib/foo-stack.ts
```

### Check for L1 Constructs (Bad - should be none)
```bash
grep -E "new (s3|lambda|dynamodb|iam|logs)\.Cfn" \
  ../foo/lib/foo-stack.ts || echo "✅ No L1 constructs found"
```

### Check for Proper Enums
```bash
echo "Runtime enums:"
grep "Runtime\." ../foo/lib/foo-stack.ts

echo "Architecture enums:"
grep "Architecture\." ../foo/lib/foo-stack.ts

echo "BillingMode enums:"
grep "BillingMode\." ../foo/lib/foo-stack.ts

echo "Duration:"
grep "Duration\." ../foo/lib/foo-stack.ts
```

### Check for RemovalPolicy
```bash
grep -c "RemovalPolicy.RETAIN" ../foo/lib/foo-stack.ts
# Should be 3 (one for each stateful resource)
```

## Debug Mode

### Enable Verbose Logging
```bash
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --dry-run 2>&1 | tee migration-debug.log
```

### Filter Logs by Step
```bash
grep "INITIAL_SCAN" migration-debug.log
grep "DISCOVERY" migration-debug.log
grep "CLASSIFICATION" migration-debug.log
grep "TEMPLATE_MODIFICATION" migration-debug.log
grep "CDK_GENERATION" migration-debug.log
grep "COMPARISON" migration-debug.log
```

### Extract Errors
```bash
grep "error" migration-debug.log
grep "Error:" migration-debug.log
grep "failed" migration-debug.log
```

## Clean Test Environment

```bash
# Remove all generated files
rm -rf ../foo ../foo-test
rm -rf ../sls-cdk-migration/.serverless
rm -f migration-debug.log full-test.log
```

## Performance Testing

```bash
# Time each step
time ./test-step-1.sh

# Time full migration
time npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --dry-run
```

## For More Details

See the complete guide: `docs/STEP_BY_STEP_TESTING.md`
