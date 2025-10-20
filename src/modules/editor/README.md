# Editor Module

Programmatically modify CloudFormation templates to safely remove resources while maintaining template integrity.

## Features

- **Safe Resource Removal**: Remove single or multiple resources with automatic dependency updates
- **Dependency Management**: Automatically update DependsOn references and detect circular dependencies
- **Template Validation**: Comprehensive validation of CloudFormation template syntax and semantics
- **Automatic Backups**: Create timestamped backups before any modification
- **Dry Run Mode**: Preview changes without modifying the template
- **Error Recovery**: Restore templates from backups if needed

## Installation

```typescript
import { Editor } from './modules/editor';
```

## Usage

### Basic Usage

```typescript
// Initialize editor
const editor = new Editor({
  backupDirectory: './.sls-to-cdk/backups',
  autoBackup: true,
  autoValidate: true
});

// Load template
const template = await editor.loadTemplate('./template.json');

// Remove a single resource
const result = await editor.removeResource(template, 'LogGroup');

console.log(`Removed: ${result.removedResources.join(', ')}`);
console.log(`Updated dependencies: ${result.updatedDependencies.length}`);
console.log(`Backup: ${result.backupPath}`);

// Save modified template
await editor.saveTemplate(template, './modified-template.json');
```

### Batch Removal

```typescript
// Remove multiple resources atomically
const result = await editor.removeResources(
  template,
  ['LogGroup1', 'LogGroup2', 'Bucket'],
  {
    createBackup: true,
    validate: true,
    updateDependencies: true
  }
);

if (result.success) {
  console.log(`Removed ${result.removedResources.length} resources`);
  console.log(`Updated ${result.updatedDependencies.length} dependencies`);
}

// Check warnings
result.warnings.forEach(warning => console.warn(warning));
```

### Dry Run

```typescript
// Preview changes without modifying
const result = await editor.removeResource(
  template,
  'CounterLogGroup',
  { dryRun: true }
);

console.log('Would remove:', result.removedResources);
console.log('Would update:', result.updatedDependencies);
console.log('Warnings:', result.warnings);
```

### Dependency Analysis

```typescript
// Find resources that depend on a target
const dependents = editor.findDependents(template, 'MyTable');
console.log('Explicit dependents:', dependents.explicit);
console.log('Implicit dependents:', dependents.implicit);

// Find all dependencies of a resource
const deps = editor.findDependencies(template, 'MyFunction');
console.log('Dependencies:', deps);

// Build complete dependency graph
const graph = editor.buildDependencyGraph(template);

// Detect circular dependencies
const cycles = editor.detectCircularDependencies(template);
if (cycles.length > 0) {
  console.error('Circular dependencies detected:', cycles);
}
```

### Template Validation

```typescript
// Validate template
const validation = editor.validateTemplate(template);

if (!validation.valid) {
  console.error('Errors:', validation.errors);
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}
```

### Backup Management

```typescript
// Create backup
const backupPath = await editor.createBackup(template);
console.log('Backup created:', backupPath);

// List all backups
const backups = await editor.listBackups();
backups.forEach(backup => {
  console.log(`${backup.filename} - ${backup.timestamp}`);
});

// Restore from backup
const restored = await editor.restoreBackup(backupPath);

// Get latest backup
const latest = await editor.getLatestBackup();

// Cleanup old backups (keep 10 most recent)
const deleted = await editor.cleanupBackups(10);
console.log(`Deleted ${deleted} old backups`);
```

### Add and Update Resources

```typescript
// Add a new resource
await editor.addResource(
  template,
  'NewLogGroup',
  {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: '/aws/lambda/new-function',
      RetentionInDays: 7
    }
  }
);

// Update resource properties
await editor.updateResource(
  template,
  'ExistingLogGroup',
  { RetentionInDays: 14 }
);
```

## API Reference

### Editor Class

#### Constructor

```typescript
new Editor(config?: EditorConfig)
```

**EditorConfig:**
- `backupDirectory?: string` - Directory for backup files (default: `./.sls-to-cdk/backups`)
- `autoBackup?: boolean` - Auto-create backups before modifications (default: `true`)
- `autoValidate?: boolean` - Auto-validate after modifications (default: `true`)
- `verbose?: boolean` - Verbose logging (default: `false`)

#### Methods

**Template Operations:**
- `loadTemplate(path: string): Promise<CloudFormationTemplate>`
- `saveTemplate(template, outputPath, options?): Promise<void>`

**Resource Modification:**
- `removeResource(template, logicalId, options?): Promise<ModificationResult>`
- `removeResources(template, logicalIds[], options?): Promise<ModificationResult>`
- `addResource(template, logicalId, resource, options?): Promise<ModificationResult>`
- `updateResource(template, logicalId, properties, options?): Promise<ModificationResult>`

**Dependency Management:**
- `updateDependencies(template, removedIds[]): DependencyUpdate[]`
- `findDependents(template, targetId): { explicit: string[], implicit: string[] }`
- `findDependencies(template, resourceId): string[]`
- `buildDependencyGraph(template): Map<string, Set<string>>`
- `detectCircularDependencies(template): string[][]`

**Validation:**
- `validateTemplate(template): ValidationResult`

**Backup Management:**
- `createBackup(template, backupPath?): Promise<string>`
- `restoreBackup(backupPath): Promise<CloudFormationTemplate>`
- `listBackups(directory?): Promise<BackupInfo[]>`
- `cleanupBackups(keepCount?): Promise<number>`
- `getLatestBackup(): Promise<BackupInfo | null>`

### Types

#### RemovalOptions

```typescript
interface RemovalOptions {
  createBackup?: boolean;      // Create backup before removal (default: true)
  validate?: boolean;          // Validate after removal (default: true)
  updateDependencies?: boolean; // Update DependsOn references (default: true)
  dryRun?: boolean;            // Preview without modifying (default: false)
  backupPath?: string;         // Custom backup path
}
```

#### ModificationResult

```typescript
interface ModificationResult {
  success: boolean;
  removedResources: string[];
  updatedDependencies: DependencyUpdate[];
  warnings: string[];
  errors?: string[];
  backupPath?: string;
  template?: CloudFormationTemplate;
}
```

#### DependencyUpdate

```typescript
interface DependencyUpdate {
  resourceId: string;    // Resource whose dependencies changed
  before: string[];      // Dependencies before update
  after: string[];       // Dependencies after update
  type: 'explicit' | 'implicit';
}
```

#### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

## Implementation Details

### Resource Removal Process

1. **Validation**: Verify resource exists
2. **Backup**: Create automatic backup (if enabled)
3. **Dependency Analysis**: Find explicit and implicit dependents
4. **Removal**: Delete resource from template
5. **Update Dependencies**: Remove DependsOn references
6. **Validation**: Validate modified template
7. **Return Results**: Report removed resources, updated dependencies, and warnings

### Dependency Detection

**Explicit Dependencies:**
- DependsOn attribute

**Implicit Dependencies:**
- `Ref` intrinsic function
- `Fn::GetAtt` intrinsic function
- `Fn::Sub` with resource references

### Topological Sorting

When removing multiple resources, the editor performs topological sorting to determine safe removal order:
1. Build dependency graph
2. Sort resources (dependents first)
3. Remove in reverse dependency order
4. Update all DependsOn references

### Circular Dependency Detection

Uses DFS (Depth-First Search) algorithm to detect cycles in the dependency graph:
- Traverses all resources
- Tracks visiting stack
- Identifies back edges indicating cycles

## Error Handling

All errors are thrown as `EditorError` with specific error codes:

```typescript
enum EditorErrorCode {
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BACKUP_FAILED = 'BACKUP_FAILED',
  RESTORE_FAILED = 'RESTORE_FAILED',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  MODIFICATION_FAILED = 'MODIFICATION_FAILED'
}
```

Example:

```typescript
try {
  await editor.removeResource(template, 'NonExistent');
} catch (error) {
  if (error instanceof EditorError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

## Best Practices

1. **Always Use Backups**: Keep automatic backups enabled for safety
2. **Validate Templates**: Enable auto-validation to catch issues early
3. **Check Warnings**: Review warnings about dependent resources
4. **Use Dry Run**: Preview changes before applying them
5. **Cleanup Backups**: Periodically cleanup old backups to save space
6. **Handle Dependencies**: Check for implicit dependencies (Ref, GetAtt) manually
7. **Test Thoroughly**: Validate templates after modifications

## Module Structure

```
editor/
├── index.ts                  # Main Editor facade
├── types.ts                  # Type definitions
├── template-editor.ts        # Core editing operations
├── dependency-updater.ts     # Dependency management
├── validator.ts              # Template validation
├── backup-manager.ts         # Backup operations
└── README.md                 # This file
```

## Examples

See `tests/modules/editor/editor.test.ts` for comprehensive examples and usage patterns.
