# Migration Tool Test Suite

Comprehensive test suite for the Serverless-to-CDK migration tool, designed to ensure 90%+ code coverage and validate all migration scenarios.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual modules
│   ├── scanner.test.ts      # Scanner module tests
│   ├── comparator.test.ts   # Comparator module tests
│   ├── generator.test.ts    # Generator module tests
│   ├── editor.test.ts       # Editor module tests
│   └── orchestrator.test.ts # Orchestrator module tests
├── integration/             # Integration tests
│   ├── e2e-migration.test.ts       # End-to-end migration flow
│   └── state-management.test.ts    # State persistence tests
├── fixtures/                # Test fixtures
│   ├── serverless.yml       # Sample Serverless configuration
│   ├── cloudformation-sls.json  # Sample SLS CloudFormation
│   └── cloudformation-cdk.json  # Sample CDK CloudFormation
├── mocks/                   # Mock implementations
│   └── aws-sdk.ts           # AWS SDK mocks
├── jest.config.js           # Jest configuration
├── setup.ts                 # Test setup and global mocks
└── README.md                # This file
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm test -- --watch
```

### Specific Test Suite
```bash
npm test scanner.test.ts
npm test e2e-migration.test.ts
```

### Coverage Report
```bash
npm test -- --coverage
```

### Verbose Output
```bash
npm test -- --verbose
```

## Test Categories

### 1. Unit Tests

#### Scanner Module (`scanner.test.ts`)
- ✅ Parse serverless.yml configuration
- ✅ Generate CloudFormation from Serverless
- ✅ Discover all resources (explicit + abstracted)
- ✅ Build dependency graphs
- ✅ Classify resources (IMPORT vs RECREATE)
- ✅ Detect circular dependencies
- ✅ Handle edge cases (missing files, invalid YAML)

**Coverage Target: 90%**

#### Comparator Module (`comparator.test.ts`)
- ✅ Load and validate CloudFormation templates
- ✅ Match resources by physical ID
- ✅ Deep property comparison
- ✅ Classification (MATCH, ACCEPTABLE, WARNING, CRITICAL)
- ✅ Generate comparison reports
- ✅ Generate HTML reports
- ✅ Handle edge cases (missing resources, mismatches)

**Coverage Target: 90%**

#### Generator Module (`generator.test.ts`)
- ✅ Generate TypeScript CDK code
- ✅ L1 (CloudFormation) constructs
- ✅ L2 (high-level) constructs
- ✅ DynamoDB Table generation
- ✅ S3 Bucket generation
- ✅ CloudWatch LogGroup generation
- ✅ Lambda Function generation
- ✅ Import statement generation
- ✅ Property conversion (CF → CDK)

**Coverage Target: 85%**

#### Editor Module (`editor.test.ts`)
- ✅ Load CloudFormation templates
- ✅ Remove single resources
- ✅ Remove multiple resources atomically
- ✅ Update dependency references
- ✅ Handle DependsOn (single + array)
- ✅ Build dependency graphs
- ✅ Validate templates
- ✅ Detect circular dependencies
- ✅ Create backups
- ✅ Save edited templates

**Coverage Target: 90%**

#### Orchestrator Module (`orchestrator.test.ts`)
- ✅ Initialize migration project
- ✅ Execute individual steps
- ✅ Run complete migration (automatic mode)
- ✅ State persistence
- ✅ Step verification
- ✅ Rollback functionality
- ✅ Resume from saved state
- ✅ Dry run mode
- ✅ Error handling
- ✅ Verification after each step

**Coverage Target: 85%**

### 2. Integration Tests

#### End-to-End Migration (`e2e-migration.test.ts`)
- ✅ Complete migration workflow (SCAN → CLEANUP)
- ✅ Resource discovery and classification
- ✅ CDK code generation
- ✅ Template comparison
- ✅ Resource removal from Serverless
- ✅ State persistence and recovery
- ✅ Rollback scenarios
- ✅ Dependency graph validation

**Coverage Target: 80%**

#### State Management (`state-management.test.ts`)
- ✅ Save state to disk
- ✅ Load state from disk
- ✅ Create backups automatically
- ✅ Handle missing files
- ✅ Maintain consistency across save/load
- ✅ Date serialization
- ✅ Backup management
- ✅ Concurrent access handling
- ✅ Error handling (corrupted files, permissions)

**Coverage Target: 85%**

## Test Fixtures

### serverless.yml
Sample Serverless Framework configuration with:
- DynamoDB table
- S3 bucket
- Lambda function
- API Gateway HTTP API

### cloudformation-sls.json
Generated CloudFormation template from Serverless including:
- Explicit resources (Table, Bucket)
- Abstracted resources (LogGroups, IAM Roles)
- Lambda functions and versions
- API Gateway resources

### cloudformation-cdk.json
Target CDK-generated CloudFormation with:
- Same resources as SLS template
- CDK-specific metadata
- Retention policies
- L2 construct properties

## Mock Implementations

### AWS SDK Mocks (`mocks/aws-sdk.ts`)
- MockCloudFormationClient
  - describeStacks
  - describeStackResources
  - updateStack
  - detectStackDrift
- MockDynamoDBClient
  - describeTable
- MockS3Client
  - headBucket
  - getBucketVersioning
- MockLogsClient
  - describeLogGroups

## Coverage Goals

| Module | Target | Current |
|--------|--------|---------|
| Scanner | 90% | TBD |
| Comparator | 90% | TBD |
| Generator | 85% | TBD |
| Editor | 90% | TBD |
| Orchestrator | 85% | TBD |
| **Overall** | **90%** | **TBD** |

## Test Patterns

### Arrange-Act-Assert (AAA)
```typescript
it('should classify DynamoDB tables as IMPORT', () => {
  // Arrange
  const resource = {
    logicalId: 'MyTable',
    type: 'AWS::DynamoDB::Table'
  };

  // Act
  const classification = scanner.classifyResource(resource);

  // Assert
  expect(classification).toBe('IMPORT');
});
```

### Given-When-Then (BDD)
```typescript
describe('Given a Serverless template with DynamoDB', () => {
  describe('When scanning resources', () => {
    it('Then should identify table as stateful', () => {
      // Test implementation
    });
  });
});
```

## Edge Cases Tested

1. **Missing Files**: Template files not found
2. **Invalid Format**: Malformed JSON/YAML
3. **Circular Dependencies**: Resources depending on each other
4. **Empty Templates**: No resources defined
5. **Duplicate Resources**: Same physical ID
6. **Complex Dependencies**: Multi-level dependency chains
7. **Concurrent Operations**: State updates from multiple sources
8. **File Permissions**: Read-only directories
9. **Large Templates**: 100+ resources
10. **Intrinsic Functions**: Ref, GetAtt, Sub, etc.

## Continuous Integration

### Pre-commit Hooks
```bash
# Run tests before commit
npm test

# Run linter
npm run lint

# Type check
npm run typecheck
```

### CI Pipeline
```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Test Data Generation

### Factory Pattern
```typescript
function createMockResource(overrides = {}) {
  return {
    logicalId: 'MockResource',
    type: 'AWS::DynamoDB::Table',
    properties: { TableName: 'mock-table' },
    ...overrides
  };
}
```

### Builders
```typescript
class ResourceBuilder {
  private resource: any = {};

  withLogicalId(id: string) {
    this.resource.logicalId = id;
    return this;
  }

  withType(type: string) {
    this.resource.type = type;
    return this;
  }

  build() {
    return this.resource;
  }
}
```

## Debugging Tests

### Run Single Test
```bash
npm test -- --testNamePattern="should classify DynamoDB"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### View Console Output
```bash
npm test -- --silent=false
```

## Best Practices

1. ✅ **Test Behavior, Not Implementation**: Focus on what the code does, not how
2. ✅ **One Assertion Per Test**: Keep tests focused and clear
3. ✅ **Descriptive Test Names**: Explain what and why
4. ✅ **Isolate Tests**: No shared state between tests
5. ✅ **Use Fixtures**: Don't generate test data inline
6. ✅ **Mock External Dependencies**: AWS SDK, file system, etc.
7. ✅ **Test Edge Cases**: Not just happy paths
8. ✅ **Fast Tests**: Unit tests < 100ms, integration < 5s
9. ✅ **Deterministic**: Same input → same output
10. ✅ **Maintainable**: Easy to update when code changes

## Troubleshooting

### Tests Failing Locally
```bash
# Clear Jest cache
npm test -- --clearCache

# Update snapshots
npm test -- --updateSnapshot
```

### Coverage Not Updating
```bash
# Remove coverage directory
rm -rf coverage/

# Run tests again
npm test -- --coverage
```

### Timeout Errors
```bash
# Increase timeout
npm test -- --testTimeout=30000
```

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure > 80% coverage for new code
3. Update this README with new test categories
4. Add fixtures for new resource types
5. Document edge cases

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [CDK Testing Guide](https://docs.aws.amazon.com/cdk/v2/guide/testing.html)

---

**Test Coverage Target: 90%+**

**Last Updated**: 2025-01-20
