#!/bin/bash

# Messy Environment Manual Testing Script
# This script helps you quickly set up and test messy environment features

set -e

# Global variables
AWS_PROFILE=""
AWS_PROFILE_FLAG=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# List available AWS profiles
list_aws_profiles() {
  if [ -f ~/.aws/credentials ]; then
    grep '^\[' ~/.aws/credentials | tr -d '[]' | grep -v '^#'
  elif [ -f ~/.aws/config ]; then
    grep '^\[profile' ~/.aws/config | sed 's/\[profile \(.*\)\]/\1/'
  fi
}

# Select AWS profile
select_aws_profile() {
  print_header "AWS Profile Selection"

  # List available profiles
  PROFILES=($(list_aws_profiles))

  if [ ${#PROFILES[@]} -eq 0 ]; then
    print_warning "No AWS profiles found in ~/.aws/credentials or ~/.aws/config"
    print_info "Using default credentials"
    AWS_PROFILE=""
    AWS_PROFILE_FLAG=""
    return
  fi

  print_info "Available AWS profiles:"
  echo ""

  for i in "${!PROFILES[@]}"; do
    echo "  $((i+1)). ${PROFILES[$i]}"
  done
  echo "  0. Use default (no profile)"
  echo ""

  read -p "Select profile (0-${#PROFILES[@]}): " profile_choice

  if [ "$profile_choice" == "0" ]; then
    print_info "Using default credentials (no profile)"
    AWS_PROFILE=""
    AWS_PROFILE_FLAG=""
  elif [ "$profile_choice" -ge 1 ] && [ "$profile_choice" -le "${#PROFILES[@]}" ]; then
    AWS_PROFILE="${PROFILES[$((profile_choice-1))]}"
    AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
    print_success "Selected profile: $AWS_PROFILE"
  else
    print_error "Invalid selection"
    select_aws_profile
  fi
}

# Check prerequisites
check_prerequisites() {
  print_header "Checking Prerequisites"

  # Check AWS CLI
  if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found. Please install it first."
    exit 1
  fi
  print_success "AWS CLI installed"

  # Check AWS credentials
  if ! aws sts get-caller-identity $AWS_PROFILE_FLAG &> /dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure'"
    exit 1
  fi
  print_success "AWS credentials configured"

  # Get AWS account info
  ACCOUNT_ID=$(aws sts get-caller-identity $AWS_PROFILE_FLAG --query Account --output text)
  REGION=$(aws configure get region $AWS_PROFILE_FLAG)

  if [ -n "$AWS_PROFILE" ]; then
    print_info "AWS Profile: $AWS_PROFILE"
  fi
  print_info "AWS Account: $ACCOUNT_ID"
  print_info "Region: $REGION"

  # Check Node.js
  if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+"
    exit 1
  fi
  NODE_VERSION=$(node --version)
  print_success "Node.js installed ($NODE_VERSION)"

  # Check CDK
  if ! command -v cdk &> /dev/null; then
    print_warning "CDK not found globally. Will use npx cdk"
  else
    CDK_VERSION=$(cdk --version)
    print_success "CDK installed ($CDK_VERSION)"
  fi
}

# Setup test directory
setup_test_dir() {
  print_header "Setting Up Test Directory"

  TEST_DIR="test-manual-$(date +%s)"
  mkdir -p "$TEST_DIR/serverless-project"
  cd "$TEST_DIR/serverless-project"

  print_success "Created test directory: $TEST_DIR"
}

# Create test serverless project
create_serverless_project() {
  print_header "Creating Test Serverless Project"

  cat > serverless.yml << 'EOF'
service: messy-env-test

provider:
  name: aws
  runtime: nodejs18.x
  region: ${env:AWS_DEFAULT_REGION, 'us-east-1'}

resources:
  Resources:
    # Scenario 1: Exact match (high confidence)
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: messy-test-users
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        Tags:
          - Key: Environment
            Value: test
          - Key: ManagedBy
            Value: sls-to-cdk-test

    # Scenario 2: Fuzzy match (medium confidence)
    OrdersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: messy-test-order  # AWS will have "messy-test-orders"
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        Tags:
          - Key: Environment
            Value: test

    # Scenario 3: Will have drift (AWS modified)
    SessionsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: messy-test-sessions
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: sessionId
            AttributeType: S
        KeySchema:
          - AttributeName: sessionId
            KeyType: HASH
        # Note: AWS will have TTL enabled (drift!)

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
EOF

  # Create simple handler
  cat > handler.js << 'EOF'
'use strict';

module.exports.hello = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from Serverless!',
      input: event,
    }),
  };
};
EOF

  # Create package.json
  cat > package.json << 'EOF'
{
  "name": "messy-env-test",
  "version": "1.0.0",
  "description": "Test project for messy environment migration",
  "scripts": {
    "test": "echo \"No tests\""
  }
}
EOF

  print_success "Created serverless.yml"
  print_success "Created handler.js"
  print_success "Created package.json"
}

# Create AWS test resources
create_aws_resources() {
  print_header "Creating AWS Test Resources"

  print_info "This will create DynamoDB tables in your AWS account"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Skipping AWS resource creation"
    return
  fi

  # Exact match table
  print_info "Creating messy-test-users table..."
  aws dynamodb create-table $AWS_PROFILE_FLAG \
    --table-name messy-test-users \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Environment,Value=test Key=ManagedBy,Value=sls-to-cdk-test \
    > /dev/null 2>&1 || print_warning "Table already exists"

  print_success "Created messy-test-users (exact match scenario)"

  # Fuzzy match table (note the 's' at the end)
  print_info "Creating messy-test-orders table..."
  aws dynamodb create-table $AWS_PROFILE_FLAG \
    --table-name messy-test-orders \
    --attribute-definitions AttributeName=id,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Environment,Value=test \
    > /dev/null 2>&1 || print_warning "Table already exists"

  print_success "Created messy-test-orders (fuzzy match scenario)"

  # Drift scenario table
  print_info "Creating messy-test-sessions table..."
  aws dynamodb create-table $AWS_PROFILE_FLAG \
    --table-name messy-test-sessions \
    --attribute-definitions AttributeName=sessionId,AttributeType=S \
    --key-schema AttributeName=sessionId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    > /dev/null 2>&1 || print_warning "Table already exists"

  # Enable TTL to create drift
  sleep 2  # Wait for table to be active
  print_info "Enabling TTL (creates drift)..."
  aws dynamodb update-time-to-live $AWS_PROFILE_FLAG \
    --table-name messy-test-sessions \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" \
    > /dev/null 2>&1 || print_warning "TTL already enabled"

  print_success "Created messy-test-sessions (drift scenario)"

  print_success "All AWS test resources created"
}

# Run basic migration test
run_basic_test() {
  print_header "Test 1: Basic Migration with Auto-Discovery"

  cd ../..  # Back to project root

  print_info "Running migration with auto-discovery..."
  AWS_PROFILE=$AWS_PROFILE npm run migrate -- \
    --source "./$TEST_DIR/serverless-project" \
    --dry-run \
    2>&1 | tee "./$TEST_DIR/test-1-output.log"

  print_success "Test 1 complete - Check ./$TEST_DIR/test-1-output.log"
}

# Run drift detection test
run_drift_test() {
  print_header "Test 2: Drift Detection"

  print_info "Running migration with drift detection..."
  AWS_PROFILE=$AWS_PROFILE npm run migrate -- \
    --source "./$TEST_DIR/serverless-project" \
    --enable-drift-detection \
    --dry-run \
    2>&1 | tee "./$TEST_DIR/test-2-output.log"

  print_success "Test 2 complete - Check ./$TEST_DIR/test-2-output.log"
}

# Run confidence scoring test
run_confidence_test() {
  print_header "Test 3: Confidence Scoring Analysis"

  print_info "Analyzing confidence scores..."
  AWS_PROFILE=$AWS_PROFILE npm run migrate -- \
    --source "./$TEST_DIR/serverless-project" \
    --show-confidence-breakdown \
    --dry-run \
    2>&1 | tee "./$TEST_DIR/test-3-output.log"

  print_success "Test 3 complete - Check ./$TEST_DIR/test-3-output.log"
}

# Show generated CDK code
show_generated_code() {
  print_header "Generated CDK Code"

  CDK_STACK="./$TEST_DIR/serverless-project/cdk/lib/cdk-stack.ts"

  if [ -f "$CDK_STACK" ]; then
    print_info "CDK Stack file:"
    cat "$CDK_STACK"
  else
    print_warning "CDK code not yet generated. Run a non-dry-run migration first."
  fi
}

# Show reports
show_reports() {
  print_header "Generated Reports"

  MIGRATION_STATE=".migration-state"

  if [ -d "$MIGRATION_STATE" ]; then
    print_info "Migration state directory contents:"
    ls -lh "$MIGRATION_STATE"

    if [ -f "$MIGRATION_STATE/manual-review-report.html" ]; then
      print_success "HTML report available: $MIGRATION_STATE/manual-review-report.html"
      read -p "Open in browser? (y/n) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$MIGRATION_STATE/manual-review-report.html" 2>/dev/null || \
        xdg-open "$MIGRATION_STATE/manual-review-report.html" 2>/dev/null || \
        print_warning "Could not open browser. Open manually: $MIGRATION_STATE/manual-review-report.html"
      fi
    fi

    if [ -f "$MIGRATION_STATE/interventions.json" ]; then
      print_success "Audit trail available: $MIGRATION_STATE/interventions.json"
      print_info "Audit trail contents:"
      cat "$MIGRATION_STATE/interventions.json" | jq '.' 2>/dev/null || \
      cat "$MIGRATION_STATE/interventions.json"
    fi
  else
    print_warning "No migration state found. Run migration first."
  fi
}

# Clean up test resources
cleanup() {
  print_header "Cleanup Test Resources"

  read -p "Delete AWS test resources? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Deleting DynamoDB tables..."

    aws dynamodb delete-table $AWS_PROFILE_FLAG --table-name messy-test-users > /dev/null 2>&1 || true
    aws dynamodb delete-table $AWS_PROFILE_FLAG --table-name messy-test-orders > /dev/null 2>&1 || true
    aws dynamodb delete-table $AWS_PROFILE_FLAG --table-name messy-test-sessions > /dev/null 2>&1 || true

    print_success "AWS resources deleted"
  fi

  read -p "Delete local test directory? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd ..
    rm -rf "$TEST_DIR"
    rm -rf .migration-state
    print_success "Local test directory deleted"
  fi
}

# Interactive menu
show_menu() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Messy Environment Testing Menu${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

  # Show current profile
  if [ -n "$AWS_PROFILE" ]; then
    print_info "Current AWS Profile: $AWS_PROFILE"
  else
    print_info "Current AWS Profile: default"
  fi
  echo ""

  echo "P. Select AWS profile"
  echo "1. Check prerequisites"
  echo "2. Setup test environment (create test project & AWS resources)"
  echo "3. Run Test 1: Basic migration with auto-discovery (dry-run)"
  echo "4. Run Test 2: Migration with drift detection (dry-run)"
  echo "5. Run Test 3: Confidence scoring analysis (dry-run)"
  echo "6. Show generated CDK code"
  echo "7. Show generated reports"
  echo "8. Run FULL migration (execute actual import)"
  echo "9. Clean up test resources"
  echo "0. Exit"
  echo ""
  read -p "Select option: " choice
  echo ""

  case $choice in
    P|p) select_aws_profile ;;
    1) check_prerequisites ;;
    2)
      setup_test_dir
      create_serverless_project
      create_aws_resources
      ;;
    3) run_basic_test ;;
    4) run_drift_test ;;
    5) run_confidence_test ;;
    6) show_generated_code ;;
    7) show_reports ;;
    8)
      print_header "Running FULL Migration"
      print_warning "This will execute actual CDK import!"
      read -p "Are you sure? (yes/no) " -r
      echo
      if [[ $REPLY == "yes" ]]; then
        AWS_PROFILE=$AWS_PROFILE npm run migrate -- \
          --source "./$TEST_DIR/serverless-project" \
          --enable-drift-detection \
          --execute-import \
          2>&1 | tee "./$TEST_DIR/full-migration.log"
      else
        print_info "Cancelled"
      fi
      ;;
    9) cleanup ;;
    0)
      print_info "Goodbye!"
      exit 0
      ;;
    *)
      print_error "Invalid option"
      ;;
  esac
}

# Main execution
main() {
  clear

  echo -e "${GREEN}"
  cat << "EOF"
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   Serverless-to-CDK Migration Tool                       ║
  ║   Messy Environment Testing Script                       ║
  ║                                                           ║
  ║   Version 2.0.0                                           ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"

  # Parse command-line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --profile)
        AWS_PROFILE="$2"
        AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
        print_info "Using AWS profile: $AWS_PROFILE"
        shift 2
        ;;
      setup|test1|test2|test3|full|cleanup)
        # Command argument - process below
        COMMAND="$1"
        shift
        ;;
      *)
        print_error "Unknown argument: $1"
        echo "Usage: $0 [--profile PROFILE_NAME] [setup|test1|test2|test3|full|cleanup]"
        exit 1
        ;;
    esac
  done

  # If no command specified, show interactive menu
  if [ -z "$COMMAND" ]; then
    # Ask for profile if not specified
    if [ -z "$AWS_PROFILE" ]; then
      select_aws_profile
    fi

    while true; do
      show_menu
      echo ""
      read -p "Press Enter to continue..."
    done
  else
    # Run specific test by command
    case $COMMAND in
      setup)
        check_prerequisites
        setup_test_dir
        create_serverless_project
        create_aws_resources
        ;;
      test1) run_basic_test ;;
      test2) run_drift_test ;;
      test3) run_confidence_test ;;
      full)
        print_warning "Running FULL migration"
        AWS_PROFILE=$AWS_PROFILE npm run migrate -- \
          --source "./$TEST_DIR/serverless-project" \
          --enable-drift-detection \
          --execute-import
        ;;
      cleanup) cleanup ;;
      *)
        print_error "Unknown command: $COMMAND"
        echo "Usage: $0 [--profile PROFILE_NAME] [setup|test1|test2|test3|full|cleanup]"
        exit 1
        ;;
    esac
  fi
}

# Run main
main "$@"
