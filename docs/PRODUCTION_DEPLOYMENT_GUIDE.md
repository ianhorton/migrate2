# Production Deployment Guide - Serverless-to-CDK Migration Tool

## Overview

This guide covers deploying and using the Serverless-to-CDK Migration Tool v2.0.0 with **Messy Environment Support** in production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [AWS IAM Permissions](#aws-iam-permissions)
5. [Environment Variables](#environment-variables)
6. [Messy Environment Features](#messy-environment-features)
7. [Usage Examples](#usage-examples)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Prerequisites

### Required Software

- **Node.js**: 18.0.0 or higher (LTS recommended)
- **npm**: 8.0.0 or higher
- **AWS CLI**: 2.0.0 or higher
- **Serverless Framework CLI**: 3.0.0 or higher
- **AWS CDK CLI**: 2.100.0 or higher

### AWS Account Requirements

- Active AWS account with appropriate permissions
- AWS credentials configured via:
  - AWS CLI (`aws configure`)
  - Environment variables
  - IAM role (for EC2/ECS deployments)

### Supported Operating Systems

- macOS 10.15+
- Linux (Ubuntu 20.04+, Amazon Linux 2+)
- Windows 10+ (with WSL2 recommended)

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g sls-to-cdk-migrator

# Verify installation
sls-to-cdk --version
# Expected output: 2.0.0
```

### Local Project Installation

```bash
# Install as dev dependency
npm install --save-dev sls-to-cdk-migrator

# Run via npx
npx sls-to-cdk migrate --help
```

### From Source

```bash
git clone https://github.com/your-org/sls-to-cdk.git
cd sls-to-cdk
npm install
npm run build
npm link

# Verify
sls-to-cdk --version
```

---

## Configuration

### Configuration File (.sls-to-cdk.json)

Create a configuration file in your project root:

```json
{
  "source": {
    "path": "./serverless-app",
    "stage": "production",
    "region": "us-east-1"
  },
  "target": {
    "path": "./serverless-app/cdk",
    "stackName": "MyProductionStack",
    "language": "typescript"
  },
  "messyEnvironment": {
    "enabled": true,
    "confidenceThreshold": 0.9,
    "autoResolveAbove": 0.95,
    "requireHumanReviewBelow": 0.7,
    "detectDrift": true,
    "interactiveCheckpoints": true
  },
  "options": {
    "dryRun": false,
    "interactive": true,
    "autoApprove": false,
    "createBackups": true,
    "verifyAfterEachStep": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `messyEnvironment.enabled` | boolean | `true` | Enable messy environment support |
| `confidenceThreshold` | number | `0.9` | Minimum confidence for auto-proceed |
| `autoResolveAbove` | number | `0.95` | Auto-resolve physical IDs above this confidence |
| `requireHumanReviewBelow` | number | `0.7` | Force human review below this confidence |
| `detectDrift` | boolean | `true` | Enable CloudFormation drift detection |
| `interactiveCheckpoints` | boolean | `true` | Enable checkpoint system |

---

## AWS IAM Permissions

### Required IAM Permissions

The migration tool requires the following AWS permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "dynamodb:*",
        "lambda:*",
        "iam:*",
        "logs:*",
        "apigateway:*",
        "events:*",
        "sns:*",
        "sqs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Minimum IAM Policy

For production environments, use this least-privilege policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationManagement",
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStacks",
        "cloudformation:GetTemplate",
        "cloudformation:UpdateStack",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DetectStackDrift",
        "cloudformation:DescribeStackDriftDetectionStatus",
        "cloudformation:DescribeStackResourceDrifts"
      ],
      "Resource": "arn:aws:cloudformation:*:*:stack/*"
    },
    {
      "Sid": "ResourceDiscovery",
      "Effect": "Allow",
      "Action": [
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "dynamodb:ListTagsOfResource",
        "s3:ListAllMyBuckets",
        "s3:GetBucketTagging",
        "s3:GetBucketLocation",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "lambda:ListTags",
        "iam:ListRoles",
        "iam:GetRole",
        "iam:ListRoleTags",
        "logs:DescribeLogGroups",
        "logs:ListTagsLogGroup"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ResourceModification",
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateTable",
        "s3:PutBucketPolicy",
        "lambda:UpdateFunctionConfiguration",
        "iam:UpdateRole"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": ["us-east-1"]
        }
      }
    }
  ]
}
```

### IAM Role for CI/CD

If running in CI/CD, create a role with the above policy:

```bash
# Create IAM role
aws iam create-role \
  --role-name SLSToCDKMigrationRole \
  --assume-role-policy-document file://trust-policy.json

# Attach policy
aws iam put-role-policy \
  --role-name SLSToCDKMigrationRole \
  --policy-name MigrationPolicy \
  --policy-document file://migration-policy.json
```

---

## Environment Variables

### Required Environment Variables

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_PROFILE=production  # or use AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY

# Tool Configuration
export SLS_TO_CDK_DEBUG=0           # Set to 1 for debug logging
export SLS_TO_CDK_STATE_DIR=./.migration-state  # Default state directory
```

### Optional Environment Variables

```bash
# Messy Environment Settings
export SLS_TO_CDK_CONFIDENCE_THRESHOLD=0.9
export SLS_TO_CDK_AUTO_RESOLVE_THRESHOLD=0.95
export SLS_TO_CDK_INTERACTIVE=true

# Performance Tuning
export SLS_TO_CDK_MAX_CONCURRENT_DISCOVERIES=5
export SLS_TO_CDK_DISCOVERY_TIMEOUT=30000  # 30 seconds

# AWS SDK Configuration
export AWS_SDK_LOAD_CONFIG=1
export AWS_MAX_ATTEMPTS=3
export AWS_RETRY_MODE=adaptive
```

---

## Messy Environment Features

### 1. Physical ID Resolution

**Scenario**: Physical resource names don't match logical IDs in templates.

**How it works**:
1. Tool scans AWS account for resources
2. Matches resources using confidence scoring (90%+ accuracy)
3. Auto-resolves high-confidence matches (≥95%)
4. Prompts human for low-confidence matches (<70%)

**Example**:
```bash
⚠️  Cannot automatically determine physical ID for DynamoDB table

Logical ID: UsersTable
Resource Type: AWS::DynamoDB::Table

Found 3 candidates in AWS account:

❯ ✨ users-table-prod (95% confidence) [RECOMMENDED]
  📍 us-east-1 | Created: 2024-01-15

  users-table-staging (60% confidence)
  📍 us-east-1 | Created: 2023-06-10

  ✏️  Enter manually
  ⏭️  Skip this resource
```

### 2. Confidence Scoring

Every migration decision has a confidence score (0-100%):

- **95-100%**: Auto-proceed (green ✅)
- **70-94%**: Review recommended (yellow ⚠️)
- **0-69%**: Human required (red 🔴)

**Factors affecting confidence**:
- Exact name match: +90%
- Name similarity: +0-50%
- Tag matching: +20%
- Configuration match: +30%
- Recent creation: +10%

### 3. Drift Detection

**Scenario**: Resources modified manually outside CloudFormation.

**How it works**:
```bash
🔍 Detecting CloudFormation drift...

⚠️  Drift detected in 2 resources:

  - ApiLambdaRole: MODIFIED
    • Added policy: AWSLambdaVPCAccessExecutionRole
    • Changed description

How would you like to proceed?

❯ Use AWS state (keep manual changes)
  Use template state (revert to template)
  Pause for manual review
  Abort migration
```

### 4. Interactive Checkpoints

Migration pauses at critical decision points:

**Checkpoint 1**: Physical ID Resolution
- Triggered when stateful resources need ID resolution
- Allows manual selection of resources

**Checkpoint 2**: Critical Differences Review
- Triggered when critical template differences found
- Shows detailed comparison report
- Options: Continue, Pause, Abort

**Checkpoint 3**: Drift Detection
- Triggered when drift detected
- Shows drift details
- Options: Use AWS state, Use template, Manual review

**Checkpoint 4**: CDK Import Execution
- Triggered before importing resources
- Shows import plan
- Monitors import process interactively

### 5. Human Intervention Manager

Interactive prompts with context:

```bash
🔴 CRITICAL: Physical resource name mismatch

Resource: ProductsTable
Expected: products-table-dev
Found: products-table-prod

This will cause import to fail if not corrected.

Options:
  1. Update CDK code to use "products-table-prod"
  2. Continue anyway (may fail)
  3. Pause for manual fix
  4. Abort migration

Choose option [1]:
```

### 6. Audit Trail

All human interventions are recorded:

```bash
# View intervention history
cat .migration-state/migration-<id>-interventions.json
```

```json
[
  {
    "promptId": "physical-id-UsersTable",
    "timestamp": "2025-01-23T10:30:00Z",
    "action": "proceed",
    "value": "users-table-prod",
    "confidence": 0.95,
    "reason": "User selected from 3 candidates"
  }
]
```

---

## Usage Examples

### Example 1: Production Migration with Messy Environment

```bash
# Step 1: Dry-run first
sls-to-cdk migrate \
  --source ./serverless-app \
  --dry-run \
  --config .sls-to-cdk.json

# Step 2: Review dry-run output and reports

# Step 3: Run actual migration
sls-to-cdk migrate \
  --source ./serverless-app \
  --config .sls-to-cdk.json
```

**Expected Output**:
```
🚀 Starting migration with Messy Environment Support v2.0.0

📋 Migration Plan:
  • Source: ./serverless-app
  • Target: ./serverless-app/cdk
  • Resources: 15 discovered
  • Messy Environment: ENABLED
  • Drift Detection: ENABLED

[Step 1/9] Initial Scan ✅ (12s)
  ✓ Discovered 15 resources
  ✓ Classified 12 IMPORT, 3 RECREATE

[Step 2/9] Physical ID Resolution
  ⚠️  Checkpoint: Physical ID Resolution

  Processing 5 stateful resources...

  ✅ UsersTable → users-table-prod (95% confidence, auto-resolved)
  ⚠️  SessionsTable → Multiple candidates found

  Found 2 candidates:
  ❯ sessions-table-prod (85% confidence)
    sessions-table-legacy (40% confidence)

  Choose resource: [1] ▌

  ✅ LogsBucket → logs-bucket-prod (98% confidence, auto-resolved)

[Step 3/9] Generate CDK Code ✅ (8s)
  ✓ Generated TypeScript CDK stack
  ✓ Created 15 constructs

[Step 4/9] Compare Templates ✅ (5s)
  ✓ Matched all resources
  ⚠️  Found 3 warning differences
  ✓ No critical differences

[Step 5/9] Drift Detection
  🔍 Detecting CloudFormation drift...

  ⚠️  Drift detected: ApiLambdaRole
    • Policy added: AWSLambdaVPCAccessExecutionRole

  Resolve drift:
  ❯ Use AWS state (keep manual policy)
    Use template state
    Manual review

  Selection: [1] ✅

[Steps 6-9] Continue...

✅ Migration completed successfully!

📊 Summary:
  • 15 resources migrated
  • 3 human interventions
  • Overall confidence: 92%
  • Duration: 2m 15s

📄 Reports generated:
  • .migration-state/migration-<id>.json
  • .migration-state/comparison-report.html
  • .migration-state/interventions.json
```

### Example 2: Non-Interactive Mode (CI/CD)

For CI/CD pipelines, pre-configure responses:

```json
// .sls-to-cdk-responses.json
{
  "physicalIds": {
    "UsersTable": "users-table-prod",
    "SessionsTable": "sessions-table-prod",
    "ApiLambdaRole": "api-lambda-role-prod"
  },
  "driftResolution": {
    "ApiLambdaRole": "use-aws"
  },
  "criticalDifferences": "abort"
}
```

```bash
sls-to-cdk migrate \
  --source ./serverless-app \
  --non-interactive \
  --responses .sls-to-cdk-responses.json
```

### Example 3: Resume Paused Migration

```bash
# Migration was paused at checkpoint
sls-to-cdk resume <migration-id>

# Or list all migrations and select
sls-to-cdk list
sls-to-cdk resume migration-1737629400000
```

---

## Troubleshooting

### Issue: "Physical ID resolution failed"

**Cause**: Cannot determine physical resource ID

**Solution**:
1. Check AWS region is correct
2. Verify AWS permissions
3. Manually specify physical ID:
   ```bash
   sls-to-cdk migrate --physical-id UsersTable=users-table-prod
   ```

### Issue: "Confidence score too low"

**Cause**: Matching confidence below threshold

**Solution**:
1. Lower confidence threshold:
   ```json
   {
     "messyEnvironment": {
       "confidenceThreshold": 0.7
     }
   }
   ```
2. Manually review and approve
3. Add explicit physical IDs in template

### Issue: "Critical template differences"

**Cause**: CDK template doesn't match Serverless template

**Solution**:
1. Review comparison report: `.migration-state/comparison-report.html`
2. Update CDK code to match
3. Re-run comparison step:
   ```bash
   sls-to-cdk migrate --from-step COMPARISON
   ```

### Issue: "Drift detection failed"

**Cause**: AWS drift detection API issues

**Solution**:
1. Disable drift detection temporarily:
   ```json
   { "messyEnvironment": { "detectDrift": false } }
   ```
2. Check CloudFormation stack status
3. Manually review drift in AWS console

---

## Best Practices

### 1. Always Use Dry-Run First

```bash
# Test migration without changes
sls-to-cdk migrate --dry-run --source ./app
```

### 2. Enable All Safety Features

```json
{
  "messyEnvironment": {
    "enabled": true,
    "detectDrift": true,
    "interactiveCheckpoints": true
  },
  "options": {
    "createBackups": true,
    "verifyAfterEachStep": true
  }
}
```

### 3. Use Configuration Files

Store configuration in version control:
- Reviewable by team
- Consistent across environments
- CI/CD compatible

### 4. Monitor Confidence Scores

If many resources have low confidence:
- Review AWS resource naming
- Add tags for better matching
- Consider manual ID specification

### 5. Review Intervention History

After migration:
```bash
cat .migration-state/migration-<id>-interventions.json
```

Document decisions for future reference.

### 6. Test in Non-Production First

Always test migration in:
1. Development environment
2. Staging environment
3. Production (with backups)

### 7. Keep Audit Trail

Save migration reports for compliance:
```bash
# Backup migration artifacts
cp -r .migration-state/ ./backups/migration-$(date +%Y%m%d)/
```

---

## Support & Resources

- **Documentation**: https://github.com/your-org/sls-to-cdk/docs
- **Issues**: https://github.com/your-org/sls-to-cdk/issues
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md)
- **Examples**: https://github.com/your-org/sls-to-cdk/examples

---

**Version**: 2.0.0
**Last Updated**: 2025-01-23
**Status**: Production Ready
