# System Requirements Specification: Messy Environment Support

**Project:** sls-to-cdk Migration Tool
**Feature:** Real-World Migration with Human Intervention
**Version:** 1.0.0
**Date:** 2025-10-23
**Status:** Draft for Implementation

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Interface Contracts](#5-interface-contracts)
6. [Data Flow Specifications](#6-data-flow-specifications)
7. [Edge Cases & Error Handling](#7-edge-cases--error-handling)
8. [User Stories](#8-user-stories)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Dependencies](#10-dependencies)
11. [Success Metrics](#11-success-metrics)
12. [Testing Requirements](#12-testing-requirements)

---

## 1. Introduction

### 1.1 Purpose

This specification defines the requirements for adding robust support for "messy" real-world migration scenarios in the sls-to-cdk migration tool. The system will handle:

- Physical resource names that don't match logical IDs
- Resources modified manually outside CloudFormation
- CloudFormation stack drift
- Multiple stacks sharing resources
- Template corruption or inconsistencies

### 1.2 Scope

**In Scope:**
- Interactive CLI prompts for critical decision points
- AWS resource discovery and matching
- Physical ID resolution with fallback strategies
- Template difference analysis and classification
- CloudFormation drift detection
- Human intervention audit trail
- Checkpoint-based migration flow
- Interactive CDK import guidance

**Out of Scope:**
- Automatic drift correction (post-v1.0)
- Machine learning-based matching (post-v1.0)
- Multi-account resource discovery (post-v1.0)
- Graphical user interface

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Physical ID** | The actual AWS resource identifier (e.g., "users-table-prod") |
| **Logical ID** | The CloudFormation template identifier (e.g., "UsersTable") |
| **Drift** | Manual modifications to resources outside CloudFormation |
| **Confidence Score** | 0.0-1.0 metric indicating certainty of a match or decision |
| **Checkpoint** | A pause point in migration requiring human review |
| **Stateful Resource** | Resources that persist data (DynamoDB, S3, RDS, etc.) |
| **Intervention** | User decision or input during migration |
| **Match Candidate** | A discovered AWS resource that might match a template resource |

### 1.4 References

- AWS CloudFormation API Documentation
- AWS SDK v3 for JavaScript
- CDK Import Process Documentation
- [MESSY_ENVIRONMENT_SUPPORT_PLAN.md](./MESSY_ENVIRONMENT_SUPPORT_PLAN.md)

---

## 2. System Overview

### 2.1 Architecture Components

```
┌─────────────────────────────────────────────────────────┐
│         Migration Orchestrator (Enhanced)               │
├─────────────────────────────────────────────────────────┤
│  • Checkpoint Management                                │
│  • State Machine Integration                            │
│  • Audit Trail Recording                                │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────────────┐   ┌▼──────────────────┐
│ Discovery      │   │ Analysis          │
│ Layer          │   │ Layer             │
├────────────────┤   ├───────────────────┤
│ • Resource     │   │ • Difference      │
│   Discovery    │   │   Analyzer        │
│ • Resource     │   │ • Drift Detector  │
│   Matcher      │   │ • Confidence      │
│ • Physical ID  │   │   Scoring         │
│   Resolver     │   │ • Manual Review   │
└────────────────┘   └───────────────────┘
                              │
                     ┌────────▼────────────┐
                     │ Interaction Layer   │
                     ├─────────────────────┤
                     │ • Human Intervention│
                     │ • Interactive Import│
                     │ • CLI Display       │
                     └─────────────────────┘
```

### 2.2 Data Flow Overview

```
1. User initiates migration
   ↓
2. [CHECKPOINT] Physical ID Resolution
   ├→ Discovery scans AWS account
   ├→ Matcher finds candidates
   ├→ Resolver selects best match OR
   └→ Intervention prompts user
   ↓
3. [CHECKPOINT] Template Analysis
   ├→ Comparator finds differences
   ├→ Analyzer classifies differences
   ├→ Confidence scorer evaluates risk
   └→ If critical: prompt user
   ↓
4. [CHECKPOINT] Drift Detection
   ├→ CloudFormation drift detection
   ├→ Correlate with differences
   └→ Resolve conflicts with user
   ↓
5. [CHECKPOINT] CDK Import Execution
   ├→ Generate import definitions
   ├→ Monitor CDK import process
   └→ Handle prompts interactively
   ↓
6. Migration Complete
   └→ Generate audit report
```

---

## 3. Functional Requirements

### 3.1 Sprint 1: Foundation Layer

#### FR-1.1: Human Intervention System

**ID:** FR-1.1
**Priority:** CRITICAL
**Sprint:** 1

**Requirement:** The system SHALL provide an interactive CLI interface for user decisions during migration.

**Sub-Requirements:**

- **FR-1.1.1:** Support multiple prompt types:
  - Choice selection (single select from options)
  - Confirmation (yes/no)
  - Text input (manual entry)

- **FR-1.1.2:** Display rich context for each prompt:
  - Severity level (info, warning, critical)
  - Detailed question
  - Background context
  - Recommended option (if applicable)
  - Confidence scores for options

- **FR-1.1.3:** Provide visual enhancements:
  - Color-coded severity (chalk)
  - Interactive navigation (inquirer)
  - Loading indicators (ora)
  - Progress bars for multi-step processes

- **FR-1.1.4:** Record all interventions:
  - Timestamp
  - User selection
  - Context snapshot
  - Reasoning provided

- **FR-1.1.5:** Support dry-run mode:
  - Simulate interventions with defaults
  - No actual AWS operations
  - Generate "what-if" reports

**Acceptance Criteria:**
- ✅ All prompt types render correctly in terminal
- ✅ Interventions are logged to JSON file
- ✅ Dry-run mode produces complete reports without prompts
- ✅ Users can abort at any prompt
- ✅ Skip functionality works for optional decisions

---

#### FR-1.2: AWS Resource Discovery

**ID:** FR-1.2
**Priority:** CRITICAL
**Sprint:** 1

**Requirement:** The system SHALL discover existing AWS resources for matching with template definitions.

**Supported Resource Types:**

| Resource Type | AWS API | Required Permissions |
|--------------|---------|---------------------|
| DynamoDB Table | DynamoDB.ListTables | dynamodb:ListTables, dynamodb:DescribeTable |
| S3 Bucket | S3.ListBuckets | s3:ListAllMyBuckets, s3:GetBucketLocation |
| CloudWatch Log Group | Logs.DescribeLogGroups | logs:DescribeLogGroups |
| Lambda Function | Lambda.ListFunctions | lambda:ListFunctions, lambda:GetFunction |
| IAM Role | IAM.ListRoles | iam:ListRoles, iam:GetRole |

**Sub-Requirements:**

- **FR-1.2.1:** Discover all resources of specified type in region
  - Handle pagination for large result sets
  - Support filtering by prefix/pattern
  - Cache results for duration of migration

- **FR-1.2.2:** Retrieve detailed metadata for each resource:
  - ARN
  - Creation date
  - Tags
  - Configuration properties
  - Current state/status

- **FR-1.2.3:** Handle API rate limiting:
  - Exponential backoff on throttling
  - Batch requests where possible
  - Show progress to user

- **FR-1.2.4:** Support cross-region discovery:
  - User can specify multiple regions
  - Aggregate results across regions
  - Filter by region in match phase

**Acceptance Criteria:**
- ✅ Discovery completes for accounts with 100+ resources
- ✅ No data loss during pagination
- ✅ API throttling handled gracefully
- ✅ Discovery time < 30 seconds for typical account
- ✅ All metadata fields populated correctly

---

#### FR-1.3: Resource Matching Algorithm

**ID:** FR-1.3
**Priority:** CRITICAL
**Sprint:** 1

**Requirement:** The system SHALL match CloudFormation logical IDs to physical AWS resources using multi-factor confidence scoring.

**Matching Factors:**

| Factor | Weight | Scoring Method |
|--------|--------|----------------|
| Exact name match | 90% | Binary: exact or not |
| Name similarity | 0-50% | Levenshtein distance |
| Tag match | +20% | All specified tags present |
| Configuration match | +30% | Key properties identical |
| Creation timeframe | +10% | Created within expected window |

**Sub-Requirements:**

- **FR-1.3.1:** Calculate confidence score for each candidate:
  - Aggregate weighted factors
  - Cap at 100%
  - Provide reason breakdown

- **FR-1.3.2:** Rank candidates by confidence:
  - Sort descending by score
  - Mark highest as "recommended"
  - Filter out scores < 30%

- **FR-1.3.3:** Auto-select on high confidence:
  - Threshold: 90%+
  - Only for stateless resources
  - User notification in logs

- **FR-1.3.4:** Support manual override:
  - User can select any candidate
  - User can enter physical ID manually
  - User can skip resource

**Acceptance Criteria:**
- ✅ 95%+ accuracy on exact name matches
- ✅ 85%+ accuracy on similar name matches
- ✅ False positive rate < 5%
- ✅ Manual entries persist correctly
- ✅ Skip functionality doesn't break migration

---

#### FR-1.4: Physical ID Resolution

**ID:** FR-1.4
**Priority:** CRITICAL
**Sprint:** 1

**Requirement:** The system SHALL resolve physical IDs using cascading fallback strategies.

**Resolution Strategies (in order):**

1. **Explicit Physical ID** (100% confidence)
   - Use physical name property from template
   - Examples: TableName, BucketName, FunctionName

2. **Auto-Discovery** (70%+ confidence)
   - Discover resources via AWS API
   - Match using confidence algorithm
   - Auto-select if 90%+ confidence

3. **Human Selection** (100% confidence)
   - Present candidates to user
   - Allow manual entry
   - Validate existence via AWS API

**Sub-Requirements:**

- **FR-1.4.1:** Try strategies in sequence until success
- **FR-1.4.2:** Log which strategy succeeded
- **FR-1.4.3:** Cache resolutions for migration session
- **FR-1.4.4:** Validate resolved IDs exist in AWS
- **FR-1.4.5:** Support bulk resolution for multiple resources

**Acceptance Criteria:**
- ✅ 100% of stateful resources get valid physical IDs
- ✅ No duplicate IDs assigned to different logical IDs
- ✅ Validation catches deleted resources
- ✅ Resolution completes in < 5 minutes for 50 resources
- ✅ User can review all resolutions before proceeding

---

### 3.2 Sprint 2: Template Analysis Layer

#### FR-2.1: Difference Classification

**ID:** FR-2.1
**Priority:** HIGH
**Sprint:** 2

**Requirement:** The system SHALL classify template differences into actionable categories.

**Categories:**

| Category | Auto-Resolvable | Requires Review | Migration Impact |
|----------|----------------|-----------------|------------------|
| ACCEPTABLE | Yes | No | None - safe to ignore |
| WARNING | No | Yes | Low - review recommended |
| CRITICAL | No | Yes | High - blocks migration |

**Classification Rules:**

**ACCEPTABLE Differences:**
- CDK adds Metadata section
- CDK adds UpdateReplacePolicy
- CDK adds Description
- CDK adds DeletionPolicy: Retain for stateful
- CDK normalizes property formatting

**WARNING Differences:**
- Different AttributeDefinitions (DynamoDB)
- Different BillingMode
- Different retention policies
- Environment variable changes
- Timeout/memory changes

**CRITICAL Differences:**
- Physical resource name mismatch
- Different key schema (DynamoDB)
- Different storage class (S3)
- Missing required properties
- Type change (would cause replacement)

**Sub-Requirements:**

- **FR-2.1.1:** Analyze each difference independently
- **FR-2.1.2:** Provide human-readable explanation
- **FR-2.1.3:** Suggest resolution strategy
- **FR-2.1.4:** Group by severity for reporting

**Acceptance Criteria:**
- ✅ 100% of differences get classification
- ✅ < 1% false critical classifications
- ✅ Explanations are clear to non-AWS-experts
- ✅ Resolution suggestions are actionable

---

#### FR-2.2: Confidence Scoring

**ID:** FR-2.2
**Priority:** HIGH
**Sprint:** 2

**Requirement:** The system SHALL calculate confidence scores for migration decisions.

**Scoring Levels:**

| Score Range | Recommendation | Action |
|-------------|---------------|--------|
| 90-100% | Auto-proceed | Continue without prompt |
| 70-89% | Review recommended | Show summary, allow proceed |
| 0-69% | Human required | Block until reviewed |

**Factors:**

```typescript
overall_confidence =
  physical_id_confidence *
  (1 - critical_differences_penalty) *
  (1 - warning_differences_penalty) *
  resource_complexity_factor
```

**Sub-Requirements:**

- **FR-2.2.1:** Calculate per-resource confidence
- **FR-2.2.2:** Calculate overall migration confidence
- **FR-2.2.3:** Track confidence over time
- **FR-2.2.4:** Explain confidence calculation

**Acceptance Criteria:**
- ✅ Scores correlate with migration success rate
- ✅ Users understand score meaning
- ✅ Thresholds are configurable
- ✅ Explanation shows all factors

---

#### FR-2.3: Manual Review Reports

**ID:** FR-2.3
**Priority:** HIGH
**Sprint:** 2

**Requirement:** The system SHALL generate comprehensive reports for human review.

**Report Formats:**

1. **Terminal Summary** (for interactive use)
   - Color-coded by severity
   - Table format for differences
   - Actionable recommendations

2. **HTML Report** (for detailed review)
   - Filterable by severity
   - Side-by-side template diff
   - Embedded confidence scores
   - Export to PDF support

3. **JSON Export** (for automation)
   - Machine-readable format
   - All metadata included
   - Suitable for CI/CD

**Report Sections:**

```markdown
1. Executive Summary
   - Total resources
   - Auto-resolvable count
   - Requires review count
   - Overall confidence
   - Estimated migration time

2. Resources Requiring Review
   - Physical ID status
   - Confidence score
   - Issue list with severity
   - Recommendations
   - Template diff

3. Auto-Resolvable Resources
   - Summary only
   - Details in JSON

4. Audit Trail
   - All interventions
   - Timestamps
   - User decisions
```

**Acceptance Criteria:**
- ✅ Reports generate in < 5 seconds
- ✅ HTML renders correctly in all modern browsers
- ✅ JSON is valid and parseable
- ✅ Terminal output fits 80-column width
- ✅ All data is present and accurate

---

#### FR-2.4: CloudFormation Drift Detection

**ID:** FR-2.4
**Priority:** HIGH
**Sprint:** 2

**Requirement:** The system SHALL detect manual modifications to CloudFormation-managed resources.

**Drift Detection Process:**

1. Initiate drift detection via CloudFormation API
2. Wait for detection to complete (up to 5 minutes)
3. Retrieve drift details for each resource
4. Correlate drift with template differences
5. Present drift to user with resolution options

**Drift Statuses:**

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| IN_SYNC | No drift | None |
| MODIFIED | Properties changed | User decides: use AWS or template |
| DELETED | Resource deleted | Block migration |
| NOT_CHECKED | Unable to check | Warning only |

**Sub-Requirements:**

- **FR-2.4.1:** Support full stack drift detection
- **FR-2.4.2:** Support per-resource drift detection
- **FR-2.4.3:** Handle drift detection timeout (5 min max)
- **FR-2.4.4:** Show property-level differences
- **FR-2.4.5:** Allow user to choose drift resolution

**Resolution Options:**

- **Use AWS State:** Update CDK template to match current AWS state
- **Use Template State:** Revert AWS resource to template definition (warns about data loss)
- **Manual Resolution:** User fixes externally, migration pauses

**Acceptance Criteria:**
- ✅ Drift detection completes for stacks with 50+ resources
- ✅ Property differences are accurate
- ✅ Timeout handled gracefully
- ✅ User resolution is applied correctly
- ✅ No data loss from incorrect resolution

---

### 3.3 Sprint 3: Interactive Execution Layer

#### FR-3.1: Interactive CDK Import

**ID:** FR-3.1
**Priority:** HIGH
**Sprint:** 3

**Requirement:** The system SHALL guide users through the CDK import process with live feedback.

**Import Process:**

```bash
1. Show import plan
   - List all resources to import
   - Show physical IDs
   - Display estimated time

2. Confirm with user
   - Review and approve plan
   - Option to modify before import

3. Execute `cdk import`
   - Spawn CDK process
   - Monitor stdout/stderr
   - Detect and respond to prompts

4. Handle import prompts
   - Auto-respond with physical IDs
   - Show progress for each resource
   - Capture errors

5. Completion
   - Success summary
   - Error report (if any)
   - Next steps
```

**Sub-Requirements:**

- **FR-3.1.1:** Parse CDK import output in real-time
- **FR-3.1.2:** Auto-respond to physical ID prompts
- **FR-3.1.3:** Show progress indicator
- **FR-3.1.4:** Capture and explain errors
- **FR-3.1.5:** Support retry on failure

**Acceptance Criteria:**
- ✅ Import completes successfully for 20+ resources
- ✅ All prompts are answered automatically
- ✅ Progress is visible to user
- ✅ Errors are captured and explained
- ✅ User can abort at any time

---

#### FR-3.2: Checkpoint System

**ID:** FR-3.2
**Priority:** CRITICAL
**Sprint:** 3

**Requirement:** The system SHALL pause migration at critical decision points.

**Predefined Checkpoints:**

| Checkpoint | Trigger Condition | User Options |
|------------|------------------|--------------|
| Physical ID Resolution | Stateful resource without physical ID | Select, Skip, Abort |
| Critical Differences | Any critical difference found | Continue, Pause, Abort |
| Drift Detection | Stack drift enabled and drift found | Use AWS, Use Template, Manual |
| CDK Import Execution | Before running `cdk import` | Proceed, Review Plan, Abort |

**Checkpoint Behavior:**

```typescript
if (checkpoint.condition(state)) {
  result = await checkpoint.handler(state)

  if (result.action === 'pause') {
    saveState(state)
    exit(0)
  } else if (result.action === 'abort') {
    cleanup()
    exit(1)
  } else {
    applyModifications(result.modifications)
    continue()
  }
}
```

**Sub-Requirements:**

- **FR-3.2.1:** Register checkpoints dynamically
- **FR-3.2.2:** Evaluate conditions before each step
- **FR-3.2.3:** Execute handler on trigger
- **FR-3.2.4:** Persist state on pause
- **FR-3.2.5:** Resume from paused checkpoint

**Acceptance Criteria:**
- ✅ All checkpoints trigger correctly
- ✅ State persists across sessions
- ✅ Resume works from any checkpoint
- ✅ Abort cleans up correctly
- ✅ Modifications apply successfully

---

#### FR-3.3: Pause and Resume

**ID:** FR-3.3
**Priority:** HIGH
**Sprint:** 3

**Requirement:** The system SHALL support pausing and resuming migrations.

**Pause Behavior:**

1. User selects "Pause" at checkpoint
2. System saves complete state to disk
3. System displays resume command
4. System exits gracefully

**Resume Behavior:**

1. User runs `sls-to-cdk resume <migration-id>`
2. System loads saved state
3. System shows summary of progress
4. System continues from last checkpoint

**Saved State Includes:**

- Migration ID and timestamp
- Current step and checkpoint
- All resource resolutions
- All user interventions
- Template paths and hashes
- Configuration options

**Sub-Requirements:**

- **FR-3.3.1:** Generate unique migration IDs
- **FR-3.3.2:** Persist state atomically (no partial writes)
- **FR-3.3.3:** Validate state on resume
- **FR-3.3.4:** Handle state schema changes
- **FR-3.3.5:** Support multiple paused migrations

**Acceptance Criteria:**
- ✅ State saves in < 1 second
- ✅ Resume restores exact state
- ✅ No data loss on crash during save
- ✅ Old state files are cleaned up
- ✅ User can list all paused migrations

---

## 4. Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1: Resource Discovery**
- MUST complete in < 30 seconds for accounts with 100 resources
- MUST handle pagination for 1000+ resources
- MUST not exceed AWS API rate limits

**NFR-1.2: Template Comparison**
- MUST complete in < 5 seconds for templates with 50 resources
- MUST generate reports in < 5 seconds
- MUST handle templates up to 10MB

**NFR-1.3: User Interaction**
- MUST render prompts in < 100ms
- MUST respond to user input in < 50ms
- MUST not block on background operations

---

### NFR-2: Reliability

**NFR-2.1: Error Handling**
- MUST handle AWS API errors gracefully
- MUST retry transient failures (3 attempts)
- MUST not lose state on crash

**NFR-2.2: Data Integrity**
- MUST validate all user inputs
- MUST verify physical IDs exist in AWS
- MUST prevent duplicate physical ID assignments

**NFR-2.3: Recovery**
- MUST support resume after any failure
- MUST log all errors with context
- MUST preserve partial progress

---

### NFR-3: Usability

**NFR-3.1: User Experience**
- MUST provide clear error messages
- MUST show progress for long operations
- MUST support aborting at any time

**NFR-3.2: Documentation**
- MUST document all prompts and options
- MUST provide examples for common scenarios
- MUST explain confidence scores

**NFR-3.3: Accessibility**
- MUST work in 80-column terminals
- MUST support screen readers (where possible)
- MUST not rely solely on color for information

---

### NFR-4: Security

**NFR-4.1: AWS Credentials**
- MUST use AWS SDK credential chain
- MUST NOT log credentials
- MUST require only necessary IAM permissions

**NFR-4.2: Sensitive Data**
- MUST NOT log sensitive resource properties
- MUST sanitize audit trail
- MUST warn before outputting sensitive data

---

### NFR-5: Maintainability

**NFR-5.1: Code Quality**
- MUST have 90%+ test coverage
- MUST follow TypeScript best practices
- MUST include JSDoc for all public APIs

**NFR-5.2: Modularity**
- MUST keep files under 500 lines
- MUST separate concerns clearly
- MUST use dependency injection

---

## 5. Interface Contracts

### 5.1 HumanInterventionManager

```typescript
/**
 * Central system for prompting users during migration
 * Location: src/modules/orchestrator/human-intervention.ts
 */

export interface InterventionPrompt {
  /** Unique identifier for this prompt */
  id: string;

  /** Type of prompt */
  type: 'choice' | 'confirm' | 'input';

  /** Severity level affecting display */
  severity: 'info' | 'warning' | 'critical';

  /** Main question to ask user */
  question: string;

  /** Optional context/explanation */
  context?: string;

  /** Available options (for choice type) */
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;

  /** Default value if user skips */
  defaultValue?: string;

  /** Whether this prompt can be skipped */
  allowSkip?: boolean;
}

export interface InterventionResponse {
  /** ID of the prompt that was answered */
  promptId: string;

  /** User action taken */
  action: 'proceed' | 'skip' | 'abort' | 'manual' | string;

  /** Value provided by user (if applicable) */
  value?: string;

  /** When intervention occurred */
  timestamp: Date;

  /** Optional reasoning from user */
  reasoning?: string;
}

export interface PhysicalResourceCandidate {
  /** Physical resource ID */
  physicalId: string;

  /** Confidence score 0.0-1.0 */
  confidence: number;

  /** How this candidate was found */
  source: 'discovered' | 'template' | 'manual';

  /** Additional resource metadata */
  metadata?: {
    arn?: string;
    region?: string;
    tags?: Record<string, string>;
    createdAt?: Date;
  };

  /** Reasons for confidence score */
  matchReasons?: string[];
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

  /**
   * Enable/disable dry-run mode
   */
  setDryRun(enabled: boolean): void;
}
```

---

### 5.2 AWSResourceDiscovery

```typescript
/**
 * Scan AWS account to find actual resources
 * Location: src/modules/discovery/aws-resource-discovery.ts
 */

export interface DiscoveredResource {
  /** Physical resource identifier */
  physicalId: string;

  /** CloudFormation resource type */
  resourceType: string;

  /** AWS region */
  region: string;

  /** Full ARN */
  arn: string;

  /** Resource tags */
  tags: Record<string, string>;

  /** Creation timestamp */
  createdAt?: Date;

  /** Resource-specific metadata */
  metadata: Record<string, any>;
}

export interface DiscoveryOptions {
  /** AWS region to scan */
  region?: string;

  /** Resource name prefix filter */
  prefix?: string;

  /** Maximum results to return */
  maxResults?: number;

  /** Whether to include detailed metadata */
  includeMetadata?: boolean;
}

export class AWSResourceDiscovery {
  /**
   * Discover all resources of a specific type
   */
  async discoverResourceType(
    resourceType: string,
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover DynamoDB tables
   */
  async discoverDynamoDBTables(
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover S3 buckets
   */
  async discoverS3Buckets(
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover CloudWatch LogGroups
   */
  async discoverLogGroups(
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover Lambda functions
   */
  async discoverLambdaFunctions(
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Discover IAM roles
   */
  async discoverIAMRoles(
    options?: DiscoveryOptions
  ): Promise<DiscoveredResource[]>;

  /**
   * Batch discover all resource types
   */
  async discoverAll(
    resourceTypes: string[],
    options?: DiscoveryOptions
  ): Promise<Map<string, DiscoveredResource[]>>;
}
```

---

### 5.3 ResourceMatcher

```typescript
/**
 * Match CloudFormation logical IDs to physical AWS resources
 * Location: src/modules/discovery/resource-matcher.ts
 */

export interface MatchCandidate {
  /** Physical resource ID */
  physicalId: string;

  /** Confidence score 0.0-1.0 */
  confidence: number;

  /** Reasons for this confidence score */
  matchReasons: string[];

  /** Full discovered resource */
  discoveredResource: DiscoveredResource;
}

export interface MatchResult {
  /** Logical ID from template */
  logicalId: string;

  /** Resource type */
  resourceType: string;

  /** All match candidates */
  matches: MatchCandidate[];

  /** Best match (highest confidence) */
  bestMatch?: MatchCandidate;

  /** Whether human review is needed */
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
   * Calculate confidence score for a single match
   * @private
   */
  private calculateConfidence(
    templateProps: Record<string, any>,
    discovered: DiscoveredResource
  ): { score: number; reasons: string[] };

  /**
   * Calculate string similarity (0.0-1.0)
   * @private
   */
  private calculateSimilarity(str1: string, str2: string): number;

  /**
   * Check if tags match
   * @private
   */
  private tagsMatch(
    templateTags: Record<string, string>,
    resourceTags: Record<string, string>
  ): boolean;
}
```

---

### 5.4 PhysicalIdResolver

```typescript
/**
 * Resolve physical IDs with fallback to human intervention
 * Location: src/modules/discovery/physical-id-resolver.ts
 */

export interface ResolutionStrategy {
  /** Strategy name */
  name: string;

  /** Confidence in this strategy */
  confidence: number;

  /** Execute the strategy */
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
   * @private
   */
  private getStrategies(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>
  ): ResolutionStrategy[];

  /**
   * Get property name that contains physical ID
   * @private
   */
  private getPhysicalIdProperty(resourceType: string): string | null;
}
```

---

### 5.5 DifferenceAnalyzer

```typescript
/**
 * Classify template differences as auto-resolvable vs requiring review
 * Location: src/modules/comparator/difference-analyzer.ts
 */

export interface Difference {
  /** JSONPath to the difference */
  path: string;

  /** Value in Serverless template */
  serverlessValue: any;

  /** Value in CDK template */
  cdkValue: any;

  /** Type of difference */
  type: 'added' | 'removed' | 'modified';
}

export interface DifferenceClassification {
  /** The original difference */
  difference: Difference;

  /** Classification category */
  category: 'acceptable' | 'warning' | 'critical';

  /** Can be auto-resolved without user input */
  autoResolvable: boolean;

  /** Suggested resolution strategy */
  resolutionStrategy?: string;

  /** Whether human review is required */
  requiresHumanReview: boolean;

  /** Human-readable explanation */
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

  /**
   * Classify a single difference
   * @private
   */
  private classifyDifference(diff: Difference): DifferenceClassification;
}
```

---

### 5.6 ConfidenceScoring

```typescript
/**
 * Assign confidence levels to migration decisions
 * Location: src/modules/orchestrator/confidence-scoring.ts
 */

export interface ConfidenceScore {
  /** Overall confidence 0.0-1.0 */
  overall: number;

  /** Individual factors contributing to score */
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;

  /** Recommendation based on score */
  recommendation: 'auto-proceed' | 'review-recommended' | 'human-required';
}

export interface MigrationState {
  /** Unique migration identifier */
  migrationId: string;

  /** Current migration step */
  currentStep: string;

  /** All resources being migrated */
  resources: ClassifiedResource[];

  /** Comparison results */
  comparisonResult?: any;

  /** Configuration */
  config: any;
}

export class ConfidenceScoring {
  /**
   * Calculate overall migration confidence
   */
  calculateMigrationConfidence(
    state: MigrationState,
    step: string
  ): ConfidenceScore;

  /**
   * Calculate resource-level confidence
   */
  calculateResourceConfidence(
    resource: any,
    matchResult?: MatchResult,
    differences?: DifferenceClassification[]
  ): ConfidenceScore;
}
```

---

### 5.7 DriftDetector

```typescript
/**
 * Detect manual modifications to CloudFormation resources
 * Location: src/modules/discovery/drift-detector.ts
 */

export interface DriftInfo {
  /** Resource logical ID */
  resourceId: string;

  /** Whether drift was detected */
  drifted: boolean;

  /** CloudFormation drift status */
  driftStatus: 'IN_SYNC' | 'MODIFIED' | 'DELETED' | 'NOT_CHECKED';

  /** Property-level differences */
  propertyDifferences?: Array<{
    propertyPath: string;
    expectedValue: any;
    actualValue: any;
    differenceType: 'ADD' | 'REMOVE' | 'MODIFY';
  }>;
}

export class DriftDetector {
  /**
   * Detect drift for entire CloudFormation stack
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

### 5.8 CheckpointManager

```typescript
/**
 * Pause migration at critical decision points
 * Location: src/modules/orchestrator/checkpoints.ts
 */

export interface Checkpoint {
  /** Unique checkpoint identifier */
  id: string;

  /** Migration step this checkpoint belongs to */
  step: string;

  /** Human-readable name */
  name: string;

  /** Description of what this checkpoint does */
  description: string;

  /** Condition function to determine if checkpoint should trigger */
  condition: (state: MigrationState) => boolean;

  /** Handler function to execute checkpoint logic */
  handler: (state: MigrationState) => Promise<CheckpointResult>;
}

export interface CheckpointResult {
  /** Action to take */
  action: 'continue' | 'pause' | 'abort';

  /** Optional modifications to apply to state */
  modifications?: Partial<MigrationState>;
}

export class CheckpointManager {
  /**
   * Register a checkpoint
   */
  registerCheckpoint(checkpoint: Checkpoint): void;

  /**
   * Check if checkpoint should trigger for current state
   */
  shouldTrigger(state: MigrationState, step: string): Checkpoint | null;

  /**
   * Execute checkpoint handler
   */
  async executeCheckpoint(
    checkpoint: Checkpoint,
    state: MigrationState
  ): Promise<CheckpointResult>;

  /**
   * Get all registered checkpoints
   */
  getAllCheckpoints(): Checkpoint[];
}
```

---

## 6. Data Flow Specifications

### 6.1 Physical ID Resolution Flow

```
┌─────────────────────────────────────────────────────────┐
│ Input: Logical ID, Resource Type, Template Properties  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ Strategy 1: Check for Explicit Physical ID Property   │
│ (TableName, BucketName, FunctionName, etc.)            │
└────────────────┬───────────────────────────────────────┘
                 │
         ┌───────┴────────┐
         │ Found?         │
         └───┬────────┬───┘
             │ Yes    │ No
             │        │
             ▼        ▼
      ┌──────────┐  ┌────────────────────────────────────┐
      │ Return   │  │ Strategy 2: Auto-Discovery         │
      │ Physical │  │ - Discover resources via AWS API   │
      │ ID       │  │ - Match using confidence algorithm │
      └──────────┘  └────────────┬───────────────────────┘
                                 │
                         ┌───────┴────────┐
                         │ Confidence     │
                         │ >= 90%?        │
                         └───┬────────┬───┘
                             │ Yes    │ No
                             │        │
                             ▼        ▼
                      ┌──────────┐  ┌───────────────────────────┐
                      │ Return   │  │ Strategy 3: Human Selection│
                      │ Physical │  │ - Show candidates to user  │
                      │ ID       │  │ - Allow manual entry       │
                      └──────────┘  └────────────┬──────────────┘
                                                  │
                                                  ▼
                                           ┌──────────────┐
                                           │ Return User  │
                                           │ Selection    │
                                           └──────────────┘
```

### 6.2 Checkpoint Execution Flow

```
┌────────────────────────────────────────────────────────┐
│ Orchestrator Executing Migration Step                 │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ CheckpointManager.shouldTrigger(state, step)           │
└────────────────┬───────────────────────────────────────┘
                 │
         ┌───────┴────────┐
         │ Checkpoint     │
         │ Triggered?     │
         └───┬────────┬───┘
             │ No     │ Yes
             │        │
             ▼        ▼
      ┌──────────┐  ┌────────────────────────────────────┐
      │ Continue │  │ Execute checkpoint.handler(state)  │
      │ with     │  └────────────┬───────────────────────┘
      │ Step     │               │
      └──────────┘               ▼
                         ┌───────────────┐
                         │ Get Result    │
                         │ Action        │
                         └───┬───┬───┬───┘
                             │   │   │
                    ┌────────┘   │   └────────┐
                    │            │            │
                    ▼            ▼            ▼
             ┌──────────┐ ┌──────────┐ ┌──────────┐
             │ Continue │ │ Pause    │ │ Abort    │
             │          │ │ - Save   │ │ - Clean  │
             │          │ │   State  │ │   up     │
             │          │ │ - Exit   │ │ - Exit   │
             └────┬─────┘ └──────────┘ └──────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Apply          │
         │ Modifications  │
         │ (if any)       │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Continue       │
         │ with Step      │
         └────────────────┘
```

### 6.3 Complete Migration Flow with Checkpoints

```
START MIGRATION
      │
      ▼
┌─────────────────────┐
│ Load Configuration  │
│ Initialize State    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Step: SCAN          │
│ Parse Serverless    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ CHECKPOINT: Physical ID Resolution      │
│ - Discover AWS resources                │
│ - Match with template logical IDs       │
│ - Prompt user for uncertain matches     │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Step: GENERATE      │
│ Create CDK code     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Step: SYNTHESIZE    │
│ Run cdk synth       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Step: COMPARE       │
│ Diff templates      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ CHECKPOINT: Critical Differences        │
│ - Analyze differences                   │
│ - Classify by severity                  │
│ - Prompt user for critical issues       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ CHECKPOINT: Drift Detection (optional)  │
│ - Detect CloudFormation drift           │
│ - Show property differences             │
│ - User chooses resolution strategy      │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Step: PREPARE       │
│ Generate imports    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ CHECKPOINT: CDK Import Execution        │
│ - Show import plan                      │
│ - User confirms                         │
│ - Monitor cdk import                    │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Step: VERIFY        │
│ Validate import     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ MIGRATION COMPLETE  │
│ Generate report     │
└─────────────────────┘
```

---

## 7. Edge Cases & Error Handling

### 7.1 Resource Discovery Edge Cases

#### EC-1.1: No Resources Found
**Scenario:** Discovery returns zero resources of expected type

**Handling:**
1. Log warning
2. Check if region is correct
3. Verify IAM permissions
4. Prompt user: "No [resource type] found. Is this expected?"
5. Options: Retry with different region, Skip resource, Abort

**Test Case:**
```typescript
it('should handle empty discovery results', async () => {
  mockDiscovery.returns([]);
  const result = await resolver.resolve('MyTable', 'AWS::DynamoDB::Table', {});
  expect(interventionManager.prompt).toHaveBeenCalled();
});
```

---

#### EC-1.2: API Throttling During Discovery
**Scenario:** AWS API returns ThrottlingException

**Handling:**
1. Detect throttling error
2. Exponential backoff (1s, 2s, 4s, 8s, 16s)
3. Show progress: "Waiting due to API rate limits..."
4. After 5 retries, prompt user: "Continue waiting or abort?"

**Test Case:**
```typescript
it('should retry on throttling', async () => {
  mockAPI.throws(new ThrottlingException()).onCall(0);
  mockAPI.returns(validResponse).onCall(1);
  const result = await discovery.discoverTables();
  expect(mockAPI.callCount).toBe(2);
});
```

---

#### EC-1.3: Account with 100+ Resources
**Scenario:** Account has more than 100 resources of one type

**Handling:**
1. Use pagination automatically
2. Show progress: "Discovered 100 of ~150 resources..."
3. Cache results to avoid re-discovery
4. Filter by prefix if user provides one

**Performance Requirement:**
- MUST handle 1000 resources in < 60 seconds

**Test Case:**
```typescript
it('should paginate large result sets', async () => {
  mockAPI.returns({ TableNames: Array(1000).fill('table-') });
  const result = await discovery.discoverTables();
  expect(result).toHaveLength(1000);
});
```

---

### 7.2 Matching Edge Cases

#### EC-2.1: Multiple High-Confidence Matches
**Scenario:** Two resources both have 90%+ confidence

**Handling:**
1. Cannot auto-select
2. Show both to user with detailed comparison
3. Explain why both scored high
4. User must manually select

**Example:**
```
⚠️  Multiple high-confidence matches found

users-table-dev (92% confidence)
  ✓ Name similarity: 95%
  ✓ Tags match: project=users
  ✓ Created: 2024-01-15

users-table-staging (91% confidence)
  ✓ Name similarity: 90%
  ✓ Tags match: project=users
  ✓ Created: 2024-01-10

Which is correct? [1, 2, manual]
```

---

#### EC-2.2: All Candidates Below Threshold
**Scenario:** All discovered resources have < 30% confidence

**Handling:**
1. Show all candidates anyway (even low confidence)
2. Clearly mark as "Low Confidence"
3. Recommend manual entry
4. Provide option to skip

**Test Case:**
```typescript
it('should show low-confidence matches', async () => {
  const candidates = [
    { physicalId: 'wrong-table', confidence: 0.2 }
  ];
  const result = await matcher.match('UsersTable', 'AWS::DynamoDB::Table', {}, candidates);
  expect(result.requiresHumanReview).toBe(true);
});
```

---

#### EC-2.3: Resource Exists but Wrong Region
**Scenario:** Resource found in different region than expected

**Handling:**
1. Show resource with region indicator
2. Mark as "Wrong Region" in UI
3. Confidence score penalty (-50%)
4. Warn: "This resource is in us-west-2, but migration is for us-east-1"

---

### 7.3 Drift Detection Edge Cases

#### EC-3.1: Drift Detection Timeout
**Scenario:** CloudFormation drift detection takes > 5 minutes

**Handling:**
1. Show timeout warning
2. Offer to continue without drift check
3. Or retry detection
4. Log: "Drift detection timed out. Continuing without drift check."

**Test Case:**
```typescript
it('should handle drift detection timeout', async () => {
  mockCFN.detectDrift.returns({ timeout: true });
  const result = await driftDetector.detectDrift('my-stack');
  expect(result.status).toBe('NOT_CHECKED');
});
```

---

#### EC-3.2: Resource Deleted Outside CloudFormation
**Scenario:** Drift status is DELETED

**Handling:**
1. Immediately flag as critical
2. Show error: "Resource was deleted outside CloudFormation"
3. Cannot continue migration for this resource
4. Options: Skip resource (not recommended) or abort

**Migration Impact:** BLOCKING

---

#### EC-3.3: Drift in Non-Critical Properties
**Scenario:** Drift in tags or description only

**Handling:**
1. Classify as WARNING
2. Show differences but allow auto-proceed
3. Update CDK template to match AWS state
4. Log: "Auto-resolved drift in non-critical properties"

---

### 7.4 User Interaction Edge Cases

#### EC-4.1: User Aborts During Checkpoint
**Scenario:** User presses Ctrl+C or selects "Abort"

**Handling:**
1. Catch SIGINT signal
2. Prompt: "Are you sure you want to abort? Progress will be saved."
3. If yes:
   - Save current state
   - Clean up temporary files
   - Exit with code 0
4. Display resume command

**Test Case:**
```typescript
it('should handle abort gracefully', async () => {
  mockIntervention.returns({ action: 'abort' });
  await expect(orchestrator.migrate(config)).resolves.toEqual({
    status: 'aborted',
    canResume: true
  });
});
```

---

#### EC-4.2: Invalid Manual Entry
**Scenario:** User enters physical ID that doesn't exist

**Handling:**
1. Validate via AWS API
2. Show error: "Resource 'xyz' not found in AWS"
3. Re-prompt with same candidates
4. Allow retry unlimited times

**Test Case:**
```typescript
it('should validate manual physical ID entries', async () => {
  mockAWS.describeTable.throws(new ResourceNotFoundException());
  await expect(
    resolver.validatePhysicalId('invalid-table', 'AWS::DynamoDB::Table')
  ).rejects.toThrow('not found');
});
```

---

#### EC-4.3: Terminal Too Narrow
**Scenario:** Terminal width < 80 columns

**Handling:**
1. Detect terminal width
2. Adjust output formatting
3. Use abbreviated labels
4. Still functional, just less pretty

**Minimum Width:** 80 columns

---

### 7.5 State Management Edge Cases

#### EC-5.1: State File Corrupted
**Scenario:** Saved state JSON is invalid

**Handling:**
1. Detect corruption on load
2. Attempt to recover from backup
3. If unrecoverable, show error:
   "Migration state corrupted. Please start fresh migration."
4. Delete corrupted file

---

#### EC-5.2: Template Changed Between Pause and Resume
**Scenario:** Template hash differs from saved state

**Handling:**
1. Detect hash mismatch
2. Show warning: "Template has changed since migration was paused"
3. Options:
   - Continue anyway (risky)
   - Start fresh migration
   - Review changes first

---

#### EC-5.3: AWS Resources Changed Between Pause and Resume
**Scenario:** Physical IDs resolved earlier no longer exist

**Handling:**
1. Re-validate all physical IDs on resume
2. For deleted resources:
   - Mark as "Requires Re-Resolution"
   - Re-run discovery
   - Re-prompt user
3. Show summary of changes

---

### 7.6 Import Execution Edge Cases

#### EC-6.1: CDK Import Fails Mid-Process
**Scenario:** `cdk import` fails after importing 5 of 10 resources

**Handling:**
1. Capture error output
2. Parse which resources succeeded
3. Save state with partial imports
4. Show clear error message
5. Offer to fix issue and retry
6. Next retry skips already-imported resources

**Recovery Strategy:**
```typescript
{
  importedResources: ['Table1', 'Table2', 'Table3'],
  pendingResources: ['Table4', 'Table5'],
  failedResource: 'Table4',
  error: 'Physical ID mismatch'
}
```

---

#### EC-6.2: Physical ID Changed During Import
**Scenario:** Resource was renamed/recreated between resolution and import

**Handling:**
1. CDK import fails with "Resource not found"
2. Detect this specific error
3. Prompt: "Resource 'XYZ' not found. Re-resolve physical ID?"
4. If yes: Re-run discovery and resolution
5. If no: Skip resource or abort

---

## 8. User Stories

### US-1: Physical ID Mismatch Resolution
**As a** DevOps engineer
**I want** to select the correct DynamoDB table when the name doesn't match the template
**So that** my production data isn't lost during migration

**Scenario:**
```gherkin
Given I have a DynamoDB table named "users-prod"
And my Serverless template says "UsersTable"
When I run the migration
Then I should see a list of matching tables
And I can select "users-prod"
And the migration continues with my selection
```

**Acceptance Criteria:**
- Shows all tables with confidence scores
- Allows manual entry if needed
- Validates table exists before continuing
- Records my selection in audit log

---

### US-2: Critical Difference Review
**As a** developer
**I want** to review critical template differences before import
**So that** I don't accidentally change my production resources

**Scenario:**
```gherkin
Given the Serverless template has 3 DynamoDB GSIs
And the CDK template only has 2 GSIs
When the migration reaches comparison
Then I should see a critical difference warning
And I can pause the migration to fix the CDK code
And I can resume after fixing
```

**Acceptance Criteria:**
- All critical differences are highlighted
- Explanation is clear and actionable
- Can pause without losing progress
- Can resume from exact same point

---

### US-3: CloudFormation Drift Handling
**As a** platform engineer
**I want** to know if my resources have been manually modified
**So that** I can decide whether to keep or revert those changes

**Scenario:**
```gherkin
Given my IAM role has been manually modified
And drift detection is enabled
When the migration runs
Then I should see the drift details
And I can choose to use AWS state or template state
And my choice is reflected in the final CDK code
```

**Acceptance Criteria:**
- Drift is detected for all resources
- Property-level differences are shown
- I can make informed decisions
- CDK code reflects my choices

---

### US-4: Bulk Physical ID Resolution
**As a** migration operator
**I want** to resolve physical IDs for all resources at once
**So that** I don't have to wait for each prompt individually

**Scenario:**
```gherkin
Given I have 20 stateful resources
When I start the migration
Then I should see all unresolved resources at once
And I can select physical IDs for all of them
And the migration continues after I'm done
```

**Acceptance Criteria:**
- All resources are presented together
- Can navigate between resources
- Can go back to change earlier selections
- Progress is saved after each selection

---

### US-5: Migration Pause and Resume
**As a** DevOps engineer working across multiple days
**I want** to pause my migration and resume later
**So that** I can take time to review issues properly

**Scenario:**
```gherkin
Given I'm in the middle of a migration
And I encounter a complex issue
When I select "Pause"
Then my progress is saved
And I can close my terminal
And later I run "sls-to-cdk resume"
And I continue from where I left off
```

**Acceptance Criteria:**
- State persists across sessions
- No data loss on pause
- Resume works correctly
- All previous decisions are preserved

---

## 9. Acceptance Criteria

### Sprint 1 Acceptance Criteria

#### AC-1.1: Human Intervention System
- [ ] All three prompt types render correctly
- [ ] Colors display properly in supported terminals
- [ ] Can navigate using arrow keys
- [ ] Can abort with Ctrl+C
- [ ] Interventions logged to JSON file
- [ ] Dry-run mode works without prompts
- [ ] Prompt responses persist across restarts

#### AC-1.2: AWS Resource Discovery
- [ ] Discovers 100+ resources in < 30 seconds
- [ ] Handles pagination automatically
- [ ] No data loss during pagination
- [ ] API throttling triggers exponential backoff
- [ ] All metadata fields populated
- [ ] Works with IAM roles with limited permissions
- [ ] Cache prevents redundant API calls

#### AC-1.3: Resource Matching
- [ ] 95%+ accuracy on exact name matches
- [ ] 85%+ accuracy on similar names
- [ ] False positive rate < 5%
- [ ] Confidence scores are understandable
- [ ] Reason breakdown is clear
- [ ] Can handle resources with no tags

#### AC-1.4: Physical ID Resolution
- [ ] 100% of stateful resources get valid IDs
- [ ] Explicit IDs are used when present
- [ ] Auto-selection works at 90%+ confidence
- [ ] Human prompt works for low confidence
- [ ] Validation catches non-existent IDs
- [ ] Resolution completes in < 5 minutes for 50 resources

---

### Sprint 2 Acceptance Criteria

#### AC-2.1: Difference Classification
- [ ] 100% of differences get classification
- [ ] False critical rate < 1%
- [ ] Explanations are actionable
- [ ] Resolution strategies are valid
- [ ] Grouping by severity works correctly

#### AC-2.2: Confidence Scoring
- [ ] Scores correlate with success rate
- [ ] Thresholds are configurable
- [ ] Factor breakdown is complete
- [ ] Recommendations make sense
- [ ] Updates as new information is added

#### AC-2.3: Manual Review Reports
- [ ] Terminal report fits 80 columns
- [ ] HTML renders in all modern browsers
- [ ] JSON is valid and parseable
- [ ] Reports generate in < 5 seconds
- [ ] All data is present and accurate
- [ ] Can export to PDF from HTML

#### AC-2.4: Drift Detection
- [ ] Detects drift for 50+ resource stacks
- [ ] Property differences are accurate
- [ ] Timeout handled gracefully (5 min max)
- [ ] User resolution applies correctly
- [ ] No data loss from resolution choices

---

### Sprint 3 Acceptance Criteria

#### AC-3.1: Interactive CDK Import
- [ ] Import plan displays correctly
- [ ] All physical IDs are shown
- [ ] Progress indicator works
- [ ] Errors are captured and explained
- [ ] Can retry failed imports
- [ ] Partial import recovery works

#### AC-3.2: Checkpoint System
- [ ] All checkpoints trigger correctly
- [ ] Conditions evaluate properly
- [ ] Handlers execute successfully
- [ ] State persists on pause
- [ ] Abort cleans up correctly
- [ ] Continue applies modifications

#### AC-3.3: Pause and Resume
- [ ] State saves in < 1 second
- [ ] Resume restores exact state
- [ ] No data loss on crash during save
- [ ] Can list all paused migrations
- [ ] Old states are cleaned up (30 days)

---

## 10. Dependencies

### 10.1 NPM Packages

#### New Dependencies Required

```json
{
  "dependencies": {
    "inquirer": "^9.2.12",      // Already installed ✓
    "chalk": "^4.1.2",          // Already installed ✓
    "ora": "^5.4.1",            // Already installed ✓
    "string-similarity": "^4.0.4"  // NEW - For fuzzy matching
  }
}
```

**string-similarity**: Levenshtein distance calculation for name matching

---

### 10.2 AWS SDK v3 Services

#### Additional AWS Services Required

```typescript
// Already available
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';

// NEW - Required for Sprint 1
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand }
  from '@aws-sdk/client-lambda';
import { IAMClient, ListRolesCommand, GetRoleCommand, ListRolePoliciesCommand }
  from '@aws-sdk/client-iam';

// NEW - Required for Sprint 2
import {
  CloudFormationClient,
  DetectStackDriftCommand,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand
} from '@aws-sdk/client-cloudformation';
```

---

### 10.3 IAM Permissions Required

#### Minimum IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ResourceDiscovery",
      "Effect": "Allow",
      "Action": [
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "dynamodb:ListTagsOfResource",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "s3:GetBucketTagging",
        "logs:DescribeLogGroups",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "iam:ListRoles",
        "iam:GetRole",
        "iam:ListRolePolicies"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DriftDetection",
      "Effect": "Allow",
      "Action": [
        "cloudformation:DetectStackDrift",
        "cloudformation:DescribeStackDriftDetectionStatus",
        "cloudformation:DescribeStackResourceDrifts"
      ],
      "Resource": "arn:aws:cloudformation:*:*:stack/*"
    }
  ]
}
```

---

### 10.4 Integration Points

#### Existing Modules to Modify

1. **MigrationOrchestrator** (`src/modules/orchestrator/index.ts`)
   - Add checkpoint integration
   - Add pause/resume logic
   - Update state management

2. **Comparator** (`src/modules/comparator/index.ts`)
   - Integrate DifferenceAnalyzer
   - Add confidence scoring
   - Generate manual review reports

3. **StateManager** (`src/modules/orchestrator/state-manager.ts`)
   - Extend state schema
   - Add intervention history
   - Support pause/resume

4. **CLI Commands** (`src/cli/commands/migrate.ts`)
   - Add `--detect-drift` flag
   - Add `--interactive` flag (default true)
   - Add resume subcommand

#### New Modules to Create

1. **HumanInterventionManager** (`src/modules/orchestrator/human-intervention.ts`)
2. **AWSResourceDiscovery** (`src/modules/discovery/aws-resource-discovery.ts`)
3. **ResourceMatcher** (`src/modules/discovery/resource-matcher.ts`)
4. **PhysicalIdResolver** (`src/modules/discovery/physical-id-resolver.ts`)
5. **DifferenceAnalyzer** (`src/modules/comparator/difference-analyzer.ts`)
6. **ConfidenceScoring** (`src/modules/orchestrator/confidence-scoring.ts`)
7. **ManualReviewReport** (`src/modules/reporter/manual-review-report.ts`)
8. **DriftDetector** (`src/modules/discovery/drift-detector.ts`)
9. **CheckpointManager** (`src/modules/orchestrator/checkpoints.ts`)
10. **InteractiveCDKImport** (`src/modules/importer/interactive-cdk-import.ts`)

---

## 11. Success Metrics

### 11.1 Technical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Resource discovery time | < 30s for 100 resources | Telemetry timing |
| Physical ID resolution accuracy | > 95% | Post-migration validation |
| False critical difference rate | < 1% | Manual review of samples |
| State persistence reliability | 100% | Automated tests |
| Resume success rate | > 99% | Telemetry tracking |

---

### 11.2 User Experience Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Intervention clarity score | > 4.5/5 | User survey |
| Time to resolve intervention | < 2 minutes average | Telemetry timing |
| Documentation completeness | > 90% coverage | Doc review |
| User satisfaction | > 4.0/5 | Post-migration survey |

---

### 11.3 Migration Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Messy environment migrations | 100% completion | Telemetry tracking |
| Drift detection accuracy | > 95% | Validate against AWS |
| Import success rate | > 98% | Telemetry tracking |
| Data loss incidents | 0 | User reports + validation |

---

## 12. Testing Requirements

### 12.1 Unit Test Coverage

**Target:** 90%+ code coverage

**Required Test Categories:**

1. **Human Intervention**
   - [ ] All prompt types render
   - [ ] Dry-run mode works
   - [ ] Audit logging is correct
   - [ ] Input validation works

2. **Resource Discovery**
   - [ ] Each resource type discovery
   - [ ] Pagination handling
   - [ ] API throttling
   - [ ] Empty result sets
   - [ ] Network errors

3. **Resource Matching**
   - [ ] Confidence calculation
   - [ ] Name similarity scoring
   - [ ] Tag matching
   - [ ] Configuration comparison
   - [ ] Ranking algorithm

4. **Physical ID Resolution**
   - [ ] Strategy ordering
   - [ ] Fallback behavior
   - [ ] Validation
   - [ ] Caching

5. **Difference Analysis**
   - [ ] Classification rules
   - [ ] Category assignment
   - [ ] Explanation generation
   - [ ] Grouping logic

6. **Confidence Scoring**
   - [ ] Score calculation
   - [ ] Factor weighting
   - [ ] Recommendation logic
   - [ ] Threshold handling

7. **Drift Detection**
   - [ ] CloudFormation API integration
   - [ ] Timeout handling
   - [ ] Property parsing
   - [ ] Correlation logic

8. **Checkpoint System**
   - [ ] Condition evaluation
   - [ ] Handler execution
   - [ ] State modifications
   - [ ] Trigger logic

---

### 12.2 Integration Tests

**Required Scenarios:**

1. **Complete Messy Environment Migration**
   ```typescript
   it('should migrate messy environment end-to-end', async () => {
     // Setup: Create AWS resources with mismatched names
     // Execute: Run full migration with mocked interventions
     // Verify: All resources imported correctly
   });
   ```

2. **Physical ID Resolution with Discovery**
   ```typescript
   it('should discover and match resources', async () => {
     // Setup: Mock AWS API responses
     // Execute: Run discovery and matching
     // Verify: Correct physical IDs selected
   });
   ```

3. **Critical Difference Handling**
   ```typescript
   it('should pause on critical differences', async () => {
     // Setup: Templates with critical differences
     // Execute: Run comparison
     // Verify: Checkpoint triggers, migration pauses
   });
   ```

4. **Drift Detection and Resolution**
   ```typescript
   it('should detect and resolve drift', async () => {
     // Setup: Stack with drifted resources
     // Execute: Run drift detection
     // Verify: User prompted, resolution applied
   });
   ```

5. **Pause and Resume**
   ```typescript
   it('should pause and resume correctly', async () => {
     // Setup: Start migration
     // Execute: Pause at checkpoint, save state, resume
     // Verify: Continues from exact point
   });
   ```

6. **Interactive CDK Import**
   ```typescript
   it('should monitor and complete CDK import', async () => {
     // Setup: CDK project ready for import
     // Execute: Run interactive import
     // Verify: All resources imported, prompts answered
   });
   ```

---

### 12.3 Performance Tests

**Required Benchmarks:**

1. **Resource Discovery Performance**
   - 100 resources: < 30 seconds
   - 500 resources: < 90 seconds
   - 1000 resources: < 180 seconds

2. **Template Comparison Performance**
   - 50 resources: < 5 seconds
   - 100 resources: < 10 seconds
   - 200 resources: < 20 seconds

3. **State Persistence Performance**
   - Save state: < 1 second
   - Load state: < 2 seconds
   - Validate state: < 1 second

---

### 12.4 User Acceptance Tests

**Required Scenarios:**

1. **Manual Physical ID Entry**
   - User starts migration
   - System cannot auto-match table
   - User enters physical ID manually
   - Migration continues successfully

2. **Review and Fix Critical Difference**
   - Migration finds critical difference
   - User pauses migration
   - User fixes CDK code
   - User resumes migration
   - Migration completes successfully

3. **Drift Resolution**
   - System detects drift
   - User reviews property differences
   - User chooses to use AWS state
   - CDK template updated correctly
   - Import succeeds

---

## Appendix A: Example Intervention Prompts

### Physical ID Selection
```
⚠️  Cannot automatically determine physical ID for DynamoDB table

Logical ID: UsersTable
Resource Type: AWS::DynamoDB::Table

Found 3 candidates in AWS account:

❯ ✨ users-table-dev (90% confidence) [RECOMMENDED]
  📍 us-east-1 | Created: 2024-01-15 | Size: 1.2 GB
  ✓ Name similarity: 95%
  ✓ Tags match: environment=dev
  ✓ Configuration matches

  users-table-prod (50% confidence)
  📍 us-east-1 | Created: 2023-06-10 | Size: 15.8 GB
  ✓ Name similarity: 80%

  legacy-users (30% confidence)
  📍 us-east-1 | Created: 2022-03-20 | Size: 0.5 GB
  ✓ Name similarity: 60%

  ✏️  Enter manually
  ⏭️  Skip this resource

Choose resource: █
```

---

### Critical Difference Review
```
🔴 Critical differences found - Review required

Resource: UsersTable (DynamoDB Table)
Confidence: 65%

┌─────────────────────────────────────────────────────────────┐
│ Issue 1: CRITICAL - AttributeDefinitions differ             │
├─────────────────────────────────────────────────────────────┤
│ Serverless: [userId: S, email: S, timestamp: N]             │
│ CDK:        [userId: S]                                     │
│                                                             │
│ ⚠️  This may indicate missing GSIs in CDK template          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Issue 2: WARNING - BillingMode changed                      │
├─────────────────────────────────────────────────────────────┤
│ Serverless: PROVISIONED                                     │
│ CDK:        PAY_PER_REQUEST                                 │
│                                                             │
│ ℹ️  This will not cause data loss                           │
└─────────────────────────────────────────────────────────────┘

Recommendations:
  1. Review CDK template for missing GSIs
  2. Verify email and timestamp attributes are defined
  3. Consider impact of billing mode change

How would you like to proceed?
  ❯ Continue anyway
    Pause for manual review
    Abort migration

Select option: █
```

---

### Drift Resolution
```
🔍 CloudFormation drift detected

Resource: ApiLambdaRole (IAM Role)
Status: MODIFIED
Drifted Properties: 3

┌─────────────────────────────────────────────────────────────┐
│ Property: Policies                                          │
├─────────────────────────────────────────────────────────────┤
│ Template State:                                             │
│   - AWSLambdaBasicExecutionRole                            │
│   - DynamoDBReadPolicy                                     │
│                                                             │
│ Actual AWS State:                                           │
│   - AWSLambdaBasicExecutionRole                            │
│   - DynamoDBReadPolicy                                     │
│   - S3ReadOnlyAccess (manually added)                      │
└─────────────────────────────────────────────────────────────┘

⚠️  Someone manually added S3ReadOnlyAccess policy

How should we resolve this drift?

  ❯ Use AWS State - Keep manual changes (update CDK template)
    Use Template State - Revert to original (⚠️  removes S3 access)
    Manual Resolution - I'll fix this myself (pauses migration)

Select option: █
```

---

## Appendix B: Configuration Example

### CLI Flags

```bash
# Enable all messy environment features
sls-to-cdk migrate \
  --source ./my-serverless-app \
  --detect-drift \
  --interactive \
  --auto-resolve-threshold 0.9

# Dry run to see what would happen
sls-to-cdk migrate \
  --source ./my-serverless-app \
  --dry-run \
  --output-report ./migration-report.html

# Resume paused migration
sls-to-cdk resume abc123-migration-2024-10-23
```

### Configuration File

```yaml
# .sls-to-cdk.config.yaml
migration:
  detectDrift: true
  interactive: true
  autoResolveThreshold: 0.9

discovery:
  regions:
    - us-east-1
    - us-west-2
  resourceTypes:
    - AWS::DynamoDB::Table
    - AWS::S3::Bucket
    - AWS::Logs::LogGroup

checkpoints:
  - physical-id-resolution
  - critical-differences
  - drift-detection
  - cdk-import

confidence:
  thresholds:
    autoProceed: 0.9
    reviewRecommended: 0.7
    humanRequired: 0.0
```

---

**END OF SPECIFICATION**

**Document Control:**
- Version: 1.0.0
- Last Updated: 2025-10-23
- Status: Ready for Architecture Phase
- Next Phase: SPARC Architecture Design
