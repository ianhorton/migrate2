# Serverless-to-CDK Migration Tool - User Guide

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Commands](#commands)
6. [Migration Workflow](#migration-workflow)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

The Serverless-to-CDK Migration Tool automates the migration of AWS applications from Serverless Framework to AWS CDK, eliminating manual template comparison and error-prone editing steps. **Version 2.0.0** adds comprehensive support for "messy" real-world environments.

### Key Features

✅ **Messy Environment Support** ⭐ NEW - Handles real-world complexity with human intervention
✅ **Physical ID Resolution** - Smart matching with 90%+ accuracy and confidence scoring
✅ **Drift Detection** - Detects and resolves manual CloudFormation modifications
✅ **Interactive Checkpoints** - Pauses at critical decision points for human review
✅ **Automated Resource Discovery** - Discovers all resources including abstracted ones (60-80% typically hidden)
✅ **Intelligent Template Comparison** - Compares CloudFormation templates with severity classification
✅ **Safe Migration** - Automatic backups, validation gates, and rollback capability
✅ **CDK Code Generation** - Generates production-ready TypeScript CDK code
✅ **State Management** - Resume interrupted migrations at any point
✅ **Dry-Run Mode** - Preview all changes before executing them

### What Gets Automated

- CloudFormation template parsing and comparison
- Resource discovery and classification
- CDK code generation
- Template editing with dependency updates
- Stack operations (protect, remove, import, deploy)
- Drift detection and verification

---

## Installation

### Prerequisites

- Node.js 18+ (LTS recommended)
- AWS CLI configured with credentials
- Serverless Framework CLI (`npm install -g serverless`)
- AWS CDK CLI (`npm install -g aws-cdk`)

### Install the Tool

```bash
# Clone or install the package
npm install -g sls-to-cdk

# Verify installation
sls-to-cdk --version
```

---

## Quick Start

### Interactive Migration (Recommended)

```bash
sls-to-cdk migrate
```

The interactive wizard will guide you through:
1. Source Serverless app directory
2. Target CDK output directory
3. Migration options (dry-run, auto-approve, etc.)

### Command-Line Migration

```bash
sls-to-cdk migrate \
  --source ./serverless-app \
  --target ./cdk-app \
  --stage dev \
  --region us-east-1
```

### Dry-Run Mode

```bash
sls-to-cdk migrate --source ./serverless-app --dry-run
```

---

## Configuration

### Configuration File

Create `.sls-to-cdk.json` in your project root:

```json
{
  "source": {
    "path": "./serverless-app",
    "stage": "dev",
    "region": "us-east-1"
  },
  "target": {
    "path": "./cdk-app",
    "stackName": "MyMigratedStack",
    "language": "typescript"
  },
  "resources": {
    "include": ["*"],
    "exclude": []
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

### Environment Variables

```bash
export AWS_PROFILE=myprofile
export AWS_REGION=us-east-1
export SLS_DEBUG=1  # Enable Serverless debug output
```

---

## Commands

### `migrate`

Run the complete migration workflow.

```bash
sls-to-cdk migrate [options]

Options:
  --source <path>       Source Serverless directory
  --target <path>       Target CDK directory
  --stage <stage>       Serverless stage (default: dev)
  --region <region>     AWS region
  --dry-run            Preview changes without executing
  --interactive        Use interactive wizard (default)
  --auto-approve       Skip confirmation prompts
  --resume <id>        Resume previous migration
  --config <file>      Configuration file path
```

### `scan`

Scan Serverless configuration and discover resources.

```bash
sls-to-cdk scan --source ./serverless-app --stage dev

Output:
  - Console summary
  - JSON report: ./scan-report.json
```

### `compare`

Compare Serverless and CDK CloudFormation templates.

```bash
sls-to-cdk compare \
  --sls-template .serverless/cloudformation-template-update-stack.json \
  --cdk-template cdk.out/MyStack.template.json \
  --output comparison-report.html
```

### `generate`

Generate CDK code from Serverless configuration.

```bash
sls-to-cdk generate \
  --source ./serverless-app \
  --target ./cdk-app \
  --language typescript
```

### `verify`

Verify migration readiness and prerequisites.

```bash
sls-to-cdk verify --source ./serverless-app --target ./cdk-app
```

### `rollback`

Rollback to a previous migration step.

```bash
sls-to-cdk rollback <migration-id> --to INITIAL_SCAN
```

### `list`

List all migrations.

```bash
sls-to-cdk list

# Show detailed info
sls-to-cdk list --verbose
```

### `status`

Show migration status.

```bash
sls-to-cdk status <migration-id>
```

---

## Migration Workflow

The tool executes 9 sequential steps:

### 1. **Initial Scan** (`INITIAL_SCAN`)
- Parse `serverless.yml`
- Generate CloudFormation template
- Discover all resources (explicit + abstracted)
- Build dependency graph
- Classify resources (IMPORT vs RECREATE)

**Output**: Scan report with resource inventory

### 2. **Protect Resources** (`DISCOVERY`)
- Add `DeletionPolicy: Retain` to stateful resources
- Deploy Serverless stack with protections
- Verify deployment success

**Why**: Prevents accidental deletion during migration

### 3. **Generate CDK Code** (`CDK_GENERATION`)
- Generate TypeScript CDK stack
- Create app entry point
- Generate `cdk.json` configuration
- Run `cdk synth` to generate CloudFormation

**Output**: Complete CDK project structure

### 4. **Compare Templates** (`COMPARISON`)
- Match resources by physical IDs
- Deep property comparison
- Classify differences (CRITICAL/WARNING/ACCEPTABLE)
- Generate comparison report

**Gate**: Blocks if critical differences found

### 5. **Remove from Serverless** (`TEMPLATE_MODIFICATION`)
- Remove resources from Serverless template
- Update dependencies (DependsOn)
- Validate template
- Update CloudFormation stack via AWS API

**Result**: Resources orphaned (exist in AWS, not in any stack)

### 6. **Import Preparation** (`IMPORT_PREPARATION`)
- Prepare import mapping file
- Validate resource identifiers
- Check CDK stack readiness

### 7. **Deploy CDK** (`VERIFICATION` - Deploy)
- Execute `cdk import` to import orphaned resources
- Deploy new CDK resources (Lambda functions, etc.)
- Monitor deployment progress

**Result**: All resources managed by CDK stack

### 8. **Verify Migration** (`VERIFICATION` - Verify)
- Check stack drift
- Verify all resources exist
- Verify resource configurations match
- Run smoke tests

**Gate**: Fails if drift detected or resources missing

### 9. **Cleanup** (`COMPLETE`)
- Optionally remove old Serverless stack
- Clean up temporary files
- Generate final migration report
- Create backups

**Output**: Final summary and next steps

---

## Troubleshooting

### Common Issues

#### Issue: "Resource not found in AWS"
**Cause**: Resource was deleted or in different region/account
**Solution**: Check AWS console, verify region and credentials

#### Issue: "Template comparison failed: critical differences"
**Cause**: CDK template doesn't match Serverless template
**Solution**:
1. Review comparison report (HTML)
2. Update CDK code to match properties
3. Re-run comparison step

#### Issue: "Circular dependency detected"
**Cause**: Resources have circular DependsOn references
**Solution**: Review dependency graph, break circular references

#### Issue: "Stack drift detected after migration"
**Cause**: Resource configuration changed outside CloudFormation
**Solution**:
1. Check drift details
2. Import current configuration
3. Update CDK code

### Debug Mode

Enable detailed logging:

```bash
export SLS_TO_CDK_DEBUG=1
sls-to-cdk migrate --source ./app
```

### State Management

Migrations are saved in `.migration-state/`:

```bash
# List all migrations
ls -la .migration-state/

# Inspect migration state
cat .migration-state/migration-<id>.json

# Restore from backup
sls-to-cdk rollback <migration-id> --to INITIAL_SCAN
```

---

## Best Practices

### Before Migration

1. **Backup Everything**
   - Export Serverless stack template
   - Backup all resource configurations
   - Document current application state

2. **Test in Non-Production**
   - Run migration on dev/staging first
   - Verify application functionality
   - Test rollback procedures

3. **Review Resource Inventory**
   - Run `scan` command first
   - Verify all resources discovered
   - Check for custom resources or plugins

### During Migration

1. **Use Interactive Mode**
   - Review each step before proceeding
   - Check comparison reports carefully
   - Verify resource mappings

2. **Monitor Progress**
   - Watch CloudFormation events
   - Check AWS console
   - Review generated CDK code

3. **Verify After Each Step**
   - Enable `verifyAfterEachStep` option
   - Check logs for warnings
   - Validate resource access

### After Migration

1. **Thorough Testing**
   - Run integration tests
   - Test all application features
   - Monitor for errors

2. **Update CI/CD**
   - Replace Serverless deploy with CDK deploy
   - Update environment variables
   - Test deployment pipelines

3. **Documentation**
   - Document CDK stack structure
   - Update deployment procedures
   - Train team on CDK

### Safety Tips

✅ **Always use dry-run first**
✅ **Enable automatic backups**
✅ **Review comparison reports**
✅ **Test in non-production first**
✅ **Keep Serverless stack until verified**
✅ **Monitor application after migration**

❌ **Don't skip comparison step**
❌ **Don't auto-approve in production**
❌ **Don't delete Serverless stack immediately**
❌ **Don't migrate without backups**

---

## Messy Environment Support ⭐ NEW

Version 2.0.0 adds robust support for real-world "messy" migration scenarios.

### What is a "Messy Environment"?

Real-world environments often have:
- Physical resource names that don't match logical IDs
- Resources manually modified outside CloudFormation (drift)
- Multiple stacks sharing resources
- Template inconsistencies
- Missing or incorrect tags

### Key Features

#### 1. Physical ID Resolution

**Problem**: CloudFormation logical IDs don't always match physical resource names.

**Solution**: Intelligent matching with confidence scoring.

**Example**:
```bash
⚠️  Physical ID Resolution Required

Logical ID: UsersTable
Type: AWS::DynamoDB::Table

Found 3 candidates:

❯ ✨ users-table-prod (95% confidence) [RECOMMENDED]
  📍 us-east-1 | Created: 2024-01-15
  Tags: Environment=prod, App=myapp

  users-table-staging (60% confidence)
  📍 us-east-1 | Created: 2023-06-10

  ✏️  Enter manually
  ⏭️  Skip this resource

Choose resource: [Use arrow keys]
```

**Confidence Factors**:
- Exact name match: +90%
- Name similarity: +0-50%
- Tag matching: +20%
- Configuration match: +30%
- Recent creation: +10%

#### 2. Confidence Scoring

Every migration decision has a confidence score:

| Score | Indicator | Action |
|-------|-----------|--------|
| 95-100% | ✅ Green | Auto-proceed |
| 70-94% | ⚠️ Yellow | Review recommended |
| 0-69% | 🔴 Red | Human required |

**View confidence scores**:
```bash
# In migration output
[Step 2/9] Physical ID Resolution
  ✅ UsersTable (95% confidence) → users-table-prod
  ⚠️  SessionsTable (78% confidence) → sessions-table-prod
  🔴 ApiRole (45% confidence) → HUMAN REQUIRED
```

#### 3. Drift Detection

**Problem**: Resources modified manually outside CloudFormation.

**Solution**: Detect and resolve drift interactively.

**Example**:
```bash
🔍 Detecting CloudFormation drift...

⚠️  Drift detected in 2 resources:

Resource: ApiLambdaRole (IAM Role)
Status: MODIFIED

Differences:
  • Added policy: AWSLambdaVPCAccessExecutionRole
  • Changed MaxSessionDuration: 3600 → 7200

Resolve drift:
❯ Use AWS state (keep manual changes)
  Use template state (revert to template)
  Pause for manual review
  Abort migration

Choose resolution: [Use arrow keys]
```

**Drift Resolution Options**:
- **Use AWS state**: Keep manual changes, update CDK to match
- **Use template state**: Revert to template configuration
- **Manual review**: Pause for manual inspection
- **Abort**: Stop migration

#### 4. Interactive Checkpoints

Migration pauses at critical decision points:

**Checkpoint 1: Physical ID Resolution**
- Triggered: When stateful resources need ID resolution
- Action: Select or confirm physical IDs

**Checkpoint 2: Critical Differences Review**
- Triggered: When critical template differences found
- Action: Review comparison report, decide how to proceed

**Checkpoint 3: Drift Detection**
- Triggered: When CloudFormation drift detected
- Action: Choose drift resolution strategy

**Checkpoint 4: CDK Import Execution**
- Triggered: Before importing resources into CDK
- Action: Review import plan, monitor process

**Example**:
```bash
🛑 Checkpoint: Critical Differences Review

Found 2 critical differences that may cause import failure:

1. UsersTable - AttributeDefinitions mismatch
   Serverless: [userId: S, email: S]
   CDK: [userId: S]

   Impact: Import will fail if GSI references missing attribute

2. ApiGateway - StageName mismatch
   Serverless: "prod"
   CDK: "production"

   Impact: Will create new stage instead of importing existing

Options:
  1. Continue anyway (may fail)
  2. Pause for manual fix
  3. Abort migration

Choose option [2]: _
```

#### 5. Human Intervention Prompts

Interactive prompts with full context:

**Types of Prompts**:
- **Choice**: Select from multiple options
- **Confirm**: Yes/No decision
- **Input**: Enter value manually

**Example Prompts**:

```bash
# Prompt Type: Choice
❓ Multiple IAM roles found matching "ApiRole"

Which role should be imported?

  1. api-lambda-role-prod (Created: 2024-01-15)
     Policies: AWSLambdaBasicExecutionRole, CustomApiPolicy

  2. legacy-api-role (Created: 2023-06-10)
     Policies: AWSLambdaBasicExecutionRole

  3. Enter ARN manually
  4. Skip this resource

Select option [1-4]: _
```

```bash
# Prompt Type: Confirm
⚠️  WARNING: Proceeding will remove 5 resources from Serverless stack

Resources to be removed:
  • UsersTable (DynamoDB)
  • SessionsTable (DynamoDB)
  • ApiLambdaRole (IAM)
  • LogsBucket (S3)
  • ApiGateway (API Gateway)

These resources will be orphaned (exist in AWS but not in any stack)
until imported into CDK stack.

Continue? [y/N]: _
```

#### 6. Manual Review Reports

Comprehensive reports for human review:

**HTML Report** (`.migration-state/comparison-report.html`):
- Interactive web interface
- Side-by-side comparison
- Confidence score visualization
- Resource dependency graph

**Terminal Summary**:
```bash
📊 Manual Review Required

Summary:
  Total Resources: 15
  Auto-Resolvable: 10 (67%)
  Requires Review: 5 (33%)
  Overall Confidence: 78%

Resources Requiring Review:

1. UsersTable (DynamoDB) - Confidence: 65%
   ⚠️  Critical: AttributeDefinitions differ
   ⚠️  Warning: BillingMode differs

   Recommendations:
   • Verify GSI attribute definitions in CDK code
   • Review billing mode change impact

2. ApiRole (IAM) - Confidence: 45%
   🔴 Human Required: Multiple candidates found

   Candidates:
   • api-lambda-role-prod (60% match)
   • legacy-api-role (40% match)
```

### Configuration

Enable messy environment features in `.sls-to-cdk.json`:

```json
{
  "messyEnvironment": {
    "enabled": true,
    "confidenceThreshold": 0.9,
    "autoResolveAbove": 0.95,
    "requireHumanReviewBelow": 0.7,
    "detectDrift": true,
    "interactiveCheckpoints": true
  }
}
```

### Best Practices

1. **Always enable drift detection** in production
2. **Use dry-run first** to preview decisions
3. **Review confidence scores** - investigate low scores
4. **Save intervention history** for audit trail
5. **Test in non-production first** with messy environment features

### Troubleshooting

**Issue**: "Low confidence scores for all resources"

**Solution**:
- Add tags to AWS resources for better matching
- Use explicit physical IDs in template
- Lower confidence threshold if appropriate

**Issue**: "Too many human intervention prompts"

**Solution**:
- Increase `autoResolveAbove` threshold
- Pre-configure responses in non-interactive mode
- Fix naming inconsistencies in AWS

**Issue**: "Drift detection takes too long"

**Solution**:
- Disable drift detection: `"detectDrift": false`
- Run drift detection separately before migration
- Limit to specific resources

---

## Next Steps

After successful migration:

1. **Remove Serverless Stack** (optional)
   ```bash
   sls-to-cdk cleanup --remove-serverless-stack
   ```

2. **Update Team Documentation**
   - CDK deployment procedures
   - Stack management
   - Troubleshooting guides

3. **Optimize CDK Code**
   - Convert L1 to L2 constructs
   - Add custom logic
   - Implement best practices

4. **Set Up Monitoring**
   - CloudWatch dashboards
   - Alarms and notifications
   - Cost tracking

---

## Support

- **Documentation**: https://github.com/your-org/sls-to-cdk/docs
- **Issues**: https://github.com/your-org/sls-to-cdk/issues
- **Examples**: https://github.com/your-org/sls-to-cdk/examples

---

*Tool Version: 2.0.0*
*Last Updated: 2025-01-23*
