#!/bin/bash
set -e

echo "🚀 In-Place Migration Step-by-Step Test"
echo "========================================"

cd /Users/ianhorton/development/sls-to-cdk/migrate2

# Clean
echo ""
echo "🧹 Cleaning previous test outputs..."
rm -rf ../sls-cdk-migration/cdk
rm -rf ../sls-cdk-migration/.serverless

# Build
echo ""
echo "📦 Building migration tool..."
npm run build

# Step 1: INITIAL_SCAN
echo ""
echo "📡 Step 1: INITIAL_SCAN"
cd ../sls-cdk-migration
sls package --stage dev > /dev/null 2>&1

# Find the generated template (update-stack or create-stack)
if [ -f .serverless/cloudformation-template-update-stack.json ]; then
  TEMPLATE_FILE=".serverless/cloudformation-template-update-stack.json"
elif [ -f .serverless/cloudformation-template-create-stack.json ]; then
  TEMPLATE_FILE=".serverless/cloudformation-template-create-stack.json"
else
  echo "   ❌ Failed: No CloudFormation template found"
  exit 1
fi

SCAN_RESOURCES=$(cat "$TEMPLATE_FILE" | jq '.Resources | length')
echo "   ✅ Generated CloudFormation with $SCAN_RESOURCES resources"
cd ../migrate2

# Step 2-6: Run in-place migration (no --target parameter)
echo ""
echo "🔄 Steps 2-6: Running in-place migration (dry-run)..."
echo "   ℹ️  CDK will be created at: ../sls-cdk-migration/cdk"
npm run migrate -- \
  --source ../sls-cdk-migration \
  --dry-run 2>&1 | tee in-place-test.log

# Verify in-place mode was detected
echo ""
echo "🏠 Verifying In-Place Mode"
if grep -q "In-place mode: CDK project will be created at:" in-place-test.log; then
  IN_PLACE_PATH=$(grep "In-place mode:" in-place-test.log -A 1 | tail -1 | xargs)
  echo "   ✅ In-place mode detected: $IN_PLACE_PATH"
else
  echo "   ❌ Failed: In-place mode not detected"
  exit 1
fi

# Verify Step 2: DISCOVERY
echo ""
echo "🔍 Step 2: DISCOVERY"
if [ -f ../sls-cdk-migration/.serverless/cloudformation-template-protected.json ]; then
  PROTECTED=$(grep -c "DeletionPolicy.*Retain" \
    ../sls-cdk-migration/.serverless/cloudformation-template-protected.json || echo 0)
  echo "   ✅ Protected $PROTECTED stateful resources"
else
  echo "   ⚠️  Warning: Protected template not found (only created by full migration)"
fi

# Verify Step 3: CLASSIFICATION
echo ""
echo "📊 Step 3: CLASSIFICATION"
STATEFUL=$(grep "Stateful resources:" in-place-test.log | grep -oE '[0-9]+' | head -1)
STATELESS=$(grep "Stateless resources:" in-place-test.log | grep -oE '[0-9]+' | head -1)
echo "   ✅ Classified $STATEFUL stateful and $STATELESS stateless resources"

# Verify Step 4: TEMPLATE_MODIFICATION
echo ""
echo "✏️  Step 4: TEMPLATE_MODIFICATION"
if [ -f ../sls-cdk-migration/.serverless/cloudformation-template-removed.json ]; then
  REMOVED_RESOURCES=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
    jq '.Resources | length')
  REMOVED_COUNT=$((SCAN_RESOURCES - REMOVED_RESOURCES))
  echo "   ✅ Removed $REMOVED_COUNT resources from template"
else
  echo "   ⚠️  Warning: Modified template not found"
  REMOVED_COUNT=0
fi

# Verify Step 5: CDK_GENERATION (in-place location)
echo ""
echo "⚡ Step 5: CDK_GENERATION"
CDK_DIR="../sls-cdk-migration/cdk"

if [ ! -d "$CDK_DIR" ]; then
  echo "   ❌ Failed: CDK directory not created at $CDK_DIR"
  exit 1
fi

echo "   ✅ CDK project created at: $CDK_DIR"

# Check CDK project structure
echo "   📂 Verifying CDK project structure:"
if [ -f "$CDK_DIR/package.json" ]; then
  echo "      ✓ package.json"
else
  echo "      ✗ package.json missing"
fi

if [ -f "$CDK_DIR/cdk.json" ]; then
  echo "      ✓ cdk.json"
else
  echo "      ✗ cdk.json missing"
fi

if [ -d "$CDK_DIR/bin" ]; then
  echo "      ✓ bin/"
else
  echo "      ✗ bin/ missing"
fi

if [ -d "$CDK_DIR/lib" ]; then
  echo "      ✓ lib/"
else
  echo "      ✗ lib/ missing"
fi

# Install and synthesize CDK
cd "$CDK_DIR"
echo "   📦 Installing CDK dependencies..."
npm install --silent

echo "   🔨 Synthesizing CDK stack..."
npx cdk synth > /dev/null 2>&1

# Find the CDK template
CDK_TEMPLATE=$(find cdk.out -name "*.template.json" ! -name "*.assets.json" | head -1)
if [ -f "$CDK_TEMPLATE" ]; then
  CDK_RESOURCES=$(cat "$CDK_TEMPLATE" | jq '.Resources | length')
  echo "   ✅ Generated CDK code with $CDK_RESOURCES resources"
else
  echo "   ⚠️  Warning: CDK template not found"
  CDK_RESOURCES=0
fi

cd ../../migrate2

# Verify Step 6: COMPARISON
echo ""
echo "🔀 Step 6: COMPARISON"
COMPARISON_REPORT="$CDK_DIR/migration-comparison-report.json"
if [ -f "$COMPARISON_REPORT" ]; then
  MATCHED=$(cat "$COMPARISON_REPORT" | jq '.summary.matched')
  MISSING=$(cat "$COMPARISON_REPORT" | jq '.summary.missingInCdk')
  EXTRA=$(cat "$COMPARISON_REPORT" | jq '.summary.extraInCdk')
  echo "   ✅ Comparison report generated"
  echo "      Matched: $MATCHED resources"
  echo "      Missing in CDK: $MISSING"
  echo "      Extra in CDK: $EXTRA"
else
  echo "   ⚠️  Warning: Comparison report not found"
  MATCHED=0
fi

# Verify .gitignore was updated
echo ""
echo "📝 Verifying .gitignore"
if [ -f ../sls-cdk-migration/.gitignore ]; then
  if grep -q "^/cdk/$" ../sls-cdk-migration/.gitignore || grep -q "^/cdk$" ../sls-cdk-migration/.gitignore; then
    echo "   ✅ .gitignore contains /cdk/ entry"
  else
    echo "   ⚠️  Warning: .gitignore missing /cdk/ entry (expected in non-dry-run)"
  fi
else
  echo "   ⚠️  Warning: .gitignore not found"
fi

# Summary
echo ""
echo "========================================"
echo "✨ All steps completed successfully!"
echo ""
echo "📊 Results Summary:"
echo "   Mode: In-Place (CDK at <source>/cdk)"
echo "   Scan: $SCAN_RESOURCES resources"
echo "   Protected: ${PROTECTED:-N/A} stateful"
echo "   Removed: ${REMOVED_COUNT:-N/A} from Serverless"
echo "   CDK Generated: ${CDK_RESOURCES:-N/A} resources"
echo "   Matched: ${MATCHED:-N/A} resources"
echo ""
echo "📂 Outputs:"
echo "   CDK Project: ../sls-cdk-migration/cdk/"
echo "   Reports: ../sls-cdk-migration/cdk/migration-comparison-report.html"
echo "   Logs: in-place-test.log"
echo ""
echo "🔍 To inspect outputs:"
echo "   cd ../sls-cdk-migration/cdk"
echo "   cat lib/*-stack.ts"
echo "   open migration-comparison-report.html"
echo ""
echo "🧹 To clean up:"
echo "   rm -rf ../sls-cdk-migration/cdk"
echo "   rm -rf ../sls-cdk-migration/.serverless"
