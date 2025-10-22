# Feature: In-Place CDK Generation

## Requirement Analysis

### Current Behavior ❌

**CLI Command Line:**
```bash
# REQUIRED: Both --source and --target must be provided
npm run migrate -- --source ../sls-project --target ../cdk-project
```

**Interactive Mode:**
```bash
npm run migrate
# Prompts:
#   Source directory: . (default)
#   Target directory: ./cdk-output (default, REQUIRED)
```

**Code Evidence:**
- `src/cli/commands/migrate.ts:61` - Requires both `options.source && options.target`
- `src/cli/interactive.ts:30-35` - `targetDir` field has required validation
- No conditional logic for in-place generation

**Directory Structure Created:**
```
../sls-project/          (Serverless project - untouched)
  ├── serverless.yml
  ├── handler.js
  └── .serverless/

../cdk-project/          (Completely separate directory)
  ├── bin/
  ├── lib/
  │   └── cdk-project-stack.ts
  ├── cdk.json
  └── package.json
```

---

### Desired Behavior ✅

**Option 1: Explicit Target (Backward Compatible)**
```bash
# Same as before - create in separate directory
npm run migrate -- --source ../sls-project --target ../cdk-project
```

**Option 2: In-Place Generation (NEW)**
```bash
# No --target specified → create /cdk folder inside source
npm run migrate -- --source ../sls-project

# Or just use current directory
npm run migrate
```

**Directory Structure Created (In-Place):**
```
../sls-project/          (Serverless project - unchanged)
  ├── serverless.yml
  ├── handler.js
  ├── .serverless/
  └── cdk/               ← NEW: CDK project created here
      ├── bin/
      ├── lib/
      │   └── sls-project-stack.ts
      ├── cdk.json
      ├── package.json
      └── migration-comparison-report.html
```

---

## Behavioral Differences

| Aspect | Current | Desired | Change Impact |
|--------|---------|---------|---------------|
| **Target Parameter** | REQUIRED | OPTIONAL | Breaking if users don't provide it |
| **Default Location** | N/A | `<source>/cdk` | New default behavior |
| **Backward Compatibility** | N/A | ✅ Maintained | Existing scripts still work |
| **In-Place Option** | ❌ Not supported | ✅ Supported | New capability |
| **Interactive Mode** | Requires target input | Target optional with smart default | UX improvement |

---

## Key Questions & Answers

### Q1: What if `<source>/cdk` already exists?
**Answer:**
- Check if directory exists
- If exists and contains CDK project → Error with clear message
- If exists but empty → Use it
- If not exists → Create it

### Q2: Does this affect comparison logic?
**Answer:**
- No - comparison uses `.serverless/` and `cdk.out/` paths
- Paths are computed from `targetDir` regardless of location

### Q3: What about `.gitignore`?
**Answer:**
- Should create/update `.gitignore` in source directory
- Add `/cdk/` to ignore patterns (if not already present)

### Q4: Stack naming differences?
**Answer:**
- Current: Uses target directory name (`cdk-project` → `CdkProjectStack`)
- In-place: Should use source directory name (`sls-project` → `SlsProjectStack`)
- This is already handled by `toPascalCase(dirName)` logic ✅

### Q5: Does this work with `--dry-run`?
**Answer:**
- Yes - dry-run should work the same
- Just creates in different location

---

## Impact Analysis

### Files That Need Changes

#### 1. **src/cli/commands/migrate.ts**
**Current Code (line 61):**
```typescript
} else if (options.source && options.target) {
  config = {
    sourceDir: options.source,
    targetDir: options.target,
    // ...
  };
```

**Required Change:**
```typescript
} else if (options.source) {
  // NEW: Default to <source>/cdk if target not provided
  const targetDir = options.target || path.join(options.source, 'cdk');

  config = {
    sourceDir: options.source,
    targetDir: targetDir,
    // ...
  };
```

#### 2. **src/cli/interactive.ts**
**Current Code (line 26-36):**
```typescript
{
  type: 'input',
  name: 'targetDir',
  message: 'Target directory for CDK output:',
  default: './cdk-output',
  validate: (input: string) => {
    if (!input || input.trim().length === 0) {
      return 'Target directory is required';
    }
    return true;
  }
}
```

**Required Change:**
```typescript
{
  type: 'input',
  name: 'targetDir',
  message: 'Target directory for CDK output (leave blank for in-place):',
  default: '', // Changed from './cdk-output'
  validate: (input: string) => {
    // Remove required validation
    return true;
  }
},
// NEW: Add conditional logic after all prompts
// If targetDir is empty, set to <sourceDir>/cdk
```

#### 3. **src/modules/orchestrator/steps/generate-executor.ts**
**Current Code:** No changes needed (already handles any targetDir)

**Verification Needed:**
- Ensure CDK init works in nested directory
- Ensure comparison paths are correct

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing scripts | Low | High | Maintain backward compatibility |
| Directory conflicts | Medium | Medium | Check for existing `/cdk` directory |
| Confusing UX | Low | Medium | Clear CLI help text and prompts |
| File permission issues | Low | Medium | Validate write permissions before starting |

---

## Testing Requirements

### Unit Tests
- [ ] Test default target directory generation
- [ ] Test explicit target directory (backward compat)
- [ ] Test path resolution for in-place mode
- [ ] Test error handling for existing `/cdk` directory

### Integration Tests
- [ ] Test full migration with in-place mode
- [ ] Test full migration with explicit target (regression)
- [ ] Test interactive mode with empty target
- [ ] Test comparison report paths

### E2E Tests
- [ ] Migrate real Serverless project in-place
- [ ] Verify CDK synth works from `<source>/cdk`
- [ ] Verify comparison report generated in correct location

---

## Documentation Updates

### Files to Update:
1. **README.md** - Add in-place migration examples
2. **USER_GUIDE.md** - Document both modes
3. **QUICK_START.md** - Show simplest command (in-place)
4. **SPECIFICATION.md** - Update target directory requirements

### Example Documentation:

```markdown
## Migration Modes

### In-Place Migration (Recommended)
Creates CDK project within your Serverless project:

```bash
cd my-serverless-project
npm run migrate
# Creates: ./cdk/
```

### Separate Directory Migration
Creates CDK project in a different location:

```bash
npm run migrate -- --source ./my-serverless-project --target ./my-cdk-project
```
```

---

## Acceptance Criteria

### Must Have ✅
- [ ] CLI accepts migration without `--target` parameter
- [ ] Default target is `<source>/cdk` when not provided
- [ ] Existing scripts with `--target` continue working (backward compatible)
- [ ] Interactive mode allows empty target directory
- [ ] CDK project successfully created in `<source>/cdk`
- [ ] Comparison report generated in correct location
- [ ] Documentation updated

### Should Have 🎯
- [ ] Validate `/cdk` directory doesn't exist before starting
- [ ] Clear error message if directory conflicts
- [ ] Update `.gitignore` with `/cdk/` entry
- [ ] Help text explains both modes

### Nice to Have 💡
- [ ] Auto-detect if already in Serverless project (smart defaults)
- [ ] Suggest in-place mode in interactive wizard
- [ ] Progress indicator shows target location

---

## Summary

### Does This Differ from Current Behavior?
**YES** - Significant behavioral change:

1. **Target Parameter:** Changes from REQUIRED → OPTIONAL
2. **Default Location:** Adds new default (`<source>/cdk`)
3. **Directory Structure:** Supports in-place generation
4. **User Experience:** Simplifies most common use case

### Backward Compatibility?
**YES** - Fully backward compatible:
- Users can still provide `--target`
- Existing scripts unchanged
- Same output when target is specified

### Complexity?
**LOW** - Minimal code changes:
- 2 files need modification
- ~20 lines of code
- Existing logic reusable
- No architecture changes

---

## Next Steps

See `IMPLEMENTATION_PLAN.md` for detailed SPARC-based implementation plan.
