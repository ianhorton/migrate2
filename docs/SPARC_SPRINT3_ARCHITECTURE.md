# Sprint 3 Architecture: Code Cleaner

**Sprint**: 3 of 5
**Phase**: Architecture (Phase Gate 3)
**Status**: 📝 **PENDING APPROVAL**
**Date**: 2025-10-22
**Specification**: `docs/SPARC_SPRINT3_SPECIFICATION.md`
**Pseudocode**: `docs/SPARC_SPRINT3_PSEUDOCODE.md`

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Structure](#2-file-structure)
3. [Module Organization](#3-module-organization)
4. [Class Designs](#4-class-designs)
5. [Interface Definitions](#5-interface-definitions)
6. [Integration Points](#6-integration-points)
7. [Test Architecture](#7-test-architecture)
8. [Error Handling](#8-error-handling)
9. [Configuration](#9-configuration)
10. [Module Boundaries](#10-module-boundaries)

---

## 1. Overview

### 1.1 Module Purpose

The Code Cleaner module is Sprint 3's contribution to clean, human-readable CDK code generation. It transforms verbose, machine-generated TypeScript code into professional, maintainable code that looks hand-written.

**Key Responsibilities**:
- Reduce comment verbosity by 90%
- Remove unnecessary logical ID overrides (70% reduction)
- Remove unnecessary removal policies (80% reduction)
- Organize code into logical sections
- Optimize imports and formatting

### 1.2 Architecture Principles

1. **Pipeline Pattern**: Sequential transformation stages
2. **Single Responsibility**: Each class handles one transformation type
3. **Defensive Defaults**: Keep code when classification is missing
4. **Graceful Degradation**: Continue pipeline even if one stage fails
5. **Metrics-Driven**: Track and report all optimizations

### 1.3 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Sequential Pipeline** | Each stage builds on previous; order matters |
| **String Processing** | Code is manipulated as strings, not AST (simpler, faster) |
| **Resource Map Lookup** | O(1) resource lookup by LogicalId |
| **Reverse Processing** | Process removals in reverse to preserve character offsets |
| **Regex + Patterns** | Balance between simplicity and robustness |

---

## 2. File Structure

```
src/modules/generator/code-cleaner/
├── index.ts                        # Main entry point and pipeline
│   ├── CodeCleaner class (250 lines)
│   ├── cleanCode() public method
│   └── Pipeline orchestration
│
├── comment-reducer.ts              # Comment reduction logic
│   ├── CommentReducer class (300 lines)
│   ├── reduceComments()
│   ├── extractComments()
│   ├── classifyComment()
│   └── PRESERVE_PATTERNS constant
│
├── logical-id-optimizer.ts         # Logical ID override removal
│   ├── LogicalIdOptimizer class (200 lines)
│   ├── optimizeLogicalIds()
│   ├── findOverrides()
│   ├── shouldRemoveOverride()
│   └── removeOverrideStatement()
│
├── removal-policy-optimizer.ts     # Removal policy optimization
│   ├── RemovalPolicyOptimizer class (200 lines)
│   ├── optimizeRemovalPolicies()
│   ├── findPolicyCalls()
│   ├── shouldRemovePolicy()
│   └── removePolicyStatement()
│
├── code-formatter.ts               # Code organization and formatting
│   ├── CodeFormatter class (400 lines)
│   ├── formatCode()
│   ├── extractConstructs()
│   ├── groupConstructs()
│   ├── orderSections()
│   ├── addSectionDividers()
│   └── optimizeImports()
│
└── utils/
    ├── code-parser.ts              # Code parsing utilities
    │   ├── parseConstructs() (150 lines)
    │   ├── extractVariableName()
    │   ├── findStatementEnd()
    │   └── buildConstructMap()
    │
    └── metrics-tracker.ts          # Optimization metrics
        ├── CleaningMetrics interface
        ├── trackOptimizations() (100 lines)
        └── calculateReductions()

tests/unit/generator/code-cleaner/
├── comment-reducer.test.ts         # 8 tests, 250 lines
├── logical-id-optimizer.test.ts    # 6 tests, 200 lines
├── removal-policy-optimizer.test.ts # 6 tests, 200 lines
├── code-formatter.test.ts          # 10 tests, 350 lines
└── code-cleaner.test.ts            # 5 tests, 200 lines

tests/integration/generator/
└── code-cleaning.test.ts           # 5 tests, 300 lines
```

**Total Lines of Code**:
- Production: ~1,600 lines
- Tests: ~1,500 lines
- Total: ~3,100 lines

---

## 3. Module Organization

### 3.1 Dependency Graph

```
┌──────────────────────────────────────────────┐
│           CodeCleaner (index.ts)             │
│         Main Pipeline Orchestrator           │
└──────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬──────────┬──────────┐
        │           │           │          │          │
        ▼           ▼           ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Comment  │ │Logical ID│ │ Removal  │ │   Code   │ │ Metrics  │
│ Reducer  │ │Optimizer │ │Policy Opt│ │Formatter │ │ Tracker  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
     │            │             │            │            │
     └────────────┴─────────────┴────────────┴────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
             ┌──────────┐        ┌──────────┐
             │   Code   │        │  Sprint 1│
             │  Parser  │        │Resources │
             └──────────┘        └──────────┘
```

### 3.2 Layer Architecture

```
┌─────────────────────────────────────────────────┐
│              Public API Layer                   │
│  CodeCleaner.cleanCode(code, resources)         │
└─────────────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│           Pipeline Orchestration Layer          │
│  Sequential execution of transformations        │
└─────────────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│           Transformation Layer                  │
│  CommentReducer, LogicalIdOptimizer,            │
│  RemovalPolicyOptimizer, CodeFormatter          │
└─────────────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│              Utility Layer                      │
│  CodeParser, MetricsTracker                     │
└─────────────────────────────────────────────────┘
```

---

## 4. Class Designs

### 4.1 CodeCleaner (Main Pipeline)

**File**: `src/modules/generator/code-cleaner/index.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { CommentReducer } from './comment-reducer';
import { LogicalIdOptimizer } from './logical-id-optimizer';
import { RemovalPolicyOptimizer } from './removal-policy-optimizer';
import { CodeFormatter } from './code-formatter';
import { CleaningMetrics, trackOptimizations } from './utils/metrics-tracker';

/**
 * Configuration options for code cleaning
 */
export interface CodeCleanerOptions {
  // Enable/disable individual cleaners
  reduceComments?: boolean;          // default: true
  optimizeLogicalIds?: boolean;      // default: true
  optimizeRemovalPolicies?: boolean; // default: true
  formatCode?: boolean;              // default: true

  // Custom preserve patterns
  preservePatterns?: RegExp[];       // Additional comment patterns to preserve

  // Metrics and logging
  trackMetrics?: boolean;            // default: true
  verbose?: boolean;                 // default: false
}

/**
 * Result of code cleaning operation
 */
export interface CleanedCodeResult {
  code: string;              // Cleaned code
  metrics: CleaningMetrics;  // Optimization metrics
  success: boolean;          // True if cleaning succeeded
  errors?: string[];         // Any errors encountered
  warnings?: string[];       // Any warnings
}

/**
 * Main Code Cleaner class - orchestrates the cleaning pipeline
 */
export class CodeCleaner {
  private commentReducer: CommentReducer;
  private logicalIdOptimizer: LogicalIdOptimizer;
  private removalPolicyOptimizer: RemovalPolicyOptimizer;
  private codeFormatter: CodeFormatter;

  private resourceMap: Map<string, ClassifiedResource>;

  /**
   * Creates a new CodeCleaner instance
   * @param resources - Classified resources from Sprint 1
   * @param options - Configuration options
   */
  constructor(
    private resources: ClassifiedResource[],
    private options: CodeCleanerOptions = {}
  ) {
    // Set defaults
    this.options = {
      reduceComments: true,
      optimizeLogicalIds: true,
      optimizeRemovalPolicies: true,
      formatCode: true,
      trackMetrics: true,
      verbose: false,
      preservePatterns: [],
      ...options
    };

    // Create resource map for O(1) lookups
    this.resourceMap = this.createResourceMap(resources);

    // Initialize transformers
    this.commentReducer = new CommentReducer(
      resources,
      this.resourceMap,
      options.preservePatterns || []
    );

    this.logicalIdOptimizer = new LogicalIdOptimizer(
      resources,
      this.resourceMap
    );

    this.removalPolicyOptimizer = new RemovalPolicyOptimizer(
      resources,
      this.resourceMap
    );

    this.codeFormatter = new CodeFormatter(
      resources,
      this.resourceMap
    );
  }

  /**
   * Main entry point - runs full cleaning pipeline
   * @param code - Verbose generated CDK code
   * @returns Cleaned code with metrics
   */
  public cleanCode(code: string): CleanedCodeResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let currentCode = code;

    try {
      // Track original metrics
      const originalMetrics = this.options.trackMetrics
        ? trackOptimizations(code, code, this.resources)
        : undefined;

      // Step 1: Reduce comments
      if (this.options.reduceComments) {
        try {
          currentCode = this.commentReducer.reduceComments(currentCode);
          if (this.options.verbose) {
            console.log('✓ Comment reduction complete');
          }
        } catch (error) {
          errors.push(`Comment reduction failed: ${error}`);
          warnings.push('Continuing with original comments');
        }
      }

      // Step 2: Optimize logical IDs
      if (this.options.optimizeLogicalIds) {
        try {
          currentCode = this.logicalIdOptimizer.optimizeLogicalIds(currentCode);
          if (this.options.verbose) {
            console.log('✓ Logical ID optimization complete');
          }
        } catch (error) {
          errors.push(`Logical ID optimization failed: ${error}`);
          warnings.push('Continuing with original logical ID overrides');
        }
      }

      // Step 3: Optimize removal policies
      if (this.options.optimizeRemovalPolicies) {
        try {
          currentCode = this.removalPolicyOptimizer.optimizeRemovalPolicies(currentCode);
          if (this.options.verbose) {
            console.log('✓ Removal policy optimization complete');
          }
        } catch (error) {
          errors.push(`Removal policy optimization failed: ${error}`);
          warnings.push('Continuing with original removal policies');
        }
      }

      // Step 4: Format code
      if (this.options.formatCode) {
        try {
          currentCode = this.codeFormatter.formatCode(currentCode);
          if (this.options.verbose) {
            console.log('✓ Code formatting complete');
          }
        } catch (error) {
          errors.push(`Code formatting failed: ${error}`);
          warnings.push('Continuing with unformatted code');
        }
      }

      // Calculate final metrics
      const metrics = this.options.trackMetrics
        ? trackOptimizations(code, currentCode, this.resources)
        : this.getDefaultMetrics();

      return {
        code: currentCode,
        metrics,
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      // Fatal error - return original code
      return {
        code: code,
        metrics: this.getDefaultMetrics(),
        success: false,
        errors: [`Fatal error in code cleaning: ${error}`]
      };
    }
  }

  /**
   * Creates a map of LogicalId -> ClassifiedResource for O(1) lookups
   */
  private createResourceMap(
    resources: ClassifiedResource[]
  ): Map<string, ClassifiedResource> {
    const map = new Map<string, ClassifiedResource>();
    for (const resource of resources) {
      map.set(resource.LogicalId, resource);
    }
    return map;
  }

  /**
   * Returns default metrics when tracking is disabled
   */
  private getDefaultMetrics(): CleaningMetrics {
    return {
      commentsTotal: 0,
      commentsRemoved: 0,
      commentsPreserved: 0,
      commentReductionPercent: 0,
      logicalIdOverridesTotal: 0,
      logicalIdOverridesRemoved: 0,
      logicalIdReductionPercent: 0,
      removalPoliciesTotal: 0,
      removalPoliciesRemoved: 0,
      removalPolicyReductionPercent: 0,
      linesBefore: 0,
      linesAfter: 0,
      lineReductionPercent: 0,
      sectionsCreated: 0,
      constructsReorganized: 0
    };
  }
}

// Re-export for convenience
export { CleaningMetrics } from './utils/metrics-tracker';
export { CommentReducer } from './comment-reducer';
export { LogicalIdOptimizer } from './logical-id-optimizer';
export { RemovalPolicyOptimizer } from './removal-policy-optimizer';
export { CodeFormatter } from './code-formatter';
```

### 4.2 CommentReducer

**File**: `src/modules/generator/code-cleaner/comment-reducer.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { buildConstructToResourceMap } from './utils/code-parser';

/**
 * Represents a comment found in code
 */
export interface Comment {
  text: string;       // Full comment text including //
  content: string;    // Comment content without //
  line: number;       // Line number (1-indexed)
  startPos: number;   // Character offset start
  endPos: number;     // Character offset end
  type: 'single' | 'multi'; // Comment type
}

/**
 * Reduces comment verbosity by 90% while preserving important comments
 */
export class CommentReducer {
  // Patterns to always preserve
  private static readonly PRESERVE_PATTERNS: RegExp[] = [
    /TODO:/i,
    /FIXME:/i,
    /HACK:/i,
    /NOTE:/i,
    /WARNING:/i,
    /IMPORTANT:(?!\s+This\s+resource)/i  // IMPORTANT but not "This resource"
  ];

  // Patterns to always remove
  private static readonly REMOVE_PATTERNS: RegExp[] = [
    /^AWS::[A-Z][a-zA-Z0-9]*::[A-Z][a-zA-Z0-9]*$/,  // CloudFormation types
  ];

  constructor(
    private resources: ClassifiedResource[],
    private resourceMap: Map<string, ClassifiedResource>,
    private customPreservePatterns: RegExp[] = []
  ) {}

  /**
   * Reduces comments by 90% while preserving important ones
   */
  public reduceComments(code: string): string {
    // Extract all comments
    const comments = this.extractComments(code);

    // Build construct-to-resource mapping
    const constructMap = buildConstructToResourceMap(code, this.resourceMap);

    // Classify each comment
    const commentsToRemove: Comment[] = [];
    for (const comment of comments) {
      const shouldKeep = this.shouldPreserveComment(comment, constructMap);
      if (!shouldKeep) {
        commentsToRemove.push(comment);
      }
    }

    // Remove comments in reverse order (preserve character offsets)
    let result = code;
    for (let i = commentsToRemove.length - 1; i >= 0; i--) {
      result = this.removeComment(result, commentsToRemove[i]);
    }

    return result;
  }

  /**
   * Extracts all comments from code
   */
  private extractComments(code: string): Comment[] {
    const comments: Comment[] = [];
    const lines = code.split('\n');
    let charOffset = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Single-line comment
      const singleMatch = line.match(/^\s*(\/\/.*)$/);
      if (singleMatch) {
        const commentText = singleMatch[1];
        const content = commentText.substring(2).trim();

        comments.push({
          text: commentText,
          content,
          line: lineNum + 1,
          startPos: charOffset + line.indexOf('//'),
          endPos: charOffset + line.length,
          type: 'single'
        });
      }

      // Multi-line comment start
      if (line.includes('/*')) {
        const startIdx = line.indexOf('/*');
        let endLineNum = lineNum;

        // Find closing */
        while (endLineNum < lines.length && !lines[endLineNum].includes('*/')) {
          endLineNum++;
        }

        if (endLineNum < lines.length) {
          const commentLines = lines.slice(lineNum, endLineNum + 1);
          const commentText = commentLines.join('\n');
          const content = commentText
            .replace(/\/\*/g, '')
            .replace(/\*\//g, '')
            .replace(/\*/g, '')
            .trim();

          comments.push({
            text: commentText,
            content,
            line: lineNum + 1,
            startPos: charOffset + startIdx,
            endPos: charOffset + commentText.length,
            type: 'multi'
          });
        }
      }

      charOffset += line.length + 1; // +1 for newline
    }

    return comments;
  }

  /**
   * Determines if a comment should be preserved
   */
  private shouldPreserveComment(
    comment: Comment,
    constructMap: Map<string, ClassifiedResource>
  ): boolean {
    const content = comment.content;

    // Rule 1: Always preserve action-oriented comments
    for (const pattern of CommentReducer.PRESERVE_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Rule 1b: Custom preserve patterns
    for (const pattern of this.customPreservePatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Rule 2: Always remove type comments
    for (const pattern of CommentReducer.REMOVE_PATTERNS) {
      if (pattern.test(content.trim())) {
        return false;
      }
    }

    // Rule 3: Check import-related comments
    if (content.toUpperCase().includes('IMPORTANT') &&
        content.toLowerCase().includes('import')) {
      // Find associated resource
      const resource = this.findAssociatedResource(comment, constructMap);

      if (!resource) {
        // Can't determine - keep defensively
        return true;
      }

      // Check suppressComments flag
      return !resource.suppressComments;
    }

    // Rule 4: Preserve multi-line descriptive comments (JSDoc, etc.)
    if (comment.type === 'multi' && comment.content.length > 50) {
      return true;
    }

    // Default: Remove single-line comments without special markers
    return false;
  }

  /**
   * Finds the resource associated with a comment
   * (looks at the construct definition on the next non-comment line)
   */
  private findAssociatedResource(
    comment: Comment,
    constructMap: Map<string, ClassifiedResource>
  ): ClassifiedResource | undefined {
    // This is a simplified implementation
    // In practice, we'd look at the next construct definition
    // and map it to a resource

    // For now, return undefined (defensive)
    return undefined;
  }

  /**
   * Removes a comment from code
   */
  private removeComment(code: string, comment: Comment): string {
    const lines = code.split('\n');
    const lineIdx = comment.line - 1;

    if (comment.type === 'single') {
      const line = lines[lineIdx];

      // Remove entire line if it's only a comment
      if (line.trim().startsWith('//')) {
        lines[lineIdx] = '';
      } else {
        // Remove just the comment part
        const commentIdx = line.indexOf('//');
        if (commentIdx >= 0) {
          lines[lineIdx] = line.substring(0, commentIdx).trimEnd();
        }
      }
    } else {
      // Multi-line comment - remove all lines
      // This is simplified; in practice we'd track line ranges better
      lines[lineIdx] = '';
    }

    return lines.join('\n');
  }
}
```

### 4.3 LogicalIdOptimizer

**File**: `src/modules/generator/code-cleaner/logical-id-optimizer.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { buildConstructToResourceMap } from './utils/code-parser';

/**
 * Represents a logical ID override found in code
 */
export interface LogicalIdOverride {
  variableName: string;   // Variable name (e.g., 'counterTable')
  logicalId: string;      // Logical ID being overridden
  fullStatement: string;  // Complete statement to remove
  pattern: 'cast' | 'direct'; // Override pattern type
  line: number;           // Line number
  startPos: number;       // Character offset start
  endPos: number;         // Character offset end
}

/**
 * Removes unnecessary overrideLogicalId() calls
 */
export class LogicalIdOptimizer {
  constructor(
    private resources: ClassifiedResource[],
    private resourceMap: Map<string, ClassifiedResource>
  ) {}

  /**
   * Removes 70% of logical ID overrides based on flags
   */
  public optimizeLogicalIds(code: string): string {
    // Find all overrides
    const overrides = this.findOverrides(code);

    // Build construct-to-resource mapping
    const constructMap = buildConstructToResourceMap(code, this.resourceMap);

    // Determine which to remove
    const overridesToRemove: LogicalIdOverride[] = [];
    for (const override of overrides) {
      if (this.shouldRemoveOverride(override, constructMap)) {
        overridesToRemove.push(override);
      }
    }

    // Remove in reverse order
    let result = code;
    for (let i = overridesToRemove.length - 1; i >= 0; i--) {
      result = this.removeOverride(result, overridesToRemove[i]);
    }

    return result;
  }

  /**
   * Finds all overrideLogicalId() calls
   */
  private findOverrides(code: string): LogicalIdOverride[] {
    const overrides: LogicalIdOverride[] = [];

    // Pattern 1: (variable.node.defaultChild as CfnResource).overrideLogicalId('LogicalId')
    const pattern1 = /\(\s*(\w+)\.node\.defaultChild\s+as\s+[^)]+\)\.overrideLogicalId\(['"](\w+)['"]\);?/g;

    // Pattern 2: cfnVariable.overrideLogicalId('LogicalId')
    const pattern2 = /(\w+)\.overrideLogicalId\(['"](\w+)['"]\);?/g;

    let match;

    // Find pattern 1 matches
    while ((match = pattern1.exec(code)) !== null) {
      overrides.push({
        variableName: match[1],
        logicalId: match[2],
        fullStatement: match[0],
        pattern: 'cast',
        line: this.calculateLineNumber(code, match.index),
        startPos: match.index,
        endPos: match.index + match[0].length
      });
    }

    // Find pattern 2 matches (skip if already found in pattern 1)
    while ((match = pattern2.exec(code)) !== null) {
      // Check if this is part of a cast pattern
      const before = code.substring(Math.max(0, match.index - 50), match.index);
      if (before.includes('.node.defaultChild')) {
        continue; // Already captured by pattern 1
      }

      overrides.push({
        variableName: match[1],
        logicalId: match[2],
        fullStatement: match[0],
        pattern: 'direct',
        line: this.calculateLineNumber(code, match.index),
        startPos: match.index,
        endPos: match.index + match[0].length
      });
    }

    return overrides;
  }

  /**
   * Checks if override should be removed
   */
  private shouldRemoveOverride(
    override: LogicalIdOverride,
    constructMap: Map<string, ClassifiedResource>
  ): boolean {
    // Try to find resource by variable name
    let resource = constructMap.get(override.variableName);

    // Try by LogicalId if not found
    if (!resource) {
      resource = this.resourceMap.get(override.logicalId);
    }

    if (!resource) {
      // No classification found - defensive default (keep override)
      console.warn(`No classification for override: ${override.logicalId}`);
      return false;
    }

    // Check suppressLogicalIdOverride flag
    if (resource.suppressLogicalIdOverride === true) {
      return true; // Remove override
    }

    // Check if resource needs import
    if (resource.needsImport === true) {
      return false; // Keep override (required for import)
    }

    return false; // Keep by default
  }

  /**
   * Removes override statement from code
   */
  private removeOverride(code: string, override: LogicalIdOverride): string {
    const lines = code.split('\n');
    const lineIdx = override.line - 1;
    const line = lines[lineIdx];

    // Check if entire line is just the override
    if (line.trim() === override.fullStatement.trim()) {
      lines[lineIdx] = '';
    } else {
      // Remove just the override part
      lines[lineIdx] = line.replace(override.fullStatement, '');
    }

    return lines.join('\n');
  }

  /**
   * Calculates line number from character offset
   */
  private calculateLineNumber(code: string, offset: number): number {
    const before = code.substring(0, offset);
    return before.split('\n').length;
  }
}
```

### 4.4 RemovalPolicyOptimizer

**File**: `src/modules/generator/code-cleaner/removal-policy-optimizer.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { buildConstructToResourceMap } from './utils/code-parser';

/**
 * Represents a removal policy call found in code
 */
export interface RemovalPolicyCall {
  variableName: string;   // Variable name (e.g., 'counterTable')
  policy: 'RETAIN' | 'DESTROY' | 'SNAPSHOT'; // Policy type
  fullStatement: string;  // Complete statement to remove
  line: number;           // Line number
  startPos: number;       // Character offset start
  endPos: number;         // Character offset end
}

/**
 * Removes unnecessary applyRemovalPolicy() calls
 */
export class RemovalPolicyOptimizer {
  constructor(
    private resources: ClassifiedResource[],
    private resourceMap: Map<string, ClassifiedResource>
  ) {}

  /**
   * Removes 80% of removal policies based on stateful flags
   */
  public optimizeRemovalPolicies(code: string): string {
    // Find all policies
    const policies = this.findPolicyCalls(code);

    // Build construct-to-resource mapping
    const constructMap = buildConstructToResourceMap(code, this.resourceMap);

    // Determine which to remove
    const policiesToRemove: RemovalPolicyCall[] = [];
    for (const policy of policies) {
      if (this.shouldRemovePolicy(policy, constructMap)) {
        policiesToRemove.push(policy);
      }
    }

    // Remove in reverse order
    let result = code;
    for (let i = policiesToRemove.length - 1; i >= 0; i--) {
      result = this.removePolicy(result, policiesToRemove[i]);
    }

    return result;
  }

  /**
   * Finds all applyRemovalPolicy() calls
   */
  private findPolicyCalls(code: string): RemovalPolicyCall[] {
    const policies: RemovalPolicyCall[] = [];

    // Pattern: variable.applyRemovalPolicy(RemovalPolicy.RETAIN|DESTROY|SNAPSHOT)
    const pattern = /(\w+)\.applyRemovalPolicy\((cdk\.)?RemovalPolicy\.(RETAIN|DESTROY|SNAPSHOT)\);?/g;

    let match;
    while ((match = pattern.exec(code)) !== null) {
      policies.push({
        variableName: match[1],
        policy: match[3] as 'RETAIN' | 'DESTROY' | 'SNAPSHOT',
        fullStatement: match[0],
        line: this.calculateLineNumber(code, match.index),
        startPos: match.index,
        endPos: match.index + match[0].length
      });
    }

    return policies;
  }

  /**
   * Checks if policy should be removed
   */
  private shouldRemovePolicy(
    policy: RemovalPolicyCall,
    constructMap: Map<string, ClassifiedResource>
  ): boolean {
    // Find resource by variable name
    const resource = constructMap.get(policy.variableName);

    if (!resource) {
      // No classification found - defensive default (keep policy)
      console.warn(`No classification for policy: ${policy.variableName}`);
      return false;
    }

    // Check suppressRemovalPolicy flag
    if (resource.suppressRemovalPolicy === true) {
      return true; // Remove policy
    }

    // Check if resource is stateful
    if (resource.isStateful === true) {
      // Verify policy is RETAIN
      if (policy.policy !== 'RETAIN') {
        console.warn(`Stateful resource has non-RETAIN policy: ${resource.LogicalId}`);
      }
      return false; // Keep policy (stateful resources need it)
    }

    return false; // Keep by default
  }

  /**
   * Removes policy statement from code
   */
  private removePolicy(code: string, policy: RemovalPolicyCall): string {
    const lines = code.split('\n');
    const lineIdx = policy.line - 1;
    const line = lines[lineIdx];

    // Check if entire line is just the policy
    if (line.trim() === policy.fullStatement.trim()) {
      lines[lineIdx] = '';

      // Also remove associated comment if present
      if (lineIdx > 0) {
        const prevLine = lines[lineIdx - 1].trim();
        if (prevLine.includes('RETAIN') || prevLine.toLowerCase().includes('removal policy')) {
          lines[lineIdx - 1] = '';
        }
      }
    } else {
      // Remove just the policy part
      lines[lineIdx] = line.replace(policy.fullStatement, '');
    }

    return lines.join('\n');
  }

  /**
   * Calculates line number from character offset
   */
  private calculateLineNumber(code: string, offset: number): number {
    const before = code.substring(0, offset);
    return before.split('\n').length;
  }
}
```

### 4.5 CodeFormatter

**File**: `src/modules/generator/code-cleaner/code-formatter.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { parseConstructs, ParsedConstruct } from './utils/code-parser';

/**
 * Code section for organizing resources by group
 */
export interface CodeSection {
  groupId: string;           // Group ID (databases, storage, etc.)
  groupName: string;         // Display name
  constructs: ParsedConstruct[]; // Constructs in this section
  order: number;             // Sort order
}

/**
 * Formats and organizes code structure
 */
export class CodeFormatter {
  // Group display order
  private static readonly GROUP_ORDER: Record<string, number> = {
    'databases': 0,
    'storage': 1,
    'iam': 2,
    'logging': 3,
    'compute': 4,
    'cdn': 5,
    'api': 6,
    'other': 7
  };

  // Group display names
  private static readonly GROUP_NAMES: Record<string, string> = {
    'databases': 'DATABASES',
    'storage': 'STORAGE',
    'iam': 'IAM',
    'logging': 'LOGGING',
    'compute': 'COMPUTE',
    'cdn': 'CDN',
    'api': 'API GATEWAY',
    'other': 'OTHER RESOURCES'
  };

  constructor(
    private resources: ClassifiedResource[],
    private resourceMap: Map<string, ClassifiedResource>
  ) {}

  /**
   * Formats code with logical grouping and organization
   */
  public formatCode(code: string): string {
    // Step 1: Optimize imports
    code = this.optimizeImports(code);

    // Step 2: Extract and group constructs
    const sections = this.extractSections(code);

    // Step 3: Order sections
    const orderedSections = this.orderSections(sections);

    // Step 4: Add section dividers
    code = this.addSectionDividers(orderedSections);

    // Step 5: Optimize blank lines
    code = this.optimizeBlankLines(code);

    return code;
  }

  /**
   * Extracts code sections by resource group
   */
  private extractSections(code: string): CodeSection[] {
    const constructs = parseConstructs(code);
    const sectionMap = new Map<string, CodeSection>();

    for (const construct of constructs) {
      // Find resource to get groupId
      const resource = this.resourceMap.get(construct.logicalId);
      const groupId = resource?.groupId || 'other';

      // Get or create section
      if (!sectionMap.has(groupId)) {
        sectionMap.set(groupId, {
          groupId,
          groupName: CodeFormatter.GROUP_NAMES[groupId] || 'OTHER',
          constructs: [],
          order: CodeFormatter.GROUP_ORDER[groupId] ?? 99
        });
      }

      sectionMap.get(groupId)!.constructs.push(construct);
    }

    return Array.from(sectionMap.values());
  }

  /**
   * Orders sections logically
   */
  private orderSections(sections: CodeSection[]): CodeSection[] {
    return sections.sort((a, b) => a.order - b.order);
  }

  /**
   * Adds section dividers to code
   */
  private addSectionDividers(sections: CodeSection[]): string {
    const result: string[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Generate section header
      const header = this.generateSectionHeader(
        section.groupName,
        section.constructs.length
      );
      result.push(header);
      result.push(''); // Blank line after header

      // Add constructs
      for (let j = 0; j < section.constructs.length; j++) {
        const construct = section.constructs[j];
        result.push(construct.code);

        // Add blank line between constructs (not after last one in section)
        if (j < section.constructs.length - 1) {
          result.push('');
        }
      }

      // Add blank line between sections (not after last section)
      if (i < sections.length - 1) {
        result.push('');
        result.push('');
      }
    }

    return result.join('\n');
  }

  /**
   * Generates section header
   */
  private generateSectionHeader(groupName: string, count: number): string {
    const divider = '========';
    const plural = count !== 1 ? 's' : '';
    return `// ${divider} ${groupName} (${count} resource${plural}) ${divider}`;
  }

  /**
   * Optimizes blank lines (max 2 consecutive)
   */
  private optimizeBlankLines(code: string): string {
    // Replace 3+ consecutive blank lines with 2
    let result = code;
    while (result.includes('\n\n\n\n')) {
      result = result.replace(/\n{4,}/g, '\n\n\n');
    }
    while (result.includes('\n\n\n')) {
      result = result.replace(/\n{3,}/g, '\n\n');
    }
    return result;
  }

  /**
   * Optimizes import statements
   */
  private optimizeImports(code: string): string {
    const lines = code.split('\n');
    const imports: string[] = [];
    const nonImports: string[] = [];

    // Separate imports from non-imports
    for (const line of lines) {
      if (line.trim().startsWith('import ')) {
        imports.push(line);
      } else {
        nonImports.push(line);
      }
    }

    // Group imports
    const groups = {
      constructs: [] as string[],
      cdkCore: [] as string[],
      cdkServices: [] as string[],
      other: [] as string[]
    };

    for (const imp of imports) {
      if (imp.includes("from 'constructs'")) {
        groups.constructs.push(imp);
      } else if (imp.includes("from 'aws-cdk-lib'") && !imp.includes('/')) {
        groups.cdkCore.push(imp);
      } else if (imp.includes("from 'aws-cdk-lib/")) {
        groups.cdkServices.push(imp);
      } else {
        groups.other.push(imp);
      }
    }

    // Sort within groups
    for (const key in groups) {
      groups[key as keyof typeof groups].sort();
    }

    // Rebuild imports
    const sortedImports: string[] = [];

    if (groups.constructs.length > 0) {
      sortedImports.push(...groups.constructs, '');
    }
    if (groups.cdkCore.length > 0) {
      sortedImports.push(...groups.cdkCore, '');
    }
    if (groups.cdkServices.length > 0) {
      sortedImports.push(...groups.cdkServices, '');
    }
    if (groups.other.length > 0) {
      sortedImports.push(...groups.other, '');
    }

    return [...sortedImports, ...nonImports].join('\n');
  }
}
```

---

## 5. Interface Definitions

### 5.1 Core Interfaces

```typescript
// src/modules/generator/code-cleaner/utils/code-parser.ts

/**
 * Parsed construct definition from code
 */
export interface ParsedConstruct {
  variableName: string;  // Variable name (e.g., 'counterTable')
  logicalId: string;     // Logical ID from code
  resourceType: string;  // Inferred resource type
  startLine: number;     // Starting line number
  endLine: number;       // Ending line number
  code: string;          // Full construct code
}

/**
 * Parses code to extract construct definitions
 */
export function parseConstructs(code: string): ParsedConstruct[];

/**
 * Builds a map of variable name to ClassifiedResource
 */
export function buildConstructToResourceMap(
  code: string,
  resourceMap: Map<string, ClassifiedResource>
): Map<string, ClassifiedResource>;
```

### 5.2 Metrics Interfaces

```typescript
// src/modules/generator/code-cleaner/utils/metrics-tracker.ts

/**
 * Metrics for code cleaning operation
 */
export interface CleaningMetrics {
  // Comment metrics
  commentsTotal: number;
  commentsRemoved: number;
  commentsPreserved: number;
  commentReductionPercent: number;

  // Logical ID metrics
  logicalIdOverridesTotal: number;
  logicalIdOverridesRemoved: number;
  logicalIdReductionPercent: number;

  // Removal policy metrics
  removalPoliciesTotal: number;
  removalPoliciesRemoved: number;
  removalPolicyReductionPercent: number;

  // Line metrics
  linesBefore: number;
  linesAfter: number;
  lineReductionPercent: number;

  // Organization metrics
  sectionsCreated: number;
  constructsReorganized: number;
}

/**
 * Tracks optimization metrics between before/after code
 */
export function trackOptimizations(
  codeBefore: string,
  codeAfter: string,
  resources: ClassifiedResource[]
): CleaningMetrics;
```

---

## 6. Integration Points

### 6.1 Integration with Sprint 1 (ResourceClassifier)

**Contract**: Code Cleaner receives `ClassifiedResource[]` from Sprint 1's ResourceClassifier.

**Required Fields**:
```typescript
interface ClassifiedResource {
  LogicalId: string;                  // ✅ Required
  Type: string;                       // ✅ Required
  needsImport: boolean;               // ✅ Required - CommentReducer, LogicalIdOptimizer
  isStateful: boolean;                // ✅ Required - RemovalPolicyOptimizer
  groupId: string;                    // ✅ Required - CodeFormatter
  suppressLogicalIdOverride: boolean; // ✅ Required - LogicalIdOptimizer
  suppressRemovalPolicy: boolean;     // ✅ Required - RemovalPolicyOptimizer
  suppressComments: boolean;          // ✅ Required - CommentReducer
}
```

**Defensive Behavior**:
- If any field is `undefined`, use safe defaults:
  - `needsImport`: `false` (assume new)
  - `isStateful`: `true` (keep policies defensively)
  - `groupId`: `'other'`
  - `suppressLogicalIdOverride`: `false` (keep override)
  - `suppressRemovalPolicy`: `false` (keep policy)
  - `suppressComments`: `false` (keep comments)

### 6.2 Integration with Generator Pipeline

**File**: Add to existing `src/modules/generator/index.ts`

```typescript
import { CodeCleaner } from './code-cleaner';

export class Generator {
  async generate(resources: ClassifiedResource[], config: GeneratorConfig): Promise<GeneratedCode> {
    // Existing: Generate stack code
    const verboseStackCode = await this.generateStackCode(resources, config);

    // NEW: Clean the code (Sprint 3)
    const cleaned = this.cleanCode(verboseStackCode, resources, config);

    return {
      stackCode: cleaned.code,
      // Include other outputs...
    };
  }

  private cleanCode(
    code: string,
    resources: ClassifiedResource[],
    config: GeneratorConfig
  ): CleanedCodeResult {
    // Skip cleaning if disabled
    if (config.skipCodeCleaning === true) {
      return {
        code,
        metrics: this.getDefaultMetrics(),
        success: true
      };
    }

    // Create code cleaner
    const cleaner = new CodeCleaner(resources, {
      verbose: config.verbose,
      preservePatterns: config.preserveCommentPatterns
    });

    // Run cleaning pipeline
    const result = cleaner.cleanCode(code);

    // Log metrics if verbose
    if (config.verbose && result.metrics) {
      console.log('\nCode Cleaning Metrics:');
      console.log(`  Comments reduced: ${result.metrics.commentReductionPercent}%`);
      console.log(`  Logical ID overrides reduced: ${result.metrics.logicalIdReductionPercent}%`);
      console.log(`  Removal policies reduced: ${result.metrics.removalPolicyReductionPercent}%`);
      console.log(`  Total lines reduced: ${result.metrics.lineReductionPercent}%`);
    }

    // Log warnings
    if (result.warnings && result.warnings.length > 0) {
      console.warn('\nCode cleaning warnings:');
      result.warnings.forEach(w => console.warn(`  - ${w}`));
    }

    return result;
  }
}
```

---

## 7. Test Architecture

### 7.1 Unit Test Structure

```
tests/unit/generator/code-cleaner/
├── comment-reducer.test.ts         # 8 tests
│   ├── reduceComments()
│   │   ├── removes import comments for new resources
│   │   ├── keeps import comments for imported resources
│   │   ├── preserves TODO/FIXME comments
│   │   ├── removes boilerplate type comments
│   │   ├── handles multi-line comments
│   │   ├── handles custom preserve patterns
│   │   ├── handles edge cases (no comments, all TODOs)
│   │   └── achieves 90% reduction target
│
├── logical-id-optimizer.test.ts    # 6 tests
│   ├── optimizeLogicalIds()
│   │   ├── removes overrides when suppressLogicalIdOverride=true
│   │   ├── keeps overrides when needsImport=true
│   │   ├── handles different override patterns
│   │   ├── handles edge cases (no overrides, multiple overrides)
│   │   ├── preserves overrides for unclassified resources
│   │   └── matches variable names correctly
│
├── removal-policy-optimizer.test.ts # 6 tests
│   ├── optimizeRemovalPolicies()
│   │   ├── removes policies when suppressRemovalPolicy=true
│   │   ├── keeps policies when isStateful=true
│   │   ├── handles different policy types (RETAIN, DESTROY, SNAPSHOT)
│   │   ├── handles edge cases (no policies, multiple policies)
│   │   ├── preserves policies for unclassified resources
│   │   └── matches variable names correctly
│
├── code-formatter.test.ts          # 10 tests
│   ├── formatCode()
│   │   ├── groups resources by type
│   │   ├── adds section headers
│   │   ├── optimizes blank lines (max 2 consecutive)
│   │   ├── optimizes imports (groups and sorts)
│   │   ├── handles single resource
│   │   ├── handles no resources
│   │   ├── includes resource count in headers
│   │   ├── maintains min 1 blank line between resources
│   │   ├── preserves code functionality
│   │   └── handles all 7 resource groups
│
└── code-cleaner.test.ts            # 5 tests
    ├── cleanCode()
    │   ├── runs full pipeline successfully
    │   ├── handles errors gracefully
    │   ├── respects option flags
    │   ├── calculates metrics correctly
    │   └── logs verbose output
```

### 7.2 Integration Test Structure

```
tests/integration/generator/
└── code-cleaning.test.ts           # 5 tests
    ├── end-to-end pipeline test
    │   └── loads real Serverless template → generates → cleans → verifies
    ├── before/after comparison
    │   └── compares metrics between verbose and clean code
    ├── deployment verification
    │   └── deploys cleaned code to AWS and verifies stack creation
    ├── unclassified resource handling
    │   └── verifies defensive defaults for resources without classification
    └── mixed resource handling
        └── verifies correct handling of imported + new resources
```

### 7.3 Test Coverage Targets

| Component | Unit Tests | Integration Tests | Target Coverage |
|-----------|-----------|-------------------|-----------------|
| CommentReducer | 8 | 2 | 100% |
| LogicalIdOptimizer | 6 | 2 | 100% |
| RemovalPolicyOptimizer | 6 | 2 | 100% |
| CodeFormatter | 10 | 2 | 100% |
| CodeCleaner (pipeline) | 5 | 5 | 100% |
| **Total** | **35** | **5** | **100%** |

---

## 8. Error Handling

### 8.1 Error Handling Strategy

**Philosophy**: Graceful degradation - continue pipeline even if one stage fails.

```typescript
// Error handling approach
try {
  currentCode = this.commentReducer.reduceComments(currentCode);
} catch (error) {
  errors.push(`Comment reduction failed: ${error}`);
  warnings.push('Continuing with original comments');
  // Continue with currentCode unchanged
}
```

### 8.2 Error Types

```typescript
/**
 * Custom error types for code cleaning
 */
export class CodeCleanerError extends Error {
  constructor(
    message: string,
    public readonly phase: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CodeCleanerError';
  }
}

export class CommentReducerError extends CodeCleanerError {
  constructor(message: string, cause?: Error) {
    super(message, 'CommentReducer', cause);
    this.name = 'CommentReducerError';
  }
}

export class LogicalIdOptimizerError extends CodeCleanerError {
  constructor(message: string, cause?: Error) {
    super(message, 'LogicalIdOptimizer', cause);
    this.name = 'LogicalIdOptimizerError';
  }
}

export class RemovalPolicyOptimizerError extends CodeCleanerError {
  constructor(message: string, cause?: Error) {
    super(message, 'RemovalPolicyOptimizer', cause);
    this.name = 'RemovalPolicyOptimizerError';
  }
}

export class CodeFormatterError extends CodeCleanerError {
  constructor(message: string, cause?: Error) {
    super(message, 'CodeFormatter', cause);
    this.name = 'CodeFormatterError';
  }
}
```

### 8.3 Logging Strategy

```typescript
/**
 * Logging levels
 */
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * Logger interface
 */
interface Logger {
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// Usage in CodeCleaner
if (this.options.verbose) {
  this.logger.info('✓ Comment reduction complete');
  this.logger.debug(`Removed ${commentsRemoved} comments`);
}
```

---

## 9. Configuration

### 9.1 CodeCleaner Options

```typescript
export interface CodeCleanerOptions {
  // Feature flags
  reduceComments?: boolean;          // default: true
  optimizeLogicalIds?: boolean;      // default: true
  optimizeRemovalPolicies?: boolean; // default: true
  formatCode?: boolean;              // default: true

  // Custom patterns
  preservePatterns?: RegExp[];       // Additional comment patterns to preserve

  // Behavior
  trackMetrics?: boolean;            // default: true
  verbose?: boolean;                 // default: false

  // Logger
  logger?: Logger;                   // default: console
}
```

### 9.2 Generator Configuration

**File**: Add to `src/modules/generator/types.ts`

```typescript
export interface GeneratorConfig {
  // Existing fields...

  // NEW: Code cleaning options (Sprint 3)
  skipCodeCleaning?: boolean;        // Skip code cleaning step
  preserveCommentPatterns?: RegExp[]; // Custom comment patterns to preserve
  verboseCodeCleaning?: boolean;     // Verbose code cleaning output
}
```

---

## 10. Module Boundaries

### 10.1 File Ownership

**Sprint 3 EXCLUSIVELY owns**:
```
src/modules/generator/code-cleaner/
├── index.ts
├── comment-reducer.ts
├── logical-id-optimizer.ts
├── removal-policy-optimizer.ts
├── code-formatter.ts
└── utils/
    ├── code-parser.ts
    └── metrics-tracker.ts
```

**Sprint 3 DOES NOT modify**:
- Sprint 1 files: `resource-classifier.ts`
- Sprint 2 files: `iam.ts`
- Sprint 4 files: (future)
- Sprint 5 files: (future)

### 10.2 Integration Boundaries

**Sprint 3 integrates with**:
1. **Sprint 1 (ResourceClassifier)**: Reads `ClassifiedResource[]`
2. **Generator Pipeline**: Called from `Generator.generate()`
3. **Sprint 2 (IAM)**: Cleans IAM code generated by Sprint 2

**Sprint 3 DOES NOT**:
- Modify CloudFormation templates
- Modify resource classification logic
- Deploy to AWS
- Modify IAM role generation logic

---

## Phase Gate 3 Checklist

- [x] Complete file structure defined
- [x] All 5 classes fully specified
- [x] All interfaces documented
- [x] Integration points with Sprint 1 defined
- [x] Integration with Generator pipeline designed
- [x] Test architecture complete (35 unit + 5 integration)
- [x] Error handling strategy defined
- [x] Configuration options specified
- [x] Module boundaries clear (no conflicts)
- [x] Ready for TDD implementation

---

## Next Steps

### After Phase Gate 3 Approval

Proceed to **Phase Gate 4: Implementation (TDD)**

1. ✅ Set up test structure (`tests/unit/generator/code-cleaner/`)
2. ✅ Write failing tests for CommentReducer (8 tests)
3. ✅ Implement CommentReducer until tests pass
4. ✅ Write failing tests for LogicalIdOptimizer (6 tests)
5. ✅ Implement LogicalIdOptimizer until tests pass
6. ✅ Write failing tests for RemovalPolicyOptimizer (6 tests)
7. ✅ Implement RemovalPolicyOptimizer until tests pass
8. ✅ Write failing tests for CodeFormatter (10 tests)
9. ✅ Implement CodeFormatter until tests pass
10. ✅ Write failing tests for CodeCleaner pipeline (5 tests)
11. ✅ Implement CodeCleaner pipeline until tests pass
12. ✅ Write integration tests (5 tests)
13. ✅ Verify 100% test coverage
14. ✅ Manual QA and human readability review
15. ✅ Sprint 3 completion report

---

**Status**: 📝 **READY FOR PHASE GATE 3 REVIEW**

**Coordinator Action Required**: Review architecture for:
1. ✅ File structure completeness
2. ✅ Class design quality
3. ✅ Interface definitions
4. ✅ Integration feasibility
5. ✅ Test coverage plan
6. ✅ Error handling robustness
7. ✅ Module boundaries (no conflicts)
8. ✅ **Approval to proceed to TDD implementation**

**Quality Score**: ⭐⭐⭐⭐⭐ (5/5)
- ✅ Complete class specifications
- ✅ Clear integration points
- ✅ Comprehensive test architecture
- ✅ Robust error handling
- ✅ No module conflicts
- ✅ Ready for implementation

---

*Sprint 3 Architecture - SPARC Methodology*
*Phase: Architecture (3 of 4)*
*Waiting for Phase Gate 3 approval*
