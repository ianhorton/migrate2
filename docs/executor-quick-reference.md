# Step Executors Quick Reference

## Execution Order

```
1. INITIAL_SCAN      → ScanExecutor
2. DISCOVERY         → ProtectExecutor
3. CDK_GENERATION    → GenerateExecutor
4. COMPARISON        → CompareExecutor
5. TEMPLATE_MODIFICATION → RemoveExecutor
6. IMPORT_PREPARATION → ImportExecutor
7. VERIFICATION (Deploy) → DeployExecutor
8. VERIFICATION (Verify) → VerifyExecutor
9. COMPLETE          → CleanupExecutor
```

## Executor Cheat Sheet

### ScanExecutor
```typescript
Input:  sourceDir, stage
Output: serverlessConfig, cloudFormationTemplate, inventory
AWS:    None (reads files only)
CLI:    serverless package (optional)
```

### ProtectExecutor
```typescript
Input:  inventory.stateful
Output: protectedResources[], templatePath, stackId
AWS:    CloudFormation.describeStacks
CLI:    serverless deploy
```

### GenerateExecutor
```typescript
Input:  cloudFormationTemplate
Output: cdkCode, projectPath, templatePath
AWS:    None
CLI:    cdk init, cdk synth, npm install
```

### CompareExecutor
```typescript
Input:  slsTemplatePath, cdkTemplatePath
Output: report, readyForImport, blockingIssues
AWS:    None (reads files only)
CLI:    None
```

### RemoveExecutor
```typescript
Input:  stateful resources, protected template
Output: removedResources[], modifiedTemplatePath, stackId
AWS:    CloudFormation.updateStack, CloudFormation.describeStacks
CLI:    None (uses AWS SDK directly)
```

### ImportExecutor
```typescript
Input:  resourcesToImport[], physicalIds
Output: importedResources[], importMethod, stackId
AWS:    CloudFormation.describeStacks
CLI:    cdk import [--auto-approve]
```

### DeployExecutor
```typescript
Input:  importedResources
Output: deploymentStatus, stackId, stackOutputs
AWS:    CloudFormation.describeStacks, CloudFormation.listStackResources
CLI:    cdk diff, cdk deploy
```

### VerifyExecutor
```typescript
Input:  stackName
Output: driftStatus, resourcesVerified, issues[]
AWS:    CloudFormation.detectStackDrift, CloudFormation.describeStackDriftDetectionStatus
CLI:    None
```

### CleanupExecutor
```typescript
Input:  sourceDir, backupEnabled
Output: backupPath, tempFilesRemoved[], summary
AWS:    None
CLI:    serverless remove (optional)
```

## Common Patterns

### Reading Previous Step Results
```typescript
const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
const inventory = scanData.inventory;
```

### Validating Prerequisites
```typescript
protected validatePrerequisites(state: MigrationState): boolean {
  const prevResult = state.stepResults[MigrationStep.PREVIOUS_STEP];
  if (!prevResult || !prevResult.data) {
    this.logger.error('Previous step must complete first');
    return false;
  }
  return true;
}
```

### Handling Dry-Run
```typescript
if (state.config.dryRun) {
  this.logger.info('Dry-run mode: skipping AWS operations');
  return { /* mock result */ };
}
```

### Error Handling
```typescript
try {
  const result = await someOperation();
  return result;
} catch (error) {
  this.logger.error('Operation failed', error);
  throw new Error(`Failed to execute: ${error.message}`);
}
```

### Validation Checks
```typescript
protected async runValidationChecks(state: MigrationState) {
  const checks = [];

  checks.push({
    name: 'check-name',
    passed: condition,
    message: 'Description',
    severity: 'error' | 'warning' | 'info'
  });

  return checks;
}
```

## AWS SDK Usage

### CloudFormation Operations
```typescript
// Describe stack
const { Stacks } = await this.cloudformation.describeStacks({
  StackName: stackName
}).promise();

// Update stack
await this.cloudformation.updateStack({
  StackName: stackName,
  TemplateBody: templateContent,
  Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']
}).promise();

// Detect drift
const { StackDriftDetectionId } = await this.cloudformation.detectStackDrift({
  StackName: stackName
}).promise();
```

## CLI Command Patterns

### Serverless Framework
```typescript
execSync('serverless package', { cwd: sourceDir, stdio: 'inherit' });
execSync('serverless deploy --stage prod', { cwd: sourceDir, stdio: 'inherit' });
execSync('serverless remove', { cwd: sourceDir, stdio: 'inherit' });
```

### AWS CDK
```typescript
execSync('cdk init app --language typescript', { cwd: targetDir, stdio: 'inherit' });
execSync('cdk synth', { cwd: targetDir, stdio: 'inherit' });
execSync('cdk diff', { cwd: targetDir, stdio: 'pipe' });
execSync('cdk deploy --require-approval never', { cwd: targetDir, stdio: 'inherit' });
execSync('cdk import --auto-approve', { cwd: targetDir, stdio: 'pipe' });
execSync('cdk destroy --force', { cwd: targetDir, stdio: 'inherit' });
```

## State Management

### Migration State Structure
```typescript
interface MigrationState {
  id: string;
  currentStep: MigrationStep;
  status: MigrationStatus;
  config: MigrationConfig;
  stepResults: Record<MigrationStep, StepResult>;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: Error;
}
```

### Step Result Structure
```typescript
interface StepResult {
  step: MigrationStep;
  status: MigrationStatus;
  startedAt: Date;
  completedAt?: Date;
  data?: any;  // Executor-specific data
  error?: Error;
}
```

## File Paths Convention

### Serverless Files
- `{sourceDir}/serverless.yml` - Original config
- `{sourceDir}/.serverless/cloudformation-template-update-stack.json` - Current template
- `{sourceDir}/.serverless/cloudformation-template-protected.json` - With DeletionPolicy
- `{sourceDir}/.serverless/cloudformation-template-removed.json` - Resources removed

### CDK Files
- `{targetDir}/cdk.json` - CDK config
- `{targetDir}/lib/{stackName}-stack.ts` - Stack file
- `{targetDir}/cdk.out/{stackName}.template.json` - Synthesized template

### Reports & Backups
- `{targetDir}/migration-comparison-report.html` - Comparison report
- `{targetDir}/MIGRATION_SUMMARY.md` - Final summary
- `{sourceDir}/.migration-backup/{timestamp}/` - Backup directory

## Debugging Tips

### Enable Verbose Logging
```typescript
const logger = new Logger(stepName);
logger.setLevel('debug');
```

### Check AWS SDK Credentials
```bash
aws sts get-caller-identity
aws configure list
```

### Validate CloudFormation Template
```bash
aws cloudformation validate-template --template-body file://template.json
```

### Test CDK Synthesis
```bash
cd cdk-project
cdk synth --no-staging
```

### Inspect Migration State
```typescript
console.log(JSON.stringify(state, null, 2));
```

## Common Issues & Solutions

### Issue: "No executor registered for step"
**Solution**: Call `await StepExecutorFactory.initializeExecutors()` first

### Issue: "Template not found"
**Solution**: Run `serverless package` to generate CloudFormation template

### Issue: "CDK CLI not found"
**Solution**: Install globally with `npm install -g aws-cdk`

### Issue: "Import failed - resource not found"
**Solution**: Check that resources exist in AWS and physical IDs are correct

### Issue: "Stack drift detected"
**Solution**: Manual changes were made - review drift report and decide whether to accept

### Issue: "Deployment failed - no changes"
**Solution**: This is normal if no changes needed - operation succeeds automatically

## Testing Checklist

- [ ] Prerequisite validation works
- [ ] Happy path executes successfully
- [ ] Error handling catches failures
- [ ] Rollback logic undoes changes
- [ ] Validation checks pass/fail correctly
- [ ] Dry-run mode skips AWS operations
- [ ] Logger outputs helpful messages
- [ ] AWS SDK calls work with credentials
- [ ] CLI commands execute correctly
- [ ] File operations succeed

## Performance Optimization

1. **Parallel Validation**: Run independent checks concurrently
2. **Template Caching**: Reuse parsed templates
3. **Batch AWS Calls**: Combine API requests where possible
4. **Async File I/O**: Use `fs.promises` for non-blocking I/O
5. **Progress Indicators**: Show user that work is happening

## Security Best Practices

1. **Never log AWS credentials**
2. **Validate all file paths** (prevent path traversal)
3. **Use AWS SDK credential chain** (don't hardcode)
4. **Create backups** before destructive operations
5. **Validate templates** before applying changes
6. **Use least-privilege IAM** policies

---

**Quick Links**:
- [Full Implementation Docs](./step-executors-implementation.md)
- [Design Document](./design.md)
- [API Reference](./api-reference.md)
