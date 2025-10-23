# Messy Environment Support - Implementation Plan

## Executive Summary

This plan adds robust support for real-world "messy" migration scenarios where:
- Physical resource names don't match logical IDs
- Resources have been manually modified outside CloudFormation
- CloudFormation drift exists
- Multiple stacks share resources
- Template corruption or inconsistencies exist

**Goal:** Add human intervention hooks at critical decision points rather than attempting full automation of uncertain scenarios.

**Timeline:** 3 sprints (~6-8 weeks)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│              Migration Orchestrator                      │
│         (Enhanced with Checkpoints)                      │
└────────┬─────────────────────────────────────────────────┘
         │
         ├─── Checkpoint: Physical ID Resolution
         │    └─→ AWSResourceDiscovery
         │        └─→ ResourceMatcher
         │            └─→ PhysicalIdResolver
         │                └─→ HumanInterventionManager
         │
         ├─── Checkpoint: Template Difference Review
         │    └─→ DifferenceAnalyzer
         │        └─→ ConfidenceScoring
         │            └─→ ManualReviewReport
         │
         ├─── Checkpoint: Drift Detection
         │    └─→ DriftDetector
         │        └─→ HumanInterventionManager
         │
         └─── Checkpoint: CDK Import Execution
              └─→ InteractiveCDKImport
                  └─→ HumanInterventionManager
```

---

## Sprint 1: Foundation (2-3 weeks)

### Goal
Build core infrastructure for human intervention and AWS resource discovery.

### Tasks

#### 1.1 HumanInterventionManager
**Location:** `src/modules/orchestrator/human-intervention.ts`

**Purpose:** Central system for prompting users during migration

**Interface:**
```typescript
export interface InterventionPrompt {
  id: string;
  type: 'choice' | 'confirm' | 'input';
  severity: 'info' | 'warning' | 'critical';
  question: string;
  context?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
  defaultValue?: string;
  allowSkip?: boolean;
}

export interface InterventionResponse {
  promptId: string;
  action: 'proceed' | 'skip' | 'abort' | 'manual' | string;
  value?: string;
  timestamp: Date;
}

export class HumanInterventionManager {
  /**
   * Prompt user for decision with interactive CLI
   */
  async prompt(prompt: InterventionPrompt): Promise<InterventionResponse>;

  /**
   * Prompt for physical resource ID selection
   */
  async promptForPhysicalId(
    logicalId: string,
    resourceType: string,
    candidates: PhysicalResourceCandidate[]
  ): Promise<string>;

  /**
   * Prompt for critical difference approval
   */
  async confirmCriticalDifference(
    resourceId: string,
    differences: Difference[]
  ): Promise<'proceed' | 'abort' | 'manual'>;

  /**
   * Show drift and ask for resolution strategy
   */
  async resolveDrift(
    resourceId: string,
    drift: DriftInfo
  ): Promise<'use-aws' | 'use-template' | 'manual'>;

  /**
   * Record intervention for audit trail
   */
  recordIntervention(response: InterventionResponse): void;

  /**
   * Get intervention history for migration
   */
  getInterventionHistory(migrationId: string): InterventionResponse[];
}
```

**Features:**
- ✅ Colored terminal output with `chalk`
- ✅ Interactive menus with `inquirer`
- ✅ Progress indicators with `ora`
- ✅ Intervention audit trail (JSON log)
- ✅ Dry-run mode (simulate interventions)

**Example Usage:**
```typescript
const response = await interventionManager.promptForPhysicalId(
  'UsersTable',
  'AWS::DynamoDB::Table',
  [
    { physicalId: 'users-table-dev', confidence: 0.9, source: 'discovered' },
    { physicalId: 'users-table-prod', confidence: 0.5, source: 'discovered' },
    { physicalId: 'legacy-users', confidence: 0.3, source: 'discovered' }
  ]
);
```

**Output:**
```
⚠️  Cannot automatically determine physical ID for DynamoDB table

Logical ID: UsersTable
Resource Type: AWS::DynamoDB::Table

Found 3 candidates in AWS account:

❯ ✨ users-table-dev (90% confidence) [RECOMMENDED]
  📍 us-east-1 | Created: 2024-01-15

  users-table-prod (50% confidence)
  📍 us-east-1 | Created: 2023-06-10

  legacy-users (30% confidence)
  📍 us-east-1 | Created: 2022-03-20

  ✏️  Enter manually
  ⏭️  Skip this resource

Choose resource:
```

---

#### 1.2 AWSResourceDiscovery
**Location:** `src/modules/discovery/aws-resource-discovery.ts`

**Purpose:** Scan AWS account to find actual resources

**Interface:**
```typescript
export interface DiscoveredResource {
  physicalId: string;
  resourceType: string;
  region: string;
  arn: string;
  tags: Record<string, string>;
  createdAt?: Date;
  metadata: Record<string, any>;
}

export class AWSResourceDiscovery {
  /**
   * Discover all resources of a specific type
   */
  async discoverResourceType(
    resourceType: string,
    region?: string
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover DynamoDB tables
   */
  async discoverDynamoDBTables(): Promise<DiscoveredResource[]>;

  /**
   * Discover S3 buckets
   */
  async discoverS3Buckets(): Promise<DiscoveredResource[]>;

  /**
   * Discover CloudWatch LogGroups
   */
  async discoverLogGroups(prefix?: string): Promise<DiscoveredResource[]>;

  /**
   * Discover Lambda functions
   */
  async discoverLambdaFunctions(): Promise<DiscoveredResource[]>;

  /**
   * Discover IAM roles
   */
  async discoverIAMRoles(pathPrefix?: string): Promise<DiscoveredResource[]>;

  /**
   * Batch discover all resource types
   */
  async discoverAll(
    resourceTypes: string[]
  ): Promise<Map<string, DiscoveredResource[]>>;
}
```

**Implementation:**
```typescript
// Example: Discover DynamoDB tables
async discoverDynamoDBTables(): Promise<DiscoveredResource[]> {
  const client = new DynamoDBClient({ region: this.region });
  const command = new ListTablesCommand({});
  const response = await client.send(command);

  const tables: DiscoveredResource[] = [];

  for (const tableName of response.TableNames || []) {
    const describeCommand = new DescribeTableCommand({ TableName: tableName });
    const tableDetails = await client.send(describeCommand);

    tables.push({
      physicalId: tableName,
      resourceType: 'AWS::DynamoDB::Table',
      region: this.region,
      arn: tableDetails.Table?.TableArn || '',
      tags: await this.getTableTags(tableName),
      createdAt: tableDetails.Table?.CreationDateTime,
      metadata: {
        keySchema: tableDetails.Table?.KeySchema,
        billingMode: tableDetails.Table?.BillingModeSummary?.BillingMode,
        itemCount: tableDetails.Table?.ItemCount
      }
    });
  }

  return tables;
}
```

---

#### 1.3 ResourceMatcher
**Location:** `src/modules/discovery/resource-matcher.ts`

**Purpose:** Match CloudFormation logical IDs to physical AWS resources

**Interface:**
```typescript
export interface MatchCandidate {
  physicalId: string;
  confidence: number; // 0.0 to 1.0
  matchReasons: string[];
  discoveredResource: DiscoveredResource;
}

export interface MatchResult {
  logicalId: string;
  resourceType: string;
  matches: MatchCandidate[];
  bestMatch?: MatchCandidate;
  requiresHumanReview: boolean;
}

export class ResourceMatcher {
  /**
   * Match template resource to discovered resources
   */
  match(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>,
    discoveredResources: DiscoveredResource[]
  ): MatchResult;

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(
    templateProps: Record<string, any>,
    discovered: DiscoveredResource
  ): { score: number; reasons: string[] };
}
```

**Matching Strategy:**
```typescript
// Confidence scoring algorithm
calculateConfidence(templateProps, discovered): { score, reasons } {
  let score = 0.0;
  const reasons: string[] = [];

  // Exact name match = 90% confidence
  if (templateProps.TableName === discovered.physicalId) {
    score += 0.9;
    reasons.push('Exact name match');
  }

  // Name similarity (fuzzy) = 0-50% confidence
  const similarity = this.calculateSimilarity(
    templateProps.TableName,
    discovered.physicalId
  );
  if (similarity > 0.7) {
    score += similarity * 0.5;
    reasons.push(`Name similarity: ${(similarity * 100).toFixed(0)}%`);
  }

  // Tag match = +20% confidence
  if (this.tagsMatch(templateProps.Tags, discovered.tags)) {
    score += 0.2;
    reasons.push('Tags match');
  }

  // Configuration match (key schema, etc.) = +30% confidence
  if (this.configurationMatches(templateProps, discovered.metadata)) {
    score += 0.3;
    reasons.push('Configuration matches');
  }

  // CreatedAt within expected timeframe = +10% confidence
  if (this.isRecentlyCreated(discovered.createdAt)) {
    score += 0.1;
    reasons.push('Recently created');
  }

  return { score: Math.min(score, 1.0), reasons };
}
```

---

#### 1.4 PhysicalIdResolver
**Location:** `src/modules/discovery/physical-id-resolver.ts`

**Purpose:** Resolve physical IDs with fallback to human intervention

**Interface:**
```typescript
export interface ResolutionStrategy {
  name: string;
  confidence: number;
  execute(): Promise<string | null>;
}

export class PhysicalIdResolver {
  constructor(
    private discovery: AWSResourceDiscovery,
    private matcher: ResourceMatcher,
    private interventionManager: HumanInterventionManager
  ) {}

  /**
   * Resolve physical ID with cascading fallback strategies
   */
  async resolve(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>
  ): Promise<string>;

  /**
   * Get all available resolution strategies
   */
  private getStrategies(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>
  ): ResolutionStrategy[];
}
```

**Fallback Strategy:**
```typescript
async resolve(logicalId, resourceType, templateProperties): Promise<string> {
  const strategies = [
    // Strategy 1: Use explicit physical ID from template (100% confidence)
    {
      name: 'Explicit Physical ID',
      confidence: 1.0,
      execute: async () => {
        const physicalIdProp = this.getPhysicalIdProperty(resourceType);
        return templateProperties[physicalIdProp] || null;
      }
    },

    // Strategy 2: Discover and auto-match (70%+ confidence)
    {
      name: 'Auto-Discovery',
      confidence: 0.7,
      execute: async () => {
        const discovered = await this.discovery.discoverResourceType(resourceType);
        const matchResult = this.matcher.match(
          logicalId,
          resourceType,
          templateProperties,
          discovered
        );

        // Auto-select if best match has 90%+ confidence
        if (matchResult.bestMatch && matchResult.bestMatch.confidence >= 0.9) {
          return matchResult.bestMatch.physicalId;
        }
        return null;
      }
    },

    // Strategy 3: Human intervention (always succeeds)
    {
      name: 'Human Selection',
      confidence: 1.0,
      execute: async () => {
        const discovered = await this.discovery.discoverResourceType(resourceType);
        const matchResult = this.matcher.match(
          logicalId,
          resourceType,
          templateProperties,
          discovered
        );

        return await this.interventionManager.promptForPhysicalId(
          logicalId,
          resourceType,
          matchResult.matches.map(m => ({
            physicalId: m.physicalId,
            confidence: m.confidence,
            source: 'discovered',
            metadata: m.discoveredResource.metadata
          }))
        );
      }
    }
  ];

  // Execute strategies in order until one succeeds
  for (const strategy of strategies) {
    const result = await strategy.execute();
    if (result) {
      console.log(`✅ Resolved ${logicalId} using ${strategy.name}`);
      return result;
    }
  }

  throw new Error(`Failed to resolve physical ID for ${logicalId}`);
}
```

---

### Sprint 1 Deliverables

✅ `HumanInterventionManager` with interactive CLI prompts
✅ `AWSResourceDiscovery` supporting DynamoDB, S3, LogGroups, Lambda, IAM
✅ `ResourceMatcher` with confidence scoring algorithm
✅ `PhysicalIdResolver` with cascading fallback strategies
✅ Unit tests for all modules (90% coverage)
✅ Integration test: Resolve physical IDs in messy environment

---

## Sprint 2: Template Analysis (2-3 weeks)

### Goal
Enhance template comparison to handle differences and drift with human review.

### Tasks

#### 2.1 DifferenceAnalyzer
**Location:** `src/modules/comparator/difference-analyzer.ts`

**Purpose:** Classify template differences as auto-resolvable vs requiring review

**Interface:**
```typescript
export interface DifferenceClassification {
  difference: Difference;
  category: 'acceptable' | 'warning' | 'critical';
  autoResolvable: boolean;
  resolutionStrategy?: string;
  requiresHumanReview: boolean;
  explanation: string;
}

export class DifferenceAnalyzer {
  /**
   * Analyze all differences and classify them
   */
  analyzeDifferences(
    differences: Difference[]
  ): DifferenceClassification[];

  /**
   * Group differences by resolution requirement
   */
  groupByResolution(
    classifications: DifferenceClassification[]
  ): {
    autoResolvable: DifferenceClassification[];
    requiresReview: DifferenceClassification[];
  };

  /**
   * Generate human-readable explanation for difference
   */
  explainDifference(diff: Difference): string;
}
```

**Classification Rules:**
```typescript
// Example classification logic
classify(difference: Difference): DifferenceClassification {
  // ACCEPTABLE: CDK adds metadata
  if (difference.path.includes('Metadata') &&
      difference.serverlessValue === undefined) {
    return {
      category: 'acceptable',
      autoResolvable: true,
      requiresHumanReview: false,
      explanation: 'CDK automatically adds metadata for stack tracking'
    };
  }

  // ACCEPTABLE: CDK adds UpdateReplacePolicy
  if (difference.path.includes('UpdateReplacePolicy')) {
    return {
      category: 'acceptable',
      autoResolvable: true,
      requiresHumanReview: false,
      explanation: 'CDK adds UpdateReplacePolicy for resource protection'
    };
  }

  // WARNING: Different attribute definitions
  if (difference.path.includes('AttributeDefinitions')) {
    return {
      category: 'warning',
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'DynamoDB attribute definitions differ - verify schema compatibility'
    };
  }

  // CRITICAL: Different physical resource name
  if (difference.path.match(/(TableName|BucketName|FunctionName)/)) {
    return {
      category: 'critical',
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Physical resource name mismatch - import will fail'
    };
  }

  // ... more rules
}
```

---

#### 2.2 ConfidenceScoring
**Location:** `src/modules/orchestrator/confidence-scoring.ts`

**Purpose:** Assign confidence levels to migration decisions

**Interface:**
```typescript
export interface ConfidenceScore {
  overall: number; // 0.0 to 1.0
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  recommendation: 'auto-proceed' | 'review-recommended' | 'human-required';
}

export class ConfidenceScoring {
  /**
   * Calculate overall migration confidence
   */
  calculateMigrationConfidence(
    state: MigrationState,
    step: MigrationStep
  ): ConfidenceScore;

  /**
   * Calculate resource-level confidence
   */
  calculateResourceConfidence(
    resource: ClassifiedResource,
    matchResult?: MatchResult,
    differences?: DifferenceClassification[]
  ): ConfidenceScore;
}
```

**Scoring Logic:**
```typescript
calculateResourceConfidence(resource, matchResult, differences): ConfidenceScore {
  let score = 1.0;
  const factors = [];

  // Physical ID resolution
  if (matchResult) {
    if (matchResult.bestMatch) {
      score *= matchResult.bestMatch.confidence;
      factors.push({
        factor: 'Physical ID Match',
        impact: matchResult.bestMatch.confidence,
        description: `Matched with ${(matchResult.bestMatch.confidence * 100).toFixed(0)}% confidence`
      });
    } else {
      score *= 0.5;
      factors.push({
        factor: 'Physical ID Unknown',
        impact: 0.5,
        description: 'Could not auto-match physical resource'
      });
    }
  }

  // Template differences
  if (differences) {
    const criticalCount = differences.filter(d => d.category === 'critical').length;
    const warningCount = differences.filter(d => d.category === 'warning').length;

    if (criticalCount > 0) {
      score *= 0.3;
      factors.push({
        factor: 'Critical Differences',
        impact: 0.3,
        description: `${criticalCount} critical differences found`
      });
    }

    if (warningCount > 0) {
      score *= 0.7;
      factors.push({
        factor: 'Warning Differences',
        impact: 0.7,
        description: `${warningCount} warnings found`
      });
    }
  }

  // Resource type complexity
  const complexTypes = ['AWS::RDS::DBInstance', 'AWS::RDS::DBCluster'];
  if (complexTypes.includes(resource.Type)) {
    score *= 0.8;
    factors.push({
      factor: 'Complex Resource Type',
      impact: 0.8,
      description: 'Resource type requires careful review'
    });
  }

  // Determine recommendation
  let recommendation: 'auto-proceed' | 'review-recommended' | 'human-required';
  if (score >= 0.9) {
    recommendation = 'auto-proceed';
  } else if (score >= 0.7) {
    recommendation = 'review-recommended';
  } else {
    recommendation = 'human-required';
  }

  return { overall: score, factors, recommendation };
}
```

---

#### 2.3 ManualReviewReport
**Location:** `src/modules/reporter/manual-review-report.ts`

**Purpose:** Generate comprehensive reports for human review

**Interface:**
```typescript
export class ManualReviewReport {
  /**
   * Generate HTML report for manual review
   */
  generateHTMLReport(
    state: MigrationState,
    classifications: DifferenceClassification[],
    confidenceScores: Map<string, ConfidenceScore>
  ): string;

  /**
   * Generate terminal-friendly summary
   */
  generateTerminalSummary(
    state: MigrationState,
    classifications: DifferenceClassification[]
  ): string;

  /**
   * Export to JSON for processing
   */
  exportToJSON(state: MigrationState): string;
}
```

**Report Structure:**
```markdown
# Migration Manual Review Report

## Summary
- Total Resources: 15
- Auto-Resolvable: 10 (67%)
- Requires Review: 5 (33%)
- Overall Confidence: 78%

## Resources Requiring Review

### 1. UsersTable (DynamoDB Table) - Confidence: 65%
**Physical ID:** users-table-dev (auto-matched with 90% confidence)
**Status:** ⚠️ Review Recommended

**Issues:**
- ❌ CRITICAL: AttributeDefinitions differ
  - Serverless: [userId: S, email: S]
  - CDK: [userId: S]
  - **Action Required:** Verify GSI attribute definitions

**Template Differences:**
| Path | Serverless | CDK | Severity |
|------|------------|-----|----------|
| Properties.AttributeDefinitions | 2 attributes | 1 attribute | CRITICAL |
| Properties.BillingMode | PROVISIONED | PAY_PER_REQUEST | WARNING |

**Recommendations:**
1. Review attribute definitions in CDK code
2. Verify no GSIs are missing
3. Consider billing mode change impact

---

### 2. ApiLambdaRole (IAM Role) - Confidence: 45%
**Physical ID:** Unknown - Multiple candidates found
**Status:** 🔴 Human Required

**Candidates:**
1. api-lambda-role-dev (60% confidence)
   - Name similarity: 85%
   - Created: 2024-01-15

2. legacy-api-role (40% confidence)
   - Name similarity: 60%
   - Created: 2023-06-10

**Action Required:** Select correct IAM role

---
```

---

#### 2.4 DriftDetector
**Location:** `src/modules/discovery/drift-detector.ts`

**Purpose:** Detect manual modifications to CloudFormation resources

**Interface:**
```typescript
export interface DriftInfo {
  resourceId: string;
  drifted: boolean;
  driftStatus: 'IN_SYNC' | 'MODIFIED' | 'DELETED' | 'NOT_CHECKED';
  propertyDifferences?: Array<{
    propertyPath: string;
    expectedValue: any;
    actualValue: any;
    differenceType: 'ADD' | 'REMOVE' | 'MODIFY';
  }>;
}

export class DriftDetector {
  /**
   * Detect drift for CloudFormation stack
   */
  async detectDrift(stackName: string): Promise<Map<string, DriftInfo>>;

  /**
   * Detect drift for specific resource
   */
  async detectResourceDrift(
    stackName: string,
    logicalResourceId: string
  ): Promise<DriftInfo>;

  /**
   * Compare drift with template differences
   */
  correlateDriftWithDifferences(
    drift: DriftInfo,
    differences: Difference[]
  ): {
    driftCausedByManualChange: boolean;
    affectedDifferences: Difference[];
  };
}
```

---

### Sprint 2 Deliverables

✅ `DifferenceAnalyzer` with comprehensive classification rules
✅ `ConfidenceScoring` for migration and resource-level decisions
✅ `ManualReviewReport` with HTML and terminal output
✅ `DriftDetector` with CloudFormation drift detection
✅ Enhanced comparator to use new analysis modules
✅ Integration test: Handle drifted resources

---

## Sprint 3: Interactive Import & Checkpoints (2 weeks)

### Goal
Add interactive CDK import guidance and checkpoint system to orchestrator.

### Tasks

#### 3.1 InteractiveCDKImport
**Location:** `src/modules/importer/interactive-cdk-import.ts`

**Purpose:** Guide users through `cdk import` with live feedback

**Interface:**
```typescript
export class InteractiveCDKImport {
  /**
   * Run interactive CDK import process
   */
  async runImport(
    cdkProjectPath: string,
    importDefinitions: ImportDefinition[]
  ): Promise<ImportResult>;

  /**
   * Monitor CDK import process
   */
  private async monitorImportProcess(
    process: ChildProcess
  ): Promise<void>;

  /**
   * Handle import prompts interactively
   */
  private async handleImportPrompt(
    prompt: string
  ): Promise<string>;
}
```

**Implementation:**
```typescript
async runImport(cdkProjectPath, importDefinitions): Promise<ImportResult> {
  console.log('🚀 Starting interactive CDK import...\n');

  // Show import plan
  this.showImportPlan(importDefinitions);

  // Confirm with user
  const proceed = await this.interventionManager.prompt({
    type: 'confirm',
    severity: 'info',
    question: 'Ready to run `cdk import`?',
    context: `This will import ${importDefinitions.length} resources into your CDK stack.`
  });

  if (proceed.action !== 'proceed') {
    return { status: 'aborted' };
  }

  // Spawn cdk import process
  const cdkProcess = spawn('npx', ['cdk', 'import', '--force'], {
    cwd: cdkProjectPath,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Monitor output
  let currentResource = '';

  cdkProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(output);

    // Detect import prompts
    if (output.includes('import with')) {
      currentResource = this.extractResourceFromPrompt(output);
      // Auto-respond based on import definitions
      const response = this.getImportResponse(currentResource, importDefinitions);
      cdkProcess.stdin.write(response + '\n');
    }

    // Show progress
    if (output.includes('✅')) {
      console.log(`  ✅ Imported: ${currentResource}`);
    }
  });

  cdkProcess.stderr.on('data', (data) => {
    console.error('❌ Error:', data.toString());
  });

  return new Promise((resolve) => {
    cdkProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Import completed successfully!');
        resolve({ status: 'success', resourcesImported: importDefinitions.length });
      } else {
        console.error(`\n❌ Import failed with code ${code}`);
        resolve({ status: 'failed', errorCode: code });
      }
    });
  });
}
```

---

#### 3.2 Checkpoint System
**Location:** `src/modules/orchestrator/checkpoints.ts`

**Purpose:** Pause migration at critical decision points

**Interface:**
```typescript
export interface Checkpoint {
  id: string;
  step: MigrationStep;
  name: string;
  description: string;
  condition: (state: MigrationState) => boolean;
  handler: (state: MigrationState) => Promise<CheckpointResult>;
}

export interface CheckpointResult {
  action: 'continue' | 'pause' | 'abort';
  modifications?: Partial<MigrationState>;
}

export class CheckpointManager {
  /**
   * Register checkpoint
   */
  registerCheckpoint(checkpoint: Checkpoint): void;

  /**
   * Check if checkpoint should trigger
   */
  shouldTrigger(state: MigrationState, step: MigrationStep): Checkpoint | null;

  /**
   * Execute checkpoint
   */
  async executeCheckpoint(
    checkpoint: Checkpoint,
    state: MigrationState
  ): Promise<CheckpointResult>;
}
```

**Predefined Checkpoints:**
```typescript
// Checkpoint 1: Physical ID Resolution
const physicalIdCheckpoint: Checkpoint = {
  id: 'physical-id-resolution',
  step: MigrationStep.DISCOVERY,
  name: 'Physical ID Resolution',
  description: 'Verify physical IDs for all stateful resources',
  condition: (state) => {
    return state.resources.some(r =>
      r.isStateful && !r.physicalId
    );
  },
  handler: async (state) => {
    const unresolved = state.resources.filter(r =>
      r.isStateful && !r.physicalId
    );

    console.log(`\n⚠️  ${unresolved.length} resources need physical ID resolution\n`);

    for (const resource of unresolved) {
      const physicalId = await physicalIdResolver.resolve(
        resource.LogicalId,
        resource.Type,
        resource.Properties
      );

      resource.physicalId = physicalId;
    }

    return { action: 'continue', modifications: { resources: state.resources } };
  }
};

// Checkpoint 2: Critical Differences Review
const criticalDifferencesCheckpoint: Checkpoint = {
  id: 'critical-differences',
  step: MigrationStep.COMPARISON,
  name: 'Critical Differences Review',
  description: 'Review critical template differences',
  condition: (state) => {
    const classifications = state.comparisonResult?.classifications || [];
    return classifications.some(c => c.category === 'critical');
  },
  handler: async (state) => {
    const critical = state.comparisonResult.classifications.filter(
      c => c.category === 'critical'
    );

    console.log(`\n🔴 Found ${critical.length} critical differences\n`);

    // Generate review report
    const report = manualReviewReport.generateTerminalSummary(
      state,
      state.comparisonResult.classifications
    );

    console.log(report);

    const response = await interventionManager.prompt({
      type: 'choice',
      severity: 'critical',
      question: 'How would you like to proceed?',
      options: [
        { value: 'continue', label: 'Continue anyway', description: 'Proceed with migration despite differences' },
        { value: 'pause', label: 'Pause for manual review', description: 'Stop here and review differences' },
        { value: 'abort', label: 'Abort migration', description: 'Cancel the migration' }
      ]
    });

    return { action: response.action as any };
  }
};

// Checkpoint 3: Drift Detection
const driftCheckpoint: Checkpoint = {
  id: 'drift-detection',
  step: MigrationStep.TEMPLATE_MODIFICATION,
  name: 'Drift Detection',
  description: 'Check for manual CloudFormation modifications',
  condition: (state) => state.config.detectDrift !== false,
  handler: async (state) => {
    console.log('\n🔍 Detecting CloudFormation drift...\n');

    const driftMap = await driftDetector.detectDrift(state.config.stackName);
    const drifted = Array.from(driftMap.values()).filter(d => d.drifted);

    if (drifted.length === 0) {
      console.log('✅ No drift detected\n');
      return { action: 'continue' };
    }

    console.log(`⚠️  Drift detected in ${drifted.length} resources:\n`);

    for (const drift of drifted) {
      console.log(`  - ${drift.resourceId}: ${drift.driftStatus}`);

      const resolution = await interventionManager.resolveDrift(
        drift.resourceId,
        drift
      );

      if (resolution === 'abort') {
        return { action: 'abort' };
      }
    }

    return { action: 'continue' };
  }
};
```

---

#### 3.3 Enhanced Orchestrator
**Location:** `src/modules/orchestrator/index.ts` (modifications)

**Changes:**
```typescript
// Add checkpoint processing to executeMigration
private async executeMigration(
  state: MigrationState,
  options: OrchestratorOptions
): Promise<MigrationState> {
  const allSteps = MigrationStateMachine.getAllSteps();

  for (const step of allSteps) {
    // Check for checkpoints BEFORE executing step
    const checkpoint = this.checkpointManager.shouldTrigger(state, step);

    if (checkpoint) {
      console.log(`\n🛑 Checkpoint: ${checkpoint.name}\n`);
      console.log(`   ${checkpoint.description}\n`);

      const result = await this.checkpointManager.executeCheckpoint(
        checkpoint,
        state
      );

      if (result.action === 'pause') {
        console.log('\n⏸️  Migration paused at checkpoint');
        state.status = MigrationStatus.PAUSED;
        await this.stateManager.saveState(state);
        return state;
      }

      if (result.action === 'abort') {
        console.log('\n🛑 Migration aborted by user');
        state.status = MigrationStatus.FAILED;
        await this.stateManager.saveState(state);
        return state;
      }

      // Apply modifications from checkpoint
      if (result.modifications) {
        state = { ...state, ...result.modifications };
      }
    }

    // Execute step as normal
    const stepResult = await this.executeStep(state, step, options);
    // ... rest of existing logic
  }

  return state;
}
```

---

### Sprint 3 Deliverables

✅ `InteractiveCDKImport` with live process monitoring
✅ `CheckpointManager` with predefined checkpoints
✅ Enhanced `MigrationOrchestrator` with checkpoint integration
✅ Pause/resume capability for paused migrations
✅ Integration test: Complete messy environment migration
✅ Documentation for all new features

---

## Testing Strategy

### Unit Tests
```typescript
// Test physical ID resolution
describe('PhysicalIdResolver', () => {
  it('should use explicit physical ID from template', async () => {
    const resolver = new PhysicalIdResolver(discovery, matcher, intervention);
    const result = await resolver.resolve('MyTable', 'AWS::DynamoDB::Table', {
      TableName: 'users-table-dev'
    });
    expect(result).toBe('users-table-dev');
  });

  it('should auto-match with high confidence', async () => {
    mockDiscovery.returns([
      { physicalId: 'users-table-dev', /* ... */ }
    ]);
    mockMatcher.returns({
      bestMatch: { physicalId: 'users-table-dev', confidence: 0.95 }
    });

    const result = await resolver.resolve('UsersTable', 'AWS::DynamoDB::Table', {});
    expect(result).toBe('users-table-dev');
    expect(interventionManager.prompt).not.toHaveBeenCalled();
  });

  it('should prompt human when confidence is low', async () => {
    mockMatcher.returns({
      bestMatch: { physicalId: 'users-table-dev', confidence: 0.6 }
    });
    mockIntervention.returns({ value: 'users-table-prod' });

    const result = await resolver.resolve('UsersTable', 'AWS::DynamoDB::Table', {});
    expect(interventionManager.promptForPhysicalId).toHaveBeenCalled();
    expect(result).toBe('users-table-prod');
  });
});
```

### Integration Tests
```typescript
// Test complete messy environment migration
describe('Messy Environment Migration', () => {
  it('should handle drift and mismatched IDs', async () => {
    const config = {
      sourcePath: './fixtures/messy-serverless-app',
      stackName: 'messy-stack-dev',
      detectDrift: true,
      interactive: false // Use mock interventions
    };

    // Mock interventions
    mockAllInterventions({
      'UsersTable.physicalId': 'users-table-actual',
      'ApiRole.physicalId': 'api-role-legacy',
      'critical-differences': 'continue',
      'drift-ApiRole': 'use-aws'
    });

    const orchestrator = new MigrationOrchestrator();
    const state = await orchestrator.startMigration(config);

    expect(state.status).toBe(MigrationStatus.COMPLETED);
    expect(state.interventions).toHaveLength(4);
    expect(state.resources.every(r => r.physicalId)).toBe(true);
  });
});
```

---

## Documentation

### User Guide Updates
**Location:** `docs/USER_GUIDE.md`

Add new sections:
- "Working with Messy Environments"
- "Understanding Confidence Scores"
- "Manual Review Process"
- "Resolving Physical ID Conflicts"
- "Handling CloudFormation Drift"

### API Documentation
**Location:** `docs/api/`

Document all new interfaces:
- `HumanInterventionManager`
- `AWSResourceDiscovery`
- `ResourceMatcher`
- `PhysicalIdResolver`
- `DifferenceAnalyzer`
- `ConfidenceScoring`
- `CheckpointManager`

---

## Success Metrics

- ✅ Successfully migrate projects with 100% CloudFormation drift
- ✅ Handle physical ID mismatches with 95%+ accuracy
- ✅ Reduce false-positive critical differences by 80%
- ✅ Complete messy environment migrations with <5 human interventions
- ✅ 90%+ user satisfaction with intervention prompts (survey)

---

## Rollout Plan

### Phase 1: Alpha (Sprint 1 complete)
- Internal testing only
- Collect feedback on intervention UX
- Refine confidence scoring algorithms

### Phase 2: Beta (Sprint 2 complete)
- Release to early adopters
- Gather data on intervention patterns
- Improve matching algorithms

### Phase 3: GA (Sprint 3 complete)
- Full production release
- Comprehensive documentation
- Training materials

---

## Future Enhancements (Post-Sprint 3)

### Machine Learning Integration
- Train ML model on intervention history
- Predict likely physical IDs based on patterns
- Auto-improve confidence scoring

### Multi-Account Support
- Scan resources across multiple AWS accounts
- Handle cross-account references
- Organization-level discovery

### Advanced Drift Resolution
- Automatic drift correction
- Drift prediction before migration
- Smart drift merging strategies

---

## Appendix: Example Scenarios

### Scenario 1: Physical ID Mismatch
```
User has DynamoDB table named "users-table-prod" but template says "users-table-dev"

Tool Behavior:
1. Discovery finds both tables
2. Matcher gives 50% confidence to each
3. HumanInterventionManager prompts user
4. User selects "users-table-prod"
5. Migration continues with correct physical ID
```

### Scenario 2: Critical Template Difference
```
Serverless template has 3 DynamoDB GSIs, CDK template has 2

Tool Behavior:
1. Comparison finds critical difference
2. DifferenceAnalyzer flags as "human-required"
3. Checkpoint triggers before IMPORT_PREPARATION
4. ManualReviewReport shows detailed comparison
5. User chooses to fix CDK code
6. Migration pauses for manual fix
7. User resumes after adding GSI
```

### Scenario 3: CloudFormation Drift
```
IAM role has been manually modified with additional policies

Tool Behavior:
1. DriftDetector finds MODIFIED status
2. Checkpoint triggers with drift details
3. Shows: template vs. actual AWS state
4. User chooses "use-aws" to preserve manual changes
5. Tool updates CDK code to match AWS state
6. Migration continues
```

---

**End of Plan**

Total Estimated Effort: **6-8 weeks**
Risk Level: **Medium** (new AWS SDK integrations, UX design)
Success Probability: **High** (builds on solid foundation)
