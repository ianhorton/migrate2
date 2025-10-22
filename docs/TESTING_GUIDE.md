# Testing Guide - Serverless to CDK Migration Tool

## ✅ The --source Parameter Works Correctly

After thorough testing, the `--source` parameter is functioning as designed. This guide will help you test the tool correctly.

## 🚀 Correct Usage

### Option 1: Using the built CLI

```bash
# Build first
npm run build

# Then run migrate with --source
node dist/cli/index.js migrate --source ./your-serverless-app --dry-run
```

### Option 2: Using npm script

```bash
npm run migrate -- --source ./your-serverless-app --dry-run
```

**Note**: The `--` is required to pass arguments through npm.

### Option 3: Using ts-node directly

```bash
npx ts-node src/cli/index.ts migrate --source ./your-serverless-app --dry-run
```

### Option 4: After global install

```bash
npm install -g .
sls-to-cdk migrate --source ./your-serverless-app --dry-run
```

## 🧪 Test Cases

### Test 1: In-Place Migration (New Feature)

```bash
# Create test app
mkdir -p /tmp/test-sls-app
cd /tmp/test-sls-app

# Create minimal serverless.yml
cat > serverless.yml << 'EOF'
service: test-service

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello
EOF

# Run migration (no --target = in-place mode)
node /path/to/migrate2/dist/cli/index.js migrate --source . --dry-run
```

**Expected Output**:
```
ℹ️  In-place mode: CDK project will be created at:
   /tmp/test-sls-app/cdk

📊 Migration Configuration

Source: /tmp/test-sls-app
Target: /tmp/test-sls-app/cdk
Stage: dev
Region: us-east-1
...
```

### Test 2: Explicit Target (Backward Compatible)

```bash
node dist/cli/index.js migrate \
  --source /tmp/test-sls-app \
  --target /tmp/cdk-output \
  --dry-run
```

**Expected Output**:
```
📊 Migration Configuration

Source: /tmp/test-sls-app
Target: /tmp/cdk-output
...
```

### Test 3: Interactive Mode (No Arguments)

```bash
node dist/cli/index.js migrate
```

**Expected**: Interactive wizard prompts for:
1. Source directory
2. Target directory (can be left blank for in-place)
3. Stage
4. Region
5. Stack name
6. Dry run
7. Backups
8. CDK language

## ⚠️ Common Issues

### Issue 1: "It asks for source even with --source"

**Cause**: Not building before running, or running wrong command.

**Fix**:
```bash
# Always build after code changes
npm run build

# Then run with built code
node dist/cli/index.js migrate --source ./app
```

### Issue 2: "Arguments not passed through npm run"

**Cause**: Missing `--` separator for npm scripts.

**Wrong**: ❌
```bash
npm run migrate --source ./app
```

**Correct**: ✅
```bash
npm run migrate -- --source ./app
```

### Issue 3: "serverless.yml not found"

**Cause**: Source directory doesn't contain serverless.yml or path is incorrect.

**Fix**:
```bash
# Verify serverless.yml exists
ls -la /path/to/your/app/serverless.yml

# Use absolute path
node dist/cli/index.js migrate --source /absolute/path/to/app
```

### Issue 4: "Invalid serverless.yml: missing provider"

**Cause**: serverless.yml is incomplete or malformed.

**Fix**: Ensure serverless.yml has required fields:
```yaml
service: your-service-name

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
```

## 🔍 Debugging Steps

### Step 1: Verify Build

```bash
npm run build
ls -la dist/cli/index.js
```

### Step 2: Test with Minimal Example

```bash
# Create test directory
mkdir -p /tmp/test-migration
cd /tmp/test-migration

# Create valid serverless.yml
cat > serverless.yml << 'EOF'
service: test-svc
provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
functions:
  test:
    handler: index.handler
EOF

# Test migration
node /your/project/path/dist/cli/index.js migrate --source . --dry-run
```

### Step 3: Check Help

```bash
node dist/cli/index.js migrate --help
```

**Should show**:
```
Options:
  -c, --config <path>  Path to configuration file
  -s, --source <dir>   Source directory containing serverless.yml
  -t, --target <dir>   Target directory for CDK output
  ...
```

## ✅ Verification Checklist

- [ ] Built project with `npm run build`
- [ ] serverless.yml exists in source directory
- [ ] serverless.yml has required `provider` field
- [ ] Using correct syntax: `--source <path>` not `-source <path>`
- [ ] If using npm scripts, included `--` separator
- [ ] Source path is correct (use `pwd` to verify)

## 📝 Test Results

### Confirmed Working ✅

1. **CLI Mode with --source**: ✅ Working
   - `node dist/cli/index.js migrate --source ./app`
   - Correctly processes source and defaults target to `<source>/cdk`

2. **CLI Mode with --source and --target**: ✅ Working
   - `node dist/cli/index.js migrate --source ./app --target ./cdk-out`
   - Correctly uses explicit target

3. **Interactive Mode**: ✅ Working
   - `node dist/cli/index.js migrate`
   - Prompts for all required inputs

4. **In-Place Mode**: ✅ Working
   - Empty target defaults to `<source>/cdk`
   - ConfigBuilder correctly resolves paths
   - DirectoryValidator checks safety

5. **Dry-Run Mode**: ✅ Working
   - `--dry-run` flag prevents actual changes
   - Shows what would be created

## 🚨 If Still Having Issues

If you're still experiencing issues where the tool asks for source despite passing `--source`:

1. **Share your exact command**:
   ```bash
   # What are you typing?
   ```

2. **Check Node version**:
   ```bash
   node --version  # Should be 18+
   ```

3. **Verify you're in the right directory**:
   ```bash
   pwd
   ls -la  # Should show dist/ folder
   ```

4. **Test with absolute path**:
   ```bash
   node dist/cli/index.js migrate --source /absolute/path/to/your/app
   ```

5. **Check for multiple installations**:
   ```bash
   which sls-to-cdk
   npm list -g sls-to-cdk
   ```

## 📞 Getting Help

If none of these steps resolve your issue, please provide:
1. The exact command you're running
2. The complete output (including any errors)
3. Node.js version (`node --version`)
4. Project structure (`ls -la`)
5. Contents of serverless.yml (first few lines)
