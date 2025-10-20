# Serverless Framework to CDK Migration - Research Documentation

This directory contains comprehensive research findings for building an automated Serverless Framework to AWS CDK migration tool.

## Research Documents

### 📋 [RESEARCH_SUMMARY.md](./RESEARCH_SUMMARY.md)
**Executive summary and key findings**
- Research overview and status
- Key findings and recommendations
- Implementation roadmap
- Success metrics and validation

### 🔍 [serverless-framework-patterns.md](./serverless-framework-patterns.md)
**Primary research document (2,330 lines)**
- How Serverless Framework generates CloudFormation
- Abstracted resources (60-80% of stack)
- Resource naming patterns and conventions
- Complete CDK resource type mappings
- CloudFormation template comparison strategies
- Common migration patterns by resource type
- Migration pitfalls and recommendations

**Key Sections:**
1. Serverless Framework CloudFormation Generation
2. CDK Resource Type Mappings (L1 vs L2)
3. CloudFormation Template Comparison Strategies
4. Common Migration Patterns (DynamoDB, S3, Lambda, etc.)
5. Migration Pitfalls and Edge Cases
6. Implementation Recommendations

### 🛠 [cdk-construct-mappings.md](./cdk-construct-mappings.md)
**Code generation reference (450+ lines)**
- Complete CloudFormation to CDK L1 mappings
- Property-by-property translation examples
- Code generation templates
- Property conversion rules
- Intrinsic function handling (Ref, GetAtt, Sub, Join)

**Key Sections:**
- DynamoDB Table mapping
- S3 Bucket mapping
- CloudWatch LogGroup mapping
- Lambda Function mapping
- IAM Role mapping
- Stack and App templates
- Property conversion algorithms

### ⚠️ [migration-edge-cases.md](./migration-edge-cases.md)
**Advanced scenarios and edge cases (600+ lines)**
- DynamoDB Global Tables (multi-region)
- S3 Cross-Region Replication
- Lambda Provisioned Concurrency
- API Gateway Custom Domains
- EventBridge Rules (multiple targets)
- Step Functions (ARN references)
- VPC Lambdas (ENI timing)
- Cognito User Pools (must import)
- RDS Databases (critical data)
- CloudFront Distributions (propagation)

**Key Sections:**
- Critical edge cases (10 scenarios)
- Dependency resolution strategies
- Testing strategies for edge cases
- Validation checklist
- Recommendations

## Quick Reference

### Resource Classification

**IMPORT (Stateful):**
- ✅ DynamoDB Tables
- ✅ S3 Buckets
- ✅ CloudWatch LogGroups
- ✅ RDS Databases
- ✅ Cognito User Pools

**RECREATE (Stateless):**
- ♻️ Lambda Functions
- ♻️ IAM Roles
- ♻️ API Gateway
- ♻️ EventBridge Rules

### Template Comparison

**Severity Levels:**
- 🔴 **CRITICAL**: Block import (must fix)
- 🟡 **WARNING**: Review required
- 🔵 **ACCEPTABLE**: Safe to proceed
- ⚪ **INFO**: Informational only

### Physical ID Properties

```typescript
const physicalIdMap = {
  'AWS::DynamoDB::Table': 'TableName',
  'AWS::S3::Bucket': 'BucketName',
  'AWS::Logs::LogGroup': 'LogGroupName',
  'AWS::Lambda::Function': 'FunctionName',
  'AWS::IAM::Role': 'RoleName',
  // ... see full list in research docs
};
```

### Code Generation Strategy

**Use L1 Constructs:**
```typescript
// ✅ Exact CloudFormation match
const table = new dynamodb.CfnTable(this, 'Table', {
  tableName: 'my-table',
  // ... exact properties
});
table.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

## Implementation Modules

Based on research findings, the migration tool should have these modules:

### 1. Scanner Module
- Parse serverless.yml
- Generate CloudFormation via `serverless package`
- Discover all resources (explicit + abstracted)
- Classify resources (import vs recreate)
- Build dependency graph

### 2. Comparator Module
- Match resources by physical ID
- Deep property comparison
- Apply resource-specific rules
- Generate severity-based report
- Validate import readiness

### 3. Generator Module
- Generate CDK stack (TypeScript)
- Use L1 constructs for exact match
- Apply RemovalPolicy.RETAIN
- Handle intrinsic functions
- Generate complete project structure

### 4. Editor Module
- Remove resources from Serverless template
- Update DependsOn references
- Validate CloudFormation syntax
- Create automatic backups
- Execute via CloudFormation API

### 5. Orchestrator Module
- 9-step state machine
- Checkpoint/resume capability
- Rollback to any step
- Dry-run mode
- Interactive approval gates

## Migration Workflow

```
1. SCAN      → Discover resources (8 found)
2. PROTECT   → Add DeletionPolicy: Retain
3. GENERATE  → Create CDK code
4. COMPARE   → Validate templates match
5. REMOVE    → Remove from Serverless stack
6. IMPORT    → Import to CDK stack
7. DEPLOY    → Deploy CDK stack
8. VERIFY    → Check drift, test functionality
9. CLEANUP   → Optional: remove old stack
```

## Key Insights

### Abstracted Resources
60-80% of Serverless CloudFormation resources are **not** in serverless.yml:
- CloudWatch LogGroups (per Lambda)
- IAM Roles (execution roles)
- Lambda Versions (immutable)
- API Gateway resources (auto-generated)

### Naming Patterns
**Logical IDs:**
```
hello-world function → HelloDashworldLambdaFunction
LogGroup           → HelloDashworldLogGroup
IAM Role           → HelloDashworldIamRoleLambdaExecution
```

**Physical IDs:**
```
Function: ${service}-${stage}-${function}
LogGroup: /aws/lambda/${function-name}
Role:     ${service}-${stage}-${region}-lambdaRole
```

### Property Comparison Rules

**DynamoDB:**
- CRITICAL: TableName, KeySchema, AttributeDefinitions
- WARNING: StreamSpecification, GSI/LSI
- ACCEPTABLE: PointInTimeRecovery, Tags

**S3:**
- CRITICAL: BucketName
- WARNING: Versioning, Lifecycle, CORS
- ACCEPTABLE: Encryption, PublicAccessBlock

**LogGroups:**
- CRITICAL: LogGroupName
- ACCEPTABLE: RetentionInDays (CDK often adds this)

## Common Pitfalls

1. ❌ Forgetting `RemovalPolicy.RETAIN`
2. ❌ Matching by logical ID instead of physical ID
3. ❌ Using serverless.yml instead of generated CloudFormation
4. ❌ Not accounting for CDK default properties
5. ❌ Attempting to import Lambda functions (should recreate)

## Testing Strategy

### Validation Checklist
- ✅ Resource exists in AWS
- ✅ Properties match (critical properties)
- ✅ Dependencies intact
- ✅ No stack drift
- ✅ Application functional

### Migration Phases
1. Sandbox testing (never production first)
2. Incremental migration (one type at a time)
3. Parallel deployment (both stacks running)
4. Gradual cutover (traffic shift)
5. Monitoring (metrics, errors)

## Research Metadata

**Date:** 2025-10-20
**Researcher:** Hive Mind Research Agent
**Swarm ID:** swarm-1760972243186-bfpe2o7mu
**Status:** ✅ COMPLETE

**Metrics:**
- Research Documents: 4
- Total Lines: 3,380+
- Code Examples: 50+
- Resource Types Covered: 20+
- Edge Cases Documented: 10+

**Collective Memory:**
All findings stored in hive mind memory under `hive/research/*` namespace.

## Next Steps

### For Architects:
Review system architecture design in [../design.md](../design.md) and research findings to create detailed technical specifications.

### For Coders:
Implement modules using research findings:
1. Start with Scanner Module (resource discovery)
2. Build Comparator Module (template comparison)
3. Create Generator Module (CDK code generation)

### For Testers:
Design test suites covering:
1. Unit tests for each module
2. Integration tests with sample stacks
3. Edge case handling tests
4. End-to-end migration tests

## Additional Resources

- [Design Document](../design.md) - Overall system architecture
- [Serverless Framework Docs](https://www.serverless.com/framework/docs)
- [AWS CDK Docs](https://docs.aws.amazon.com/cdk/)
- [CloudFormation Resource Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html)

---

*Research conducted by Hive Mind Research Agent*
*Coordinated via Claude Flow Swarm Intelligence*
*All findings available in collective memory*
