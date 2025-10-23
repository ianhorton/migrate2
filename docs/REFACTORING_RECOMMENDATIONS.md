# Refactoring Recommendations

**Date**: 2025-10-23
**Based on**: Code Review Report
**Priority**: High-impact improvements for maintainability

---

## Overview

This document provides **concrete refactoring recommendations** to improve code quality, reduce duplication, and enhance maintainability. Each recommendation includes:
- Current state analysis
- Proposed refactoring
- Benefits
- Estimated effort

---

## 1. Extract Shared Naming Utilities

### Current State

**Problem**: `toCamelCase`, `toPascalCase`, `toKebabCase` functions duplicated across 5+ files.

**Locations**:
- `/src/modules/generator/typescript-generator.ts` (Line 470)
- `/src/modules/generator/cdk-code-generator.ts` (Line 318)
- `/src/modules/generator/advanced/alias-generator.ts` (implied)
- `/src/modules/generator/advanced/function-url-generator.ts` (Line 255)
- `/src/modules/generator/advanced/cloudfront-suggester.ts` (Lines 186, 193)

### Proposed Refactoring

**Create**: `/src/modules/generator/utils/naming-utils.ts`

```typescript
/**
 * Naming convention utilities for CDK code generation
 */
export class NamingUtils {
  /**
   * Convert PascalCase or kebab-case to camelCase
   * @example toCamelCase('MyFunction') -> 'myFunction'
   */
  static toCamelCase(str: string): string {
    if (!str) return str;
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  /**
   * Convert camelCase or kebab-case to PascalCase
   * @example toPascalCase('myFunction') -> 'MyFunction'
   */
  static toPascalCase(str: string): string {
    if (!str) return str;
    return str
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  /**
   * Convert PascalCase to kebab-case
   * @example toKebabCase('MyFunction') -> 'my-function'
   */
  static toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Convert CloudFormation LogicalId to CDK variable name
   * @example toVariableName('MyLambdaFunction') -> 'myLambdaFunction'
   */
  static toVariableName(logicalId: string): string {
    return NamingUtils.toCamelCase(logicalId);
  }

  /**
   * Convert function name to alias variable name
   * @example toAliasName('myLambda') -> 'myLambdaAlias'
   */
  static toAliasName(baseName: string): string {
    return `${baseName}Alias`;
  }

  /**
   * Convert function name to URL variable name
   * @example toUrlName('myLambda') -> 'myLambdaUrl'
   */
  static toUrlName(baseName: string): string {
    return `${baseName}Url`;
  }
}
```

**Update all files**:
```typescript
// Before
private toCamelCase(str: string): string {
  // ... 10 lines of code
}

// After
import { NamingUtils } from '../utils/naming-utils';

// Use directly
const varName = NamingUtils.toCamelCase(logicalId);
```

**Benefits**:
- Single source of truth
- Consistent behavior across codebase
- Easier testing
- Reduced code duplication (~50 lines eliminated)

**Effort**: 2 hours

---

## 2. Create Centralized Logger Interface

### Current State

**Problem**: Console.log/warn scattered across 15+ files, cannot be controlled or tested.

**Locations**:
- `/src/modules/generator/cdk-code-generator.ts` (Lines 40, 59, 60, 101, 115-119)
- `/src/modules/generator/typescript-generator.ts` (Line 118)
- Multiple orchestrator files

### Proposed Refactoring

**Create**: `/src/utils/logger.ts` (enhance existing)

```typescript
/**
 * Structured logging interface
 */
export interface ILogger {
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
  debug(message: string, metadata?: Record<string, any>): void;
}

/**
 * Console logger for CLI usage
 */
export class ConsoleLogger implements ILogger {
  constructor(private level: LogLevel = LogLevel.INFO) {}

  info(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`ℹ️  ${message}`, metadata ? JSON.stringify(metadata, null, 2) : '');
    }
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`⚠️  ${message}`, metadata ? JSON.stringify(metadata, null, 2) : '');
    }
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`❌ ${message}`);
      if (error) {
        console.error(error.stack);
      }
      if (metadata) {
        console.error(JSON.stringify(metadata, null, 2));
      }
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(`🔍 ${message}`, metadata ? JSON.stringify(metadata, null, 2) : '');
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }
}

/**
 * Test logger that captures output
 */
export class TestLogger implements ILogger {
  public logs: Array<{
    level: string;
    message: string;
    metadata?: Record<string, any>;
    error?: Error;
  }> = [];

  info(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'info', message, metadata });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'warn', message, metadata });
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'error', message, error, metadata });
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.logs.push({ level: 'debug', message, metadata });
  }

  clear(): void {
    this.logs = [];
  }

  hasError(): boolean {
    return this.logs.some(log => log.level === 'error');
  }

  getErrorMessages(): string[] {
    return this.logs
      .filter(log => log.level === 'error')
      .map(log => log.message);
  }
}

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}
```

**Update generators**:
```typescript
// Before
export class CDKCodeGenerator {
  constructor() {
    this.typeScriptGenerator = new TypeScriptGenerator();
  }

  async generateStack(...) {
    console.log('🔍 Classifying resources...');
    console.log(`✅ Classified ${classifiedResources.length} resources`);
  }
}

// After
export class CDKCodeGenerator {
  constructor(
    private logger: ILogger = new ConsoleLogger()
  ) {
    this.typeScriptGenerator = new TypeScriptGenerator(logger);
  }

  async generateStack(...) {
    this.logger.info('Classifying resources');
    this.logger.info('Classification complete', {
      resourceCount: classifiedResources.length,
      logicalIds: classifiedResources.map(r => r.LogicalId)
    });
  }
}
```

**Benefits**:
- Testable logging (can assert on log messages)
- Consistent log formatting
- Configurable log levels
- Structured metadata
- Easy to switch to file/remote logging later

**Effort**: 3 hours

---

## 3. Consolidate Configuration Interfaces

### Current State

**Problem**: Multiple overlapping configuration interfaces across modules.

**Locations**:
- `GeneratorConfig` in `/src/modules/generator/index.ts`
- `AdvancedConstructsOptions` in `/src/modules/generator/advanced/alias-generator.ts`
- `AliasConfig`, `FunctionUrlConfig` scattered across files

### Proposed Refactoring

**Create**: `/src/modules/generator/config/generator-config.ts`

```typescript
/**
 * Unified generator configuration
 */
export interface GeneratorConfig {
  // Stack configuration
  stackName: string;
  cdkVersion?: string;
  useL2Constructs?: boolean;

  // Environment configuration
  stage?: string;
  environment?: Record<string, string>;

  // Advanced features
  advanced?: AdvancedFeaturesConfig;

  // Serverless config (for detection)
  serverlessConfig?: ServerlessConfig;

  // Logging
  logLevel?: LogLevel;
}

/**
 * Advanced construct generation options
 */
export interface AdvancedFeaturesConfig {
  // Lambda aliases
  aliases?: {
    enabled?: boolean;
    defaultAliasName?: string;
    provisionedConcurrency?: number;
  };

  // Function URLs
  functionUrls?: {
    enabled?: boolean;
    defaultAuthType?: 'AWS_IAM' | 'NONE';
    cors?: DefaultCorsConfig;
  };

  // CloudFront
  cloudfront?: {
    suggestForProduction?: boolean;
    defaultPriceClass?: string;
  };
}

/**
 * Serverless.yml configuration structure
 */
export interface ServerlessConfig {
  service?: string;
  provider?: {
    name?: string;
    stage?: string;
    region?: string;
    [key: string]: any;
  };
  functions?: Record<string, ServerlessFunction>;
  custom?: Record<string, any>;
}

export interface ServerlessFunction {
  handler?: string;
  events?: Array<{
    http?: HttpEvent | string;
    httpApi?: HttpApiEvent;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Configuration builder with validation
 */
export class GeneratorConfigBuilder {
  private config: Partial<GeneratorConfig> = {};

  setStackName(name: string): this {
    if (!name || name.trim().length === 0) {
      throw new Error('Stack name cannot be empty');
    }
    this.config.stackName = name;
    return this;
  }

  setStage(stage: string): this {
    this.config.stage = stage;
    return this;
  }

  enableAliases(enabled: boolean = true): this {
    if (!this.config.advanced) {
      this.config.advanced = {};
    }
    if (!this.config.advanced.aliases) {
      this.config.advanced.aliases = {};
    }
    this.config.advanced.aliases.enabled = enabled;
    return this;
  }

  enableFunctionUrls(authType: 'AWS_IAM' | 'NONE' = 'AWS_IAM'): this {
    if (!this.config.advanced) {
      this.config.advanced = {};
    }
    if (!this.config.advanced.functionUrls) {
      this.config.advanced.functionUrls = {};
    }
    this.config.advanced.functionUrls.enabled = true;
    this.config.advanced.functionUrls.defaultAuthType = authType;
    return this;
  }

  fromServerlessConfig(serverlessConfig: ServerlessConfig): this {
    this.config.serverlessConfig = serverlessConfig;

    // Auto-detect stage
    if (serverlessConfig.provider?.stage) {
      this.config.stage = serverlessConfig.provider.stage;
    }

    return this;
  }

  build(): GeneratorConfig {
    // Validate required fields
    if (!this.config.stackName) {
      throw new Error('Stack name is required');
    }

    // Apply defaults
    return {
      stackName: this.config.stackName,
      cdkVersion: this.config.cdkVersion || '2.100.0',
      useL2Constructs: this.config.useL2Constructs !== false,
      stage: this.config.stage || 'dev',
      environment: this.config.environment || {},
      advanced: this.config.advanced || {},
      serverlessConfig: this.config.serverlessConfig,
      logLevel: this.config.logLevel || LogLevel.INFO
    };
  }
}
```

**Usage**:
```typescript
// Clean, fluent API
const config = new GeneratorConfigBuilder()
  .setStackName('MyStack')
  .setStage('production')
  .enableAliases()
  .enableFunctionUrls('AWS_IAM')
  .fromServerlessConfig(serverlessYml)
  .build();

const generator = new CDKCodeGenerator(logger);
const code = await generator.generateStack(resources, config);
```

**Benefits**:
- Single source of configuration truth
- Type-safe configuration
- Validation at build time
- Fluent API for better DX
- Easy to extend

**Effort**: 4 hours

---

## 4. Implement Resource Lifecycle Management

### Current State

**Problem**: No explicit cleanup/disposal pattern for resources that need cleanup (child processes, AWS clients, file handles).

### Proposed Refactoring

**Create**: `/src/utils/disposable.ts`

```typescript
/**
 * Interface for objects that need cleanup
 */
export interface IDisposable {
  dispose(): Promise<void>;
}

/**
 * Manages lifecycle of disposable resources
 */
export class DisposableManager implements IDisposable {
  private disposables: Set<IDisposable> = new Set();

  /**
   * Register a resource for cleanup
   */
  register<T extends IDisposable>(disposable: T): T {
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Unregister a resource (already disposed elsewhere)
   */
  unregister(disposable: IDisposable): void {
    this.disposables.delete(disposable);
  }

  /**
   * Dispose all registered resources
   */
  async dispose(): Promise<void> {
    const errors: Error[] = [];

    // Dispose in reverse order of registration
    const disposables = Array.from(this.disposables).reverse();

    for (const disposable of disposables) {
      try {
        await disposable.dispose();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.disposables.clear();

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Failed to dispose ${errors.length} resources`
      );
    }
  }
}

/**
 * Helper for using disposable resources with try-finally
 */
export async function using<T extends IDisposable, R>(
  resource: T,
  action: (resource: T) => Promise<R>
): Promise<R> {
  try {
    return await action(resource);
  } finally {
    await resource.dispose();
  }
}
```

**Update executors**:
```typescript
// Before
export class DeployExecutor extends StepExecutor {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const proc = spawn('cdk', ['deploy']);
    // ... no cleanup
  }
}

// After
export class DeployExecutor extends StepExecutor implements IDisposable {
  private disposables = new DisposableManager();
  private childProcesses: Set<ChildProcess> = new Set();
  private awsClients: Set<any> = new Set();

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const proc = spawn('cdk', ['deploy']);
      this.childProcesses.add(proc);

      // Work...

      return { status: 'success', data: result };
    } finally {
      await this.dispose();
    }
  }

  async dispose(): Promise<void> {
    // Kill all child processes
    for (const proc of this.childProcesses) {
      if (!proc.killed) {
        proc.kill('SIGTERM');

        // Wait briefly for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 100));

        // Force kill if still running
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }
    }
    this.childProcesses.clear();

    // Destroy AWS clients
    for (const client of this.awsClients) {
      if (client.destroy) {
        await client.destroy();
      }
    }
    this.awsClients.clear();

    // Dispose managed resources
    await this.disposables.dispose();
  }
}

// Usage in orchestrator
async function runMigration() {
  const executor = new DeployExecutor();
  try {
    return await executor.execute(context);
  } finally {
    await executor.dispose();
  }
}
```

**Benefits**:
- Prevents resource leaks
- Explicit cleanup contracts
- Composable resource management
- Easier testing (can verify cleanup)
- Better error handling

**Effort**: 6 hours

---

## 5. Refactor TypeScriptGenerator Property Transformers

### Current State

**Problem**: Large switch-like logic in property transformers. `transformIAMRoleProps` is 80+ lines with deep nesting.

**Location**: `/src/modules/generator/typescript-generator.ts` (Lines 540-584)

### Proposed Refactoring

**Strategy**: Strategy pattern for property transformation

```typescript
/**
 * Property transformation strategy
 */
interface PropertyTransformationStrategy {
  /**
   * Can this strategy handle this resource type?
   */
  canHandle(resourceType: string): boolean;

  /**
   * Transform CloudFormation properties to CDK L2 properties
   */
  transform(
    properties: Record<string, unknown>,
    context: TransformationContext
  ): Record<string, unknown>;
}

interface TransformationContext {
  resourceType: string;
  resourceRefs: Map<string, string>;
  logger: ILogger;
}

/**
 * IAM Role property transformer
 */
class IAMRoleTransformer implements PropertyTransformationStrategy {
  canHandle(resourceType: string): boolean {
    return resourceType === 'AWS::IAM::Role';
  }

  transform(
    properties: Record<string, unknown>,
    context: TransformationContext
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    // Extract each property in its own method
    this.transformAssumeRolePolicy(properties, transformed, context);
    this.transformPolicies(properties, transformed, context);
    this.transformBasicProperties(properties, transformed);

    return transformed;
  }

  private transformAssumeRolePolicy(
    properties: Record<string, unknown>,
    transformed: Record<string, unknown>,
    context: TransformationContext
  ): void {
    const assumeRolePolicy = properties.AssumeRolePolicyDocument;
    if (!assumeRolePolicy) return;

    if (!this.isValidAssumeRolePolicy(assumeRolePolicy)) {
      context.logger.warn('Invalid AssumeRolePolicyDocument structure', {
        resourceType: context.resourceType
      });
      return;
    }

    const doc = assumeRolePolicy as AssumeRolePolicyDocument;
    const service = doc.Statement[0].Principal.Service;
    const serviceName = Array.isArray(service) ? service[0] : service;

    transformed.assumedBy = `new iam.ServicePrincipal('${serviceName}')`;
  }

  private transformPolicies(
    properties: Record<string, unknown>,
    transformed: Record<string, unknown>,
    context: TransformationContext
  ): void {
    const policies = properties.Policies;
    if (!policies || !Array.isArray(policies) || policies.length === 0) {
      return;
    }

    const policy = policies[0];
    const policyName = this.getPolicyName(policy);

    transformed.inlinePolicies = `{
      ${policyName}: new iam.PolicyDocument({
        statements: ${this.convertPolicyStatements(policy.PolicyDocument.Statement)}
      })
    }`;
  }

  private transformBasicProperties(
    properties: Record<string, unknown>,
    transformed: Record<string, unknown>
  ): void {
    if (properties.RoleName) {
      transformed.roleName = properties.RoleName;
    }
    if (properties.Path) {
      transformed.path = properties.Path;
    }
  }

  private isValidAssumeRolePolicy(value: unknown): value is AssumeRolePolicyDocument {
    if (!value || typeof value !== 'object') return false;
    const doc = value as any;
    return (
      Array.isArray(doc.Statement) &&
      doc.Statement.length > 0 &&
      doc.Statement[0].Principal?.Service
    );
  }

  private getPolicyName(policy: any): string {
    if (typeof policy.PolicyName === 'string') {
      return this.toCamelCase(policy.PolicyName);
    }
    return 'lambdaPolicy'; // Default name
  }

  private toCamelCase(str: string): string {
    return NamingUtils.toCamelCase(str);
  }

  private convertPolicyStatements(statements: any[]): string {
    // Implementation...
  }
}

/**
 * Lambda Function property transformer
 */
class LambdaFunctionTransformer implements PropertyTransformationStrategy {
  canHandle(resourceType: string): boolean {
    return resourceType === 'AWS::Lambda::Function';
  }

  transform(
    properties: Record<string, unknown>,
    context: TransformationContext
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    this.transformCode(properties, transformed, context);
    this.transformRuntime(properties, transformed);
    this.transformTimeout(properties, transformed);
    this.transformMemory(properties, transformed);
    this.transformBasicProperties(properties, transformed);

    return transformed;
  }

  // ... individual transformation methods
}

/**
 * Registry of property transformers
 */
class PropertyTransformerRegistry {
  private transformers: PropertyTransformationStrategy[] = [];

  register(transformer: PropertyTransformationStrategy): void {
    this.transformers.push(transformer);
  }

  getTransformer(resourceType: string): PropertyTransformationStrategy | undefined {
    return this.transformers.find(t => t.canHandle(resourceType));
  }
}
```

**Update TypeScriptGenerator**:
```typescript
export class TypeScriptGenerator {
  private transformerRegistry: PropertyTransformerRegistry;

  constructor(private logger: ILogger) {
    this.transformerRegistry = new PropertyTransformerRegistry();

    // Register built-in transformers
    this.transformerRegistry.register(new IAMRoleTransformer());
    this.transformerRegistry.register(new LambdaFunctionTransformer());
    this.transformerRegistry.register(new S3BucketTransformer());
    this.transformerRegistry.register(new DynamoDBTableTransformer());
    this.transformerRegistry.register(new LogGroupTransformer());
  }

  generateConstruct(resource: Resource | ClassifiedResource, useL2: boolean = true): ConstructCode {
    // ... setup

    // Transform properties using strategy pattern
    let transformedProps = resourceProperties;
    if (useL2) {
      const transformer = this.transformerRegistry.getTransformer(resourceType);
      if (transformer) {
        transformedProps = transformer.transform(resourceProperties, {
          resourceType,
          resourceRefs: this.resourceRefs,
          logger: this.logger
        });
      }
    }

    // ... rest of generation
  }
}
```

**Benefits**:
- Single Responsibility: Each transformer handles one resource type
- Open/Closed: Easy to add new transformers without modifying existing code
- Testability: Can test each transformer independently
- Readability: Clear separation of concerns
- Complexity: Reduced cyclomatic complexity from ~35 to ~8 per transformer

**Effort**: 8 hours

---

## 6. Add Comprehensive Type Guards

### Current State

**Problem**: Excessive use of `any` and unsafe type assertions throughout codebase.

### Proposed Refactoring

**Create**: `/src/modules/generator/utils/type-guards.ts`

```typescript
/**
 * Type guards for CloudFormation resources
 */

// IAM types
export interface AssumeRolePolicyDocument {
  Version?: string;
  Statement: Array<{
    Effect: 'Allow' | 'Deny';
    Principal: {
      Service: string | string[];
      [key: string]: any;
    };
    Action: string | string[];
  }>;
}

export interface IAMPolicy {
  PolicyName: string | object; // Can be Fn::Join
  PolicyDocument: {
    Statement: Array<{
      Effect: 'Allow' | 'Deny';
      Action: string | string[];
      Resource: string | string[] | object;
    }>;
  };
}

// Type guards
export function isAssumeRolePolicyDocument(
  value: unknown
): value is AssumeRolePolicyDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const doc = value as any;

  if (!Array.isArray(doc.Statement) || doc.Statement.length === 0) {
    return false;
  }

  const statement = doc.Statement[0];
  return (
    statement &&
    typeof statement === 'object' &&
    statement.Principal &&
    typeof statement.Principal === 'object' &&
    'Service' in statement.Principal
  );
}

export function isIAMPolicyArray(value: unknown): value is IAMPolicy[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const policy = value[0];
  return (
    policy &&
    typeof policy === 'object' &&
    'PolicyName' in policy &&
    'PolicyDocument' in policy &&
    typeof policy.PolicyDocument === 'object' &&
    Array.isArray((policy.PolicyDocument as any).Statement)
  );
}

export function isLambdaCodeConfig(value: unknown): value is {
  S3Bucket: string | { Ref: string };
  S3Key: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const code = value as any;
  return (
    ('S3Bucket' in code && 'S3Key' in code) &&
    (typeof code.S3Key === 'string')
  );
}

export function hasTagArray(value: unknown): value is {
  Tags: Array<{ Key: string; Value: string }>;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as any;
  return (
    Array.isArray(obj.Tags) &&
    obj.Tags.every(
      (tag: any) =>
        tag &&
        typeof tag === 'object' &&
        typeof tag.Key === 'string' &&
        'Value' in tag
    )
  );
}
```

**Usage**:
```typescript
// Before (unsafe)
private transformIAMRoleProps(properties: Record<string, unknown>): Record<string, unknown> {
  const doc = value as any;  // ❌ Unsafe
  const service = doc.Statement[0].Principal.Service;  // Can crash
}

// After (type-safe)
private transformIAMRoleProps(properties: Record<string, unknown>): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (key === 'AssumeRolePolicyDocument') {
      if (!isAssumeRolePolicyDocument(value)) {
        throw new ValidationError(
          'Invalid AssumeRolePolicyDocument structure',
          { expected: 'AssumeRolePolicyDocument', received: typeof value }
        );
      }

      // TypeScript now knows the exact type
      const service = value.Statement[0].Principal.Service;
      const serviceName = Array.isArray(service) ? service[0] : service;
      transformed.assumedBy = `new iam.ServicePrincipal('${serviceName}')`;
    }
  }

  return transformed;
}
```

**Benefits**:
- Type safety: Catch errors at runtime before they cause crashes
- Better IDE support: Auto complete works correctly
- Self-documenting: Types serve as documentation
- Testability: Can test type guards independently
- Maintainability: Changes to types are caught by compiler

**Effort**: 6 hours

---

## 7. Extract Code Cleaner Metrics

### Current State

**Problem**: Metrics calculation mixed with cleaning logic.

### Proposed Refactoring

```typescript
/**
 * Metrics calculator for code cleaning operations
 */
export class CleaningMetricsCalculator {
  calculate(
    originalCode: string,
    cleanedCode: string,
    operations: CleaningOperations
  ): CleaningMetrics {
    const originalLines = originalCode.split('\n').length;
    const cleanedLines = cleanedCode.split('\n').length;
    const totalReduction = originalLines - cleanedLines;

    return {
      comments: {
        removed: operations.commentsRemoved,
        reductionPercentage: this.calculatePercentage(
          operations.commentsRemoved,
          originalLines
        )
      },
      logicalIds: {
        removed: operations.logicalIdsRemoved,
        reductionPercentage: this.calculatePercentage(
          operations.logicalIdsRemoved * 2, // ~2 lines per override
          originalLines
        )
      },
      removalPolicies: {
        removed: operations.removalPoliciesRemoved,
        reductionPercentage: this.calculatePercentage(
          operations.removalPoliciesRemoved,
          originalLines
        )
      },
      totalReductionPercentage: this.calculatePercentage(
        totalReduction,
        originalLines
      ),
      originalLines,
      cleanedLines
    };
  }

  private calculatePercentage(removed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((removed / total) * 100);
  }
}
```

**Benefits**:
- Separation of concerns
- Easier to test metrics calculation
- Can enhance metrics without touching cleaning logic

**Effort**: 1 hour

---

## Summary of Refactoring

| Refactoring | Priority | Effort | Impact |
|-------------|----------|--------|--------|
| 1. Naming Utilities | High | 2h | High (reduces duplication) |
| 2. Logger Interface | High | 3h | High (enables testing) |
| 3. Config Consolidation | Medium | 4h | Medium (improves DX) |
| 4. Lifecycle Management | Critical | 6h | Critical (prevents leaks) |
| 5. Property Transformers | Medium | 8h | High (reduces complexity) |
| 6. Type Guards | Critical | 6h | Critical (type safety) |
| 7. Metrics Calculator | Low | 1h | Low (nice to have) |

**Total Effort**: 30 hours (~4 days)

**Recommended Order**:
1. Type Guards (CRITICAL - prevents crashes)
2. Lifecycle Management (CRITICAL - prevents leaks)
3. Logger Interface (HIGH - enables testing)
4. Naming Utilities (HIGH - quick win)
5. Property Transformers (MEDIUM - significant improvement)
6. Config Consolidation (MEDIUM - improves DX)
7. Metrics Calculator (LOW - polish)

---

## Next Steps

1. Review refactoring recommendations with team
2. Prioritize based on current sprint goals
3. Create separate tasks for each refactoring
4. Implement in order of priority
5. Add tests for each refactored component
6. Update documentation

**Questions?** Contact the architecture review team for guidance on implementation strategy.
