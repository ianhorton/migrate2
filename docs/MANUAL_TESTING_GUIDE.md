# Manual Testing Guide - Messy Environment Support

This guide walks you through manually testing all messy environment features to verify they work as expected.

## Prerequisites

### 1. Install Dependencies

```bash
npm install
npm run build
```

### 2. AWS Setup

You need an AWS account with existing resources to test discovery and matching features.

**Required AWS Permissions** (add to your IAM user/role):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "dynamodb:ListTagsOfResource",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "s3:GetBucketTagging",
        "s3:GetBucketVersioning",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "lambda:ListTags",
        "logs:DescribeLogGroups",
        "logs:ListTagsLogGroup",
        "iam:ListRoles",
        "iam:GetRole",
        "iam:ListRoleTags",
        "cloudformation:DetectStackDrift",
        "cloudformation:DescribeStackDriftDetectionStatus",
        "cloudformation:DescribeStackResourceDrifts"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. Configure AWS Credentials

```bash
aws configure
# Or set environment variables:
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1
```

---

## Test Scenario 1: Physical ID Resolution with Auto-Discovery

This tests the system's ability to automatically match CloudFormation logical IDs to physical AWS resources.

### Setup

Create a test DynamoDB table in AWS Console:

```bash
aws dynamodb create-table \
  --table-name users-table-production \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Environment,Value=production Key=Application,Value=MyApp
```

### Create Test Serverless Project

```bash
mkdir -p test-manual/serverless-project
cd test-manual/serverless-project
```

Create `serverless.yml`:

```yaml
service: my-test-service

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1

resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: users-table  # Note: Different from actual name!
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        Tags:
          - Key: Environment
            Value: production
          - Key: Application
            Value: MyApp
```

### Run Migration

```bash
cd ../..
npm run migrate -- --source ./test-manual/serverless-project
```

### Expected Behavior

**Step 1: Resource Discovery**
```
🔍 Discovering AWS resources...
  ✓ Found 3 DynamoDB tables
  ✓ Found 5 S3 buckets
  ✓ Found 2 Lambda functions
  ✓ Cached results for 5 minutes
```

**Step 2: Resource Matching**
```
🎯 Matching CloudFormation resources to AWS...

  Resource: UsersTable (AWS::DynamoDB::Table)
  Template name: users-table

  Candidates found:
    1. users-table-production (85% confidence) [RECOMMENDED]
       - Name similarity: 75%
       - Tags match: ✓
       - Configuration match: ✓
       - Recently created: ✓

    2. users-table-dev (60% confidence)
       - Name similarity: 80%
       - Tags match: ✗

  ✅ Auto-selected: users-table-production
```

**Step 3: Confidence Report**
```
📊 Migration Confidence: 85%

  Recommendation: PROCEED WITH REVIEW
  - 1 resource with high confidence (>80%)
  - 0 resources requiring human intervention
```

### Verify Results

Check the generated CDK code includes the correct physical ID:

```bash
cat ./test-manual/serverless-project/cdk/lib/cdk-stack.ts
```

Should contain:

```typescript
// Import existing DynamoDB table
const usersTable = dynamodb.Table.fromTableArn(
  this,
  'UsersTable',
  'arn:aws:dynamodb:us-east-1:123456789012:table/users-table-production'
);
```

---

## Test Scenario 2: Human Intervention for Ambiguous Resources

This tests interactive prompts when the system can't confidently match resources.

### Setup

Create two similar tables:

```bash
aws dynamodb create-table \
  --table-name orders-prod \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb create-table \
  --table-name orders-staging \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Update `serverless.yml`:

```yaml
resources:
  Resources:
    OrdersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: orders  # Ambiguous - matches both!
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```

### Run Migration

```bash
npm run migrate -- --source ./test-manual/serverless-project
```

### Expected Behavior

**Interactive Prompt Appears**:

```
🛑 CHECKPOINT: Physical ID Resolution

⚠️  Multiple candidates found for OrdersTable

? Select physical ID for AWS::DynamoDB::Table "OrdersTable":
❯ orders-prod (50% confidence)
  orders-staging (50% confidence)
  ✏️  Enter manually
  ⏭️  Skip this resource
```

**Use Arrow Keys** to select `orders-prod`, press Enter.

**Audit Trail Created**:

```
✅ Intervention recorded
   Resource: OrdersTable
   Selected: orders-prod
   Timestamp: 2025-01-23T14:30:00Z

📝 Audit trail saved to: .migration-state/interventions.json
```

### Verify Audit Trail

```bash
cat .migration-state/interventions.json
```

Expected content:

```json
{
  "interventions": [
    {
      "id": "int-1",
      "timestamp": "2025-01-23T14:30:00.000Z",
      "resourceLogicalId": "OrdersTable",
      "resourceType": "AWS::DynamoDB::Table",
      "promptType": "physical-id-selection",
      "question": "Select physical ID for AWS::DynamoDB::Table \"OrdersTable\"",
      "selectedValue": "orders-prod",
      "selectedOption": {
        "physicalId": "orders-prod",
        "confidence": 0.5,
        "source": "discovered"
      },
      "allOptions": [
        {
          "physicalId": "orders-prod",
          "confidence": 0.5,
          "source": "discovered"
        },
        {
          "physicalId": "orders-staging",
          "confidence": 0.5,
          "source": "discovered"
        }
      ]
    }
  ]
}
```

---

## Test Scenario 3: CloudFormation Drift Detection

Tests detection of differences between AWS state and template definitions.

### Setup

Create a table and manually modify it:

```bash
# Create table
aws dynamodb create-table \
  --table-name sessions-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Enable TTL (drift from template!)
aws dynamodb update-time-to-live \
  --table-name sessions-table \
  --time-to-live-specification "Enabled=true,AttributeName=ttl"

# Add tags (drift from template!)
aws dynamodb tag-resource \
  --resource-arn arn:aws:dynamodb:us-east-1:ACCOUNT:table/sessions-table \
  --tags Key=ManuallyadDed,Value=true
```

Update `serverless.yml`:

```yaml
resources:
  Resources:
    SessionsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: sessions-table
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        # Note: No TTL in template!
```

### Run Migration with Drift Detection

```bash
npm run migrate -- --source ./test-manual/serverless-project --enable-drift-detection
```

### Expected Behavior

**Drift Detection**:

```
🔄 Detecting CloudFormation drift...

⚠️  DRIFT DETECTED: SessionsTable

Property Differences:
  ✓ TimeToLiveSpecification
    Template: undefined
    AWS:      { Enabled: true, AttributeName: 'ttl' }

  ✓ Tags
    Template: []
    AWS:      [{ Key: 'ManuallyAdded', Value: 'true' }]

Drift Severity: MAJOR
```

**Checkpoint Triggered**:

```
🛑 CHECKPOINT: Drift Detection Review

The following resources have drifted from their templates:
  • SessionsTable (MAJOR drift)

? How would you like to proceed?
❯ Use AWS state (update CDK to match AWS)
  Use template (may cause drift)
  Manual review (pause migration)
  Abort migration
```

Select **"Use AWS state"**.

**Expected Result**:

The generated CDK code should include the TTL configuration:

```typescript
const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
  tableName: 'sessions-table',
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl', // ← Added from AWS state
});

// Manual tags detected
cdk.Tags.of(sessionsTable).add('ManuallyAdded', 'true');
```

---

## Test Scenario 4: Template Difference Analysis

Tests classification of acceptable vs critical differences.

### Setup

Create a complex Serverless config with various differences:

```yaml
resources:
  Resources:
    # Acceptable difference: Default removal policy
    LogsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: logs-table
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        # CDK will add: RemovalPolicy: RETAIN by default

    # Warning: Encryption change
    SecureTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: secure-table
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        SSESpecification:
          SSEEnabled: false  # CDK defaults to true!

    # Critical: Stateful resource property change
    DataBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: my-data-bucket
        # Missing: VersioningConfiguration
        # AWS has versioning enabled!
```

### Run Migration

```bash
npm run migrate -- --source ./test-manual/serverless-project
```

### Expected Behavior

**Difference Analysis**:

```
📊 Template Difference Analysis

✅ ACCEPTABLE DIFFERENCES (3):
  1. LogsTable.RemovalPolicy
     Template: undefined
     CDK:      RETAIN
     Auto-resolvable: Yes (CDK default)

  2. SecureTable.SSESpecification.SSEEnabled
     Template: false
     CDK:      true
     Auto-resolvable: Yes (AWS best practice)

⚠️  WARNING DIFFERENCES (1):
  1. DataBucket.VersioningConfiguration
     Template: undefined
     AWS:      { Status: 'Enabled' }
     Impact: May disable versioning on import

🛑 CHECKPOINT: Critical Differences Review

? The following differences require review:
  • DataBucket versioning configuration mismatch

  Continue with import? (y/N)
```

**Manual Review Report Generated**:

```
📄 Manual Review Report: .migration-state/manual-review-report.html
   Open in browser for detailed analysis
```

Open the HTML report:

```bash
open .migration-state/manual-review-report.html
```

**Expected HTML Report** should show:

- Color-coded difference severity
- Side-by-side template vs AWS comparison
- Recommendations for each difference
- Export options (JSON, Markdown)

---

## Test Scenario 5: Interactive CDK Import

Tests the automated CDK import process with monitoring.

### Setup

Ensure you have a CDK project generated from previous scenarios.

### Run Import

```bash
npm run migrate -- \
  --source ./test-manual/serverless-project \
  --execute-import
```

### Expected Behavior

**Process Monitoring**:

```
🚀 Starting interactive CDK import...

Import Plan:
  ✓ UsersTable → users-table-production
  ✓ OrdersTable → orders-prod
  ✓ SessionsTable → sessions-table

⏳ Executing: npx cdk import --force

CDK Output:
  UsersTable (AWS::DynamoDB::Table): creating...
  [████████░░] 80%

  ↪ Detected prompt: "Do you want to import UsersTable with..."
  ↪ Auto-response: yes

  ✅ UsersTable imported successfully

  OrdersTable (AWS::DynamoDB::Table): creating...
  [██████████] 100%

  ✅ OrdersTable imported successfully
```

**Progress Tracking**:

```
📊 Import Progress:
  Completed: 2/3 resources (66%)
  Remaining: SessionsTable
  Elapsed: 45s
```

**Completion Summary**:

```
✅ Import completed successfully!

Summary:
  ✓ Resources imported: 3
  ✓ Duration: 1m 23s
  ✓ No errors

📝 Import log: .migration-state/import-log.txt
```

### Verify Import

Check CloudFormation stack:

```bash
aws cloudformation describe-stack-resources \
  --stack-name my-test-service-cdk \
  --query 'StackResources[].{Resource:LogicalResourceId,Type:ResourceType,Status:ResourceStatus}'
```

Expected output:

```json
[
  {
    "Resource": "UsersTable",
    "Type": "AWS::DynamoDB::Table",
    "Status": "IMPORT_COMPLETE"
  },
  {
    "Resource": "OrdersTable",
    "Type": "AWS::DynamoDB::Table",
    "Status": "IMPORT_COMPLETE"
  },
  {
    "Resource": "SessionsTable",
    "Type": "AWS::DynamoDB::Table",
    "Status": "IMPORT_COMPLETE"
  }
]
```

---

## Test Scenario 6: Checkpoint System

Tests pause/resume functionality at critical decision points.

### Run Migration with Checkpoints

```bash
npm run migrate -- \
  --source ./test-manual/serverless-project \
  --enable-checkpoints
```

### Expected Behavior

**Checkpoint 1: Physical ID Resolution**

```
🛑 CHECKPOINT: Physical ID Resolution

Verify physical IDs for all stateful resources:
  ✓ UsersTable → users-table-production (85% confidence)
  ⚠ OrdersTable → orders-prod (50% confidence, user selected)
  ✓ SessionsTable → sessions-table (90% confidence)

? Proceed with these physical IDs? (Y/n/pause/abort)
```

Options:
- `Y` - Continue to next checkpoint
- `n` - Go back and re-select
- `pause` - Save state and exit
- `abort` - Cancel migration

Press `Y` to continue.

**Checkpoint 2: Critical Differences**

```
🛑 CHECKPOINT: Critical Differences Review

The following critical differences were found:
  ⚠️  DataBucket.VersioningConfiguration mismatch

Review details:
  1. View HTML report (.migration-state/manual-review-report.html)
  2. Review JSON export (.migration-state/differences.json)

? How would you like to proceed?
❯ Continue (accept differences)
  Pause (review offline)
  Modify template
  Abort migration
```

Select **"Pause"**.

**State Saved**:

```
💾 Migration state saved

   Checkpoint: critical-differences-review
   State file: .migration-state/checkpoint-state.json

To resume: npm run migrate -- --resume
```

### Resume Migration

```bash
npm run migrate -- --resume
```

**Expected Behavior**:

```
🔄 Resuming migration...

Last checkpoint: critical-differences-review
Previous selections restored:
  ✓ UsersTable → users-table-production
  ✓ OrdersTable → orders-prod
  ✓ SessionsTable → sessions-table

? Continue from checkpoint? (Y/n)
```

Press `Y`.

**Checkpoint 3: Drift Detection** (if enabled):

```
🛑 CHECKPOINT: Drift Detection

SessionsTable has drifted from template.
Resolution strategy: USE_AWS_STATE (selected earlier)

? Confirm drift resolution? (Y/n)
```

**Checkpoint 4: Pre-Import Verification**

```
🛑 CHECKPOINT: Pre-Import Verification

Final verification before CDK import:

  Resources to import: 3
  Total confidence: 75%
  Critical differences: 1
  Drift resolutions: 1

Migration Plan:
  1. Import UsersTable from users-table-production
  2. Import OrdersTable from orders-prod
  3. Import SessionsTable from sessions-table (with drift fix)

Estimated duration: 2-3 minutes

? Proceed with import? (Y/n/abort)
```

---

## Test Scenario 7: Dry Run Mode

Tests the migration process without making any changes.

### Run Dry Run

```bash
npm run migrate -- \
  --source ./test-manual/serverless-project \
  --dry-run
```

### Expected Behavior

```
🔍 DRY RUN MODE - No changes will be made

Simulating migration...

Step 1: Resource Discovery
  ✓ Would discover DynamoDB tables
  ✓ Would discover S3 buckets
  ✓ Would discover Lambda functions

Step 2: Resource Matching
  ✓ Would match UsersTable → users-table-production (85%)
  ⚠️  Would prompt for OrdersTable (ambiguous)
  ✓ Would match SessionsTable → sessions-table (90%)

Step 3: Difference Analysis
  ✓ Would classify 3 acceptable differences
  ⚠️  Would flag 1 critical difference

Step 4: Drift Detection (if enabled)
  ⚠️  Would detect drift in SessionsTable

Step 5: CDK Generation
  ✓ Would generate CDK code (3 resources)
  ✓ Would create manual review report

Step 6: CDK Import
  ✓ Would import 3 resources
  ✓ Would monitor import progress

📊 Dry Run Summary:
  Resources analyzed: 3
  Human interventions required: 1
  Critical differences: 1
  Drift detected: 1
  Estimated confidence: 75%

  Recommendation: PROCEED WITH REVIEW

💾 Dry run results saved: .migration-state/dry-run-results.json
```

**No AWS Changes Made**:
- No CloudFormation stacks created
- No resources modified
- No imports executed
- Only analysis and reporting

---

## Test Scenario 8: Confidence Scoring and Recommendations

Tests the confidence-based decision system.

### Create Test Cases with Various Confidence Levels

Create `serverless.yml` with mixed scenarios:

```yaml
resources:
  Resources:
    # HIGH CONFIDENCE (90%+)
    ExactMatchTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: exact-match-table  # Exists in AWS with exact name
        BillingMode: PAY_PER_REQUEST
        Tags:
          - Key: Environment
            Value: production
        # Configuration matches AWS exactly

    # MEDIUM CONFIDENCE (70-89%)
    SimilarTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: similar-tbl  # AWS has "similar-table"
        BillingMode: PAY_PER_REQUEST
        # Some tags match

    # LOW CONFIDENCE (<70%)
    AmbiguousTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: data  # Multiple tables start with "data-"
        BillingMode: PAY_PER_REQUEST
        # No tags to help matching
```

### Run Migration

```bash
npm run migrate -- --source ./test-manual/serverless-project
```

### Expected Confidence Report

```
📊 Migration Confidence Analysis

Resource Confidence Breakdown:

  ✅ HIGH CONFIDENCE (90-100%):
    • ExactMatchTable → exact-match-table (95%)
      Factors:
        - Exact name match: 90%
        - Tags match: +20%
        - Configuration match: +30%
        - Recently created: +10%
        (Capped at 100%)

  ⚠️  MEDIUM CONFIDENCE (70-89%):
    • SimilarTable → similar-table (78%)
      Factors:
        - Fuzzy name match: 40%
        - Tags partial match: +10%
        - Configuration match: +30%

  🔴 LOW CONFIDENCE (<70%):
    • AmbiguousTable → [REQUIRES HUMAN SELECTION]
      Candidates:
        1. data-production (45%)
        2. data-staging (45%)
        3. data-archive (40%)

Overall Migration Confidence: 73%

📋 Recommendation: PROCEED WITH MANUAL REVIEW

Suggested Actions:
  1. Auto-proceed: ExactMatchTable (high confidence)
  2. Review: SimilarTable (verify fuzzy match is correct)
  3. Human selection required: AmbiguousTable

Confidence Factors Contributing to Score:
  ✓ Exact matches: 33% of resources
  ⚠️  Fuzzy matches: 33% of resources
  🔴 Ambiguous: 33% of resources

  Tag coverage: 66%
  Configuration alignment: 100%
```

---

## Test Scenario 9: Performance Benchmarking

Tests that performance meets target thresholds.

### Setup Large Resource Set

Create AWS resources:

```bash
# Create 100 DynamoDB tables for performance testing
for i in {1..100}; do
  aws dynamodb create-table \
    --table-name "perf-test-table-$i" \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Test,Value=Performance
done
```

### Run Performance Test

```bash
npm run migrate -- \
  --source ./test-manual/serverless-project \
  --performance-test
```

### Expected Performance Metrics

```
⏱️  Performance Benchmarks

Discovery Phase:
  ✓ 100 DynamoDB tables discovered in 3.2s
    Target: <10s ✅ PASS

  ✓ 50 S3 buckets discovered in 1.8s
    Target: <5s ✅ PASS

  ✓ 20 Lambda functions discovered in 0.9s
    Target: <3s ✅ PASS

Matching Phase:
  ✓ 50 resources matched against 200 candidates in 2.1s
    Target: <5s ✅ PASS

  ✓ Average match time: 42ms per resource
    Target: <100ms ✅ PASS

Confidence Calculation:
  ✓ 100 confidence scores calculated in 0.3s
    Target: <1s ✅ PASS

  ✓ Average calculation time: 3ms per resource
    Target: <10ms ✅ PASS

Fuzzy Matching:
  ✓ 1000 Levenshtein distance calculations in 0.7s
    Target: <2s ✅ PASS

Overall Performance: ✅ ALL TARGETS MET
```

---

## Verification Checklist

After running all test scenarios, verify:

### ✅ Functionality Checks

- [ ] **Physical ID Resolution**
  - [ ] Exact name matches auto-resolved
  - [ ] Fuzzy matching works for similar names
  - [ ] Human prompts appear for ambiguous cases
  - [ ] Manual entry option works

- [ ] **Resource Discovery**
  - [ ] DynamoDB tables discovered correctly
  - [ ] S3 buckets discovered with metadata
  - [ ] Lambda functions discovered
  - [ ] Tags retrieved correctly
  - [ ] Results cached (verify speed on second run)

- [ ] **Confidence Scoring**
  - [ ] High confidence resources (90%+) auto-proceed
  - [ ] Medium confidence (70-89%) flagged for review
  - [ ] Low confidence (<70%) require human selection
  - [ ] Confidence factors calculated correctly

- [ ] **Drift Detection**
  - [ ] Detects property differences
  - [ ] Classifies drift severity
  - [ ] Offers resolution strategies
  - [ ] Checkpoint triggered for major drift

- [ ] **Difference Analysis**
  - [ ] Acceptable differences classified correctly
  - [ ] Warning differences flagged
  - [ ] Critical differences trigger checkpoint
  - [ ] Auto-resolvable differences identified

- [ ] **Checkpoint System**
  - [ ] Physical ID checkpoint works
  - [ ] Critical differences checkpoint works
  - [ ] Drift detection checkpoint works
  - [ ] Pre-import verification works
  - [ ] Pause/resume state saved correctly

- [ ] **Interactive Import**
  - [ ] CDK import process spawns correctly
  - [ ] Output monitored in real-time
  - [ ] Prompts detected and answered
  - [ ] Progress tracking works
  - [ ] Completion summary accurate

- [ ] **Reporting**
  - [ ] HTML report generated correctly
  - [ ] Terminal output formatted properly
  - [ ] JSON export contains all data
  - [ ] Markdown export readable

- [ ] **Audit Trail**
  - [ ] All interventions recorded
  - [ ] Timestamps accurate
  - [ ] Decision context captured
  - [ ] JSON format valid

### ✅ Quality Checks

- [ ] **Error Handling**
  - [ ] AWS access denied handled gracefully
  - [ ] Missing resources don't crash
  - [ ] Invalid input validated
  - [ ] Timeout protection works

- [ ] **Performance**
  - [ ] Discovery completes in <10s for 100 resources
  - [ ] Matching completes in <5s for 50 resources
  - [ ] Confidence calculation <1s for 100 resources
  - [ ] No memory leaks during long operations

- [ ] **User Experience**
  - [ ] Colored output renders correctly
  - [ ] Progress spinners work
  - [ ] Clear error messages
  - [ ] Helpful prompts with recommendations

---

## Troubleshooting

### Issue: "AWS access denied"

**Solution**: Check IAM permissions and ensure all required actions are allowed.

```bash
aws sts get-caller-identity
aws iam get-user-policy --user-name YOUR_USER --policy-name YOUR_POLICY
```

### Issue: "No resources discovered"

**Solution**: Verify resources exist in the correct region.

```bash
aws dynamodb list-tables --region us-east-1
aws configure get region
```

### Issue: "Confidence always 0%"

**Solution**: Check that tags and naming conventions match between template and AWS resources.

### Issue: "CDK import fails"

**Solution**: Verify CDK is installed and project initialized correctly.

```bash
npx cdk --version
cd test-manual/serverless-project/cdk && npx cdk synth
```

### Issue: "Checkpoint state corrupted"

**Solution**: Delete checkpoint state and restart.

```bash
rm -rf .migration-state
npm run migrate -- --source ./test-manual/serverless-project
```

---

## Clean Up Test Resources

After testing, remove all created AWS resources:

```bash
# Delete DynamoDB tables
aws dynamodb delete-table --table-name users-table-production
aws dynamodb delete-table --table-name orders-prod
aws dynamodb delete-table --table-name orders-staging
aws dynamodb delete-table --table-name sessions-table

# Delete performance test tables
for i in {1..100}; do
  aws dynamodb delete-table --table-name "perf-test-table-$i"
done

# Delete local test files
rm -rf test-manual
rm -rf .migration-state
```

---

## Next Steps

Once manual testing is complete and verified:

1. **Document any issues found**
2. **Create automated integration tests** for scenarios that work
3. **Update user documentation** with real-world examples
4. **Prepare for production deployment**

For production use, see `PRODUCTION_DEPLOYMENT_GUIDE.md`.
