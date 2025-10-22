# SPARC Implementation Plan: In-Place CDK Generation

## Document Version
- **Version**: 1.0.0
- **Date**: 2025-10-21
- **Feature**: In-Place CDK Generation
- **Reference**: FEATURE_IN_PLACE_CDK.md

---

# Phase 1: SPECIFICATION 📋

## 1.1 Functional Requirements

### FR-1: Optional Target Parameter
**ID**: FR-1
**Priority**: HIGH
**Description**: The `--target` CLI parameter shall be optional instead of required.

**Current State**:
```typescript
// src/cli/commands/migrate.ts:61
} else if (options.source && options.target) {
```

**Desired State**:
```typescript
} else if (options.source) {
  const targetDir = options.target || path.join(options.source, 'cdk');
```

**Acceptance Criteria**:
- Given the user runs `npm run migrate -- --source ./my-project`
- When no `--target` parameter is provided
- Then the migration should proceed successfully
- And the target should default to `./my-project/cdk`

**Test Cases**:
```typescript
describe('FR-1: Optional Target Parameter', () => {
  it('should accept migration command without --target', () => {
    const args = ['--source', './test-project'];
    const parsed = parseCliArgs(args);
    expect(parsed.source).toBe('./test-project');
    expect(parsed.target).toBeUndefined();
  });

  it('should still accept --target when provided', () => {
    const args = ['--source', './test-project', '--target', './cdk-output'];
    const parsed = parseCliArgs(args);
    expect(parsed.target).toBe('./cdk-output');
  });
});
```

---

### FR-2: Default Target Directory
**ID**: FR-2
**Priority**: HIGH
**Description**: When `--target` is not provided, the system shall default to `<source>/cdk`.

**Business Rules**:
- Default path: `path.join(sourceDir, 'cdk')`
- Path resolution: Must handle relative and absolute paths
- Path normalization: Use `path.resolve()` for consistency

**Acceptance Criteria**:
- Given the source directory is `./my-serverless-app`
- When the user does not specify `--target`
- Then the target directory should be `./my-serverless-app/cdk`
- And all CDK files should be created in that location

**Test Cases**:
```typescript
describe('FR-2: Default Target Directory', () => {
  it('should compute default target as <source>/cdk', () => {
    const sourceDir = './my-serverless-app';
    const targetDir = computeDefaultTarget(sourceDir);
    expect(targetDir).toBe(path.join(sourceDir, 'cdk'));
  });

  it('should handle absolute paths', () => {
    const sourceDir = '/Users/test/my-app';
    const targetDir = computeDefaultTarget(sourceDir);
    expect(targetDir).toBe('/Users/test/my-app/cdk');
  });

  it('should normalize paths with trailing slashes', () => {
    const sourceDir = './my-app/';
    const targetDir = computeDefaultTarget(sourceDir);
    expect(path.normalize(targetDir)).toBe(path.normalize('./my-app/cdk'));
  });
});
```

---

### FR-3: Backward Compatibility
**ID**: FR-3
**Priority**: CRITICAL
**Description**: Existing migration scripts using explicit `--target` must continue working without modification.

**Compatibility Requirements**:
- All existing CLI flags must work identically
- No breaking changes to API contracts
- Same output structure when target is explicit
- Same error messages and validation

**Acceptance Criteria**:
- Given an existing migration script: `npm run migrate -- --source ./a --target ./b`
- When the script is executed after this feature
- Then the behavior should be identical to previous versions
- And the CDK project should be created at `./b`
- And no warnings or deprecation messages should appear

**Test Cases**:
```typescript
describe('FR-3: Backward Compatibility', () => {
  it('should maintain exact behavior with explicit target', async () => {
    const config = {
      sourceDir: './test-sls',
      targetDir: './test-cdk-explicit'
    };

    await migrateCommand(config);

    expect(fs.existsSync('./test-cdk-explicit/bin')).toBe(true);
    expect(fs.existsSync('./test-cdk-explicit/lib')).toBe(true);
    expect(fs.existsSync('./test-sls/cdk')).toBe(false); // Should NOT create in-place
  });
});
```

---

### FR-4: Directory Existence Validation
**ID**: FR-4
**Priority**: HIGH
**Description**: The system shall validate that the target directory does not already exist before starting migration.

**Validation Rules**:
1. If `<source>/cdk` exists and is a directory → Error
2. If `<source>/cdk` exists and contains CDK files → Error with specific message
3. If `<source>/cdk` exists but is empty → Warning and proceed
4. If `<source>/cdk` does not exist → Create it

**Error Messages**:
```typescript
const ERROR_MESSAGES = {
  CDK_DIR_EXISTS: 'Target directory "<path>/cdk" already exists. Please remove it or specify a different --target.',
  CDK_PROJECT_EXISTS: 'A CDK project already exists at "<path>/cdk". Use --force to overwrite or specify a different --target.',
  PERMISSION_DENIED: 'Cannot create directory "<path>/cdk". Permission denied.'
};
```

**Acceptance Criteria**:
- Given the source directory is `./my-app`
- When `./my-app/cdk` already exists and contains files
- Then the migration should fail immediately
- And display a clear error message
- And suggest remediation steps

**Test Cases**:
```typescript
describe('FR-4: Directory Existence Validation', () => {
  it('should error if target directory exists with files', async () => {
    fs.mkdirSync('./test-app/cdk', { recursive: true });
    fs.writeFileSync('./test-app/cdk/package.json', '{}');

    await expect(migrate({ sourceDir: './test-app' }))
      .rejects
      .toThrow(/already exists/i);
  });

  it('should proceed if target directory is empty', async () => {
    fs.mkdirSync('./test-app/cdk', { recursive: true });

    await migrate({ sourceDir: './test-app' });

    expect(fs.existsSync('./test-app/cdk/bin')).toBe(true);
  });

  it('should create directory if it does not exist', async () => {
    expect(fs.existsSync('./test-app/cdk')).toBe(false);

    await migrate({ sourceDir: './test-app' });

    expect(fs.existsSync('./test-app/cdk')).toBe(true);
  });
});
```

---

### FR-5: Automatic .gitignore Update
**ID**: FR-5
**Priority**: MEDIUM
**Description**: When using in-place mode, automatically update or create `.gitignore` to exclude the `/cdk/` directory.

**Implementation Requirements**:
- Check if `.gitignore` exists in source directory
- If exists: Append `/cdk/` if not already present
- If not exists: Create with `/cdk/` entry
- Preserve existing content and formatting
- Handle both LF and CRLF line endings

**Gitignore Entry**:
```gitignore
# CDK Migration Output (generated by sls-to-cdk)
/cdk/
```

**Acceptance Criteria**:
- Given in-place migration to `./my-app/cdk`
- When the migration completes
- Then `.gitignore` should contain `/cdk/`
- And existing `.gitignore` entries should be preserved
- And the entry should only be added once (idempotent)

**Test Cases**:
```typescript
describe('FR-5: Automatic .gitignore Update', () => {
  it('should create .gitignore if it does not exist', async () => {
    await migrate({ sourceDir: './test-app' });

    const gitignore = fs.readFileSync('./test-app/.gitignore', 'utf8');
    expect(gitignore).toContain('/cdk/');
  });

  it('should append to existing .gitignore', async () => {
    fs.writeFileSync('./test-app/.gitignore', 'node_modules/\n.env\n');

    await migrate({ sourceDir: './test-app' });

    const gitignore = fs.readFileSync('./test-app/.gitignore', 'utf8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('/cdk/');
  });

  it('should not duplicate /cdk/ entry', async () => {
    fs.writeFileSync('./test-app/.gitignore', '/cdk/\n');

    await migrate({ sourceDir: './test-app' });

    const gitignore = fs.readFileSync('./test-app/.gitignore', 'utf8');
    const matches = gitignore.match(/\/cdk\//g);
    expect(matches?.length).toBe(1);
  });

  it('should not modify .gitignore when using explicit target', async () => {
    const initialGitignore = 'node_modules/\n';
    fs.writeFileSync('./test-app/.gitignore', initialGitignore);

    await migrate({
      sourceDir: './test-app',
      targetDir: '../separate-cdk-output'
    });

    const gitignore = fs.readFileSync('./test-app/.gitignore', 'utf8');
    expect(gitignore).toBe(initialGitignore);
  });
});
```

---

## 1.2 Non-Functional Requirements

### NFR-1: Performance
**ID**: NFR-1
**Category**: Performance
**Priority**: MEDIUM
**Description**: The in-place migration should have no performance degradation compared to explicit target mode.

**Metrics**:
- Path resolution: <1ms overhead
- Directory validation: <10ms
- Overall migration time: No change (±5%)

**Measurement**:
```typescript
describe('NFR-1: Performance', () => {
  it('should complete path resolution in <1ms', () => {
    const start = performance.now();
    const target = computeDefaultTarget('./my-app');
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1);
  });

  it('should complete migration in similar time', async () => {
    const explicitStart = performance.now();
    await migrate({ sourceDir: './app', targetDir: './out' });
    const explicitDuration = performance.now() - explicitStart;

    const inPlaceStart = performance.now();
    await migrate({ sourceDir: './app' });
    const inPlaceDuration = performance.now() - inPlaceStart;

    const variance = Math.abs(inPlaceDuration - explicitDuration) / explicitDuration;
    expect(variance).toBeLessThan(0.05); // <5% variance
  });
});
```

---

### NFR-2: User Experience
**ID**: NFR-2
**Category**: Usability
**Priority**: HIGH
**Description**: The CLI should provide clear, helpful messages for in-place migration mode.

**UX Requirements**:
- Progress messages indicate in-place mode
- Help text explains both modes clearly
- Error messages suggest solutions
- Interactive mode guides users to simpler workflow

**Example Messages**:
```typescript
const UX_MESSAGES = {
  IN_PLACE_DETECTED: '📦 Using in-place mode: CDK project will be created at <source>/cdk',
  EXPLICIT_TARGET: '📂 Using explicit target: <target>',
  HELP_TEXT: `
Migration Modes:
  1. In-place (recommended):   npm run migrate -- --source ./my-project
     Creates CDK at: ./my-project/cdk

  2. Separate directory:       npm run migrate -- --source ./my-project --target ./cdk-output
     Creates CDK at: ./cdk-output
  `,
  INTERACTIVE_HINT: 'Tip: Leave target blank to use in-place mode (creates ./cdk folder)'
};
```

**Acceptance Criteria**:
- Given the user runs migration in in-place mode
- When the migration starts
- Then a clear message should indicate the target location
- And the user should understand where files will be created

---

### NFR-3: Safety
**ID**: NFR-3
**Category**: Data Safety
**Priority**: CRITICAL
**Description**: In-place migration must not risk data loss in the source directory.

**Safety Measures**:
1. No modification of existing source files
2. Directory isolation (all output in `/cdk` subdirectory)
3. Validation before any filesystem changes
4. Rollback capability if generation fails
5. Clear separation between source and generated files

**Acceptance Criteria**:
- Given a migration fails mid-process
- When the error occurs
- Then no source files should be modified
- And partial CDK files should be cleanly removed
- And the source directory should remain valid

**Test Cases**:
```typescript
describe('NFR-3: Safety', () => {
  it('should not modify source files during migration', async () => {
    const originalFiles = getDirectorySnapshot('./test-app');

    await migrate({ sourceDir: './test-app' });

    const currentFiles = getDirectorySnapshot('./test-app', { exclude: ['cdk'] });
    expect(currentFiles).toEqual(originalFiles);
  });

  it('should rollback on failure', async () => {
    const mockError = new Error('CDK init failed');
    jest.spyOn(execAsync, 'execAsync').mockRejectedValueOnce(mockError);

    await expect(migrate({ sourceDir: './test-app' })).rejects.toThrow();

    expect(fs.existsSync('./test-app/cdk')).toBe(false);
  });
});
```

---

## 1.3 Edge Cases & Scenarios

### Scenario 1: Source Directory is Current Directory
**Given**: User is in their serverless project directory
**When**: They run `npm run migrate` with no arguments
**Then**: CDK should be created at `./cdk`

```typescript
describe('Edge Case: Current Directory', () => {
  it('should create ./cdk when source is current directory', async () => {
    process.chdir('./test-app');
    await migrate({ sourceDir: '.' });
    expect(fs.existsSync('./cdk')).toBe(true);
  });
});
```

---

### Scenario 2: Symbolic Links
**Given**: Source directory contains symlinks
**When**: Migration runs in in-place mode
**Then**: Symlinks should be followed and resolved correctly

```typescript
describe('Edge Case: Symbolic Links', () => {
  it('should resolve symlinks in source path', async () => {
    fs.symlinkSync('./real-app', './linked-app', 'dir');
    await migrate({ sourceDir: './linked-app' });
    expect(fs.existsSync('./real-app/cdk')).toBe(true);
  });
});
```

---

### Scenario 3: Deeply Nested Paths
**Given**: Source directory is deeply nested (>10 levels)
**When**: In-place migration runs
**Then**: Path resolution should handle it correctly

```typescript
describe('Edge Case: Deeply Nested Paths', () => {
  it('should handle deeply nested source directories', async () => {
    const deepPath = './a/b/c/d/e/f/g/h/i/j/project';
    fs.mkdirSync(deepPath, { recursive: true });

    await migrate({ sourceDir: deepPath });

    expect(fs.existsSync(`${deepPath}/cdk`)).toBe(true);
  });
});
```

---

### Scenario 4: Special Characters in Path
**Given**: Source path contains spaces or special characters
**When**: Migration runs
**Then**: Path should be properly escaped and handled

```typescript
describe('Edge Case: Special Characters', () => {
  it('should handle spaces in directory names', async () => {
    const sourcePath = './my serverless app';
    fs.mkdirSync(sourcePath, { recursive: true });

    await migrate({ sourceDir: sourcePath });

    expect(fs.existsSync(`${sourcePath}/cdk`)).toBe(true);
  });
});
```

---

### Scenario 5: Windows Path Separators
**Given**: Running on Windows OS
**When**: Paths are computed
**Then**: Should use correct path separators for the OS

```typescript
describe('Edge Case: Windows Paths', () => {
  it('should handle Windows backslashes', () => {
    const sourceDir = 'C:\\Users\\Test\\my-app';
    const targetDir = computeDefaultTarget(sourceDir);
    expect(targetDir).toBe(path.join(sourceDir, 'cdk'));
  });
});
```

---

### Scenario 6: Read-Only Source Directory
**Given**: Source directory is read-only
**When**: In-place migration attempts to create `/cdk`
**Then**: Should fail with clear permission error

```typescript
describe('Edge Case: Permissions', () => {
  it('should error clearly on permission denied', async () => {
    fs.mkdirSync('./readonly-app', { recursive: true });
    fs.chmodSync('./readonly-app', 0o444); // Read-only

    await expect(migrate({ sourceDir: './readonly-app' }))
      .rejects
      .toThrow(/permission denied/i);
  });
});
```

---

# Phase 2: PSEUDOCODE 🧩

## 2.1 Target Directory Resolution Algorithm

```pseudocode
FUNCTION resolveTargetDirectory(options: MigrationOptions) -> string
  INPUT:
    options.source: string (path to serverless project)
    options.target: string | undefined (optional explicit target)

  OUTPUT:
    targetDir: string (absolute path to CDK output directory)

  ALGORITHM:
    // Step 1: Handle explicit target (backward compatibility)
    IF options.target is defined THEN
      targetDir = path.resolve(options.target)
      RETURN targetDir
    END IF

    // Step 2: Compute default in-place target
    IF options.source is defined THEN
      sourceDir = path.resolve(options.source)
      targetDir = path.join(sourceDir, 'cdk')
      RETURN targetDir
    END IF

    // Step 3: Fallback to current directory + /cdk
    targetDir = path.join(process.cwd(), 'cdk')
    RETURN targetDir
END FUNCTION
```

---

## 2.2 Directory Validation Decision Tree

```pseudocode
FUNCTION validateTargetDirectory(targetDir: string, isInPlaceMode: boolean) -> ValidationResult
  INPUT:
    targetDir: string (resolved target path)
    isInPlaceMode: boolean (true if using default in-place mode)

  OUTPUT:
    {
      valid: boolean,
      error?: string,
      warning?: string
    }

  ALGORITHM:
    // Step 1: Check if directory exists
    IF NOT fs.exists(targetDir) THEN
      RETURN { valid: true }  // OK to create
    END IF

    // Step 2: Directory exists - check contents
    files = fs.readdir(targetDir)

    IF files.length === 0 THEN
      RETURN {
        valid: true,
        warning: "Directory exists but is empty, will use it"
      }
    END IF

    // Step 3: Check if it's a CDK project
    hasCdkJson = fs.exists(path.join(targetDir, 'cdk.json'))
    hasPackageJson = fs.exists(path.join(targetDir, 'package.json'))
    hasBinDir = fs.exists(path.join(targetDir, 'bin'))

    IF hasCdkJson OR (hasPackageJson AND hasBinDir) THEN
      IF isInPlaceMode THEN
        RETURN {
          valid: false,
          error: "CDK project already exists at <targetDir>. Remove it or use --target to specify different location."
        }
      ELSE
        RETURN {
          valid: false,
          error: "Target directory <targetDir> already contains a CDK project. Use --force to overwrite."
        }
      END IF
    END IF

    // Step 4: Directory contains other files
    RETURN {
      valid: false,
      error: "Target directory <targetDir> is not empty. Please use an empty directory or remove existing files."
    }
END FUNCTION
```

---

## 2.3 Interactive Mode Flow

```pseudocode
FUNCTION runInteractiveMigration() -> MigrationConfig
  OUTPUT:
    config: MigrationConfig

  ALGORITHM:
    // Step 1: Prompt for source directory
    sourceDir = prompt({
      message: "Source directory (Serverless project):",
      default: "."
    })

    // Step 2: Prompt for target directory with in-place hint
    targetDir = prompt({
      message: "Target directory for CDK output (leave blank for in-place):",
      default: "",
      hint: "Press Enter to create ./cdk folder in source directory"
    })

    // Step 3: Resolve target directory
    IF targetDir is empty OR targetDir.trim() === "" THEN
      resolvedTarget = path.join(path.resolve(sourceDir), 'cdk')
      isInPlace = true

      // Confirm in-place mode
      confirmed = prompt({
        type: "confirm",
        message: `Create CDK project at ${resolvedTarget}?`,
        default: true
      })

      IF NOT confirmed THEN
        // Let user specify explicit target
        targetDir = prompt({
          message: "Enter target directory:",
          validate: (input) => input.length > 0
        })
        resolvedTarget = path.resolve(targetDir)
        isInPlace = false
      END IF
    ELSE
      resolvedTarget = path.resolve(targetDir)
      isInPlace = false
    END IF

    // Step 4: Validate target directory
    validation = validateTargetDirectory(resolvedTarget, isInPlace)

    IF NOT validation.valid THEN
      THROW ERROR validation.error
    END IF

    IF validation.warning THEN
      WARN validation.warning
    END IF

    // Step 5: Collect other options (dry-run, etc.)
    dryRun = prompt({
      type: "confirm",
      message: "Dry run (preview without generating)?",
      default: false
    })

    // Step 6: Return configuration
    RETURN {
      sourceDir: path.resolve(sourceDir),
      targetDir: resolvedTarget,
      dryRun: dryRun,
      isInPlace: isInPlace
    }
END FUNCTION
```

---

## 2.4 .gitignore Update Logic

```pseudocode
FUNCTION updateGitignoreForInPlace(sourceDir: string) -> void
  INPUT:
    sourceDir: string (source project directory)

  ALGORITHM:
    gitignorePath = path.join(sourceDir, '.gitignore')
    cdkEntry = '/cdk/'

    // Step 1: Check if .gitignore exists
    IF NOT fs.exists(gitignorePath) THEN
      // Create new .gitignore
      content = `# CDK Migration Output (generated by sls-to-cdk)\n${cdkEntry}\n`
      fs.writeFile(gitignorePath, content)
      RETURN
    END IF

    // Step 2: Read existing .gitignore
    existingContent = fs.readFile(gitignorePath, 'utf8')

    // Step 3: Check if /cdk/ already present
    patterns = [
      '/cdk/',
      '/cdk',
      'cdk/',
      '/cdk/**'
    ]

    FOR EACH pattern IN patterns DO
      IF existingContent.includes(pattern) THEN
        // Already has CDK entry, no update needed
        RETURN
      END IF
    END FOR

    // Step 4: Append /cdk/ entry
    newContent = existingContent

    // Ensure file ends with newline
    IF NOT newContent.endsWith('\n') THEN
      newContent += '\n'
    END IF

    // Add comment and entry
    newContent += '\n# CDK Migration Output (generated by sls-to-cdk)\n'
    newContent += cdkEntry + '\n'

    // Step 5: Write updated .gitignore
    fs.writeFile(gitignorePath, newContent)
END FUNCTION
```

---

## 2.5 Error Handling Pseudocode

```pseudocode
FUNCTION handleMigrationErrors(error: Error, config: MigrationConfig) -> void
  INPUT:
    error: Error (the error that occurred)
    config: MigrationConfig (migration configuration)

  ALGORITHM:
    // Categorize error type
    errorType = categorizeError(error)

    SWITCH errorType DO
      CASE 'DIRECTORY_EXISTS':
        IF config.isInPlace THEN
          message = `
Target directory already exists: ${config.targetDir}

Options:
  1. Remove the existing /cdk directory:
     rm -rf ${config.targetDir}

  2. Use a different target location:
     npm run migrate -- --source ${config.sourceDir} --target ./other-location
          `
        ELSE
          message = `
Target directory already exists: ${config.targetDir}

Options:
  1. Use --force to overwrite:
     npm run migrate -- --source ${config.sourceDir} --target ${config.targetDir} --force

  2. Choose a different target:
     npm run migrate -- --source ${config.sourceDir} --target ./other-location
          `
        END IF

        LOG ERROR message
        EXIT 1

      CASE 'PERMISSION_DENIED':
        message = `
Permission denied: Cannot create directory ${config.targetDir}

This may be because:
  1. The parent directory is read-only
  2. You don't have write permissions
  3. The directory is protected by the system

Try:
  - Running with appropriate permissions
  - Choosing a different target directory
  - Checking directory ownership: ls -la ${path.dirname(config.targetDir)}
        `

        LOG ERROR message
        EXIT 1

      CASE 'CDK_INIT_FAILED':
        message = `
CDK initialization failed in ${config.targetDir}

This may be because:
  1. CDK CLI is not installed (run: npm install -g aws-cdk)
  2. Node.js version incompatibility
  3. Network issues preventing package downloads

Try:
  - Verify CDK installation: cdk --version
  - Check Node.js version: node --version (requires 18+)
  - Run in verbose mode: npm run migrate -- --verbose
        `

        LOG ERROR message

        // Attempt rollback
        IF fs.exists(config.targetDir) THEN
          LOG "Cleaning up failed migration..."
          fs.remove(config.targetDir)
          LOG "Rollback complete"
        END IF

        EXIT 1

      CASE 'INVALID_SERVERLESS_PROJECT':
        message = `
Invalid Serverless project: ${config.sourceDir}

Could not find serverless.yml or serverless.json.

Verify:
  - You're in the correct directory
  - The serverless configuration file exists
  - The file is valid YAML/JSON
        `

        LOG ERROR message
        EXIT 1

      DEFAULT:
        message = `
Migration failed with unexpected error:
${error.message}

Stack trace:
${error.stack}

Please report this issue at:
https://github.com/your-repo/sls-to-cdk/issues
        `

        LOG ERROR message
        EXIT 1
    END SWITCH
END FUNCTION
```

---

# Phase 3: ARCHITECTURE 🏗️

## 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Entry Point                         │
│                    (src/cli/index.ts)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
┌──────────▼────────────┐      ┌──────────▼─────────────┐
│  Command Line Parser  │      │  Interactive Mode      │
│  (migrate.ts)         │      │  (interactive.ts)      │
│                       │      │                        │
│  • Parse --source     │      │  • Prompt for source   │
│  • Parse --target     │      │  • Prompt for target   │
│  • Compute defaults   │      │  • Suggest in-place    │
└──────────┬────────────┘      └──────────┬─────────────┘
           │                               │
           └───────────────┬───────────────┘
                           │
                ┌──────────▼──────────────┐
                │  Configuration Builder  │
                │  (NEW component)        │
                │                         │
                │  resolveTargetDir()     │
                │  validateTarget()       │
                │  detectInPlaceMode()    │
                └──────────┬──────────────┘
                           │
                ┌──────────▼──────────────┐
                │  Directory Validator    │
                │  (NEW component)        │
                │                         │
                │  checkExists()          │
                │  checkEmpty()           │
                │  checkCdkProject()      │
                └──────────┬──────────────┘
                           │
                ┌──────────▼──────────────┐
                │  Gitignore Manager      │
                │  (NEW component)        │
                │                         │
                │  updateGitignore()      │
                │  hasEntry()             │
                │  appendEntry()          │
                └──────────┬──────────────┘
                           │
                ┌──────────▼──────────────┐
                │  Migration Orchestrator │
                │  (orchestrator/index)   │
                │                         │
                │  • Scan serverless      │
                │  • Generate CDK         │
                │  • Create comparison    │
                └─────────────────────────┘
```

---

## 3.2 Sequence Diagram: In-Place Mode

```
Actor User
CLI [migrate.ts]
Config [ConfigBuilder]
Validator [DirectoryValidator]
Gitignore [GitignoreManager]
Orchestrator [MigrationOrchestrator]

User -> CLI: npm run migrate -- --source ./my-app
CLI -> Config: resolveTargetDir({ source: './my-app', target: undefined })
Config -> Config: computeDefault()
Config --> CLI: { targetDir: './my-app/cdk', isInPlace: true }

CLI -> Validator: validateTarget('./my-app/cdk', true)
Validator -> FileSystem: exists('./my-app/cdk')?
FileSystem --> Validator: false
Validator --> CLI: { valid: true }

CLI -> Orchestrator: migrate({ source: './my-app', target: './my-app/cdk' })
Orchestrator -> Orchestrator: scanServerless()
Orchestrator -> Orchestrator: generateCdk()
Orchestrator -> FileSystem: createDirectory('./my-app/cdk')
Orchestrator -> FileSystem: writeFiles()

Orchestrator -> Gitignore: updateGitignore('./my-app')
Gitignore -> FileSystem: exists('./my-app/.gitignore')?
FileSystem --> Gitignore: true
Gitignore -> Gitignore: hasEntry('/cdk/')?
Gitignore --> Gitignore: false
Gitignore -> FileSystem: appendFile('.gitignore', '\n/cdk/\n')

Orchestrator --> CLI: MigrationResult
CLI --> User: ✅ Migration complete at ./my-app/cdk
```

---

## 3.3 Sequence Diagram: Explicit Target Mode (Backward Compatible)

```
Actor User
CLI [migrate.ts]
Config [ConfigBuilder]
Validator [DirectoryValidator]
Gitignore [GitignoreManager]
Orchestrator [MigrationOrchestrator]

User -> CLI: npm run migrate -- --source ./my-app --target ./cdk-out
CLI -> Config: resolveTargetDir({ source: './my-app', target: './cdk-out' })
Config --> CLI: { targetDir: './cdk-out', isInPlace: false }

CLI -> Validator: validateTarget('./cdk-out', false)
Validator -> FileSystem: exists('./cdk-out')?
FileSystem --> Validator: false
Validator --> CLI: { valid: true }

CLI -> Orchestrator: migrate({ source: './my-app', target: './cdk-out' })
Orchestrator -> Orchestrator: scanServerless()
Orchestrator -> Orchestrator: generateCdk()
Orchestrator -> FileSystem: createDirectory('./cdk-out')
Orchestrator -> FileSystem: writeFiles()

Note: Gitignore update SKIPPED in explicit target mode

Orchestrator --> CLI: MigrationResult
CLI --> User: ✅ Migration complete at ./cdk-out
```

---

## 3.4 State Transition Diagram

```
                    ┌────────────────┐
                    │  CLI Invoked   │
                    └────────┬───────┘
                             │
                    ┌────────▼────────────┐
                    │ Parse Arguments     │
                    │                     │
                    │ source: string      │
                    │ target: string?     │
                    └────────┬────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐         ┌─────────▼─────────┐
     │ Target Provided │         │ Target NOT Given  │
     │ (Explicit)      │         │ (In-Place)        │
     └────────┬────────┘         └─────────┬─────────┘
              │                             │
              │                    ┌────────▼────────┐
              │                    │ Compute Default │
              │                    │ <source>/cdk    │
              │                    └────────┬────────┘
              │                             │
              └─────────────┬───────────────┘
                            │
                   ┌────────▼────────┐
                   │ Validate Target │
                   │                 │
                   │ • Exists?       │
                   │ • Empty?        │
                   │ • Writable?     │
                   └────────┬────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
      ┌───────▼────────┐        ┌────────▼────────┐
      │ Validation OK  │        │ Validation FAIL │
      └───────┬────────┘        └────────┬────────┘
              │                           │
              │                   ┌───────▼────────┐
              │                   │ Show Error     │
              │                   │ Suggest Fix    │
              │                   │ EXIT(1)        │
              │                   └────────────────┘
              │
     ┌────────▼────────┐
     │ Run Migration   │
     │                 │
     │ • Scan          │
     │ • Generate      │
     │ • Compare       │
     └────────┬────────┘
              │
     ┌────────▼────────────┐
     │ Update .gitignore?  │
     │                     │
     │ YES if in-place     │
     │ NO if explicit      │
     └────────┬────────────┘
              │
     ┌────────▼────────┐
     │ Migration Done  │
     │                 │
     │ EXIT(0)         │
     └─────────────────┘
```

---

## 3.5 Error Flow Diagram

```
                ┌──────────────────┐
                │ Migration Starts │
                └────────┬─────────┘
                         │
              ┌──────────▼──────────┐
              │ Pre-flight Checks   │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼─────┐   ┌────▼────┐
    │ Source  │    │ Target   │   │ Perms   │
    │ Valid?  │    │ Valid?   │   │ OK?     │
    └────┬────┘    └────┬─────┘   └────┬────┘
         │              │              │
         NO             NO             NO
         │              │              │
    ┌────▼──────────────▼──────────────▼─────┐
    │         ERROR HANDLING                  │
    │                                         │
    │  • Categorize error type                │
    │  • Generate helpful message             │
    │  • Suggest remediation steps            │
    │  • Rollback partial changes             │
    └────┬────────────────────────────────────┘
         │
    ┌────▼────┐
    │ Log     │
    │ Error   │
    │ EXIT(1) │
    └─────────┘
```

---

## 3.6 File Structure Changes

### New Directory Structure

```
src/
├── cli/
│   ├── commands/
│   │   └── migrate.ts                    [MODIFIED]
│   ├── interactive.ts                    [MODIFIED]
│   └── config/
│       ├── config-builder.ts             [NEW]
│       ├── directory-validator.ts        [NEW]
│       └── gitignore-manager.ts          [NEW]
├── modules/
│   └── orchestrator/
│       ├── index.ts                      [MODIFIED]
│       └── steps/
│           └── generate-executor.ts      [NO CHANGE]
└── utils/
    └── path-resolver.ts                  [NEW]

tests/
└── unit/
    ├── config/
    │   ├── config-builder.test.ts        [NEW]
    │   ├── directory-validator.test.ts   [NEW]
    │   └── gitignore-manager.test.ts     [NEW]
    └── cli/
        ├── migrate.test.ts               [MODIFIED]
        └── interactive.test.ts           [MODIFIED]
```

---

## 3.7 API Contracts

### ConfigBuilder Interface

```typescript
interface ConfigBuilderOptions {
  source?: string;
  target?: string;
  dryRun?: boolean;
}

interface ResolvedConfig {
  sourceDir: string;      // Absolute path
  targetDir: string;      // Absolute path
  isInPlace: boolean;     // True if using default <source>/cdk
  dryRun: boolean;
}

interface ConfigBuilder {
  resolveTargetDir(options: ConfigBuilderOptions): string;
  buildConfig(options: ConfigBuilderOptions): ResolvedConfig;
  detectInPlaceMode(options: ConfigBuilderOptions): boolean;
}
```

### DirectoryValidator Interface

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

interface DirectoryValidator {
  validateTarget(targetDir: string, isInPlace: boolean): ValidationResult;
  checkExists(dir: string): boolean;
  checkEmpty(dir: string): boolean;
  checkCdkProject(dir: string): boolean;
  checkWritable(dir: string): boolean;
}
```

### GitignoreManager Interface

```typescript
interface GitignoreManager {
  updateGitignore(sourceDir: string): void;
  hasEntry(gitignorePath: string, entry: string): boolean;
  appendEntry(gitignorePath: string, entry: string): void;
  createGitignore(gitignorePath: string, entries: string[]): void;
}
```

---

# Phase 4: REFINEMENT (TDD) 🧪

## 4.1 Test-Driven Development Plan

### Test Writing Order (Write Tests FIRST, Then Implement)

#### Sprint 1: Path Resolution (Day 1)

**Test File**: `tests/unit/config/config-builder.test.ts`

```typescript
describe('ConfigBuilder - Target Directory Resolution', () => {
  describe('resolveTargetDir', () => {
    // TEST 1: Default in-place mode
    it('should return <source>/cdk when target not provided', () => {
      const builder = new ConfigBuilder();
      const target = builder.resolveTargetDir({ source: './my-app' });
      expect(target).toBe(path.join(path.resolve('./my-app'), 'cdk'));
    });

    // TEST 2: Explicit target (backward compat)
    it('should return explicit target when provided', () => {
      const builder = new ConfigBuilder();
      const target = builder.resolveTargetDir({
        source: './my-app',
        target: './cdk-output'
      });
      expect(target).toBe(path.resolve('./cdk-output'));
    });

    // TEST 3: Current directory
    it('should handle current directory as source', () => {
      const builder = new ConfigBuilder();
      const target = builder.resolveTargetDir({ source: '.' });
      expect(target).toBe(path.join(process.cwd(), 'cdk'));
    });

    // TEST 4: Absolute paths
    it('should handle absolute source paths', () => {
      const builder = new ConfigBuilder();
      const target = builder.resolveTargetDir({
        source: '/Users/test/my-app'
      });
      expect(target).toBe('/Users/test/my-app/cdk');
    });

    // TEST 5: Path normalization
    it('should normalize paths with trailing slashes', () => {
      const builder = new ConfigBuilder();
      const target = builder.resolveTargetDir({ source: './my-app/' });
      expect(path.normalize(target)).toBe(
        path.normalize(path.join(path.resolve('./my-app'), 'cdk'))
      );
    });
  });

  describe('detectInPlaceMode', () => {
    // TEST 6: In-place detection
    it('should detect in-place mode when target not provided', () => {
      const builder = new ConfigBuilder();
      const isInPlace = builder.detectInPlaceMode({ source: './app' });
      expect(isInPlace).toBe(true);
    });

    // TEST 7: Explicit mode detection
    it('should detect explicit mode when target provided', () => {
      const builder = new ConfigBuilder();
      const isInPlace = builder.detectInPlaceMode({
        source: './app',
        target: './out'
      });
      expect(isInPlace).toBe(false);
    });
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → All FAIL (red)
3. ✅ Create `src/cli/config/config-builder.ts`
4. ✅ Implement `resolveTargetDir()` method
5. ✅ Implement `detectInPlaceMode()` method
6. ✅ Run tests → All PASS (green)
7. ✅ Refactor for clarity

---

#### Sprint 2: Directory Validation (Day 2)

**Test File**: `tests/unit/config/directory-validator.test.ts`

```typescript
describe('DirectoryValidator', () => {
  let validator: DirectoryValidator;
  let testDir: string;

  beforeEach(() => {
    validator = new DirectoryValidator();
    testDir = path.join(__dirname, 'test-fixtures');
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('validateTarget', () => {
    // TEST 1: Non-existent directory (OK)
    it('should validate non-existent directory', () => {
      const targetDir = path.join(testDir, 'new-cdk');
      const result = validator.validateTarget(targetDir, true);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    // TEST 2: Empty directory (OK with warning)
    it('should validate empty directory with warning', () => {
      const targetDir = path.join(testDir, 'empty');
      fs.mkdirSync(targetDir);

      const result = validator.validateTarget(targetDir, true);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('empty');
    });

    // TEST 3: Directory with CDK project (FAIL)
    it('should reject directory with existing CDK project', () => {
      const targetDir = path.join(testDir, 'existing-cdk');
      fs.mkdirSync(targetDir);
      fs.writeFileSync(path.join(targetDir, 'cdk.json'), '{}');

      const result = validator.validateTarget(targetDir, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already exists');
    });

    // TEST 4: Directory with other files (FAIL)
    it('should reject directory with non-CDK files', () => {
      const targetDir = path.join(testDir, 'has-files');
      fs.mkdirSync(targetDir);
      fs.writeFileSync(path.join(targetDir, 'README.md'), '# Test');

      const result = validator.validateTarget(targetDir, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not empty');
    });

    // TEST 5: Read-only directory (FAIL)
    it('should reject read-only directory', () => {
      const targetDir = path.join(testDir, 'readonly');
      fs.mkdirSync(targetDir);
      fs.chmodSync(targetDir, 0o444);

      const result = validator.validateTarget(targetDir, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('permission');
    });
  });

  describe('checkCdkProject', () => {
    // TEST 6: Detect cdk.json
    it('should detect CDK project by cdk.json', () => {
      const dir = path.join(testDir, 'cdk1');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'cdk.json'), '{}');

      expect(validator.checkCdkProject(dir)).toBe(true);
    });

    // TEST 7: Detect bin/ + package.json
    it('should detect CDK project by bin/ and package.json', () => {
      const dir = path.join(testDir, 'cdk2');
      fs.mkdirSync(dir);
      fs.mkdirSync(path.join(dir, 'bin'));
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');

      expect(validator.checkCdkProject(dir)).toBe(true);
    });

    // TEST 8: Non-CDK directory
    it('should not detect non-CDK directory', () => {
      const dir = path.join(testDir, 'not-cdk');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'index.js'), '');

      expect(validator.checkCdkProject(dir)).toBe(false);
    });
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → All FAIL (red)
3. ✅ Create `src/cli/config/directory-validator.ts`
4. ✅ Implement `validateTarget()` method
5. ✅ Implement `checkCdkProject()` method
6. ✅ Implement `checkEmpty()` method
7. ✅ Implement `checkWritable()` method
8. ✅ Run tests → All PASS (green)
9. ✅ Refactor for clarity

---

#### Sprint 3: Gitignore Management (Day 3)

**Test File**: `tests/unit/config/gitignore-manager.test.ts`

```typescript
describe('GitignoreManager', () => {
  let manager: GitignoreManager;
  let testDir: string;

  beforeEach(() => {
    manager = new GitignoreManager();
    testDir = path.join(__dirname, 'test-fixtures');
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('updateGitignore', () => {
    // TEST 1: Create .gitignore if not exists
    it('should create .gitignore if it does not exist', () => {
      manager.updateGitignore(testDir);

      const gitignorePath = path.join(testDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('/cdk/');
    });

    // TEST 2: Append to existing .gitignore
    it('should append /cdk/ to existing .gitignore', () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n.env\n');

      manager.updateGitignore(testDir);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.env');
      expect(content).toContain('/cdk/');
    });

    // TEST 3: Don't duplicate entry
    it('should not duplicate /cdk/ entry', () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, '/cdk/\n');

      manager.updateGitignore(testDir);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      const matches = content.match(/\/cdk\//g);
      expect(matches?.length).toBe(1);
    });

    // TEST 4: Handle variations of /cdk entry
    it('should recognize existing /cdk variations', () => {
      const variations = ['/cdk/', 'cdk/', '/cdk', '/cdk/**'];

      for (const variation of variations) {
        const dir = path.join(testDir, `test-${variation.replace(/\//g, '-')}`);
        fs.mkdirSync(dir, { recursive: true });

        const gitignorePath = path.join(dir, '.gitignore');
        fs.writeFileSync(gitignorePath, `${variation}\n`);

        manager.updateGitignore(dir);

        const content = fs.readFileSync(gitignorePath, 'utf8');
        const cdkEntries = content.split('\n').filter(line =>
          line.includes('cdk') && !line.startsWith('#')
        );

        expect(cdkEntries.length).toBe(1);
      }
    });

    // TEST 5: Add comment
    it('should add explanatory comment', () => {
      manager.updateGitignore(testDir);

      const content = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf8');
      expect(content).toContain('sls-to-cdk');
    });

    // TEST 6: Handle CRLF line endings
    it('should preserve CRLF line endings', () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\r\n.env\r\n');

      manager.updateGitignore(testDir);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('\r\n');
    });
  });

  describe('hasEntry', () => {
    // TEST 7: Detect exact entry
    it('should detect exact /cdk/ entry', () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n/cdk/\n');

      expect(manager.hasEntry(gitignorePath, '/cdk/')).toBe(true);
    });

    // TEST 8: Case sensitivity
    it('should be case-sensitive', () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, '/CDK/\n');

      expect(manager.hasEntry(gitignorePath, '/cdk/')).toBe(false);
    });
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → All FAIL (red)
3. ✅ Create `src/cli/config/gitignore-manager.ts`
4. ✅ Implement `updateGitignore()` method
5. ✅ Implement `hasEntry()` method
6. ✅ Implement `appendEntry()` method
7. ✅ Implement `createGitignore()` method
8. ✅ Run tests → All PASS (green)
9. ✅ Refactor for clarity

---

#### Sprint 4: CLI Integration (Day 4)

**Test File**: `tests/unit/cli/migrate.test.ts`

```typescript
describe('Migrate Command - In-Place Mode', () => {
  let mockOrchestrator: jest.Mocked<MigrationOrchestrator>;

  beforeEach(() => {
    mockOrchestrator = {
      migrate: jest.fn().mockResolvedValue({ success: true })
    } as any;
  });

  describe('CLI argument parsing', () => {
    // TEST 1: Parse --source without --target
    it('should parse --source without --target', () => {
      const args = ['--source', './my-app'];
      const options = parseCliArgs(args);

      expect(options.source).toBe('./my-app');
      expect(options.target).toBeUndefined();
    });

    // TEST 2: Backward compat with both flags
    it('should parse both --source and --target', () => {
      const args = ['--source', './my-app', '--target', './cdk-out'];
      const options = parseCliArgs(args);

      expect(options.source).toBe('./my-app');
      expect(options.target).toBe('./cdk-out');
    });
  });

  describe('Config building', () => {
    // TEST 3: Build in-place config
    it('should build in-place config when target missing', () => {
      const config = buildMigrationConfig({ source: './my-app' });

      expect(config.sourceDir).toBe(path.resolve('./my-app'));
      expect(config.targetDir).toBe(path.join(path.resolve('./my-app'), 'cdk'));
      expect(config.isInPlace).toBe(true);
    });

    // TEST 4: Build explicit config
    it('should build explicit config when target provided', () => {
      const config = buildMigrationConfig({
        source: './my-app',
        target: './cdk-out'
      });

      expect(config.targetDir).toBe(path.resolve('./cdk-out'));
      expect(config.isInPlace).toBe(false);
    });
  });

  describe('Migration execution', () => {
    // TEST 5: Execute in-place migration
    it('should execute in-place migration', async () => {
      const result = await runMigration({
        source: './test-app',
        orchestrator: mockOrchestrator
      });

      expect(mockOrchestrator.migrate).toHaveBeenCalledWith({
        sourceDir: expect.any(String),
        targetDir: expect.stringContaining('/cdk'),
        isInPlace: true
      });
      expect(result.success).toBe(true);
    });

    // TEST 6: Execute explicit migration
    it('should execute explicit migration', async () => {
      const result = await runMigration({
        source: './test-app',
        target: './test-cdk',
        orchestrator: mockOrchestrator
      });

      expect(mockOrchestrator.migrate).toHaveBeenCalledWith({
        sourceDir: expect.any(String),
        targetDir: expect.stringContaining('test-cdk'),
        isInPlace: false
      });
    });
  });

  describe('Error handling', () => {
    // TEST 7: Handle directory exists error
    it('should handle directory exists error', async () => {
      mockOrchestrator.migrate.mockRejectedValue(
        new Error('Target directory already exists')
      );

      await expect(runMigration({ source: './app', orchestrator: mockOrchestrator }))
        .rejects
        .toThrow(/already exists/i);
    });

    // TEST 8: Handle permission error
    it('should handle permission denied error', async () => {
      mockOrchestrator.migrate.mockRejectedValue(
        new Error('EACCES: permission denied')
      );

      await expect(runMigration({ source: './app', orchestrator: mockOrchestrator }))
        .rejects
        .toThrow(/permission denied/i);
    });
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → All FAIL (red)
3. ✅ Modify `src/cli/commands/migrate.ts`
4. ✅ Integrate `ConfigBuilder`
5. ✅ Update argument parsing logic
6. ✅ Add validation step
7. ✅ Run tests → All PASS (green)
8. ✅ Refactor for clarity

---

#### Sprint 5: Interactive Mode (Day 5)

**Test File**: `tests/unit/cli/interactive.test.ts`

```typescript
describe('Interactive Mode - In-Place Support', () => {
  let mockPrompt: jest.Mock;

  beforeEach(() => {
    mockPrompt = jest.fn();
    jest.mock('inquirer', () => ({ prompt: mockPrompt }));
  });

  describe('Target directory prompt', () => {
    // TEST 1: Accept empty target
    it('should accept empty target directory', async () => {
      mockPrompt.mockResolvedValue({
        sourceDir: './my-app',
        targetDir: ''
      });

      const config = await runInteractiveMigration();

      expect(config.targetDir).toBe(path.join(path.resolve('./my-app'), 'cdk'));
      expect(config.isInPlace).toBe(true);
    });

    // TEST 2: Use explicit target when provided
    it('should use explicit target when provided', async () => {
      mockPrompt.mockResolvedValue({
        sourceDir: './my-app',
        targetDir: './cdk-output'
      });

      const config = await runInteractiveMigration();

      expect(config.targetDir).toBe(path.resolve('./cdk-output'));
      expect(config.isInPlace).toBe(false);
    });

    // TEST 3: Show hint for in-place mode
    it('should show hint about in-place mode', async () => {
      await runInteractiveMigration();

      const targetPrompt = mockPrompt.mock.calls[0][0].find(
        q => q.name === 'targetDir'
      );

      expect(targetPrompt.message).toContain('blank');
      expect(targetPrompt.message).toContain('in-place');
    });
  });

  describe('Confirmation', () => {
    // TEST 4: Confirm in-place mode
    it('should confirm in-place mode selection', async () => {
      mockPrompt
        .mockResolvedValueOnce({ sourceDir: './my-app', targetDir: '' })
        .mockResolvedValueOnce({ confirmed: true });

      const config = await runInteractiveMigration();

      expect(mockPrompt).toHaveBeenCalledTimes(2);
      expect(mockPrompt.mock.calls[1][0]).toContainEqual(
        expect.objectContaining({
          type: 'confirm',
          message: expect.stringContaining('./my-app/cdk')
        })
      );
    });

    // TEST 5: Allow changing to explicit after seeing in-place
    it('should allow changing to explicit target', async () => {
      mockPrompt
        .mockResolvedValueOnce({ sourceDir: './my-app', targetDir: '' })
        .mockResolvedValueOnce({ confirmed: false })
        .mockResolvedValueOnce({ targetDir: './other-location' });

      const config = await runInteractiveMigration();

      expect(config.targetDir).toBe(path.resolve('./other-location'));
      expect(config.isInPlace).toBe(false);
    });
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → All FAIL (red)
3. ✅ Modify `src/cli/interactive.ts`
4. ✅ Update target directory prompt
5. ✅ Add in-place confirmation
6. ✅ Integrate ConfigBuilder
7. ✅ Run tests → All PASS (green)
8. ✅ Refactor for clarity

---

#### Sprint 6: Integration Tests (Day 6)

**Test File**: `tests/integration/in-place-migration.test.ts`

```typescript
describe('In-Place Migration - End to End', () => {
  let testProjectDir: string;

  beforeEach(async () => {
    // Create test Serverless project
    testProjectDir = await createTestServerlessProject();
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(testProjectDir, { recursive: true, force: true });
  });

  // TEST 1: Full in-place migration
  it('should complete full in-place migration', async () => {
    const result = await runCli([
      'migrate',
      '--source', testProjectDir
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Migration complete');

    // Verify CDK structure
    const cdkDir = path.join(testProjectDir, 'cdk');
    expect(fs.existsSync(path.join(cdkDir, 'bin'))).toBe(true);
    expect(fs.existsSync(path.join(cdkDir, 'lib'))).toBe(true);
    expect(fs.existsSync(path.join(cdkDir, 'cdk.json'))).toBe(true);
    expect(fs.existsSync(path.join(cdkDir, 'package.json'))).toBe(true);
  });

  // TEST 2: Source files untouched
  it('should not modify source files', async () => {
    const originalFiles = await getDirectorySnapshot(testProjectDir);

    await runCli(['migrate', '--source', testProjectDir]);

    const currentFiles = await getDirectorySnapshot(testProjectDir, {
      exclude: ['cdk']
    });

    expect(currentFiles).toEqual(originalFiles);
  });

  // TEST 3: .gitignore updated
  it('should update .gitignore', async () => {
    await runCli(['migrate', '--source', testProjectDir]);

    const gitignoreContent = await fs.readFile(
      path.join(testProjectDir, '.gitignore'),
      'utf8'
    );

    expect(gitignoreContent).toContain('/cdk/');
  });

  // TEST 4: CDK synth works
  it('should produce valid CDK project (synth succeeds)', async () => {
    await runCli(['migrate', '--source', testProjectDir]);

    const cdkDir = path.join(testProjectDir, 'cdk');
    const synthResult = await execAsync('npm run cdk synth', { cwd: cdkDir });

    expect(synthResult.exitCode).toBe(0);
    expect(fs.existsSync(path.join(cdkDir, 'cdk.out'))).toBe(true);
  });

  // TEST 5: Comparison report generated
  it('should generate comparison report in CDK directory', async () => {
    await runCli(['migrate', '--source', testProjectDir]);

    const reportPath = path.join(
      testProjectDir,
      'cdk',
      'migration-comparison-report.html'
    );

    expect(fs.existsSync(reportPath)).toBe(true);
  });

  // TEST 6: Error on second migration
  it('should error when CDK directory already exists', async () => {
    await runCli(['migrate', '--source', testProjectDir]);

    const result = await runCli(['migrate', '--source', testProjectDir]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already exists');
  });

  // TEST 7: Backward compat: explicit target still works
  it('should work with explicit target (backward compatible)', async () => {
    const targetDir = path.join(__dirname, 'test-cdk-output');

    const result = await runCli([
      'migrate',
      '--source', testProjectDir,
      '--target', targetDir
    ]);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(targetDir, 'bin'))).toBe(true);
    expect(fs.existsSync(path.join(testProjectDir, 'cdk'))).toBe(false);
  });
});
```

**Implementation Steps**:
1. ✅ Write all tests above
2. ❌ Run tests → Some FAIL (integration issues)
3. ✅ Fix integration issues in components
4. ✅ Verify orchestrator integration
5. ✅ Test error scenarios
6. ✅ Run tests → All PASS (green)
7. ✅ Performance testing

---

## 4.2 Implementation Checklist

### Phase 4A: Core Components (Days 1-3)

- [ ] **ConfigBuilder** (`src/cli/config/config-builder.ts`)
  - [ ] Write 7 unit tests
  - [ ] Implement `resolveTargetDir()`
  - [ ] Implement `detectInPlaceMode()`
  - [ ] Implement `buildConfig()`
  - [ ] All tests pass

- [ ] **DirectoryValidator** (`src/cli/config/directory-validator.ts`)
  - [ ] Write 8 unit tests
  - [ ] Implement `validateTarget()`
  - [ ] Implement `checkCdkProject()`
  - [ ] Implement `checkEmpty()`
  - [ ] Implement `checkWritable()`
  - [ ] All tests pass

- [ ] **GitignoreManager** (`src/cli/config/gitignore-manager.ts`)
  - [ ] Write 8 unit tests
  - [ ] Implement `updateGitignore()`
  - [ ] Implement `hasEntry()`
  - [ ] Implement `appendEntry()`
  - [ ] Implement `createGitignore()`
  - [ ] All tests pass

### Phase 4B: CLI Integration (Days 4-5)

- [ ] **Migrate Command** (`src/cli/commands/migrate.ts`)
  - [ ] Write 8 unit tests
  - [ ] Update argument parsing
  - [ ] Integrate ConfigBuilder
  - [ ] Add validation step
  - [ ] Update error handling
  - [ ] All tests pass

- [ ] **Interactive Mode** (`src/cli/interactive.ts`)
  - [ ] Write 5 unit tests
  - [ ] Update target prompt
  - [ ] Add in-place confirmation
  - [ ] Update help text
  - [ ] All tests pass

### Phase 4C: Integration & E2E (Day 6)

- [ ] **Integration Tests**
  - [ ] Write 7 end-to-end tests
  - [ ] Test full in-place migration
  - [ ] Test backward compatibility
  - [ ] Test error scenarios
  - [ ] Test .gitignore update
  - [ ] Test CDK synth
  - [ ] All tests pass

### Phase 4D: Edge Cases (Day 7)

- [ ] **Edge Case Tests**
  - [ ] Current directory as source
  - [ ] Symbolic links
  - [ ] Deeply nested paths
  - [ ] Special characters
  - [ ] Windows paths
  - [ ] Permission issues
  - [ ] All tests pass

---

## 4.3 Verification Checkpoints

After each sprint, verify:

### Checkpoint 1: Unit Tests
```bash
npm run test:unit -- config-builder
npm run test:unit -- directory-validator
npm run test:unit -- gitignore-manager
```
**Expected**: All unit tests pass

### Checkpoint 2: Integration Tests
```bash
npm run test:integration -- in-place-migration
```
**Expected**: All integration tests pass

### Checkpoint 3: Backward Compatibility
```bash
npm run test:regression
```
**Expected**: No regressions in existing behavior

### Checkpoint 4: Manual Testing
```bash
# Test 1: In-place mode
npm run migrate -- --source ./test-sls-project

# Test 2: Explicit mode
npm run migrate -- --source ./test-sls-project --target ./test-cdk-output

# Test 3: Interactive mode
npm run migrate
```
**Expected**: All modes work correctly

---

# Phase 5: COMPLETION ✅

## 5.1 Integration Checklist

### Code Integration
- [ ] All unit tests passing (100% coverage for new code)
- [ ] All integration tests passing
- [ ] No regression in existing tests
- [ ] Code review completed
- [ ] PR approved and merged

### Component Integration
- [ ] ConfigBuilder integrated with migrate command
- [ ] DirectoryValidator integrated with CLI
- [ ] GitignoreManager integrated with orchestrator
- [ ] Error handling integrated
- [ ] Logging integrated

### Feature Verification
- [ ] In-place migration works end-to-end
- [ ] Backward compatibility maintained
- [ ] Interactive mode updated and working
- [ ] CLI help text updated
- [ ] Error messages clear and helpful

---

## 5.2 Documentation Updates

### User-Facing Documentation

#### README.md
```markdown
## Quick Start

### Option 1: In-Place Migration (Recommended)
Create CDK project within your Serverless project:

```bash
cd my-serverless-project
npm run migrate
```

This creates a `./cdk` folder containing your CDK project.

### Option 2: Separate Directory Migration
Create CDK project in a different location:

```bash
npm run migrate -- --source ./my-serverless-project --target ./my-cdk-project
```
```

#### USER_GUIDE.md
```markdown
# Migration Modes

## In-Place Mode

**When to use**: Most common use case - you want the CDK project alongside your Serverless code.

**How it works**:
- CDK project created at `<source>/cdk`
- Source files remain untouched
- `.gitignore` automatically updated

**Command**:
```bash
npm run migrate -- --source ./my-project
# or
cd my-project && npm run migrate
```

**Result**:
```
my-project/
├── serverless.yml          (unchanged)
├── handler.js              (unchanged)
├── .serverless/            (unchanged)
└── cdk/                    (NEW)
    ├── bin/
    ├── lib/
    ├── cdk.json
    └── package.json
```

## Separate Directory Mode

**When to use**: You want CDK project completely separate from Serverless code.

**How it works**:
- CDK project created at specified `--target` location
- No changes to source directory

**Command**:
```bash
npm run migrate -- --source ./serverless-project --target ./cdk-project
```
```

#### QUICK_START.md
```markdown
# Quick Start Guide

## Simplest Migration (In-Place)

```bash
cd your-serverless-project
npm run migrate
```

That's it! Your CDK project is now at `./cdk`.

## Next Steps

1. **Review the migration**:
   ```bash
   open cdk/migration-comparison-report.html
   ```

2. **Test the CDK project**:
   ```bash
   cd cdk
   npm run cdk synth
   ```

3. **Deploy**:
   ```bash
   npm run cdk deploy
   ```
```

### Technical Documentation

#### SPECIFICATION.md
Update the Configuration section:

```markdown
## Configuration

### Target Directory

**Optional** - Specifies where to create the CDK project.

**Default**: `<source>/cdk` (in-place mode)

**Examples**:
```bash
# In-place mode (default)
npm run migrate -- --source ./my-project

# Explicit target
npm run migrate -- --source ./my-project --target ./cdk-output
```

**Behavior**:
- If `--target` is provided → Use explicit target
- If `--target` is NOT provided → Use `<source>/cdk`
- In in-place mode → Update `.gitignore` automatically
```

#### ARCHITECTURE.md
Add new components section:

```markdown
## Configuration Components

### ConfigBuilder
**Location**: `src/cli/config/config-builder.ts`
**Purpose**: Resolve target directory and build migration configuration
**Dependencies**: `path`, `fs`

### DirectoryValidator
**Location**: `src/cli/config/directory-validator.ts`
**Purpose**: Validate target directory before migration
**Dependencies**: `fs`, `path`

### GitignoreManager
**Location**: `src/cli/config/gitignore-manager.ts`
**Purpose**: Update .gitignore for in-place migrations
**Dependencies**: `fs`, `path`
```

---

## 5.3 Backward Compatibility Tests

### Test Suite: Regression Testing

```typescript
describe('Backward Compatibility - Existing Workflows', () => {
  // TEST 1: Explicit source and target still works
  it('should work with explicit --source and --target', async () => {
    const result = await runCli([
      'migrate',
      '--source', './test-sls',
      '--target', './test-cdk'
    ]);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync('./test-cdk/bin')).toBe(true);
  });

  // TEST 2: Same output structure
  it('should produce same output structure as before', async () => {
    await runCli([
      'migrate',
      '--source', './test-sls',
      '--target', './test-cdk'
    ]);

    const files = await getDirectoryTree('./test-cdk');

    expect(files).toContain('bin/app.ts');
    expect(files).toContain('lib/<stack-name>-stack.ts');
    expect(files).toContain('cdk.json');
    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
  });

  // TEST 3: Comparison report in target
  it('should create comparison report in target directory', async () => {
    await runCli([
      'migrate',
      '--source', './test-sls',
      '--target', './test-cdk'
    ]);

    expect(fs.existsSync('./test-cdk/migration-comparison-report.html')).toBe(true);
  });

  // TEST 4: No .gitignore update in explicit mode
  it('should not update .gitignore in explicit mode', async () => {
    const initialGitignore = 'node_modules/\n';
    fs.writeFileSync('./test-sls/.gitignore', initialGitignore);

    await runCli([
      'migrate',
      '--source', './test-sls',
      '--target', './test-cdk'
    ]);

    const gitignoreAfter = fs.readFileSync('./test-sls/.gitignore', 'utf8');
    expect(gitignoreAfter).toBe(initialGitignore);
  });

  // TEST 5: Interactive mode with explicit target
  it('should work in interactive mode with explicit target', async () => {
    const mockPrompt = jest.fn().mockResolvedValue({
      sourceDir: './test-sls',
      targetDir: './test-cdk',
      dryRun: false
    });

    await runInteractiveMigration(mockPrompt);

    expect(fs.existsSync('./test-cdk')).toBe(true);
  });
});
```

---

## 5.4 Release Checklist

### Pre-Release
- [ ] All tests passing (unit + integration + e2e)
- [ ] Code coverage ≥ 80% for new code
- [ ] Documentation complete and reviewed
- [ ] Changelog updated
- [ ] Version bumped (semver)

### Release Artifacts
- [ ] Release notes drafted
- [ ] Migration guide for existing users
- [ ] Breaking changes documented (if any)
- [ ] Demo video/GIF created

### Post-Release
- [ ] Monitor for issues
- [ ] Respond to user feedback
- [ ] Update examples in documentation
- [ ] Blog post/announcement (optional)

---

## 5.5 Release Notes

### Version X.X.X - In-Place CDK Generation

#### 🎉 New Features

**In-Place Migration Mode**
- CDK projects can now be generated within the Serverless project directory
- Simplifies the most common use case: migrating while keeping code together
- Automatic `.gitignore` updates to exclude generated CDK code

**Usage**:
```bash
# New: In-place mode (target is optional)
npm run migrate -- --source ./my-project

# Still works: Explicit target mode
npm run migrate -- --source ./my-project --target ./cdk-output
```

#### 📖 Improvements

- Interactive mode now suggests in-place migration by default
- Clearer CLI help text explaining both migration modes
- Better error messages with remediation suggestions
- Improved directory validation before migration starts

#### ✅ Backward Compatibility

- **No breaking changes** - all existing commands work identically
- Scripts using `--source` and `--target` unchanged
- Same output structure when using explicit target mode

#### 📝 Documentation

- Updated Quick Start guide with simpler workflow
- New User Guide section explaining migration modes
- Architecture documentation for new components

#### 🐛 Bug Fixes

- Fixed path resolution for Windows
- Improved handling of symbolic links
- Better error messages for permission issues

---

## 5.6 Migration Guide for Existing Users

### For Users with Existing Scripts

**Your scripts continue to work unchanged**. No action required.

```bash
# This still works exactly as before
npm run migrate -- --source ./serverless-app --target ./cdk-app
```

### For New Projects

**You can now simplify your workflow**:

```bash
# Old way (still works)
npm run migrate -- --source ./my-app --target ./my-app-cdk

# New way (simpler)
cd my-app
npm run migrate
```

### Recommendation

- **For new migrations**: Use in-place mode for simpler workflow
- **For existing setups**: Keep using explicit target if it's working
- **For monorepos**: Consider in-place mode to keep related code together

---

## 5.7 Success Criteria

### Functional Success
✅ **In-place migration works end-to-end**
- Command: `npm run migrate -- --source ./test-project`
- Result: CDK created at `./test-project/cdk`
- Validation: `cdk synth` succeeds

✅ **Backward compatibility maintained**
- Existing commands work identically
- No regression in test suite
- Same output for explicit target mode

✅ **User experience improved**
- Simpler workflow for common case
- Clear error messages
- Helpful prompts in interactive mode

### Technical Success
✅ **Code Quality**
- 100% test coverage for new components
- All tests passing (45+ new tests)
- No linting errors
- Code review approved

✅ **Documentation**
- README updated
- User guide expanded
- Quick start simplified
- API docs complete

✅ **Performance**
- No degradation in migration time
- Path resolution <1ms
- Validation <10ms

---

## 5.8 Post-Launch Monitoring

### Metrics to Track

1. **Adoption Rate**
   - % of users using in-place mode
   - % still using explicit mode
   - Interactive mode usage

2. **Error Rates**
   - Directory exists errors
   - Permission denied errors
   - Validation failures

3. **User Feedback**
   - GitHub issues related to feature
   - User questions/confusion
   - Feature requests

### Action Items Based on Monitoring

- If high error rate → Improve validation/error messages
- If low adoption → Improve documentation/examples
- If confusion → Create tutorial video

---

# Summary

This SPARC implementation plan provides:

1. ✅ **Specification**: Complete functional and non-functional requirements with acceptance criteria
2. ✅ **Pseudocode**: Detailed algorithms for all key functions
3. ✅ **Architecture**: Component diagrams, sequence diagrams, and API contracts
4. ✅ **Refinement**: Test-Driven Development plan with 45+ tests to write before implementation
5. ✅ **Completion**: Integration checklist, documentation updates, and release notes

**Estimated Implementation Time**: 7 days (1 developer)

**Test-First Approach**:
- Day 1-3: Write tests, implement core components
- Day 4-5: Write tests, integrate with CLI
- Day 6: Write tests, end-to-end verification
- Day 7: Edge cases, documentation, release prep

**Success Metrics**:
- 45+ tests passing
- 100% backward compatibility
- 0 regressions
- Simplified UX for 80%+ of users
