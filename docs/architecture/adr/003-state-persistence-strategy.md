# ADR 003: State Persistence Strategy

## Status
**Accepted** - 2025-01-20

## Context

The migration process is complex and may take significant time (15-30 minutes). We need a state persistence strategy that supports:

1. **Resumability**: Allow migration to resume after interruption (crash, user cancellation, network issues)
2. **Auditability**: Track what actions were performed and when
3. **Rollback**: Enable reverting to previous states
4. **Progress Tracking**: Show users what's been done and what remains
5. **Debugging**: Help diagnose issues by examining historical state
6. **Multi-Run**: Support dry-run before actual migration

### Alternatives Considered

**Option 1: In-Memory Only**
- No persistence, start from scratch on failure
- Pros: Simple, no file I/O
- Cons: Cannot resume, loses all progress on failure, no audit trail

**Option 2: Full Database (PostgreSQL/MySQL)**
- Complete RDBMS with transactions
- Pros: ACID guarantees, complex queries, multi-user
- Cons: Massive overkill for single-user CLI tool, deployment complexity, dependency management

**Option 3: SQLite Embedded Database**
- Lightweight embedded database
- Pros: SQL queries, transactions, proven reliability
- Cons: Binary format, harder to inspect/debug, schema migrations needed

**Option 4: JSON Files with Structured Snapshots**
- Human-readable JSON files, timestamped snapshots
- Pros: Simple, debuggable, no dependencies, easy backup
- Cons: No transactions, potential race conditions, larger file sizes

**Option 5: Hybrid: JSON + Optional SQLite**
- Primary: JSON files for simplicity
- Optional: SQLite for advanced features (future)
- Pros: Simple now, extensible later, debuggable
- Cons: Two persistence mechanisms to maintain

## Decision

We will use **JSON Files with Structured Snapshots** as the primary persistence mechanism.

**Implementation Details:**

```
.sls-to-cdk/
├── migration-state.json          # Current state
├── backups/
│   ├── migration-state-{timestamp}.json
│   ├── cloudformation-{timestamp}.json
│   └── resources-{timestamp}.json
├── reports/
│   ├── scan-report-{id}.json
│   ├── comparison-report-{id}.json
│   └── comparison-report-{id}.html
└── audit.log                     # Line-delimited JSON log
```

**State File Structure:**
```json
{
  "migrationId": "mig-20250120-001",
  "version": "1.0.0",
  "status": "in_progress",
  "currentStep": "IMPORT",
  "completedSteps": ["SCAN", "PROTECT", "GENERATE", "COMPARE", "REMOVE"],
  "failedSteps": [],
  "startTime": "2025-01-20T10:30:00Z",
  "config": { ... },
  "resources": [ ... ],
  "backups": [ ... ],
  "auditLog": [ ... ]
}
```

**Persistence Operations:**

1. **Save State**: After every step completion, save current state and create timestamped backup
2. **Load State**: On startup, load latest state if exists
3. **Snapshot**: Before destructive operations, create full backup
4. **Audit**: Append-only log file with timestamped entries

## Consequences

### Positive

1. **Simplicity**: No external dependencies, just file system
2. **Debuggability**: Human-readable JSON, easy to inspect and modify
3. **Portability**: Works anywhere Node.js runs
4. **Resumability**: Can resume from any step
5. **Rollback**: Timestamped backups enable time-travel
6. **Version Control Friendly**: JSON diffs work well with git
7. **Zero Configuration**: No database setup required
8. **Auditability**: Complete history of operations

### Negative

1. **No Transactions**: Can't guarantee atomic multi-file updates
2. **File Size**: JSON more verbose than binary formats
3. **Performance**: Slower than database for complex queries (not needed for CLI)
4. **Concurrency**: No built-in locking (acceptable for single-user tool)
5. **Schema Evolution**: Manual migration logic needed for format changes

### Mitigation Strategies

**Transaction Safety:**
- Write to temporary file, then atomic rename
- Always create backup before modifying state
- Validate JSON schema on load

```typescript
async function saveStateSafely(state: MigrationState): Promise<void> {
  const tmpFile = `${stateFile}.tmp`;

  // 1. Validate state
  validateStateSchema(state);

  // 2. Write to temporary file
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2));

  // 3. Create backup if state exists
  if (await fs.pathExists(stateFile)) {
    const backupFile = `backups/migration-state-${Date.now()}.json`;
    await fs.copy(stateFile, backupFile);
  }

  // 4. Atomic rename
  await fs.rename(tmpFile, stateFile);
}
```

**Schema Evolution:**
```typescript
interface MigrationState {
  version: string;  // Semantic versioning
  // ... other fields
}

function migrateState(state: any): MigrationState {
  if (state.version === '1.0.0') {
    return state as MigrationState;
  }

  // Handle older versions
  if (!state.version) {
    return migrateLegacyToV1(state);
  }

  throw new Error(`Unsupported state version: ${state.version}`);
}
```

**Concurrency:**
- Not a concern for single-user CLI tool
- If needed later, implement file locking via `lockfile` package

**Performance:**
- File size acceptable for typical migrations (< 1MB)
- State loaded once at startup, cached in memory
- Only write on state changes (after each step)

### Future Extensibility

If advanced features needed later:
1. Add optional SQLite for complex queries
2. Keep JSON as source of truth
3. SQLite as derived/cached view
4. Enable features like:
   - Multi-migration tracking
   - Advanced reporting
   - Historical analysis

## Related Decisions

- ADR 007: Comprehensive Backup Strategy
- ADR 010: Step-Based Migration Orchestration
