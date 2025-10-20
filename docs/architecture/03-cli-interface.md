# CLI Interface Design

## Command Structure

The tool provides a hierarchical command structure with both high-level orchestration commands and low-level utility commands.

```
sls-to-cdk
├── migrate           # Main migration command
├── scan              # Scan Serverless application
├── compare           # Compare templates
├── generate          # Generate CDK code
├── verify            # Verify migration
├── rollback          # Rollback migration
├── resume            # Resume interrupted migration
├── status            # Show migration status
└── config            # Manage configuration
```

## Main Migration Command

### `sls-to-cdk migrate`

Primary command for executing migrations.

**Syntax:**
```bash
sls-to-cdk migrate [options]
```

**Options:**
```
  --interactive, -i          Run in interactive mode (default: true)
  --automatic, -a            Run in automatic mode without prompts
  --config, -c <path>        Path to configuration file
  --serverless-path <path>   Path to Serverless project (default: current directory)
  --cdk-path <path>          Path for CDK project (default: ./cdk-migration)
  --stage <stage>            Serverless stage (default: dev)
  --region <region>          AWS region
  --dry-run                  Simulate migration without making changes
  --auto-approve             Auto-approve all steps
  --no-backups               Skip creating backups (not recommended)
  --verify-each-step         Verify after each step
  --output-dir <path>        Output directory for reports (default: ./.sls-to-cdk)
  --verbose, -v              Verbose output
  --quiet, -q                Minimal output
  --help, -h                 Show help
```

**Examples:**

```bash
# Interactive migration (recommended for first-time users)
sls-to-cdk migrate --interactive

# Automatic migration with config file
sls-to-cdk migrate --config migration.config.json --automatic

# Dry run to preview changes
sls-to-cdk migrate --dry-run

# Migration with custom paths
sls-to-cdk migrate \
  --serverless-path ./my-sls-app \
  --cdk-path ./my-cdk-app \
  --stage prod \
  --region us-west-2
```

## Individual Step Commands

### `sls-to-cdk scan`

Scan Serverless application and discover resources.

**Syntax:**
```bash
sls-to-cdk scan [options]
```

**Options:**
```
  --serverless-path <path>   Path to Serverless project
  --stage <stage>            Serverless stage
  --region <region>          AWS region
  --output <path>            Output file for scan results (JSON)
  --format <format>          Output format (json, table, tree)
  --verbose, -v              Verbose output
```

**Output:**
```bash
$ sls-to-cdk scan --format table

┌──────────────────────┬──────────────┬─────────────────────┬───────────┐
│ Resource             │ Type         │ Physical ID         │ Action    │
├──────────────────────┼──────────────┼─────────────────────┼───────────┤
│ counterTable         │ DynamoDB     │ sandbox-table       │ IMPORT    │
│ CounterLogGroup      │ LogGroup     │ /aws/lambda/counter │ IMPORT    │
│ DataBucket           │ S3           │ sandbox-bucket      │ IMPORT    │
│ CounterFunction      │ Lambda       │ sandbox-counter     │ RECREATE  │
│ CounterRole          │ IAM Role     │ sandbox-CounterRole │ RECREATE  │
└──────────────────────┴──────────────┴─────────────────────┴───────────┘

Total: 5 resources (3 import, 2 recreate)
```

### `sls-to-cdk compare`

Compare Serverless and CDK CloudFormation templates.

**Syntax:**
```bash
sls-to-cdk compare [options]
```

**Options:**
```
  --serverless-template <path>   Path to Serverless CloudFormation template
  --cdk-template <path>          Path to CDK CloudFormation template
  --output <path>                Output file for comparison report
  --format <format>              Output format (json, html, text)
  --strict                       Strict mode (all differences are critical)
  --ignore <properties>          Comma-separated list of properties to ignore
```

**Output:**
```bash
$ sls-to-cdk compare \
  --serverless-template .serverless/cloudformation-template-update-stack.json \
  --cdk-template cdk.out/CdkStack.template.json \
  --format text

Comparison Report
=================

Resource: counterTable (DynamoDB Table)
  Status: ✅ MATCH
  Physical ID: sandbox-table
  Differences: None

Resource: CounterLogGroup (CloudWatch LogGroup)
  Status: ✅ ACCEPTABLE
  Physical ID: /aws/lambda/counter
  Differences: 1
    • RetentionInDays: undefined → 7 (ACCEPTABLE)
      CDK added log retention policy

Overall Status: READY FOR IMPORT
```

### `sls-to-cdk generate`

Generate CDK code from Serverless resources.

**Syntax:**
```bash
sls-to-cdk generate [options]
```

**Options:**
```
  --scan-result <path>       Path to scan result JSON
  --output <path>            Output directory for CDK project
  --language <lang>          CDK language (typescript, python, java)
  --stack-name <name>        CDK stack name
  --use-l2                   Use L2 constructs (default: true)
  --preserve-logical-ids     Preserve CloudFormation logical IDs
  --include-comments         Include explanatory comments
```

**Output:**
```bash
$ sls-to-cdk generate \
  --scan-result .sls-to-cdk/scan-result.json \
  --output ./cdk-migration \
  --language typescript

Generated CDK Project
=====================

Created files:
  ✓ lib/cdk-migration-stack.ts (main stack)
  ✓ bin/cdk-migration.ts (app entry point)
  ✓ cdk.json (CDK configuration)
  ✓ package.json (dependencies)
  ✓ tsconfig.json (TypeScript config)

Generated constructs:
  ✓ CounterTable (DynamoDB)
  ✓ CounterLogGroup (CloudWatch Logs)
  ✓ DataBucket (S3)

Next steps:
  1. cd cdk-migration
  2. npm install
  3. npm run build
  4. cdk synth
```

### `sls-to-cdk verify`

Verify migration state and resource consistency.

**Syntax:**
```bash
sls-to-cdk verify [options]
```

**Options:**
```
  --migration-id <id>        Migration ID to verify
  --check-drift              Check for CloudFormation drift
  --check-resources          Verify all resources exist
  --check-properties         Verify resource properties match
  --output <path>            Output file for verification report
```

**Output:**
```bash
$ sls-to-cdk verify --check-drift --check-resources

Verification Report
===================

Stack Drift Check: ✅ PASS
  No drift detected

Resource Existence: ✅ PASS
  All 3 resources verified:
    ✓ counterTable (migration-sandbox-table)
    ✓ CounterLogGroup (/aws/lambda/counter)
    ✓ DataBucket (migration-sandbox-bucket)

Resource Properties: ✅ PASS
  All properties match expected values

Overall Status: ✅ VERIFIED
```

### `sls-to-cdk rollback`

Rollback migration to a previous step.

**Syntax:**
```bash
sls-to-cdk rollback [options]
```

**Options:**
```
  --migration-id <id>        Migration ID to rollback
  --to-step <step>           Step to rollback to
  --restore-backup <path>    Restore from specific backup
  --dry-run                  Preview rollback actions
  --yes                      Auto-confirm rollback
```

**Output:**
```bash
$ sls-to-cdk rollback --to-step compare

Rollback Preview
================

Current Step: IMPORT
Target Step: COMPARE

Actions to perform:
  1. Restore CloudFormation template from backup
  2. Re-add resources to Serverless stack
  3. Update migration state

⚠️  WARNING: This will modify your AWS resources

Proceed with rollback? [y/N]: y

Rolling back...
  ✓ Restored CloudFormation template
  ✓ Re-added resources to stack
  ✓ Updated migration state

Rollback complete. Resume with:
  sls-to-cdk migrate --resume
```

### `sls-to-cdk resume`

Resume an interrupted migration.

**Syntax:**
```bash
sls-to-cdk resume [options]
```

**Options:**
```
  --migration-id <id>        Migration ID to resume
  --from-step <step>         Step to resume from
  --skip-failed              Skip previously failed steps
```

**Output:**
```bash
$ sls-to-cdk resume

Resuming Migration
==================

Migration ID: mig-20250120-001
Current Step: COMPARE
Completed Steps: SCAN, PROTECT, GENERATE
Remaining Steps: COMPARE, REMOVE, IMPORT, DEPLOY, VERIFY, CLEANUP

Resuming from step: COMPARE
```

### `sls-to-cdk status`

Show current migration status.

**Syntax:**
```bash
sls-to-cdk status [options]
```

**Options:**
```
  --migration-id <id>        Migration ID to check
  --format <format>          Output format (text, json)
  --watch                    Watch for changes (live updates)
```

**Output:**
```bash
$ sls-to-cdk status

Migration Status
================

Migration ID: mig-20250120-001
Status: IN_PROGRESS
Current Step: IMPORT (6/9)
Started: 2025-01-20 10:30:00
Duration: 8m 32s

Progress:
  ✓ SCAN (completed)
  ✓ PROTECT (completed)
  ✓ GENERATE (completed)
  ✓ COMPARE (completed)
  ✓ REMOVE (completed)
  ⏳ IMPORT (in progress)
  ⏱  DEPLOY (pending)
  ⏱  VERIFY (pending)
  ⏱  CLEANUP (pending)

Resources:
  Total: 3
  Protected: 3
  Removed: 3
  Imported: 1/3
  Verified: 0
```

## Configuration File

### `migration.config.json`

Configuration file format for automated migrations.

```json
{
  "serverless": {
    "path": "./serverless-app",
    "stackName": "my-serverless-stack",
    "stage": "prod",
    "region": "us-east-1"
  },
  "cdk": {
    "path": "./cdk-app",
    "stackName": "MyCdkStack",
    "region": "us-east-1",
    "language": "typescript",
    "useL2Constructs": true
  },
  "resources": {
    "includeTypes": [
      "AWS::DynamoDB::Table",
      "AWS::S3::Bucket",
      "AWS::Logs::LogGroup"
    ],
    "excludeResources": []
  },
  "options": {
    "dryRun": false,
    "interactive": false,
    "autoApprove": true,
    "createBackups": true,
    "verifyAfterEachStep": true,
    "continueOnError": false,
    "verbose": false,
    "outputDir": "./.sls-to-cdk"
  }
}
```

### Configuration Command

```bash
# Initialize configuration
sls-to-cdk config init

# Validate configuration
sls-to-cdk config validate --config migration.config.json

# Show current configuration
sls-to-cdk config show
```

## Interactive Mode UI

### Progress Display

```
╔══════════════════════════════════════════════════════════╗
║  Serverless Framework → AWS CDK Migration Tool           ║
║  Version 1.0.0                                           ║
╚══════════════════════════════════════════════════════════╝

📋 Migration Progress: Step 6 of 9

┌──────────────┬────────────────┬──────────┬──────────┐
│ Step         │ Status         │ Duration │ Progress │
├──────────────┼────────────────┼──────────┼──────────┤
│ ✓ Scan       │ Completed      │ 1m 23s   │ 100%     │
│ ✓ Protect    │ Completed      │ 2m 45s   │ 100%     │
│ ✓ Generate   │ Completed      │ 0m 45s   │ 100%     │
│ ✓ Compare    │ Completed      │ 0m 12s   │ 100%     │
│ ✓ Remove     │ Completed      │ 1m 30s   │ 100%     │
│ ⏳ Import    │ In Progress    │ 0m 43s   │ 67%      │
│ ⏱  Deploy    │ Pending        │ --       │ 0%       │
│ ⏱  Verify    │ Pending        │ --       │ 0%       │
│ ⏱  Cleanup   │ Pending        │ --       │ 0%       │
└──────────────┴────────────────┴──────────┴──────────┘

Current Action: Importing CounterLogGroup...
Elapsed Time: 8m 32s
Estimated Time Remaining: 3m 15s
```

### Approval Prompts

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 5/9: Removing Resources from Serverless Stack
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This step will:
  1. Modify CloudFormation template
  2. Remove 3 resources from Serverless stack
  3. Update stack in AWS

Resources to remove:
  • counterTable (DynamoDB Table)
  • CounterLogGroup (CloudWatch LogGroup)
  • DataBucket (S3 Bucket)

⚠️  WARNING: This will update your CloudFormation stack in AWS
✅ SAFE: Resources are protected with DeletionPolicy: Retain

Options:
  [y] Proceed with removal
  [n] Skip this step
  [v] View detailed plan
  [s] Save and exit
  [?] Help

Your choice:
```

### Error Handling

```
❌ Step COMPARE failed

Error: Template comparison found blocking issues

Blocking Issues:
  1. S3 Bucket versioning configuration mismatch
     Resource: DataBucket
     Serverless: VersioningConfiguration.Status = "Enabled"
     CDK: VersioningConfiguration.Status = undefined

Recommended Actions:
  1. Update CDK code to match Serverless configuration
  2. Add versioning to S3 bucket in CDK:

     const dataBucket = new s3.Bucket(this, 'DataBucket', {
       bucketName: 'migration-sandbox-bucket',
       versioned: true,  // ← Add this line
       removalPolicy: cdk.RemovalPolicy.RETAIN,
     });

  3. Re-run comparison:
     sls-to-cdk migrate --resume

Options:
  [r] Retry this step
  [e] Edit CDK code and retry
  [s] Skip and continue (not recommended)
  [a] Abort migration
  [?] Help

Your choice:
```

## Global Options

All commands support these global options:

```
  --profile <name>           AWS profile to use
  --no-color                 Disable colored output
  --json                     Output in JSON format
  --help, -h                 Show help
  --version, -V              Show version number
  --debug                    Enable debug logging
```

## Environment Variables

The tool respects these environment variables:

```bash
# AWS Configuration
AWS_PROFILE=production
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Tool Configuration
SLS_TO_CDK_CONFIG=./custom-config.json
SLS_TO_CDK_OUTPUT_DIR=./custom-output
SLS_TO_CDK_LOG_LEVEL=debug

# Feature Flags
SLS_TO_CDK_AUTO_APPROVE=true
SLS_TO_CDK_NO_BACKUPS=false
SLS_TO_CDK_DRY_RUN=false
```

## Exit Codes

```
0   Success
1   General error
2   Invalid configuration
3   Migration failed
4   Rollback failed
5   Verification failed
6   User cancelled
10  AWS API error
11  CloudFormation error
12  Serverless CLI error
13  CDK CLI error
```

## Shell Completion

Generate shell completion scripts:

```bash
# Bash
sls-to-cdk completion bash > /etc/bash_completion.d/sls-to-cdk

# Zsh
sls-to-cdk completion zsh > ~/.zsh/completion/_sls-to-cdk

# Fish
sls-to-cdk completion fish > ~/.config/fish/completions/sls-to-cdk.fish
```
