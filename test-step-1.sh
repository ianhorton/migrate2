#!/bin/bash
set -e

echo "📡 Testing Step 1: INITIAL_SCAN"

# Clean previous runs
rm -rf ../sls-cdk-migration/.serverless

# Generate CloudFormation
cd ../sls-cdk-migration
sls package --stage dev

# Find the generated CloudFormation template
# Serverless creates either cloudformation-template-update-stack.json or cloudformation-template-create-stack.json
TEMPLATE_FILE=""
if [ -f .serverless/cloudformation-template-update-stack.json ]; then
  TEMPLATE_FILE=".serverless/cloudformation-template-update-stack.json"
elif [ -f .serverless/cloudformation-template-create-stack.json ]; then
  TEMPLATE_FILE=".serverless/cloudformation-template-create-stack.json"
else
  echo "❌ Failed: CloudFormation template not generated"
  ls -la .serverless/
  exit 1
fi

echo "✅ Found template: $TEMPLATE_FILE"

RESOURCE_COUNT=$(cat "$TEMPLATE_FILE" | jq '.Resources | length')
echo "✅ Found $RESOURCE_COUNT resources"

# Check for required resources
REQUIRED=("ServerlessDeploymentBucket" "CounterLogGroup" "counterTable" "CounterLambdaFunction" "IamRoleLambdaExecution")
for resource in "${REQUIRED[@]}"; do
  if cat "$TEMPLATE_FILE" | jq -e ".Resources.$resource" > /dev/null; then
    echo "✅ Found: $resource"
  else
    echo "❌ Missing: $resource"
  fi
done

cd ../migrate2
echo ""
echo "✨ Step 1 completed successfully"
