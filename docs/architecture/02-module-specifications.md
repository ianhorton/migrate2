# Module Specifications

## Module Architecture

Each module follows a consistent structure with clear responsibilities, well-defined interfaces, and comprehensive error handling.

## 1. Scanner Module

### Purpose
Discover and analyze all resources in the Serverless application, including both explicitly defined and framework-generated resources.

### Responsibilities
1. Parse Serverless configuration files (serverless.yml)
2. Execute Serverless package to generate CloudFormation
3. Identify all resources (explicit and abstracted)
4. Build resource dependency graph
5. Classify resources for migration strategy

### Module Structure

```
scanner/
├── index.ts                    # Module exports and facade
├── serverless-parser.ts        # Parse serverless.yml
├── cloudformation-generator.ts # Generate CF from Serverless
├── resource-discoverer.ts      # Discover all resources
├── dependency-builder.ts       # Build dependency graph
├── resource-classifier.ts      # Classify resources
└── __tests__/                  # Unit tests
```

### Interface

```typescript
export interface ScannerModule {
  /**
   * Scan Serverless application and discover all resources
   */
  scan(config: ServerlessConfig): Promise<ResourceInventory>;

  /**
   * Parse serverless.yml configuration
   */
  parseServerlessConfig(path: string): Promise<ParsedServerlessConfig>;

  /**
   * Generate CloudFormation template from Serverless
   */
  generateCloudFormation(
    serverlessPath: string,
    stage: string
  ): Promise<CloudFormationTemplate>;

  /**
   * Discover all resources in CloudFormation template
   */
  discoverResources(
    template: CloudFormationTemplate,
    config: ParsedServerlessConfig
  ): Promise<Resource[]>;

  /**
   * Build dependency graph from resources
   */
  buildDependencyGraph(resources: Resource[]): DependencyGraph;

  /**
   * Classify resources for migration strategy
   */
  classifyResources(resources: Resource[]): ResourceInventory;
}

export interface ParsedServerlessConfig {
  service: string;
  provider: ProviderConfig;
  functions: Record<string, FunctionConfig>;
  resources?: CustomResources;
  plugins?: string[];
  custom?: Record<string, unknown>;
}

export interface ProviderConfig {
  name: string;
  runtime: string;
  stage: string;
  region: string;
  stackName?: string;
  environment?: Record<string, string>;
  iamRoleStatements?: IamStatement[];
}

export interface FunctionConfig {
  handler: string;
  runtime?: string;
  timeout?: number;
  memorySize?: number;
  environment?: Record<string, string>;
  events?: EventConfig[];
}

export interface CustomResources {
  Resources?: Record<string, CloudFormationResource>;
  Outputs?: Record<string, OutputDefinition>;
}
```

### Classification Logic

```typescript
class ResourceClassifier {
  /**
   * Resource types that must be imported (stateful)
   */
  private readonly STATEFUL_TYPES = [
    'AWS::DynamoDB::Table',
    'AWS::S3::Bucket',
    'AWS::RDS::DBInstance',
    'AWS::RDS::DBCluster',
    'AWS::Logs::LogGroup',
    'AWS::ECS::Cluster',
    'AWS::EFS::FileSystem',
    'AWS::ElastiCache::CacheCluster',
    'AWS::ElastiCache::ReplicationGroup',
    'AWS::Cognito::UserPool',
    'AWS::SecretsManager::Secret',
    'AWS::SSM::Parameter'
  ];

  /**
   * Resource types that cannot be imported (must recreate)
   */
  private readonly RECREATE_TYPES = [
    'AWS::Lambda::Function',
    'AWS::Lambda::Version',
    'AWS::Lambda::Alias',
    'AWS::ApiGateway::RestApi',
    'AWS::ApiGateway::Deployment',
    'AWS::ApiGateway::Stage',
    'AWS::IAM::Role',
    'AWS::IAM::Policy',
    'AWS::Events::Rule',
    'AWS::SNS::Topic',
    'AWS::SQS::Queue'
  ];

  /**
   * Resource types requiring manual migration
   */
  private readonly MANUAL_TYPES = [
    'AWS::CloudFormation::Stack',
    'Custom::*'
  ];

  classify(resource: Resource): ResourceClassification {
    // Check for stateful resources
    if (this.STATEFUL_TYPES.includes(resource.type)) {
      return ResourceClassification.IMPORT;
    }

    // Check for recreate resources
    if (this.RECREATE_TYPES.includes(resource.type)) {
      return ResourceClassification.RECREATE;
    }

    // Check for manual resources
    if (this.isManualResource(resource.type)) {
      return ResourceClassification.MANUAL;
    }

    // Unknown resource type
    return ResourceClassification.UNSUPPORTED;
  }

  private isManualResource(type: string): boolean {
    return this.MANUAL_TYPES.some(pattern =>
      pattern.endsWith('*')
        ? type.startsWith(pattern.slice(0, -1))
        : type === pattern
    );
  }
}
```

### Error Handling

```typescript
export class ScannerError extends Error {
  constructor(
    message: string,
    public readonly code: ScannerErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ScannerError';
  }
}

export enum ScannerErrorCode {
  SERVERLESS_CONFIG_NOT_FOUND = 'SERVERLESS_CONFIG_NOT_FOUND',
  INVALID_SERVERLESS_CONFIG = 'INVALID_SERVERLESS_CONFIG',
  CLOUDFORMATION_GENERATION_FAILED = 'CLOUDFORMATION_GENERATION_FAILED',
  INVALID_CLOUDFORMATION_TEMPLATE = 'INVALID_CLOUDFORMATION_TEMPLATE',
  CIRCULAR_DEPENDENCY_DETECTED = 'CIRCULAR_DEPENDENCY_DETECTED'
}
```

---

## 2. Comparator Module

### Purpose
Automatically compare Serverless and CDK CloudFormation templates to eliminate manual verification and identify differences.

### Responsibilities
1. Load and parse both CloudFormation templates
2. Match resources between templates by physical identifiers
3. Deep compare properties for each resource
4. Classify differences by severity
5. Generate human-readable comparison reports

### Module Structure

```
comparator/
├── index.ts                  # Module exports and facade
├── template-loader.ts        # Load and validate templates
├── resource-matcher.ts       # Match resources between templates
├── property-comparator.ts    # Deep property comparison
├── comparison-rules.ts       # Resource-specific comparison rules
├── report-generator.ts       # Generate reports (JSON, HTML)
└── __tests__/                # Unit tests
```

### Interface

```typescript
export interface ComparatorModule {
  /**
   * Compare two CloudFormation templates
   */
  compare(
    serverlessTemplate: CloudFormationTemplate,
    cdkTemplate: CloudFormationTemplate,
    options?: ComparisonOptions
  ): Promise<ComparisonReport>;

  /**
   * Match resources between templates
   */
  matchResources(
    serverlessTemplate: CloudFormationTemplate,
    cdkTemplate: CloudFormationTemplate
  ): ResourceMatch[];

  /**
   * Compare individual resource
   */
  compareResource(
    serverlessResource: CloudFormationResource,
    cdkResource: CloudFormationResource,
    resourceType: string
  ): ResourceComparison;

  /**
   * Generate HTML report
   */
  generateHTMLReport(report: ComparisonReport): string;

  /**
   * Generate JSON report
   */
  generateJSONReport(report: ComparisonReport): string;
}

export interface ComparisonOptions {
  /** Ignore these property paths */
  ignoredProperties?: string[];

  /** Treat these differences as acceptable */
  acceptableDifferences?: string[];

  /** Strict mode (all differences are critical) */
  strictMode?: boolean;

  /** Include unchanged properties in report */
  includeUnchanged?: boolean;
}

export interface ResourceMatch {
  serverlessLogicalId: string;
  cdkLogicalId: string;
  physicalId: string;
  resourceType: string;
  matched: boolean;
  matchConfidence: number; // 0-1
}
```

### Comparison Rules Engine

```typescript
/**
 * Resource-specific comparison rules
 */
export class ComparisonRulesEngine {
  private rules: Map<string, ResourceComparisonRule>;

  constructor() {
    this.rules = new Map();
    this.registerDefaultRules();
  }

  private registerDefaultRules(): void {
    // DynamoDB Table rules
    this.rules.set('AWS::DynamoDB::Table', {
      criticalProperties: [
        'TableName',
        'KeySchema',
        'AttributeDefinitions',
        'BillingMode'
      ],
      warningProperties: [
        'StreamSpecification',
        'GlobalSecondaryIndexes',
        'LocalSecondaryIndexes',
        'ProvisionedThroughput'
      ],
      acceptableAdditions: [
        'PointInTimeRecoverySpecification',
        'TimeToLiveSpecification',
        'Tags',
        'SSESpecification'
      ],
      ignoredProperties: [
        'UpdateReplacePolicy',
        'DeletionPolicy',
        'Metadata',
        'Condition'
      ]
    });

    // S3 Bucket rules
    this.rules.set('AWS::S3::Bucket', {
      criticalProperties: ['BucketName'],
      warningProperties: [
        'VersioningConfiguration',
        'LifecycleConfiguration',
        'BucketEncryption',
        'ReplicationConfiguration',
        'CorsConfiguration'
      ],
      acceptableAdditions: [
        'PublicAccessBlockConfiguration',
        'Tags',
        'NotificationConfiguration'
      ],
      ignoredProperties: [
        'UpdateReplacePolicy',
        'DeletionPolicy',
        'Metadata'
      ]
    });

    // CloudWatch LogGroup rules
    this.rules.set('AWS::Logs::LogGroup', {
      criticalProperties: ['LogGroupName'],
      warningProperties: ['KmsKeyId'],
      acceptableAdditions: ['RetentionInDays', 'Tags'],
      ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata']
    });

    // Lambda Function rules
    this.rules.set('AWS::Lambda::Function', {
      criticalProperties: ['FunctionName', 'Handler', 'Runtime', 'Code'],
      warningProperties: [
        'Timeout',
        'MemorySize',
        'Environment',
        'VpcConfig',
        'Role',
        'Layers'
      ],
      acceptableAdditions: ['Tags', 'TracingConfig', 'ReservedConcurrentExecutions'],
      ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata']
    });
  }

  getRule(resourceType: string): ResourceComparisonRule {
    return (
      this.rules.get(resourceType) || {
        criticalProperties: [],
        warningProperties: [],
        acceptableAdditions: [],
        ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata']
      }
    );
  }
}

export interface ResourceComparisonRule {
  /** Properties that must match exactly */
  criticalProperties: string[];

  /** Properties that should match but differences are warnings */
  warningProperties: string[];

  /** Properties that CDK can add without issue */
  acceptableAdditions: string[];

  /** Properties to ignore in comparison */
  ignoredProperties: string[];

  /** Custom comparison function */
  customComparator?: (
    serverlessValue: unknown,
    cdkValue: unknown,
    property: string
  ) => PropertyDifference | null;
}
```

### Deep Equality Comparison

```typescript
class DeepComparator {
  /**
   * Deep equality check with type awareness
   */
  deepEqual(a: unknown, b: unknown): boolean {
    // Handle primitives
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;

    // Handle different types
    if (typeof a !== typeof b) return false;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      return this.arraysEqual(a, b);
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      return this.objectsEqual(
        a as Record<string, unknown>,
        b as Record<string, unknown>
      );
    }

    return false;
  }

  private arraysEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => this.deepEqual(val, b[idx]));
  }

  private objectsEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key => this.deepEqual(a[key], b[key]));
  }

  /**
   * Get detailed difference for debugging
   */
  getDifference(
    a: unknown,
    b: unknown,
    path: string = ''
  ): string[] {
    const differences: string[] = [];

    if (this.deepEqual(a, b)) return differences;

    if (typeof a !== typeof b) {
      differences.push(`${path}: type mismatch (${typeof a} vs ${typeof b})`);
      return differences;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        differences.push(`${path}: array length mismatch (${a.length} vs ${b.length})`);
      }
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        differences.push(
          ...this.getDifference(a[i], b[i], `${path}[${i}]`)
        );
      }
    } else if (typeof a === 'object' && a !== null && b !== null) {
      const allKeys = new Set([
        ...Object.keys(a as object),
        ...Object.keys(b as object)
      ]);
      for (const key of allKeys) {
        const aVal = (a as Record<string, unknown>)[key];
        const bVal = (b as Record<string, unknown>)[key];
        differences.push(
          ...this.getDifference(
            aVal,
            bVal,
            path ? `${path}.${key}` : key
          )
        );
      }
    } else {
      differences.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }

    return differences;
  }
}
```

---

## 3. Generator Module

### Purpose
Generate CDK code from existing Serverless CloudFormation resources.

### Responsibilities
1. Generate complete CDK stack definitions
2. Create L2 constructs with proper configuration
3. Generate import statements and dependencies
4. Apply CDK best practices and naming conventions
5. Support multiple CDK languages (TypeScript priority)

### Module Structure

```
generator/
├── index.ts                    # Module exports and facade
├── cdk-code-generator.ts       # Main generator orchestrator
├── typescript-generator.ts     # TypeScript code generation
├── python-generator.ts         # Python code generation (future)
├── construct-factory.ts        # Factory for creating constructs
├── template-renderer.ts        # Template rendering engine
├── naming-strategy.ts          # Naming conventions
├── templates/                  # Code templates
│   ├── stack.ts.hbs
│   ├── app.ts.hbs
│   ├── cdk.json.hbs
│   └── constructs/
│       ├── dynamodb-table.ts.hbs
│       ├── s3-bucket.ts.hbs
│       └── lambda-function.ts.hbs
└── __tests__/                  # Unit tests
```

### Interface

```typescript
export interface GeneratorModule {
  /**
   * Generate complete CDK project
   */
  generate(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<GeneratedCode>;

  /**
   * Generate CDK stack file
   */
  generateStack(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<string>;

  /**
   * Generate individual construct
   */
  generateConstruct(
    resource: Resource,
    config: GeneratorConfig
  ): Promise<ConstructCode>;

  /**
   * Generate supporting files (app.ts, cdk.json, etc.)
   */
  generateSupportingFiles(
    config: GeneratorConfig
  ): Promise<GeneratedFile[]>;
}
```

### Construct Factory

```typescript
export class ConstructFactory {
  /**
   * Resource type to CDK construct mapping
   */
  private readonly CONSTRUCT_MAPPING: Record<
    string,
    ConstructDefinition
  > = {
    'AWS::DynamoDB::Table': {
      l1Class: 'CfnTable',
      l2Class: 'Table',
      module: 'aws-dynamodb',
      generator: this.generateDynamoDBTable.bind(this)
    },
    'AWS::S3::Bucket': {
      l1Class: 'CfnBucket',
      l2Class: 'Bucket',
      module: 'aws-s3',
      generator: this.generateS3Bucket.bind(this)
    },
    'AWS::Logs::LogGroup': {
      l1Class: 'CfnLogGroup',
      l2Class: 'LogGroup',
      module: 'aws-logs',
      generator: this.generateLogGroup.bind(this)
    },
    'AWS::Lambda::Function': {
      l1Class: 'CfnFunction',
      l2Class: 'Function',
      module: 'aws-lambda',
      generator: this.generateLambdaFunction.bind(this)
    }
  };

  createConstruct(
    resource: Resource,
    useL2: boolean = true
  ): ConstructCode {
    const definition = this.CONSTRUCT_MAPPING[resource.type];

    if (!definition) {
      throw new Error(
        `No construct definition for resource type: ${resource.type}`
      );
    }

    return definition.generator(resource, useL2);
  }

  private generateDynamoDBTable(
    resource: Resource,
    useL2: boolean
  ): ConstructCode {
    const props = resource.properties as DynamoDBTableProperties;
    const varName = this.toCamelCase(resource.logicalId);

    if (useL2) {
      return {
        name: varName,
        resourceType: resource.type,
        code: this.renderTemplate('dynamodb-table.ts.hbs', {
          varName,
          logicalId: resource.logicalId,
          tableName: props.TableName,
          partitionKey: this.extractPartitionKey(props),
          sortKey: this.extractSortKey(props),
          billingMode: props.BillingMode || 'PROVISIONED',
          streamEnabled: !!props.StreamSpecification,
          streamViewType: props.StreamSpecification?.StreamViewType
        }),
        comments: [
          `DynamoDB Table: ${props.TableName}`,
          'IMPORTANT: This resource will be imported, not created'
        ],
        dependencies: []
      };
    } else {
      // L1 construct generation
      return this.generateL1Construct(resource);
    }
  }

  private generateS3Bucket(
    resource: Resource,
    useL2: boolean
  ): ConstructCode {
    const props = resource.properties as S3BucketProperties;
    const varName = this.toCamelCase(resource.logicalId);

    if (useL2) {
      return {
        name: varName,
        resourceType: resource.type,
        code: this.renderTemplate('s3-bucket.ts.hbs', {
          varName,
          logicalId: resource.logicalId,
          bucketName: props.BucketName,
          versioned: props.VersioningConfiguration?.Status === 'Enabled',
          encryption: props.BucketEncryption,
          publicAccessBlock: true
        }),
        comments: [
          `S3 Bucket: ${props.BucketName}`,
          'IMPORTANT: This resource will be imported, not created'
        ],
        dependencies: []
      };
    } else {
      return this.generateL1Construct(resource);
    }
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private renderTemplate(
    templateName: string,
    context: Record<string, unknown>
  ): string {
    // Template rendering logic using Handlebars or similar
    // Implementation omitted for brevity
    return '';
  }
}

interface ConstructDefinition {
  l1Class: string;
  l2Class: string;
  module: string;
  generator: (resource: Resource, useL2: boolean) => ConstructCode;
}
```

---

## 4. Editor Module

### Purpose
Programmatically modify CloudFormation templates to remove resources while maintaining integrity.

### Responsibilities
1. Load and parse CloudFormation templates
2. Remove resources safely
3. Update DependsOn references
4. Validate template syntax and semantics
5. Create automatic backups

### Module Structure

```
editor/
├── index.ts                  # Module exports and facade
├── template-editor.ts        # Main editing logic
├── dependency-updater.ts     # Update DependsOn references
├── validator.ts              # Template validation
├── backup-manager.ts         # Backup creation and restoration
└── __tests__/                # Unit tests
```

### Interface

```typescript
export interface EditorModule {
  /**
   * Remove resource from template
   */
  removeResource(
    template: CloudFormationTemplate,
    logicalId: string,
    options?: RemovalOptions
  ): Promise<ModificationResult>;

  /**
   * Remove multiple resources
   */
  removeResources(
    template: CloudFormationTemplate,
    logicalIds: string[],
    options?: RemovalOptions
  ): Promise<ModificationResult>;

  /**
   * Update DependsOn references
   */
  updateDependencies(
    template: CloudFormationTemplate,
    removedIds: string[]
  ): DependencyUpdate[];

  /**
   * Validate template
   */
  validate(
    template: CloudFormationTemplate
  ): Promise<ValidationResult>;

  /**
   * Create backup
   */
  createBackup(
    template: CloudFormationTemplate,
    backupPath?: string
  ): Promise<string>;

  /**
   * Restore from backup
   */
  restoreBackup(backupPath: string): Promise<CloudFormationTemplate>;
}

export interface RemovalOptions {
  /** Create backup before removal */
  createBackup?: boolean;

  /** Validate after removal */
  validate?: boolean;

  /** Update dependent resources */
  updateDependencies?: boolean;

  /** Dry run (don't actually modify) */
  dryRun?: boolean;
}

export interface ModificationResult {
  success: boolean;
  removedResources: string[];
  updatedDependencies: DependencyUpdate[];
  warnings: string[];
  backupPath?: string;
  template?: CloudFormationTemplate;
}
```

### Dependency Management

```typescript
export class DependencyUpdater {
  /**
   * Update all DependsOn references after resource removal
   */
  updateDependencies(
    template: CloudFormationTemplate,
    removedIds: string[]
  ): DependencyUpdate[] {
    const updates: DependencyUpdate[] = [];
    const removedSet = new Set(removedIds);

    for (const [resourceId, resource] of Object.entries(
      template.Resources
    )) {
      if (!resource.DependsOn) continue;

      const before = this.normalizeDependsOn(resource.DependsOn);
      const after = before.filter(dep => !removedSet.has(dep));

      if (before.length !== after.length) {
        // Update the resource
        if (after.length === 0) {
          delete resource.DependsOn;
        } else if (after.length === 1) {
          resource.DependsOn = after[0];
        } else {
          resource.DependsOn = after;
        }

        updates.push({
          resourceId,
          before,
          after
        });
      }
    }

    return updates;
  }

  /**
   * Find all resources that depend on target
   */
  findDependents(
    template: CloudFormationTemplate,
    targetId: string
  ): string[] {
    const dependents: string[] = [];

    for (const [resourceId, resource] of Object.entries(
      template.Resources
    )) {
      if (this.hasDependency(resource, targetId)) {
        dependents.push(resourceId);
      }
    }

    return dependents;
  }

  /**
   * Find all implicit dependencies (Ref, GetAtt, Sub)
   */
  findImplicitDependencies(
    template: CloudFormationTemplate,
    targetId: string
  ): string[] {
    const dependents: string[] = [];

    for (const [resourceId, resource] of Object.entries(
      template.Resources
    )) {
      if (this.hasImplicitDependency(resource, targetId)) {
        dependents.push(resourceId);
      }
    }

    return dependents;
  }

  private hasDependency(
    resource: CloudFormationResource,
    targetId: string
  ): boolean {
    if (!resource.DependsOn) return false;
    const deps = this.normalizeDependsOn(resource.DependsOn);
    return deps.includes(targetId);
  }

  private hasImplicitDependency(
    resource: CloudFormationResource,
    targetId: string
  ): boolean {
    const references = this.findAllReferences(resource);
    return references.includes(targetId);
  }

  private findAllReferences(obj: unknown): string[] {
    const refs: string[] = [];

    if (!obj || typeof obj !== 'object') return refs;

    const objRecord = obj as Record<string, unknown>;

    // Check for Ref
    if ('Ref' in objRecord && typeof objRecord.Ref === 'string') {
      refs.push(objRecord.Ref);
    }

    // Check for Fn::GetAtt
    if ('Fn::GetAtt' in objRecord) {
      const getAtt = objRecord['Fn::GetAtt'];
      if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') {
        refs.push(getAtt[0]);
      }
    }

    // Recursively search nested objects
    for (const value of Object.values(objRecord)) {
      refs.push(...this.findAllReferences(value));
    }

    return refs;
  }

  private normalizeDependsOn(
    dependsOn: string | string[]
  ): string[] {
    return Array.isArray(dependsOn) ? dependsOn : [dependsOn];
  }
}
```

---

## 5. Migration Orchestrator

### Purpose
Coordinate the entire migration process with state management, verification, and rollback capabilities.

### Responsibilities
1. Execute migration steps in correct order
2. Manage migration state and persistence
3. Handle user approvals in interactive mode
4. Coordinate rollbacks on failure
5. Generate progress reports and audit trails

### Module Structure

```
orchestrator/
├── index.ts                  # Module exports and facade
├── state-machine.ts          # Migration state machine
├── state-manager.ts          # State persistence
├── step-executor.ts          # Individual step execution
├── rollback-manager.ts       # Rollback coordination
├── verification-engine.ts    # Migration verification
└── __tests__/                # Unit tests
```

### Interface

```typescript
export interface MigrationOrchestrator {
  /**
   * Initialize migration
   */
  initialize(config: MigrationConfig): Promise<MigrationProject>;

  /**
   * Execute single migration step
   */
  executeStep(step: MigrationStep): Promise<StepResult>;

  /**
   * Run complete migration
   */
  runMigration(
    mode: 'interactive' | 'automatic'
  ): Promise<MigrationResult>;

  /**
   * Verify migration state
   */
  verify(): Promise<VerificationResult>;

  /**
   * Rollback to previous state
   */
  rollback(toStep?: MigrationStep): Promise<RollbackResult>;

  /**
   * Resume interrupted migration
   */
  resume(): Promise<MigrationResult>;

  /**
   * Get current state
   */
  getState(): Promise<MigrationState>;

  /**
   * Cancel migration
   */
  cancel(): Promise<void>;
}
```

### State Machine Implementation

```typescript
export class MigrationStateMachine {
  private state: MigrationState;
  private config: MigrationConfig;
  private stateManager: StateManager;

  private readonly STEPS: MigrationStep[] = [
    MigrationStep.SCAN,
    MigrationStep.PROTECT,
    MigrationStep.GENERATE,
    MigrationStep.COMPARE,
    MigrationStep.REMOVE,
    MigrationStep.IMPORT,
    MigrationStep.DEPLOY,
    MigrationStep.VERIFY,
    MigrationStep.CLEANUP
  ];

  async executeStep(step: MigrationStep): Promise<StepResult> {
    const startTime = Date.now();

    try {
      this.updateState({
        currentStep: step,
        status: MigrationStatus.IN_PROGRESS
      });

      // Validate prerequisites
      await this.validateStep(step);

      // Execute step
      let result: StepResult;
      switch (step) {
        case MigrationStep.SCAN:
          result = await this.executeScan();
          break;
        case MigrationStep.PROTECT:
          result = await this.executeProtect();
          break;
        case MigrationStep.GENERATE:
          result = await this.executeGenerate();
          break;
        case MigrationStep.COMPARE:
          result = await this.executeCompare();
          break;
        case MigrationStep.REMOVE:
          result = await this.executeRemove();
          break;
        case MigrationStep.IMPORT:
          result = await this.executeImport();
          break;
        case MigrationStep.DEPLOY:
          result = await this.executeDeploy();
          break;
        case MigrationStep.VERIFY:
          result = await this.executeVerify();
          break;
        case MigrationStep.CLEANUP:
          result = await this.executeCleanup();
          break;
        default:
          throw new Error(`Unknown step: ${step}`);
      }

      result.duration = Date.now() - startTime;

      if (result.success) {
        this.state.completedSteps.push(step);
        await this.logAuditEntry(step, 'completed', result);
      } else {
        this.state.failedSteps.push({
          step,
          error: result.error || 'Unknown error',
          timestamp: new Date()
        });
        await this.logAuditEntry(step, 'failed', result);
      }

      await this.stateManager.saveState(this.state);

      return result;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      this.state.failedSteps.push({
        step,
        error: errorMsg,
        timestamp: new Date()
      });
      this.state.status = MigrationStatus.FAILED;
      await this.stateManager.saveState(this.state);

      return {
        success: false,
        step,
        error: errorMsg,
        duration: Date.now() - startTime
      };
    }
  }

  private async validateStep(step: MigrationStep): Promise<void> {
    switch (step) {
      case MigrationStep.PROTECT:
        // Ensure resources are discovered
        if (this.state.resources.length === 0) {
          throw new Error('No resources found. Run SCAN step first.');
        }
        break;

      case MigrationStep.REMOVE:
        // Ensure templates have been compared
        if (!this.state.completedSteps.includes(MigrationStep.COMPARE)) {
          throw new Error(
            'Templates must be compared before removal'
          );
        }
        break;

      case MigrationStep.IMPORT:
        // Ensure resources have been removed
        if (!this.state.completedSteps.includes(MigrationStep.REMOVE)) {
          throw new Error('Resources must be removed before import');
        }
        break;

      default:
        // No validation needed
        break;
    }
  }

  private async logAuditEntry(
    step: MigrationStep,
    action: string,
    details: unknown
  ): Promise<void> {
    this.state.auditLog.push({
      timestamp: new Date(),
      step,
      action,
      details: details as Record<string, unknown>
    });
  }
}
```

### State Persistence

```typescript
export class StateManager {
  private statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
  }

  async saveState(state: MigrationState): Promise<void> {
    const stateFile = path.join(this.statePath, 'migration-state.json');

    // Ensure directory exists
    await fs.mkdir(this.statePath, { recursive: true });

    // Save current state
    await fs.writeFile(
      stateFile,
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    // Create timestamped backup
    const backupFile = path.join(
      this.statePath,
      'backups',
      `migration-state-${Date.now()}.json`
    );

    await fs.mkdir(path.dirname(backupFile), { recursive: true });
    await fs.writeFile(
      backupFile,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }

  async loadState(): Promise<MigrationState | null> {
    const stateFile = path.join(this.statePath, 'migration-state.json');

    try {
      const content = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(content) as MigrationState;

      // Validate state structure
      if (!this.isValidState(state)) {
        throw new Error('Invalid state structure');
      }

      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // No state file exists
      }
      throw error;
    }
  }

  async listBackups(): Promise<BackupInfo[]> {
    const backupDir = path.join(this.statePath, 'backups');

    try {
      const files = await fs.readdir(backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.startsWith('migration-state-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);

          backups.push({
            filename: file,
            path: filePath,
            timestamp: stats.mtime,
            size: stats.size
          });
        }
      }

      return backups.sort((a, b) =>
        b.timestamp.getTime() - a.timestamp.getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async restoreBackup(backupPath: string): Promise<MigrationState> {
    const content = await fs.readFile(backupPath, 'utf-8');
    const state = JSON.parse(content) as MigrationState;

    if (!this.isValidState(state)) {
      throw new Error('Invalid backup state structure');
    }

    await this.saveState(state);
    return state;
  }

  private isValidState(state: unknown): state is MigrationState {
    return (
      typeof state === 'object' &&
      state !== null &&
      'migrationId' in state &&
      'status' in state &&
      'currentStep' in state &&
      'completedSteps' in state &&
      'resources' in state
    );
  }
}

interface BackupInfo {
  filename: string;
  path: string;
  timestamp: Date;
  size: number;
}
```
