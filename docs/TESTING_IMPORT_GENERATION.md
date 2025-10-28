# Testing Import Generation Feature

## Step-by-Step Testing Guide

### Prerequisites
- AWS credentials configured
- Node.js and npm installed
- Project built (`npm run build`)

### Test Sequence

#### 1. Clean Environment ✅
```bash
# Verify no leftover state
ls .test-state.json        # Should not exist
ls -d test-manual-*        # Should not exist
```

#### 2. Setup Test Environment
```bash
./scripts/test-messy-env.sh
# Choose option: 2 (Setup test environment + Create messy resources)
```

This creates:
- Test directory: `test-manual-{timestamp}/serverless-project/`
- Serverless config with DynamoDB tables, S3 bucket, Lambda
- Manual S3 bucket not in config

#### 3. Deploy Serverless Stack
```bash
./scripts/test-messy-env.sh
# Choose option: 3 (Deploy Serverless stack)
```

Expected resources deployed:
- `messy-test-users` (DynamoDB Table)
- `messy-test-sessions` (DynamoDB Table)
- `messy-test-products` (DynamoDB Table)
- `messy-test-products-manual` (S3 Bucket - manual)
- Lambda function, API Gateway, etc.

#### 4. Run Migration (Dry-Run)
```bash
./scripts/test-messy-env.sh
# Choose option: 5 (Run migration - will use --dry-run automatically)
```

This should:
1. Scan Serverless stack
2. Generate CDK code
3. Synthesize CDK template (`cdk synth`)
4. **Compare templates** (new functionality!)
5. **Generate import files** (new functionality!)

#### 5. Verify Generated Files

Check that these files exist in the CDK directory:

```bash
# Find the test directory
TEST_DIR=$(ls -dt test-manual-* 2>/dev/null | head -1)
CDK_DIR="$TEST_DIR/serverless-project/cdk"

# Check import-resources.json
cat "$CDK_DIR/import-resources.json"
```

**Expected format:**
```json
[
  {
    "resourceType": "AWS::DynamoDB::Table",
    "logicalResourceId": "UsersTable",
    "resourceIdentifier": {
      "TableName": "messy-test-users"
    }
  },
  {
    "resourceType": "AWS::DynamoDB::Table",
    "logicalResourceId": "SessionsTable",
    "resourceIdentifier": {
      "TableName": "messy-test-sessions"
    }
  }
]
```

```bash
# Check IMPORT_PLAN.md
cat "$CDK_DIR/IMPORT_PLAN.md"
```

**Should contain:**
- Overview
- List of resources to import
- Import instructions
- CDK import commands
- Troubleshooting section

```bash
# Check HTML report
open "$CDK_DIR/migration-comparison-report.html"
# Or view in browser
```

**Should show:**
- Summary with resource counts
- ✅ "Ready for import!" message
- **📦 Import Instructions section** (NEW!)
  - Generated Files list
  - Option 1: Automatic Import
  - Option 2: Review First
  - What Happens During Import
  - After Import steps

#### 6. Verify Comparison Report JSON

```bash
cat "$CDK_DIR/migration-comparison-report.json"
```

**Check for:**
```json
{
  "ready_for_import": true,
  "blocking_issues": [],
  "resources": [
    {
      "resourceType": "AWS::DynamoDB::Table",
      "physicalId": "messy-test-users",
      "slsLogicalId": "UsersTable",
      "cdkLogicalId": "UsersTable",
      "status": "MATCH" or "WARNING" or "ACCEPTABLE"
    }
  ]
}
```

#### 7. Test Import Flow (Optional - Creates Real Stack!)

⚠️ **Warning**: This will create a real CloudFormation stack!

```bash
# Navigate to CDK directory
cd "$CDK_DIR"

# Run CDK import (will prompt for resource IDs)
cdk import --resource-mapping import-resources.json

# Or with auto-approve (uses the file automatically)
cdk import --resource-mapping import-resources.json --auto-approve
```

Expected output:
```
The following resources will be imported:
  - UsersTable (AWS::DynamoDB::Table)
  - SessionsTable (AWS::DynamoDB::Table)
  ...

Do you want to import these resources? (Y/n)
```

#### 8. Verify Import Success (If Step 7 Executed)

```bash
# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name {stack-name}

# Verify resources are in IMPORT_COMPLETE status
aws cloudformation describe-stack-resources --stack-name {stack-name}

# Run drift detection to verify no changes
cdk diff
```

#### 9. Cleanup

```bash
./scripts/test-messy-env.sh
# Choose option: C (Clean up all resources)
```

## What to Look For

### ✅ Success Indicators

1. **import-resources.json**
   - Contains all stateful resources
   - Correct resourceType for each
   - Correct resourceIdentifier keys (TableName, BucketName, etc.)
   - No CRITICAL status resources included

2. **IMPORT_PLAN.md**
   - Clear, readable instructions
   - Lists all resources to import
   - Shows warnings if any
   - Provides troubleshooting guidance

3. **HTML Report**
   - Shows "Ready for import!" in green
   - Has "📦 Import Instructions" section
   - Provides copy-paste CDK commands
   - Explains the import process

4. **Console Output**
   - Shows "Generating import resources from comparison results..."
   - Lists importable count and skipped count
   - Shows any warnings

### ❌ Potential Issues

1. **No import-resources.json**
   - Check: Did comparison step complete?
   - Check: Are there stateful resources to import?

2. **Empty import-resources.json**
   - All resources may have CRITICAL status
   - Check warnings in console output

3. **Wrong resource identifiers**
   - Check physical IDs match deployed resources
   - Verify resource type mapping in ImportResourceGenerator

4. **HTML report missing import section**
   - Check: `ready_for_import: false`?
   - Review blocking_issues in JSON report

## Quick Test Command

One-liner to check all generated files:

```bash
TEST_DIR=$(ls -dt test-manual-* 2>/dev/null | head -1) && \
CDK_DIR="$TEST_DIR/serverless-project/cdk" && \
echo "=== import-resources.json ===" && \
cat "$CDK_DIR/import-resources.json" 2>/dev/null || echo "NOT FOUND" && \
echo -e "\n=== IMPORT_PLAN.md ===" && \
head -20 "$CDK_DIR/IMPORT_PLAN.md" 2>/dev/null || echo "NOT FOUND" && \
echo -e "\n=== Comparison Summary ===" && \
jq '.summary, .ready_for_import, .blocking_issues' "$CDK_DIR/migration-comparison-report.json" 2>/dev/null || echo "NOT FOUND"
```

## Expected Console Output During Migration

```
✓ Initial scan completed
✓ Template modification completed
✓ CDK generation completed
✓ Comparison completed

  Generating import resources from comparison results...
  Generated import resources: 5 importable, 0 skipped

  ✅ Import preparation completed
     Importable resources: 5

  Dry-run mode: skipping actual import
  ✅ Import preparation completed (dry-run)
  Files generated in: test-manual-xxx/serverless-project/cdk
    - import-resources.json (CDK import file)
    - IMPORT_PLAN.md (human-readable instructions)
```
