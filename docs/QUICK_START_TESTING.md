# Quick Start Testing Guide

This guide shows you how to quickly test the messy environment features in under 10 minutes.

## Option 1: Interactive Testing Script (Recommended)

The fastest way to test all features:

```bash
# Run interactive menu (will prompt for AWS profile)
./scripts/test-messy-env.sh

# Or specify profile via command-line
./scripts/test-messy-env.sh --profile my-aws-profile
```

**Menu Options:**
- **P. Select AWS profile** (choose which AWS credentials to use)
- 1. Check prerequisites (verifies AWS, Node.js, CDK)
- 2. Setup test environment (creates test project + AWS resources)
- 3. Run Test 1: Basic migration (dry-run)
- 4. Run Test 2: Migration with auto-approve (dry-run)
- 5. Run Test 3: Migration with stage/region (dry-run)
- 6. Show generated CDK code
- 7. Show generated reports
- 8. Run FULL migration (without dry-run)
- 9. Clean up test resources
- 0. Exit

**Typical Flow:**
```bash
./scripts/test-messy-env.sh

# In the menu:
# P. Select AWS profile (if you have multiple profiles)
# 1. Select option 1 (check prerequisites)
# 2. Select option 2 (setup test environment)
# 3. Select option 3 (run basic test)
# 7. Select option 7 (view reports)
# 9. Select option 9 (cleanup when done)
```

## Option 2: Command-Line Testing

Run specific tests directly:

```bash
# Setup everything (using default AWS profile)
./scripts/test-messy-env.sh setup

# Setup with specific AWS profile
./scripts/test-messy-env.sh --profile my-aws-profile setup

# Run individual tests
./scripts/test-messy-env.sh test1   # Basic migration
./scripts/test-messy-env.sh test2   # Drift detection
./scripts/test-messy-env.sh test3   # Confidence scoring

# Run tests with specific profile
./scripts/test-messy-env.sh --profile production test1
./scripts/test-messy-env.sh --profile staging test2

# Full migration (actual import)
./scripts/test-messy-env.sh full

# Cleanup
./scripts/test-messy-env.sh cleanup
```

**Available AWS Profile Options:**

The script will use your configured AWS profiles from `~/.aws/credentials` or `~/.aws/config`. You can:
- Use default profile (no flag)
- Specify profile via `--profile` flag
- Select interactively from menu option P

---

## ⚠️ Important Note: Messy Environment Features

The messy environment features (drift detection, confidence scoring, resource discovery, etc.) are **built into the code** and work automatically during migration. They don't require special CLI flags.

**Available CLI Flags:**
- `--source <dir>` - Source directory with serverless.yml
- `--target <dir>` - Target directory for CDK output
- `--dry-run` - Preview changes without executing
- `--auto-approve` - Skip approval prompts
- `--stage <stage>` - Serverless stage (dev, prod, etc.)
- `--region <region>` - AWS region
- `--verbose` - Detailed logging
- `--skip-backup` - Don't create backups
- `--resume <id>` - Resume previous migration

The tests demonstrate the migration tool working with real AWS resources. When you run the migration, it will automatically:
✅ Discover AWS resources
✅ Match CloudFormation logical IDs to physical resources
✅ Calculate confidence scores
✅ Prompt for human intervention when needed

---

## Option 3: Manual Step-by-Step

### Step 1: Build the Project

```bash
npm install
npm run build
```

### Step 2: Create Test AWS Resources

```bash
# Create a DynamoDB table for testing
aws dynamodb create-table \
  --table-name test-users-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Environment,Value=test
```

### Step 3: Create Test Serverless Project

```bash
mkdir -p test-project
cd test-project

cat > serverless.yml << 'EOF'
service: test-migration

provider:
  name: aws
  runtime: nodejs18.x

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: test-users  # Different from AWS!
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
EOF
```

### Step 4: Run Migration

```bash
cd ..
npm run migrate -- --source ./test-project --dry-run
```

### Step 5: Review Output

You should see:
- ✅ Resource discovery (finds test-users-table)
- ✅ Resource matching (fuzzy match ~75% confidence)
- ✅ Confidence scoring
- ✅ Manual review report generated

### Step 6: View Reports

```bash
# View HTML report
open .migration-state/manual-review-report.html

# View JSON data
cat .migration-state/differences.json | jq '.'

# View audit trail
cat .migration-state/interventions.json | jq '.'
```

### Step 7: Cleanup

```bash
aws dynamodb delete-table --table-name test-users-table
rm -rf test-project .migration-state
```

---

## Quick Feature Tests

### Test Physical ID Resolution

```bash
# Create exact match
aws dynamodb create-table \
  --table-name exact-match-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create serverless.yml with same name
cat > serverless.yml << 'EOF'
resources:
  Resources:
    ExactMatchTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: exact-match-table  # Exact match!
EOF

# Run migration - should auto-match with 90%+ confidence
npm run migrate -- --source . --dry-run
```

**Expected**: Auto-match with 90-95% confidence, no human intervention needed.

### Test Fuzzy Matching

```bash
# Create table with similar name
aws dynamodb create-table \
  --table-name fuzzy-test-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create serverless.yml with slightly different name
cat > serverless.yml << 'EOF'
resources:
  Resources:
    FuzzyTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: fuzzy-tst-tbl  # Similar but not exact
EOF

# Run migration
npm run migrate -- --source . --dry-run
```

**Expected**: Fuzzy match with 40-70% confidence, flagged for review.

### Test Human Intervention

```bash
# Create two similar tables
aws dynamodb create-table \
  --table-name ambiguous-prod \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb create-table \
  --table-name ambiguous-dev \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create serverless.yml with ambiguous name
cat > serverless.yml << 'EOF'
resources:
  Resources:
    AmbiguousTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ambiguous  # Could match either!
EOF

# Run migration (interactive)
npm run migrate -- --source .
```

**Expected**: Interactive prompt to choose between ambiguous-prod and ambiguous-dev.

### Test Drift Detection

```bash
# Create table
aws dynamodb create-table \
  --table-name drift-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Enable TTL (manual modification)
aws dynamodb update-time-to-live \
  --table-name drift-table \
  --time-to-live-specification "Enabled=true,AttributeName=ttl"

# Create serverless.yml without TTL
cat > serverless.yml << 'EOF'
resources:
  Resources:
    DriftTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: drift-table
        BillingMode: PAY_PER_REQUEST
        # No TTL config - will detect drift!
EOF

# Run migration with drift detection
npm run migrate -- --source . --enable-drift-detection
```

**Expected**: Drift detected, interactive prompt for resolution strategy.

### Test Confidence Scoring

```bash
# Create mix of resources
aws dynamodb create-table --table-name high-confidence-table ...  # Exact match
aws dynamodb create-table --table-name medium-conf-tbl ...        # Fuzzy match
aws dynamodb create-table --table-name low-conf-prod ...          # Ambiguous
aws dynamodb create-table --table-name low-conf-dev ...           # Ambiguous

# Run migration with confidence breakdown
npm run migrate -- --source . --show-confidence-breakdown
```

**Expected**: Detailed confidence breakdown showing high/medium/low categories.

---

## Verification Checklist

After each test, verify:

- [ ] **Console output** is colored and formatted correctly
- [ ] **Progress indicators** show during long operations
- [ ] **Confidence scores** are calculated and displayed
- [ ] **Reports generated** in `.migration-state/`
- [ ] **Audit trail** captures all interventions
- [ ] **No errors** in output (unless testing error handling)
- [ ] **Generated CDK code** is valid TypeScript
- [ ] **Physical IDs** match expected resources

---

## Common Issues & Solutions

### "Command not found: npm"
**Solution**: Install Node.js 18+ from nodejs.org

### "AWS credentials not configured"
**Solution**: Run `aws configure` and enter your credentials

### "No resources discovered"
**Solution**: Check AWS region matches your resources
```bash
aws configure get region
aws dynamodb list-tables --region us-east-1
```

### "Permission denied: ./scripts/test-messy-env.sh"
**Solution**: Make script executable
```bash
chmod +x scripts/test-messy-env.sh
```

### "Table already exists"
**Solution**: Delete existing test tables
```bash
aws dynamodb delete-table --table-name test-users-table
```

---

## Performance Expectations

Your tests should complete within these timeframes:

- **Resource discovery**: <5 seconds for ~10 resources
- **Resource matching**: <2 seconds for ~10 resources
- **Confidence calculation**: <1 second for ~10 resources
- **CDK generation**: <3 seconds
- **Full migration (dry-run)**: <15 seconds total

If slower, check:
- AWS API throttling
- Network latency
- Cache is working (2nd run should be faster)

---

## Next Steps

After successful testing:

1. Review the **detailed manual testing guide**: `docs/MANUAL_TESTING_GUIDE.md`
2. Check **production deployment guide**: `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
3. Read **user guide** for all features: `docs/USER_GUIDE.md`
4. See **changelog** for v2.0.0 features: `CHANGELOG.md`

---

## Need Help?

- **Full manual testing guide**: See `docs/MANUAL_TESTING_GUIDE.md`
- **Troubleshooting**: See `docs/PRODUCTION_DEPLOYMENT_GUIDE.md#troubleshooting`
- **User guide**: See `docs/USER_GUIDE.md`
- **Code examples**: See `tests/integration/messy-environment/`

**Happy testing!** 🚀
