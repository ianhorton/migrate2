# Testing Scripts

This directory contains two test scripts for the migration tool:

## 🏠 test-in-place-migration.sh (NEW)

Tests the **in-place migration mode** where CDK is created at `<source>/cdk`.

**Usage**:
```bash
./test-in-place-migration.sh
```

**What it tests**:
- ✅ In-place mode detection (no `--target` parameter)
- ✅ CDK created at `../sls-cdk-migration/cdk/`
- ✅ Directory structure validation
- ✅ .gitignore updates
- ✅ All 6 migration steps
- ✅ Comparison reports

**Outputs**:
- CDK project: `../sls-cdk-migration/cdk/`
- Log file: `in-place-test.log`

## 📂 test-all-steps.sh (ORIGINAL)

Tests the **explicit target mode** (backward compatible).

**Usage**:
```bash
./test-all-steps.sh
```

**What it tests**:
- ✅ Explicit target with `--target ../foo-test`
- ✅ CDK created at `../foo-test/`
- ✅ All 6 migration steps
- ✅ Comparison reports

**Outputs**:
- CDK project: `../foo-test/`
- Log file: `full-test.log`

## 🔄 Key Differences

| Feature | In-Place | Explicit Target |
|---------|----------|-----------------|
| **Target Parameter** | Omitted | `--target ../foo-test` |
| **CDK Location** | `<source>/cdk/` | `../foo-test/` |
| **Use Case** | Quick testing, development | Separate CDK project |
| **.gitignore** | Auto-updated | Not updated |

## 🧪 Running Both Tests

```bash
# Test in-place mode (recommended)
./test-in-place-migration.sh

# Clean up
rm -rf ../sls-cdk-migration/cdk
rm -rf ../sls-cdk-migration/.serverless

# Test explicit target mode (backward compatibility)
./test-all-steps.sh

# Clean up
rm -rf ../foo-test
rm -rf ../sls-cdk-migration/.serverless
```

## 📋 Prerequisites

Both scripts require:
- Node.js 18+
- Serverless Framework (`npm install -g serverless`)
- jq (`brew install jq` on macOS)
- AWS credentials configured
- Source project at `../sls-cdk-migration/`

## ✅ Success Criteria

Both scripts should output:
```
✨ All steps completed successfully!

📊 Results Summary:
   Scan: X resources
   Protected: Y stateful
   Removed: Z from Serverless
   CDK Generated: W resources
   Matched: V resources
```

## 🐛 Troubleshooting

**If scripts fail**:

1. **Check prerequisites**:
   ```bash
   node --version  # Should be 18+
   sls --version   # Should be installed
   jq --version    # Should be installed
   ```

2. **Verify source project exists**:
   ```bash
   ls -la ../sls-cdk-migration/serverless.yml
   ```

3. **Check build**:
   ```bash
   npm run build
   ls -la dist/cli/index.js
   ```

4. **Run manually**:
   ```bash
   # In-place mode
   npm run migrate -- --source ../sls-cdk-migration --dry-run

   # Explicit target
   npm run migrate -- --source ../sls-cdk-migration --target ../foo-test --dry-run
   ```

5. **Check logs**:
   ```bash
   cat in-place-test.log
   cat full-test.log
   ```
