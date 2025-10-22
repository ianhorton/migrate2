# Implementation Plan: CDK Code Generation Improvements

## 🎯 Executive Summary

**Goal**: Transform verbose, machine-generated CDK code into clean, human-readable, idiomatic CDK code that developers can easily maintain and extend.

**Approach**: 5-sprint SPARC implementation with comprehensive testing at each stage.

**Timeline**: "As long as it takes" - prioritizing quality over speed.

**Backward Compatibility**: Not required - we're replacing the old generator entirely.

---

## 📋 Revised Sprint Order

### Priority Rationalization

1. **Sprint 1: Resource Classification** - Foundation for everything else
2. **Sprint 2: Clean IAM Roles** - Highest impact (60% code reduction)
3. **Sprint 3: Code Cleaner** - Polish and reduce verbosity
4. **Sprint 4: Advanced Constructs** - Production-ready features
5. **Sprint 5: Lambda Bundling** - Complex, saved for last (on back burner)

---

## Sprint 1: Resource Classification Enhancement

**Duration**: TBD
**Goal**: Enhance resource metadata to support clean code generation
**Status**: 🔴 Not Started

### Requirements

#### Must Have
- [ ] Add `needsImport: boolean` flag to resource metadata
- [ ] Detect managed IAM policy patterns (BasicExecutionRole, etc.)
- [ ] Identify resource relationships (Lambda → Role → LogGroup)
- [ ] Group related resources for logical code ordering
- [ ] Detect stateful vs stateless resources accurately

#### Should Have
- [ ] Detect common CDK patterns (high-level constructs)
- [ ] Identify resource dependencies for ordering
- [ ] Flag resources that need special handling

#### Nice to Have
- [ ] Suggest optimization opportunities
- [ ] Detect anti-patterns

### Architecture Changes

```typescript
// src/types/index.ts
export interface ClassifiedResource extends CloudFormationResource {
  // NEW: Classification metadata
  needsImport: boolean;              // Does this resource exist and need import?
  isStateful: boolean;               // Should it have RemovalPolicy.RETAIN?
  managedPolicyEquivalent?: string;  // e.g., "service-role/AWSLambdaBasicExecutionRole"
  relatedResources: string[];        // Logical IDs of related resources
  groupId: string;                   // For logical grouping in generated code
  codeLocation?: string;             // For Lambda functions

  // NEW: Clean code hints
  suppressLogicalIdOverride?: boolean;  // Don't override logical ID
  suppressRemovalPolicy?: boolean;      // Don't add RETAIN
  suppressComments?: boolean;           // No import comments
}
```

```typescript
// src/modules/generator/classifier.ts (NEW FILE)
export class ResourceClassifier {
  /**
   * Enhances resources with classification metadata
   */
  classifyResources(resources: CloudFormationResource[]): ClassifiedResource[] {
    return resources.map(resource => ({
      ...resource,
      needsImport: this.detectNeedsImport(resource),
      isStateful: this.isStateful(resource),
      managedPolicyEquivalent: this.detectManagedPolicy(resource),
      relatedResources: this.findRelatedResources(resource, resources),
      groupId: this.assignGroup(resource),
      suppressLogicalIdOverride: this.shouldSuppressLogicalId(resource),
      suppressRemovalPolicy: this.shouldSuppressRemovalPolicy(resource),
      suppressComments: this.shouldSuppressComments(resource)
    }));
  }

  private detectNeedsImport(resource: CloudFormationResource): boolean {
    // Logic: Does this resource already exist in AWS?
    // For migration: stateful resources typically need import
    return this.isStateful(resource);
  }

  private detectManagedPolicy(resource: CloudFormationResource): string | undefined {
    // Detect if IAM policy matches a managed policy
    if (resource.Type !== 'AWS::IAM::Role') return undefined;

    // Check for BasicExecutionRole pattern
    if (this.matchesBasicExecutionRole(resource)) {
      return 'service-role/AWSLambdaBasicExecutionRole';
    }

    // Check for other common patterns
    return undefined;
  }

  private findRelatedResources(
    resource: CloudFormationResource,
    allResources: CloudFormationResource[]
  ): string[] {
    // Find resources that this resource depends on or that depend on it
    const related: string[] = [];

    // Example: Lambda function relates to its Role and LogGroup
    if (resource.Type === 'AWS::Lambda::Function') {
      const roleRef = this.extractRoleReference(resource);
      const logGroupName = this.extractLogGroupName(resource);

      if (roleRef) related.push(roleRef);
      if (logGroupName) {
        const logGroup = allResources.find(r =>
          r.Type === 'AWS::Logs::LogGroup' &&
          r.Properties?.LogGroupName === logGroupName
        );
        if (logGroup) related.push(logGroup.LogicalId);
      }
    }

    return related;
  }

  private assignGroup(resource: CloudFormationResource): string {
    // Assign resources to logical groups for code organization
    const typeToGroup = {
      'AWS::DynamoDB::Table': 'databases',
      'AWS::S3::Bucket': 'storage',
      'AWS::IAM::Role': 'iam',
      'AWS::Lambda::Function': 'compute',
      'AWS::Logs::LogGroup': 'logging',
      'AWS::CloudFront::Distribution': 'cdn'
    };

    return typeToGroup[resource.Type] || 'other';
  }
}
```

### Testing Strategy

#### Unit Tests
```typescript
// tests/unit/generator/classifier.test.ts
describe('ResourceClassifier', () => {
  describe('classifyResources', () => {
    it('should detect stateful resources need import', () => {
      const dynamoDB = createMockDynamoDBTable();
      const result = classifier.classifyResources([dynamoDB]);
      expect(result[0].needsImport).toBe(true);
      expect(result[0].isStateful).toBe(true);
    });

    it('should detect BasicExecutionRole pattern', () => {
      const role = createMockLambdaExecutionRole();
      const result = classifier.classifyResources([role]);
      expect(result[0].managedPolicyEquivalent).toBe(
        'service-role/AWSLambdaBasicExecutionRole'
      );
    });

    it('should group Lambda with its Role and LogGroup', () => {
      const lambda = createMockLambdaFunction();
      const role = createMockRole();
      const logGroup = createMockLogGroup();

      const result = classifier.classifyResources([lambda, role, logGroup]);

      expect(result[0].relatedResources).toContain(role.LogicalId);
      expect(result[0].relatedResources).toContain(logGroup.LogicalId);
    });
  });
});
```

#### Integration Tests
```typescript
// tests/integration/classification.test.ts
describe('Resource Classification Integration', () => {
  it('should classify real Serverless template correctly', async () => {
    const template = await loadServerlessTemplate('./fixtures/serverless.yml');
    const resources = await scanner.scanResources(template);
    const classified = classifier.classifyResources(resources);

    // Verify classification
    const dynamoDB = classified.find(r => r.Type === 'AWS::DynamoDB::Table');
    expect(dynamoDB?.needsImport).toBe(true);
    expect(dynamoDB?.isStateful).toBe(true);

    const lambda = classified.find(r => r.Type === 'AWS::Lambda::Function');
    expect(lambda?.groupId).toBe('compute');
    expect(lambda?.relatedResources.length).toBeGreaterThan(0);
  });
});
```

#### Manual Verification
- [ ] Test with real migration-sandbox template
- [ ] Verify all resources are classified correctly
- [ ] Check resource grouping makes sense
- [ ] Validate relationship detection

### Success Criteria

- ✅ All resources have classification metadata
- ✅ Managed policies detected accurately (90%+ success)
- ✅ Resource relationships identified correctly
- ✅ Groups are logical and useful
- ✅ 100% test coverage for classifier

---

## Sprint 2: Clean IAM Role Generation

**Duration**: TBD
**Goal**: Generate idiomatic IAM roles with managed policies
**Status**: 🔴 Not Started
**Depends On**: Sprint 1

### Requirements

#### Must Have
- [ ] Generate managed policy references instead of inline policies
- [ ] Use `addToPolicy()` for custom permissions
- [ ] Generate resource references (construct ARNs) not strings
- [ ] Remove verbose ARN substitutions
- [ ] Reduce IAM role code by 50-60%

#### Should Have
- [ ] Group related policies together
- [ ] Add helpful comments for custom policies
- [ ] Suggest least-privilege improvements

#### Nice to Have
- [ ] Detect overly permissive policies
- [ ] Suggest managed policy alternatives

### Architecture Changes

```typescript
// src/modules/generator/templates/l2-constructs/iam.ts (NEW FILE)
export class IAMRoleGenerator {
  generateRole(resource: ClassifiedResource, context: GeneratorContext): string {
    const { managedPolicies, customPermissions } = this.analyzePermissions(resource);

    // Generate clean role with managed policies
    let code = this.generateRoleDeclaration(resource, managedPolicies);

    // Add custom permissions using addToPolicy pattern
    if (customPermissions.length > 0) {
      code += this.generateCustomPermissions(resource, customPermissions, context);
    }

    return code;
  }

  private analyzePermissions(resource: ClassifiedResource) {
    const policies = this.extractPolicies(resource);

    // Separate managed vs custom
    const managedPolicies: string[] = [];
    const customPermissions: PolicyStatement[] = [];

    if (resource.managedPolicyEquivalent) {
      managedPolicies.push(resource.managedPolicyEquivalent);
    }

    // Extract custom permissions not covered by managed policies
    for (const policy of policies) {
      if (!this.isCoveredByManagedPolicy(policy, managedPolicies)) {
        customPermissions.push(policy);
      }
    }

    return { managedPolicies, customPermissions };
  }

  private generateRoleDeclaration(
    resource: ClassifiedResource,
    managedPolicies: string[]
  ): string {
    const varName = this.toVariableName(resource.LogicalId);
    const roleName = this.extractRoleName(resource);
    const assumedBy = this.extractAssumedBy(resource);

    return `
    const ${varName} = new Role(this, "${resource.LogicalId}", {
      roleName: "${roleName}",
      assumedBy: new ServicePrincipal("${assumedBy}"),
      managedPolicies: [
        ${managedPolicies.map(p =>
          `ManagedPolicy.fromAwsManagedPolicyName("${p}")`
        ).join(',\n        ')}
      ]
    });
    `.trim();
  }

  private generateCustomPermissions(
    resource: ClassifiedResource,
    permissions: PolicyStatement[],
    context: GeneratorContext
  ): string {
    const varName = this.toVariableName(resource.LogicalId);
    let code = '\n\n';

    for (const permission of permissions) {
      // Resolve resource references
      const resources = this.resolveResourceReferences(
        permission.resources,
        context
      );

      code += `
    ${varName}.addToPolicy(
      new PolicyStatement({
        actions: ${JSON.stringify(permission.actions)},
        effect: Effect.ALLOW,
        resources: [${resources.join(', ')}]
      })
    );
      `.trim() + '\n\n';
    }

    return code;
  }

  private resolveResourceReferences(
    resources: string[],
    context: GeneratorContext
  ): string[] {
    return resources.map(arn => {
      // Try to find construct reference
      const constructRef = this.findConstructReference(arn, context);
      if (constructRef) {
        return constructRef; // e.g., "counterTable.tableArn"
      }

      // Fall back to string ARN
      return `"${arn}"`;
    });
  }
}
```

### Testing Strategy

#### Unit Tests
```typescript
// tests/unit/generator/iam.test.ts
describe('IAMRoleGenerator', () => {
  it('should generate role with managed policy', () => {
    const role = createMockLambdaRole();
    role.managedPolicyEquivalent = 'service-role/AWSLambdaBasicExecutionRole';

    const code = generator.generateRole(role, context);

    expect(code).toContain('ManagedPolicy.fromAwsManagedPolicyName');
    expect(code).toContain('AWSLambdaBasicExecutionRole');
    expect(code).not.toContain('inlinePolicies');
  });

  it('should use addToPolicy for custom permissions', () => {
    const role = createMockLambdaRoleWithDynamoDB();

    const code = generator.generateRole(role, context);

    expect(code).toContain('.addToPolicy(');
    expect(code).toContain('dynamodb:UpdateItem');
  });

  it('should resolve resource references to constructs', () => {
    const role = createMockLambdaRole();
    const context = { resources: [{ name: 'counterTable', arn: '...' }] };

    const code = generator.generateRole(role, context);

    expect(code).toContain('counterTable.tableArn');
    expect(code).not.toContain('arn:aws:dynamodb');
  });
});
```

#### Integration Tests
```typescript
// tests/integration/iam-generation.test.ts
describe('IAM Role Generation Integration', () => {
  it('should generate clean IAM roles from Serverless template', async () => {
    const template = await loadServerlessTemplate();
    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified);

    // Verify managed policies used
    expect(generated).toContain('AWSLambdaBasicExecutionRole');

    // Verify addToPolicy pattern
    expect(generated).toContain('.addToPolicy(');

    // Verify code reduction
    const oldSize = measureOldGeneratorOutput(template);
    const newSize = generated.length;
    expect(newSize).toBeLessThan(oldSize * 0.6); // 40%+ reduction
  });
});
```

#### Manual Verification
- [ ] Generated roles work in AWS
- [ ] Permissions are equivalent to original
- [ ] Code is readable and maintainable
- [ ] No over-permissions or security issues

### Success Criteria

- ✅ 50-60% reduction in IAM role code
- ✅ Managed policies used where applicable
- ✅ Resource references resolved correctly
- ✅ All permissions functionally equivalent
- ✅ Code passes manual review for readability

---

## Sprint 3: Code Cleaner and Optimizer

**Duration**: TBD
**Goal**: Remove verbosity and unnecessary code
**Status**: 🔴 Not Started
**Depends On**: Sprint 1, 2

### Requirements

#### Must Have
- [ ] Remove 90% of comments (keep only essential)
- [ ] Only override logical IDs for imported resources
- [ ] Only apply RemovalPolicy.RETAIN to stateful resources
- [ ] Remove redundant blank lines
- [ ] Optimize import statements

#### Should Have
- [ ] Order code logically (databases → IAM → compute → networking)
- [ ] Group related constructs together
- [ ] Add section dividers for readability

#### Nice to Have
- [ ] Auto-format with Prettier
- [ ] Run ESLint and fix issues
- [ ] Add TODO comments for manual steps

### Architecture Changes

```typescript
// src/modules/generator/code-cleaner/ (NEW DIRECTORY)

// comment-reducer.ts
export class CommentReducer {
  reduceComments(code: string, resources: ClassifiedResource[]): string {
    let cleaned = code;

    // Remove "IMPORTANT: This resource will be imported" comments
    cleaned = cleaned.replace(/\/\/ IMPORTANT: This resource will be imported[^\n]*\n/g, '');

    // Remove redundant type comments (already in construct)
    cleaned = cleaned.replace(/\/\/ AWS::[^\n]*\n/g, '');

    // Keep only essential comments (TODOs, warnings, explanations)
    return cleaned;
  }
}

// logical-id-optimizer.ts
export class LogicalIdOptimizer {
  optimizeLogicalIds(code: string, resources: ClassifiedResource[]): string {
    let optimized = code;

    for (const resource of resources) {
      if (resource.suppressLogicalIdOverride) {
        // Remove overrideLogicalId for this resource
        const pattern = new RegExp(
          `\\(${resource.LogicalId}\\.node\\.defaultChild.*overrideLogicalId\\([^)]+\\);\\n`,
          'g'
        );
        optimized = optimized.replace(pattern, '');
      }
    }

    return optimized;
  }
}

// removal-policy-optimizer.ts
export class RemovalPolicyOptimizer {
  optimizeRemovalPolicies(code: string, resources: ClassifiedResource[]): string {
    let optimized = code;

    for (const resource of resources) {
      if (resource.suppressRemovalPolicy) {
        // Remove applyRemovalPolicy for this resource
        const varName = this.toVariableName(resource.LogicalId);
        const pattern = new RegExp(
          `${varName}\\.applyRemovalPolicy\\(.*?\\);\\n`,
          'g'
        );
        optimized = optimized.replace(pattern, '');
      }
    }

    return optimized;
  }
}

// code-formatter.ts
export class CodeFormatter {
  format(code: string): string {
    // Order sections logically
    const sections = this.extractSections(code);
    const ordered = this.orderSections(sections);

    // Add section dividers
    const withDividers = this.addSectionDividers(ordered);

    // Remove excessive blank lines (max 2)
    const cleaned = withDividers.replace(/\n{3,}/g, '\n\n');

    // Optimize imports
    const withImports = this.optimizeImports(cleaned);

    return withImports;
  }

  private orderSections(sections: CodeSection[]): CodeSection[] {
    const order = ['databases', 'storage', 'iam', 'logging', 'compute', 'cdn', 'other'];
    return sections.sort((a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group)
    );
  }

  private addSectionDividers(sections: CodeSection[]): string {
    return sections.map((section, i) => {
      if (i === 0) return section.code;

      const divider = `\n    // ========================================\n` +
                     `    // ${this.sectionTitle(section.group)}\n` +
                     `    // ========================================\n\n`;

      return divider + section.code;
    }).join('\n');
  }
}
```

### Testing Strategy

#### Unit Tests
```typescript
// tests/unit/generator/code-cleaner.test.ts
describe('CommentReducer', () => {
  it('should remove import comments', () => {
    const code = '// IMPORTANT: This resource will be imported\nconst x = ...';
    const cleaned = reducer.reduceComments(code, []);
    expect(cleaned).not.toContain('IMPORTANT');
  });

  it('should keep TODO comments', () => {
    const code = '// TODO: Update this manually\nconst x = ...';
    const cleaned = reducer.reduceComments(code, []);
    expect(cleaned).toContain('TODO');
  });
});

describe('LogicalIdOptimizer', () => {
  it('should remove logical ID override when suppressed', () => {
    const resource = {
      LogicalId: 'MyResource',
      suppressLogicalIdOverride: true
    };
    const code = 'myResource.node.defaultChild.overrideLogicalId("MyResource");\n';

    const optimized = optimizer.optimizeLogicalIds(code, [resource]);

    expect(optimized).not.toContain('overrideLogicalId');
  });

  it('should keep logical ID override for imported resources', () => {
    const resource = {
      LogicalId: 'ImportedResource',
      needsImport: true,
      suppressLogicalIdOverride: false
    };
    const code = 'imported.node.defaultChild.overrideLogicalId("ImportedResource");\n';

    const optimized = optimizer.optimizeLogicalIds(code, [resource]);

    expect(optimized).toContain('overrideLogicalId');
  });
});
```

#### Integration Tests
```typescript
// tests/integration/code-cleaning.test.ts
describe('Code Cleaning Integration', () => {
  it('should produce clean code from end to end', async () => {
    const template = await loadServerlessTemplate();
    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified);
    const cleaned = await cleanCode(generated, classified);

    // Verify reductions
    expect(countComments(cleaned)).toBeLessThan(countComments(generated) * 0.2);
    expect(countLogicalIdOverrides(cleaned)).toBeLessThan(classified.length);
    expect(countRemovalPolicies(cleaned)).toBe(
      classified.filter(r => r.isStateful).length
    );

    // Verify formatting
    expect(cleaned).toMatch(/\/\/ ={40,}\n\/\/ [A-Z]/); // Section dividers
    expect(cleaned).not.toMatch(/\n{3,}/); // No triple blank lines
  });
});
```

#### Manual Verification
- [ ] Code looks clean and professional
- [ ] Section ordering makes sense
- [ ] Comments are helpful not noisy
- [ ] Still compiles and deploys

### Success Criteria

- ✅ 90% reduction in comments
- ✅ Logical ID overrides only where needed
- ✅ Removal policies only on stateful resources
- ✅ Code passes ESLint
- ✅ Human reviewer approves readability

---

## Sprint 4: Advanced Constructs (Optional Features)

**Duration**: TBD
**Goal**: Add production-ready higher-level constructs
**Status**: 🔴 Not Started
**Depends On**: Sprint 1, 2, 3

### Requirements

#### Must Have
- [ ] Generate Lambda aliases for versioning
- [ ] Generate Function URLs where appropriate
- [ ] Add CloudFront distribution suggestions

#### Should Have
- [ ] Generate CloudWatch dashboards
- [ ] Add X-Ray tracing configuration
- [ ] Generate API Gateway integrations

#### Nice to Have
- [ ] Suggest cost optimization (ARM64, SnapStart)
- [ ] Generate monitoring alarms
- [ ] Add deployment pipelines

### Architecture Changes

```typescript
// src/modules/generator/templates/advanced/ (NEW DIRECTORY)

// aliases.ts
export class AliasGenerator {
  generateAlias(lambda: ClassifiedResource, stage: string): string {
    const lambdaVar = this.toVariableName(lambda.LogicalId);
    const aliasVar = `${lambdaVar}Alias`;

    return `
    // Create alias for gradual deployments
    const ${aliasVar} = new Alias(this, "${lambda.LogicalId}Alias", {
      aliasName: "${stage}",
      version: ${lambdaVar}.currentVersion
    });
    `.trim();
  }
}

// function-urls.ts
export class FunctionUrlGenerator {
  generateFunctionUrl(lambda: ClassifiedResource): string {
    const aliasVar = this.toVariableName(lambda.LogicalId) + 'Alias';

    return `
    // Add Function URL for direct invocation
    const url = ${aliasVar}.addFunctionUrl({
      authType: FunctionUrlAuthType.AWS_IAM
    });

    new CfnOutput(this, "${lambda.LogicalId}Url", {
      value: url.url,
      description: "Function URL for ${lambda.LogicalId}"
    });
    `.trim();
  }
}

// cloudfront.ts
export class CloudFrontGenerator {
  suggestCloudFront(functionUrl: string): string {
    return `
    // TODO: Consider adding CloudFront for better performance and custom domain
    // const distribution = new Distribution(this, "Distribution", {
    //   defaultBehavior: {
    //     origin: FunctionUrlOrigin.withOriginAccessControl(url),
    //     allowedMethods: AllowedMethods.ALLOW_ALL,
    //     cachePolicy: CachePolicy.CACHING_DISABLED,
    //     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
    //   },
    //   priceClass: PriceClass.PRICE_CLASS_100
    // });
    `.trim();
  }
}
```

### Testing Strategy

#### Unit Tests
```typescript
// tests/unit/generator/advanced.test.ts
describe('Advanced Construct Generators', () => {
  it('should generate Lambda alias', () => {
    const lambda = createMockLambda();
    const code = aliasGen.generateAlias(lambda, 'prod');

    expect(code).toContain('new Alias');
    expect(code).toContain('aliasName: "prod"');
    expect(code).toContain('.currentVersion');
  });

  it('should generate Function URL', () => {
    const lambda = createMockLambda();
    const code = urlGen.generateFunctionUrl(lambda);

    expect(code).toContain('.addFunctionUrl');
    expect(code).toContain('FunctionUrlAuthType.AWS_IAM');
    expect(code).toContain('CfnOutput');
  });

  it('should suggest CloudFront', () => {
    const code = cfGen.suggestCloudFront('https://...');

    expect(code).toContain('// TODO: Consider adding CloudFront');
    expect(code).toContain('FunctionUrlOrigin.withOriginAccessControl');
  });
});
```

#### Integration Tests
```typescript
// tests/integration/advanced-features.test.ts
describe('Advanced Features Integration', () => {
  it('should generate complete stack with advanced features', async () => {
    const config = {
      includeAliases: true,
      includeFunctionUrls: true,
      suggestCloudFront: true
    };

    const generated = await generateCDKCode(classified, config);

    expect(generated).toContain('new Alias');
    expect(generated).toContain('.addFunctionUrl');
    expect(generated).toContain('// TODO: Consider adding CloudFront');
  });

  it('should deploy successfully with advanced features', async () => {
    const stack = await deployGeneratedStack();

    // Verify alias exists
    const alias = await lambda.getAlias({ FunctionName, Name: 'dev' });
    expect(alias).toBeDefined();

    // Verify function URL works
    const response = await fetch(functionUrl);
    expect(response.status).toBe(200);
  });
});
```

#### Manual Verification
- [ ] Aliases work correctly
- [ ] Function URLs are accessible
- [ ] CloudFront suggestion is helpful
- [ ] Features are optional (can disable)

### Success Criteria

- ✅ Aliases generated for all Lambda functions
- ✅ Function URLs work correctly
- ✅ CloudFront suggestions are actionable
- ✅ Features can be toggled via config
- ✅ Production deployments succeed

---

## Sprint 5: NodejsFunction and Lambda Bundling

**Duration**: TBD (ON BACK BURNER)
**Goal**: Generate bundleable Lambda functions with local code
**Status**: 🔴 Not Started (Low Priority)
**Depends On**: Sprint 1, 2, 3, 4

### Requirements

#### Must Have
- [ ] Detect Lambda source code locations
- [ ] Generate `NodejsFunction` instead of `Function`
- [ ] Add bundling configuration
- [ ] Handle ESM and CommonJS modules

#### Should Have
- [ ] Optimize bundling (externals, minification)
- [ ] Support multiple runtimes (Node, Python, etc.)
- [ ] Generate handler boilerplate

#### Nice to Have
- [ ] SnapStart configuration
- [ ] Layer management
- [ ] Cold start optimization

### Why This Is On The Back Burner

Lambda code handling is complex because:
1. **Source location detection** - Hard to determine where Lambda code lives
2. **Multiple patterns** - ZIP files, S3, inline, layers, containers
3. **Runtime differences** - Node.js, Python, Go, etc. all handle differently
4. **Bundling complexity** - Different tools (esbuild, webpack, etc.)
5. **Migration challenge** - Existing S3-based code needs different approach

**Decision**: Handle Lambda migration as a separate, specialized problem after other improvements are working.

---

## Testing Strategy Overview

### Unit Tests (TDD Approach)
- Write tests first for each component
- Test individual functions and classes
- Mock dependencies
- Aim for 100% coverage
- Fast execution (< 1 second per test)

### Integration Tests
- Test full pipeline: Scanner → Classifier → Generator → Cleaner
- Use real Serverless templates
- Compare output to expected patterns
- Validate generated code compiles
- Verify resources can be created

### Manual Verification
- Deploy generated stacks to AWS
- Compare with original Serverless deployments
- Review code readability with human developers
- Test in multiple scenarios (simple, complex, edge cases)
- Validate migrations work end-to-end

### Test Data
```
tests/fixtures/
├── simple-lambda/          # Single Lambda + DynamoDB
├── complex-app/            # Multiple resources, dependencies
├── iam-heavy/              # Complex IAM policies
├── edge-cases/             # Unusual configurations
└── real-world/             # Actual production templates (anonymized)
```

---

## Success Criteria (Overall)

### Code Quality
- [ ] 50-70% reduction in generated code size
- [ ] 90% reduction in comments
- [ ] Human developers rate as "easy to understand" (survey)
- [ ] Passes ESLint with no warnings
- [ ] Follows AWS CDK best practices

### Functional
- [ ] All tests pass (100% coverage)
- [ ] Generated code compiles without errors
- [ ] Deployments succeed in AWS
- [ ] Resources work identically to Serverless version
- [ ] Can be imported into existing stacks

### Developer Experience
- [ ] Time to understand code: < 5 minutes
- [ ] Time to make changes: < 10 minutes
- [ ] Confidence to deploy: High (8+/10)
- [ ] Would use for own projects: Yes (80%+)

---

## Next Steps

1. **Review and approve** this implementation plan
2. **Set up test infrastructure** (fixtures, test data)
3. **Begin Sprint 1** - Resource Classification Enhancement
4. **Daily standups** to track progress and blockers
5. **Demo after each sprint** for feedback

## Open Questions

1. **Configuration**: Should advanced features be opt-in or opt-out?
2. **Migration strategy**: How to handle existing deployed stacks?
3. **Documentation**: How much inline docs vs external docs?
4. **Error handling**: How to handle unsupported resources?
5. **Versioning**: How to version the generator (semver)?

---

*Implementation plan ready for execution - let's build clean CDK code! 🚀*
