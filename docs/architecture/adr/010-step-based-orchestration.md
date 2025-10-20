# ADR 010: Step-Based Migration Orchestration

## Status
**Accepted** - 2025-01-20

## Context

The migration from Serverless to CDK is complex with multiple phases, each with potential failure points:
1. Resource discovery
2. Resource protection
3. CDK code generation
4. Template comparison
5. Resource removal from Serverless
6. Resource import to CDK
7. CDK stack deployment
8. Migration verification
9. Cleanup

We need an orchestration strategy that:
- Provides clear progress visibility
- Supports resumability after failures
- Enables rollback to previous states
- Allows skipping or retrying individual steps
- Validates prerequisites before destructive operations
- Provides appropriate approval points

### Alternatives Considered

**Option 1: Monolithic Single-Pass Migration**
- Execute all operations in one go
- Pros: Simple implementation, fast execution
- Cons: No resumability, all-or-nothing, hard to debug failures, no user control

**Option 2: Event-Driven Workflow**
- Events trigger state transitions
- Pros: Flexible, reactive, decoupled
- Cons: Complex for linear workflow, over-engineered, harder to debug sequence

**Option 3: Step-Based State Machine**
- Defined steps executed sequentially
- State persisted after each step
- Each step validates prerequisites
- Pros: Resumable, debuggable, clear progress, user control
- Cons: More implementation complexity than monolithic

**Option 4: DAG-Based Workflow Engine**
- Directed acyclic graph of tasks
- Pros: Handles complex dependencies, parallel execution
- Cons: Overkill for linear workflow, external dependency (Airflow, etc.)

## Decision

We will implement a **Step-Based State Machine** with the following characteristics:

**Migration Steps:**
```typescript
enum MigrationStep {
  SCAN = 'SCAN',           // Discover resources
  PROTECT = 'PROTECT',     // Add deletion policies
  GENERATE = 'GENERATE',   // Generate CDK code
  COMPARE = 'COMPARE',     // Compare templates
  REMOVE = 'REMOVE',       // Remove from Serverless
  IMPORT = 'IMPORT',       // Import to CDK
  DEPLOY = 'DEPLOY',       // Deploy CDK stack
  VERIFY = 'VERIFY',       // Verify migration
  CLEANUP = 'CLEANUP'      // Optional cleanup
}
```

**State Machine Properties:**

1. **Linear Progression**: Steps execute in order
2. **State Persistence**: State saved after each step
3. **Prerequisite Validation**: Each step validates requirements before execution
4. **Resumability**: Can resume from any step
5. **Rollback**: Can rollback to previous steps
6. **Approval Gates**: User approval required for destructive operations

**State Transitions:**

```
INITIALIZED
    ↓
  SCAN ────────→ (resources discovered)
    ↓
 PROTECT ──────→ (deletion policies set)
    ↓
 GENERATE ─────→ (CDK code created)
    ↓
 COMPARE ──────→ (templates match)
    ↓                ↓ (mismatch)
    │           [FIX CDK CODE]
    │                ↓
    │          retry COMPARE
    ↓
 REMOVE ───────→ (resources orphaned)
    ↓
 IMPORT ───────→ (resources in CDK)
    ↓
 DEPLOY ───────→ (stack deployed)
    ↓
 VERIFY ───────→ (no drift)
    ↓
 CLEANUP ──────→ (optional)
    ↓
 COMPLETED
```

**Implementation:**

```typescript
class MigrationStateMachine {
  private readonly STEPS = [
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
    // 1. Validate prerequisites
    await this.validatePrerequisites(step);

    // 2. Request approval if needed
    if (this.requiresApproval(step) && this.config.interactive) {
      await this.requestApproval(step);
    }

    // 3. Execute step
    const result = await this.runStep(step);

    // 4. Verify result
    if (this.config.verifyAfterEachStep) {
      await this.verifyStep(step);
    }

    // 5. Save state
    await this.saveState();

    return result;
  }

  async runMigration(mode: 'interactive' | 'automatic'): Promise<MigrationResult> {
    for (const step of this.STEPS) {
      // Skip completed steps (for resume)
      if (this.state.completedSteps.includes(step)) {
        continue;
      }

      const result = await this.executeStep(step);

      if (!result.success) {
        return { success: false, failedStep: step };
      }
    }

    return { success: true };
  }
}
```

## Consequences

### Positive

1. **Resumability**: Migration can resume from last successful step after crash/cancellation
2. **User Control**: Users can approve destructive operations before execution
3. **Progress Visibility**: Clear indication of current step and remaining work
4. **Debugging**: Can examine state after each step to diagnose issues
5. **Flexibility**: Can skip steps (e.g., cleanup), retry failed steps
6. **Rollback**: Can revert to previous steps if needed
7. **Testing**: Each step can be tested independently
8. **Auditability**: Complete record of what was executed when
9. **Validation**: Prerequisites checked before destructive operations
10. **Dry-Run**: Can simulate execution without making changes

### Negative

1. **Complexity**: More code than monolithic approach
2. **Performance**: State persistence adds overhead (minimal)
3. **Rigidity**: Linear flow may not support all future scenarios
4. **State Management**: Must carefully design state persistence

### Step Design Guidelines

Each step must:

1. **Idempotent**: Re-executing a completed step has no effect
2. **Validated**: Check prerequisites before execution
3. **Logged**: Record all actions and outcomes
4. **Reversible**: Support rollback where possible
5. **Atomic**: Complete fully or fail cleanly
6. **Informative**: Provide clear progress and error messages

Example step implementation:
```typescript
async executeScan(): Promise<StepResult> {
  try {
    // Validate
    if (!await this.serverlessExists()) {
      throw new Error('serverless.yml not found');
    }

    // Execute
    const scanner = new ScannerModule(this.config);
    const inventory = await scanner.scan();

    // Update state
    this.state.resources = inventory.resources;

    // Log
    this.logger.info(`Discovered ${inventory.resources.length} resources`);

    return {
      success: true,
      step: MigrationStep.SCAN,
      data: inventory
    };
  } catch (error) {
    return {
      success: false,
      step: MigrationStep.SCAN,
      error: error.message
    };
  }
}
```

### Approval Gates

Steps requiring approval:
- **PROTECT**: Deploys changes to Serverless stack
- **REMOVE**: Removes resources from Serverless stack
- **IMPORT**: Imports resources to CDK stack
- **DEPLOY**: Deploys CDK stack
- **CLEANUP**: Removes old Serverless stack

Approval can be bypassed with `--auto-approve` flag.

### Rollback Strategy

Rollback reverses steps in reverse order:
```
Current: IMPORT
Rollback to: COMPARE

Actions:
1. Remove resources from CDK stack
2. Re-add resources to Serverless stack
3. Restore CloudFormation template from backup
4. Update migration state
```

Limitations:
- Cannot rollback VERIFY or CLEANUP (read-only)
- DEPLOY rollback deletes CDK stack (destructive)
- REMOVE rollback requires Serverless stack to still exist

## Related Decisions

- ADR 003: State Persistence Strategy (enables resumability)
- ADR 005: Interactive and Automatic Migration Modes (approval gates)
- ADR 007: Comprehensive Backup Strategy (enables rollback)
- ADR 002: Modular Architecture (each step delegates to modules)
