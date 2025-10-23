# Messy Environment Support - Test Documentation

Comprehensive test suite for handling real-world migration scenarios with drift, mismatched physical IDs, and human intervention requirements.

## Test Structure

```
tests/
├── fixtures/messy-environment/
│   ├── serverless-with-drift.yml       # Serverless config with real-world issues
│   └── mock-aws-resources.json         # Mock AWS resource responses
├── mocks/
│   └── aws-discovery-mock.ts           # Mock AWS SDK clients
├── integration/messy-environment/
│   ├── complete-migration.test.ts      # End-to-end messy environment migration
│   └── performance.test.ts             # Performance at scale (100+ resources)
└── unit/
    ├── discovery/
    │   ├── physical-id-resolver.test.ts    # Physical ID resolution strategies
    │   ├── resource-matcher.test.ts        # Resource matching & confidence scoring
    │   ├── aws-resource-discovery.test.ts  # AWS resource discovery
    │   └── drift-detector.test.ts          # CloudFormation drift detection
    ├── comparator/
    │   └── difference-analyzer.test.ts     # Difference classification
    ├── orchestrator/
    │   ├── confidence-scoring.test.ts      # Migration confidence calculation
    │   └── checkpoint-manager.test.ts      # Checkpoint system
    └── importer/
        └── interactive-cdk-import.test.ts  # Interactive CDK import
```

## Running Tests

### All Messy Environment Tests
```bash
npm test -- --testPathPattern=messy-environment
```

### Specific Test Suites
```bash
# Integration tests
npm test tests/integration/messy-environment/complete-migration.test.ts

# Performance tests
npm test tests/integration/messy-environment/performance.test.ts

# Physical ID resolution
npm test tests/unit/discovery/physical-id-resolver.test.ts

# Resource matching
npm test tests/unit/discovery/resource-matcher.test.ts

# Difference analysis
npm test tests/unit/comparator/difference-analyzer.test.ts

# Confidence scoring
npm test tests/unit/orchestrator/confidence-scoring.test.ts

# Checkpoints
npm test tests/unit/orchestrator/checkpoint-manager.test.ts
```

### With Coverage
```bash
npm test -- --coverage --testPathPattern=messy-environment
```

## Test Scenarios Covered

### 1. Physical ID Resolution (complete-migration.test.ts)

#### Scenario: Multiple Candidates
- **Given**: DynamoDB table named "users-table" in template
- **When**: AWS account has "users-table-dev", "users-table-prod", "legacy-users"
- **Then**: Tool calculates confidence for each, presents ranked options to user

**Confidence Scoring:**
- Exact name match: 90%
- Name similarity: 0-50%
- Tag match: +20%
- Configuration match: +30%
- Recent creation: +10%

#### Scenario: Low Confidence Match
- **Given**: IAM role with ambiguous name
- **When**: Multiple roles match pattern with <70% confidence
- **Then**: Human intervention required for selection

### 2. CloudFormation Drift Detection

#### Scenario: Modified Resource
- **Given**: IAM role manually modified in AWS console
- **When**: Drift detection runs
- **Then**: Shows actual vs expected state, prompts for resolution

**Resolution Options:**
- `use-aws`: Preserve AWS state (update template)
- `use-template`: Revert to template state
- `manual`: Pause for manual review

### 3. Template Differences Classification

#### Acceptable Differences
- CDK metadata additions
- UpdateReplacePolicy/DeletionPolicy
- CDK-specific conditions

#### Warning Differences
- Billing mode changes (cost implications)
- Attribute definition changes
- IAM policy modifications
- Retention period changes

#### Critical Differences
- Physical resource name mismatches
- Key schema incompatibilities
- Missing GSIs or required properties
- Resource type changes

### 4. Checkpoint System

#### Checkpoint 1: Physical ID Resolution
- **Trigger**: Stateful resources without physical IDs
- **Action**: Resolve all physical IDs before proceeding
- **Result**: `continue` | `pause` | `abort`

#### Checkpoint 2: Critical Differences Review
- **Trigger**: Critical template differences detected
- **Action**: Generate review report, await user decision
- **Result**: `continue` | `pause` | `abort`

#### Checkpoint 3: Drift Detection
- **Trigger**: Drift detection enabled
- **Action**: Show drift details, resolve conflicts
- **Result**: `continue` | `pause` | `abort`

### 5. Interactive CDK Import

#### Process Flow
1. Generate import definitions with physical IDs
2. Show import plan to user
3. Execute `cdk import` with live monitoring
4. Auto-respond to CDK prompts
5. Track progress and errors
6. Verify import success

## Mock Data

### DynamoDB Tables (mock-aws-resources.json)
- `users-table-dev`: Recent, high confidence match
- `users-table-prod`: Older, lower confidence
- `legacy-users`: Old table, different schema
- `orders-table-dev`: Exact match

### IAM Roles
- `messy-app-api-role-dev`: Has drift (manual modifications)
- `api-role-legacy`: Old role, no tags

### S3 Buckets
- `messy-app-data-dev`: Versioning enabled

### CloudFormation Drift
- `ApiLambdaRole`: MODIFIED status
  - Additional managed policy added
  - Expanded DynamoDB permissions

## Mock Intervention Manager

### Pre-configured Responses
```typescript
mockIntervention.setResponse('UsersTable.physicalId', 'users-table-dev');
mockIntervention.setResponse('ApiLambdaRole.drift', 'use-aws');
mockIntervention.setResponse('UsersTable.criticalDifference', 'proceed');
```

### Response Types
- **physicalId**: User selects physical resource ID
- **drift**: User chooses drift resolution strategy
- **criticalDifference**: User confirms proceeding with critical issues

## Performance Targets

### Discovery Performance
- ✅ 100 DynamoDB tables: <5 seconds
- ✅ Parallel discovery across services: <2 seconds
- ✅ Cache retrieval: <10ms

### Matching Performance
- ✅ 50 resources vs 200 candidates: <3 seconds
- ✅ 100 confidence calculations: <500ms
- ✅ 1000 fuzzy string matches: <1 second

### Import Monitoring
- ✅ 20 resource import tracking: <100ms overhead
- ✅ 100 progress updates: <50ms

### Memory Efficiency
- ✅ 1000 resource dataset: <50MB memory increase
- ✅ 500 resources in batches: <1 second

## Coverage Goals

| Module | Target | Description |
|--------|--------|-------------|
| PhysicalIdResolver | 95% | All resolution strategies |
| ResourceMatcher | 95% | Matching algorithms |
| DifferenceAnalyzer | 90% | Classification rules |
| ConfidenceScoring | 90% | Scoring calculations |
| CheckpointManager | 90% | Checkpoint execution |
| DriftDetector | 85% | Drift detection |
| InteractiveCDKImport | 85% | Import process |
| **Overall** | **90%+** | Messy environment features |

## Edge Cases Tested

### Physical ID Resolution
- ✅ No discoverable candidates
- ✅ AWS API errors (invalid names, permissions)
- ✅ Resources in different regions
- ✅ Resources without tags
- ✅ Bulk resolution efficiency

### Resource Matching
- ✅ Case-insensitive matching
- ✅ Fuzzy string matching at scale
- ✅ Missing configuration metadata
- ✅ Resources without creation timestamps
- ✅ Multiple candidates with equal confidence

### Difference Analysis
- ✅ Deeply nested property differences
- ✅ Array differences (added/removed items)
- ✅ null vs undefined differences
- ✅ Boolean vs string type coercion

### Confidence Scoring
- ✅ Zero resources (empty migration)
- ✅ Perfect confidence (1.0)
- ✅ NaN and invalid values
- ✅ Confidence trends over time

### Checkpoint System
- ✅ Checkpoint handler errors
- ✅ Timeout in checkpoint execution
- ✅ Multiple checkpoints in same step
- ✅ Resume from saved checkpoint

### Import Process
- ✅ CDK CLI not found
- ✅ Invalid physical IDs
- ✅ AWS authentication errors
- ✅ Partial import failures
- ✅ Destructive change warnings

## Test Data Builders

### Create Mock Resource
```typescript
function createMockResource(overrides = {}) {
  return {
    physicalId: 'resource-123',
    resourceType: 'AWS::DynamoDB::Table',
    region: 'us-east-1',
    arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/resource-123',
    tags: { Environment: 'dev' },
    createdAt: new Date(),
    metadata: {},
    ...overrides
  };
}
```

### Create Match Candidate
```typescript
function createCandidate(confidence: number) {
  return {
    physicalId: `candidate-${Math.random()}`,
    confidence,
    matchReasons: [`${(confidence * 100).toFixed(0)}% confidence`],
    discoveredResource: createMockResource()
  };
}
```

### Create Difference
```typescript
function createDifference(category: 'acceptable' | 'warning' | 'critical') {
  return {
    path: 'Resources.Table.Properties.BillingMode',
    serverlessValue: 'PROVISIONED',
    cdkValue: 'PAY_PER_REQUEST',
    category,
    type: 'MODIFY' as const,
    explanation: 'Configuration change detected'
  };
}
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Messy Environment Tests
  run: |
    npm test -- --testPathPattern=messy-environment --coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    flags: messy-environment
```

### Pre-commit Hook
```bash
#!/bin/bash
npm test -- --testPathPattern=messy-environment --bail
```

## Debugging Tests

### Run Single Test
```bash
npm test -- --testNamePattern="should discover all DynamoDB tables"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand tests/integration/messy-environment
```

### Verbose Output
```bash
npm test -- --verbose --testPathPattern=messy-environment
```

## Best Practices

1. **Use Mock Interventions**: Always set predefined responses for automated testing
2. **Test Real Scenarios**: Base test data on actual customer migration issues
3. **Verify Confidence Scores**: Ensure scoring algorithms produce expected results
4. **Test Performance**: Validate performance targets with realistic data volumes
5. **Cover Edge Cases**: Test error conditions, timeouts, and invalid inputs
6. **Document Scenarios**: Each test should clearly explain the real-world scenario
7. **Mock AWS Calls**: Never make real AWS API calls in tests
8. **Fast Execution**: Unit tests <100ms, integration tests <5s

## Common Issues and Solutions

### Issue: Mock responses not returning
**Solution**: Verify response keys match exactly: `ResourceId.physicalId`

### Issue: Confidence scores too low/high
**Solution**: Review scoring factors and weights in `resource-matcher.test.ts`

### Issue: Checkpoint not triggering
**Solution**: Check condition function returns true for current state

### Issue: Performance tests timing out
**Solution**: Increase jest timeout or optimize test data size

## Future Enhancements

- [ ] Machine learning-based confidence scoring
- [ ] Multi-account resource discovery
- [ ] Automatic drift correction
- [ ] Pattern learning from intervention history
- [ ] Cross-region resource matching
- [ ] Advanced similarity algorithms

## Related Documentation

- [Main Test Suite Documentation](./README.md)
- [Messy Environment Support Plan](../docs/MESSY_ENVIRONMENT_SUPPORT_PLAN.md)
- [Human Intervention Guide](../docs/HUMAN_INTERVENTION.md)
- [Checkpoint System Guide](../docs/CHECKPOINTS.md)

---

**Last Updated**: 2025-01-23
**Test Coverage**: 90%+ (target)
**Total Test Files**: 10
**Total Test Cases**: 150+
