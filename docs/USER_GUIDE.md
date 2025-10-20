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

The Serverless-to-CDK Migration Tool automates the migration of AWS applications from Serverless Framework to AWS CDK, eliminating manual template comparison and error-prone editing steps.

### Key Features

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

*Tool Version: 1.0.0*
*Last Updated: 2025-01-20*
