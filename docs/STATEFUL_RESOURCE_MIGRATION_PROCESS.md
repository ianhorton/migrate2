# Stateful Resource Migration Process: Serverless Framework to AWS CDK

## Executive Summary

This document outlines the high-level process for migrating **stateful resources only** from Serverless Framework to AWS CDK. Stateful resources contain data that must be preserved during migration (DynamoDB tables, S3 buckets, RDS databases, CloudWatch LogGroups, etc.).

**Key Principle:** Resources can only exist in one CloudFormation stack at a time, requiring careful orchestration to transfer ownership without data loss.

**Migration Pattern:** Protect → Recreate → Remove → Import → Verify

---

## What Are Stateful Resources?

Stateful resources are AWS resources that contain or manage data that must be preserved:

| Resource Type | Examples | Why Stateful |
|--------------|----------|-------------|
| **Databases** | DynamoDB Tables, RDS Instances | Contains application data |
| **Storage** | S3 Buckets | Contains files and objects |
| **Logs** | CloudWatch LogGroups | Contains historical log data |
| **Queues** | SQS Queues | Contains in-flight messages |
| **Caches** | ElastiCache Clusters | Contains cached data |
| **Secrets** | Secrets Manager Secrets | Contains sensitive configuration |

**Stateless resources** (Lambda functions, API Gateway, IAM roles) can be recreated with new names and don't require the import process.

---

## High-Level Process Flow

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 1: PROTECT                                       │
│  Add DeletionPolicy: Retain to prevent data loss       │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 2: RECREATE IN CDK                               │
│  Write CDK code to match existing resource              │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 3: COMPARE & VALIDATE                            │
│  Ensure CDK template matches Serverless template       │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 4: REMOVE FROM SERVERLESS                        │
│  Orphan the resource (stays in AWS, not in stack)      │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 5: IMPORT TO CDK                                 │
│  CDK adopts the orphaned resource                       │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 6: VERIFY                                        │
│  Confirm resource is managed by CDK, no drift           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Process Steps

### Phase 1: Protect Resources

**Objective:** Ensure resources won't be deleted when removed from Serverless stack

**Actions:**
1. Identify all stateful resources in your Serverless application
2. Add `DeletionPolicy: Retain` to each resource in `serverless.yml`
3. Deploy the updated Serverless stack
4. Verify the policy exists in the generated CloudFormation template

**Example:**
```yaml
resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      DeletionPolicy: Retain  # ← Add this
      Properties:
        TableName: my-users-table
        # ... other properties
```

**Critical Checks:**
- [ ] Deletion policy added to ALL stateful resources
- [ ] Policy verified in CloudFormation template (`.serverless/cloudformation-template-update-stack.json`)
- [ ] Stack deployed successfully
- [ ] No unintended changes in deployment

**Gotcha:** Some resources (like LogGroups) are abstracted and don't appear in `serverless.yml`. You must inspect the generated CloudFormation template to find them.

---

### Phase 2: Recreate in CDK

**Objective:** Create equivalent resource definitions in CDK

**Actions:**
1. Write CDK code that recreates the resource with identical properties
2. Focus on matching the **physical identifier** (table name, bucket name, etc.)
3. Use the same configuration as the Serverless version
4. Generate the CDK CloudFormation template

**Example (DynamoDB):**
```typescript
const usersTable = new dynamodb.Table(this, 'UsersTable', {
  tableName: 'my-users-table',  // Must match exactly
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,  // Important for safety
});
```

**Critical Properties to Match:**

| Resource Type | Critical Properties |
|--------------|-------------------|
| **DynamoDB Table** | TableName, KeySchema, AttributeDefinitions, BillingMode |
| **S3 Bucket** | BucketName, Versioning, Encryption, Lifecycle rules |
| **LogGroup** | LogGroupName, RetentionInDays (if set) |
| **RDS Instance** | DBInstanceIdentifier, Engine, EngineVersion, InstanceClass |
| **SQS Queue** | QueueName, FIFO settings, Encryption |

**Commands:**
```bash
npx cdk synth
# Output: cdk.out/YourStackName.template.json
```

---

### Phase 3: Compare & Validate

**Objective:** Ensure CDK and Serverless templates define identical resources

**Actions:**
1. Generate both CloudFormation templates
2. Compare resource properties side-by-side
3. Identify and classify differences
4. Fix critical mismatches
5. Document acceptable differences

**Commands:**
```bash
# Generate Serverless template
npx serverless package

# Generate CDK template
npx cdk synth

# Compare (manual or automated)
# Look for resources by their physical identifiers
grep -A 20 '"TableName": "my-users-table"' .serverless/cloudformation-template-update-stack.json
grep -A 20 '"TableName": "my-users-table"' cdk.out/YourStackName.template.json
```

**Comparison Guidelines:**

| Difference Type | Action |
|----------------|--------|
| **Critical mismatch** | Must fix before proceeding (e.g., different table name) |
| **Warning** | Should review (e.g., different attribute definitions) |
| **Acceptable** | Safe to proceed (e.g., CDK adds RetentionInDays to LogGroup) |

**Common Acceptable Differences:**
- CDK adds `UpdateReplacePolicy`
- CDK adds `Metadata` sections
- CDK adds retention policies
- CloudFormation logical IDs differ (e.g., `usersTable` vs `UsersTable4E2F9D12`)

**Critical Checks:**
- [ ] Physical identifier matches exactly (table name, bucket name, etc.)
- [ ] Key schema/structure matches
- [ ] All configuration properties match
- [ ] No unexpected critical differences

---

### Phase 4: Remove from Serverless

**Objective:** Orphan the resource (remove from CloudFormation stack without deleting from AWS)

**Two Scenarios:**

#### Scenario A: Explicit Resources (DynamoDB, S3, etc.)

**Actions:**
1. Comment out or delete the resource from `serverless.yml`
2. Deploy the Serverless stack
3. Verify resource still exists in AWS

**Example:**
```yaml
resources:
  Resources:
    # UsersTable:  # ← Comment out or delete
    #   Type: AWS::DynamoDB::Table
    #   DeletionPolicy: Retain
    #   Properties:
    #     TableName: my-users-table
```

**Commands:**
```bash
# Deploy with resource removed
npx serverless deploy

# Verify resource still exists
aws dynamodb describe-table --table-name my-users-table
```

#### Scenario B: Abstracted Resources (CloudWatch LogGroups)

**Actions:**
1. Backup the CloudFormation template
2. Manually edit the generated template to remove the resource
3. Remove the resource from Lambda `DependsOn` arrays
4. Update the CloudFormation stack via AWS Console

**Why Manual?** These resources don't appear in `serverless.yml` - they're automatically created by the framework.

**Process:**
1. Edit `.serverless/cloudformation-template-update-stack.json`
2. Remove the LogGroup resource block
3. Remove LogGroup from any `DependsOn` arrays
4. Go to CloudFormation Console → Update Stack → Upload template
5. Review change set (should ONLY show LogGroup removal)
6. Submit update

**Critical Checks:**
- [ ] Resource removed from Serverless stack
- [ ] Deployment successful
- [ ] Resource verified to still exist in AWS
- [ ] No unintended resources deleted

---

### Phase 5: Import to CDK

**Objective:** Transfer resource ownership to CDK stack

**Actions:**
1. Run `cdk import` command
2. CDK will scan AWS for the orphaned resource
3. Confirm the import by matching physical identifier
4. CDK updates CloudFormation to manage the resource

**Commands:**
```bash
npx cdk import
```

**Interactive Prompt:**
```
YourStack/UsersTable/Resource (AWS::DynamoDB::Table): 
  import with TableName=my-users-table (yes/no) [default: yes]?
```

**Response:** Type `yes` or press Enter

**What Happens:**
- CDK searches AWS for a resource matching the physical identifier
- Finds the orphaned resource
- Associates it with the CDK construct
- Updates CloudFormation stack to manage it

**Critical Checks:**
- [ ] Import command succeeds
- [ ] Correct physical identifier confirmed
- [ ] Resource now appears in CDK stack
- [ ] No errors during import

---

### Phase 6: Verify

**Objective:** Confirm successful migration and detect any issues

**Actions:**
1. Deploy CDK stack (should show minimal/no changes)
2. Check for CloudFormation drift
3. Verify resource is accessible and functional
4. Test dependent services

**Commands:**
```bash
# Deploy CDK stack
npx cdk deploy
# Expected: Minimal changes (metadata only)

# Check for drift
aws cloudformation detect-stack-drift --stack-name YourStackName
aws cloudformation describe-stack-drift-detection-status --stack-drift-detection-id <id>
```

**Verification Checklist:**
- [ ] `cdk deploy` shows no unexpected changes
- [ ] No drift detected
- [ ] Resource accessible via AWS Console
- [ ] Resource accessible via AWS CLI
- [ ] Application can read/write to resource
- [ ] Dependent services still function
- [ ] Logs/metrics still captured
- [ ] No error alarms triggered

**Signs of Problems:**
- ❌ Drift detected
- ❌ `cdk deploy` shows unexpected changes
- ❌ Application errors accessing resource
- ❌ Different resource ARN or identifier

---

## Resource-Specific Guidance

### DynamoDB Tables

**Complexity:** Medium ⭐⭐

**Key Considerations:**
- Must match table name exactly
- Key schema must be identical
- GSI/LSI configurations must match
- Billing mode must match
- Stream specifications must match

**Common Issues:**
- Forgetting to include all attribute definitions
- GSI/LSI mismatches causing import failure
- Stream configuration differences

**Best Practice:**
```typescript
const table = new dynamodb.Table(this, 'MyTable', {
  tableName: 'exact-name-from-serverless',  // Critical
  partitionKey: { /* must match */ },
  sortKey: { /* if exists, must match */ },
  billingMode: /* must match */,
  stream: /* if enabled, must match */,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

---

### CloudWatch LogGroups

**Complexity:** High ⭐⭐⭐⭐

**Key Considerations:**
- Not explicitly defined in `serverless.yml`
- Auto-generated by Lambda function definitions
- Requires manual CloudFormation template surgery
- Must track Lambda `DependsOn` references

**Common Issues:**
- Missing abstracted LogGroups during planning
- Forgetting to remove from Lambda dependencies
- Template timestamp mismatches

**Best Practice:**
1. Always inspect generated CloudFormation for LogGroups
2. Create a backup before manual edits
3. Use CloudFormation Console to review change sets
4. Run `serverless deploy --force` if timestamps don't match

---

### S3 Buckets

**Complexity:** Medium-High ⭐⭐⭐

**Key Considerations:**
- Bucket policies are separate resources
- Versioning configuration must match
- Lifecycle rules must match exactly
- Encryption settings must match
- CORS configuration if present

**Common Issues:**
- Bucket policy not imported (separate resource)
- Event notifications complexity
- Public access settings mismatch

**Best Practice:**
```typescript
const bucket = new s3.Bucket(this, 'MyBucket', {
  bucketName: 'exact-bucket-name',  // Critical
  versioned: /* must match */,
  encryption: /* must match */,
  lifecycleRules: [ /* must match */ ],
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

---

### RDS Databases

**Complexity:** Very High ⭐⭐⭐⭐⭐

**Key Considerations:**
- Most critical - contains production data
- Complex configuration with many properties
- Connection strings may change
- Potential downtime during cutover
- Security group management

**Common Issues:**
- Parameter group mismatches
- Subnet group configuration
- Security group references
- Backup/retention settings
- Maintenance window settings

**Best Practice:**
- Perform during maintenance window
- Create RDS snapshot before migration
- Test connection strings thoroughly
- Monitor database performance during/after
- Consider blue/green deployment for zero downtime

**Recommendation:** Migrate RDS instances last, after gaining experience with simpler resources.

---

## Decision Tree: To Import or Recreate?

```
┌──────────────────────────────────────┐
│ Does the resource contain data?      │
└────────────┬─────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
     YES           NO
      │             │
      ▼             ▼
┌──────────┐  ┌──────────────┐
│ IMPORT   │  │ RECREATE     │
│          │  │ (new name)   │
└──────────┘  └──────────────┘

Examples:            Examples:
- DynamoDB           - Lambda
- S3 Buckets         - API Gateway  
- RDS                - IAM Roles
- LogGroups          - CloudFront
- SQS Queues
```

**Import When:**
- Resource contains data you must preserve
- Historical logs/metrics are valuable
- Resource has complex configuration
- Downtime is unacceptable

**Recreate When:**
- Resource is stateless
- No data loss from recreation
- Simpler than import process
- Running both in parallel is acceptable

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting Abstracted Resources

**Problem:** CloudWatch LogGroups created automatically by Lambda functions are easy to miss

**Solution:**
- Always inspect generated CloudFormation template
- Search for `AWS::Logs::LogGroup` in template
- Create a checklist of all resources before starting

### Pitfall 2: Property Mismatches

**Problem:** Subtle differences in properties cause import failures or drift

**Solution:**
- Use automated comparison tools where possible
- Pay special attention to nested configurations (GSIs, lifecycle rules)
- Test import in dev environment first

### Pitfall 3: Template Timestamp Issues

**Problem:** Manual CloudFormation edits fail due to timestamp mismatches

**Solution:**
- Run `npx serverless deploy --force` before manual edits
- Always review CloudFormation change set preview
- Only proceed if changes match expectations

### Pitfall 4: Incomplete Testing

**Problem:** Migration appears successful but breaks application functionality

**Solution:**
- Test all CRUD operations on migrated resources
- Verify dependent services still work
- Check CloudWatch metrics and logs
- Run integration tests

### Pitfall 5: Lost Configuration

**Problem:** Missing non-obvious configurations (tags, alarms, policies)

**Solution:**
- Document all resource configurations before migration
- Check for separate resources (bucket policies, alarms, etc.)
- Verify tags are preserved
- Migrate CloudWatch alarms separately

---

## Risk Assessment Matrix

| Resource Type | Migration Risk | Data Loss Risk | Downtime Risk | Recommendation |
|--------------|----------------|----------------|---------------|----------------|
| **DynamoDB** | Medium | Low (with Retain) | None | Import |
| **S3 Bucket** | Medium | Low (with Retain) | None | Import |
| **LogGroup** | High | Low (with Retain) | None | Import |
| **RDS** | Very High | Medium | Medium-High | Import (with care) |
| **SQS Queue** | Medium | Medium | Low | Import |
| **ElastiCache** | High | High (in-memory) | High | Consider recreate |
| **Secrets** | Low | Low | None | Import |

**Risk Levels:**
- **Low:** Straightforward migration, minimal issues expected
- **Medium:** Requires careful attention, moderate complexity
- **High:** Complex migration, significant testing required
- **Very High:** Critical resource, requires extensive planning

---

## Migration Order Recommendations

### Phase 1: Low-Risk Resources (Practice)
1. CloudWatch LogGroups (low risk, high complexity - good practice)
2. Secrets Manager Secrets (low risk, simple)
3. Parameter Store Parameters (low risk, simple)

### Phase 2: Medium-Risk Resources
4. DynamoDB Tables (medium complexity, critical data)
5. S3 Buckets (medium complexity, critical data)
6. SQS Queues (medium risk)

### Phase 3: High-Risk Resources
7. ElastiCache Clusters (consider if recreation is better)
8. RDS Databases (highest risk, save for last)

**Rationale:**
- Start with LogGroups to learn the manual template editing process
- Gain confidence with simpler imports
- Build expertise before tackling critical databases
- RDS should be last due to complexity and criticality

---

## Pre-Migration Checklist

### Documentation
- [ ] List all stateful resources in the service
- [ ] Document physical identifiers (names, ARNs)
- [ ] Capture all resource configurations
- [ ] Identify dependent resources
- [ ] Document any CloudWatch alarms
- [ ] Note any resource policies

### Backups
- [ ] Create snapshots of databases (RDS, DynamoDB if using PITR)
- [ ] Backup S3 buckets (if versioning not enabled)
- [ ] Export CloudWatch logs if retention is important
- [ ] Save current CloudFormation templates
- [ ] Document current infrastructure state

### Environment Preparation
- [ ] Test process in dev environment first
- [ ] Ensure AWS credentials have sufficient permissions
- [ ] Install and test CDK CLI
- [ ] Verify Serverless Framework version
- [ ] Check CloudFormation stack status (no updates in progress)

### Team Coordination
- [ ] Schedule migration window
- [ ] Notify stakeholders
- [ ] Prepare rollback plan
- [ ] Assign roles (executor, verifier, communicator)
- [ ] Set up monitoring for migration

---

## Post-Migration Checklist

### Immediate Verification (0-1 hour)
- [ ] All resources accessible via AWS Console
- [ ] All resources accessible via AWS CLI
- [ ] Application functionality verified
- [ ] No CloudFormation drift detected
- [ ] No error alarms triggered
- [ ] Logs being written correctly
- [ ] Metrics being collected

### Short-Term Monitoring (1-7 days)
- [ ] Monitor application error rates
- [ ] Check resource utilization metrics
- [ ] Verify backup/snapshot schedules
- [ ] Confirm no configuration drift
- [ ] Review CloudWatch alarms
- [ ] Check cost/billing for anomalies

### Cleanup
- [ ] Remove old Serverless stack (when confident)
- [ ] Update documentation
- [ ] Update runbooks
- [ ] Archive migration artifacts
- [ ] Share lessons learned with team

---

## Rollback Strategy

### If Issues Discovered During Import

**Before `cdk import` completes:**
1. Cancel the import process
2. Fix the CDK code to match Serverless template
3. Re-run `cdk synth` and compare
4. Retry import

### If Issues Discovered After Import

**After `cdk import` but before removing Serverless:**
1. Resource is now managed by CDK
2. Cannot easily roll back
3. Fix issues in CDK code
4. Deploy fixes via `cdk deploy`
5. Option: Recreate in Serverless if CDK migration unworkable

### If Critical Issues in Production

**Last resort:**
1. Keep the resource orphaned (managed by neither stack)
2. Manually manage via Console/CLI temporarily
3. Plan proper re-migration
4. Document the state for team awareness

**Prevention:** Always test in dev/staging first!

---

## Success Criteria

A stateful resource migration is successful when:

✅ **Ownership Transfer Complete**
- Resource removed from Serverless CloudFormation stack
- Resource imported into CDK CloudFormation stack
- No drift detected

✅ **Functionality Preserved**
- Application can read/write to resource
- All CRUD operations work
- No errors in application logs
- Dependent services function normally

✅ **Configuration Preserved**
- All settings match original
- Tags preserved
- Policies intact
- Alarms still trigger
- Backups still run

✅ **Data Integrity**
- No data loss
- No data corruption
- Historical data accessible
- Logs/metrics continuous

✅ **Monitoring Active**
- CloudWatch alarms work
- Metrics collected
- Logs written
- Dashboards functional

---

## Anti-Patterns to Avoid

### ❌ Skipping the Comparison Step
**Why it fails:** Properties mismatch causes import failure or drift

**Do instead:** Always compare templates, even if CDK code "looks right"

### ❌ Migrating Production First
**Why it fails:** No practice, higher risk of mistakes

**Do instead:** Always test in dev environment first

### ❌ Migrating Multiple Resources Simultaneously
**Why it fails:** Hard to debug which resource caused issues

**Do instead:** Migrate one resource type at a time

### ❌ Not Setting DeletionPolicy
**Why it fails:** Resource gets deleted when removed from stack

**Do instead:** ALWAYS set `DeletionPolicy: Retain` first

### ❌ Skipping Verification
**Why it fails:** Silent failures or configuration drift goes unnoticed

**Do instead:** Complete all verification steps before proceeding

### ❌ No Rollback Plan
**Why it fails:** Getting stuck with broken state and no way back

**Do instead:** Document rollback steps before starting

---

## Timeline Estimates

### Per Resource (Manual Process)

| Resource Type | Estimate | Notes |
|--------------|----------|-------|
| **DynamoDB Table** | 30-45 min | Straightforward, explicit in config |
| **CloudWatch LogGroup** | 45-60 min | Requires manual template surgery |
| **S3 Bucket** | 45-60 min | Many nested properties to match |
| **RDS Instance** | 2-4 hours | Complex, requires extensive testing |
| **SQS Queue** | 30-45 min | Relatively simple |
| **ElastiCache** | 1-2 hours | Complex networking configuration |

### Per Service (Typical)

| Service Complexity | Resource Count | Total Time | Notes |
|-------------------|----------------|------------|-------|
| **Simple** | 1-3 stateful | 2-3 hours | Single DynamoDB + LogGroup |
| **Medium** | 4-8 stateful | 4-6 hours | Multiple tables, queues, buckets |
| **Complex** | 9+ stateful | 1-2 days | RDS, multiple tables, caches |

**Note:** These are for manual migration. With automation tooling, expect 70-80% time reduction.

---

## Key Takeaways

1. **DeletionPolicy: Retain is mandatory** - Set it before doing anything else

2. **Template comparison is critical** - Don't skip the eyeballing step

3. **Abstracted resources are easy to miss** - Always inspect generated CloudFormation

4. **Import is one-way** - Resource ownership transfers to CDK permanently

5. **Test in dev first** - Never migrate production without practice

6. **One resource at a time** - Don't try to migrate everything at once

7. **Verification is not optional** - Complete all checks before moving on

8. **Automation saves time** - Manual process is error-prone and slow

---

## Next Steps

After successfully migrating stateful resources:

1. **Migrate Stateless Resources** - Recreate Lambda functions, API Gateway, etc. with new names
2. **Test Both Systems in Parallel** - Verify new CDK stack works alongside old Serverless stack
3. **Plan Cutover** - Update DNS/routing to point to new infrastructure
4. **Remove Old Stack** - Delete Serverless Framework stack once confident
5. **Update CI/CD** - Switch deployment pipeline to CDK

---

## Additional Resources

- **AWS CDK Import Documentation:** https://docs.aws.amazon.com/cdk/latest/guide/importing_resources.html
- **CloudFormation DeletionPolicy:** https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
- **CloudFormation Drift Detection:** https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-stack.html
- **Original Tutorial:** https://speedrun.nobackspacecrew.com/blog/2025/03/11/migrating-from-serverless-framework-to-cdk.html

---

**Document Version:** 1.0  
**Date:** January 2025  
**Audience:** Engineers performing Serverless Framework to CDK migrations  
**Focus:** Stateful resources only (DynamoDB, S3, LogGroups, RDS, etc.)