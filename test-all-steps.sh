#!/bin/bash
set -e

echo "🚀 Complete Migration Step-by-Step Test"
echo "========================================"

cd /Users/ianhorton/development/sls-to-cdk/migrate2

# Clean
echo ""
echo "🧹 Cleaning previous test outputs..."
rm -rf ../foo-test
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

# Step 2-6: Run migration
echo ""
echo "🔄 Steps 2-6: Running migration (dry-run)..."
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-test \
  --dry-run 2>&1 | tee full-test.log

# Verify Step 2: DISCOVERY
echo ""
echo "🔍 Step 2: DISCOVERY"
# The migration tool creates cloudformation-template-protected.json
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
STATEFUL=$(grep "Stateful resources:" full-test.log | grep -oE '[0-9]+' | head -1)
echo "   ✅ Classified $STATEFUL stateful resources"

# Verify Step 4: TEMPLATE_MODIFICATION
echo ""
echo "✏️  Step 4: TEMPLATE_MODIFICATION"
REMOVED_RESOURCES=$(cat ../sls-cdk-migration/.serverless/cloudformation-template-removed.json | \
  jq '.Resources | length')
REMOVED_COUNT=$((SCAN_RESOURCES - REMOVED_RESOURCES))
echo "   ✅ Removed $REMOVED_COUNT resources from template"

# Verify Step 5: CDK_GENERATION
echo ""
echo "⚡ Step 5: CDK_GENERATION"
cd ../foo-test
npm install --silent
npx cdk synth > /dev/null 2>&1
CDK_RESOURCES=$(cat cdk.out/FooStack.template.json | jq '.Resources | length')
echo "   ✅ Generated CDK code with $CDK_RESOURCES resources"
cd ../migrate2

# Verify Step 6: COMPARISON
echo ""
echo "🔀 Step 6: COMPARISON"
MATCHED=$(cat ../foo-test/migration-comparison-report.json | jq '.summary.matched')
echo "   ✅ Matched $MATCHED resources between Serverless and CDK"

# Summary
echo ""
echo "========================================"
echo "✨ All steps completed successfully!"
echo ""
echo "📊 Results Summary:"
echo "   Scan: $SCAN_RESOURCES resources"
echo "   Protected: $PROTECTED stateful"
echo "   Removed: $REMOVED_COUNT from Serverless"
echo "   CDK Generated: $CDK_RESOURCES resources"
echo "   Matched: $MATCHED resources"
echo ""
echo "📂 Outputs:"
echo "   CDK Project: ../foo-test"
echo "   Reports: ../foo-test/migration-comparison-report.html"
echo ""
echo "🔍 To inspect outputs:"
echo "   cat ../foo-test/lib/foo-stack.ts"
echo "   open ../foo-test/migration-comparison-report.html"
