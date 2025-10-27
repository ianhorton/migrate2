#!/bin/bash

# Messy Environment Manual Testing Script
# This script helps you quickly set up and test messy environment features

set -e

# Global variables
AWS_PROFILE=""
AWS_PROFILE_FLAG=""
PROJECT_ROOT=""
TEST_DIR=""
STATE_FILE=".test-state.json"
CLEAN_EXIT=false

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

print_command() {
  echo -e "${YELLOW}▶ Running: $1${NC}"
}

# State management functions
save_state() {
  cat > "$PROJECT_ROOT/$STATE_FILE" << EOF
{
  "test_dir": "$TEST_DIR",
  "aws_profile": "$AWS_PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "resources": {
    "serverless_deployed": ${SERVERLESS_DEPLOYED:-false},
    "messy_resources_created": ${MESSY_RESOURCES_CREATED:-false},
    "manual_bucket": "$MANUAL_BUCKET",
    "cdk_deployed": ${CDK_DEPLOYED:-false}
  }
}
EOF
  print_info "State saved to $STATE_FILE"
}

load_state() {
  if [ -f "$PROJECT_ROOT/$STATE_FILE" ]; then
    if command -v jq &> /dev/null; then
      TEST_DIR=$(jq -r '.test_dir // ""' "$PROJECT_ROOT/$STATE_FILE")
      AWS_PROFILE=$(jq -r '.aws_profile // ""' "$PROJECT_ROOT/$STATE_FILE")
      SERVERLESS_DEPLOYED=$(jq -r '.resources.serverless_deployed // false' "$PROJECT_ROOT/$STATE_FILE")
      MESSY_RESOURCES_CREATED=$(jq -r '.resources.messy_resources_created // false' "$PROJECT_ROOT/$STATE_FILE")
      MANUAL_BUCKET=$(jq -r '.resources.manual_bucket // ""' "$PROJECT_ROOT/$STATE_FILE")
      CDK_DEPLOYED=$(jq -r '.resources.cdk_deployed // false' "$PROJECT_ROOT/$STATE_FILE")
    else
      TEST_DIR=$(grep '"test_dir"' "$PROJECT_ROOT/$STATE_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/')
      AWS_PROFILE=$(grep '"aws_profile"' "$PROJECT_ROOT/$STATE_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/')
      SERVERLESS_DEPLOYED=false
      MESSY_RESOURCES_CREATED=false
    fi

    if [ -n "$AWS_PROFILE" ]; then
      AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
    fi

    return 0
  fi
  return 1
}

clear_state() {
  if [ -f "$PROJECT_ROOT/$STATE_FILE" ]; then
    rm -f "$PROJECT_ROOT/$STATE_FILE"
    print_info "State file cleared"
  fi
}

# Cleanup function for trap handlers
cleanup_on_error() {
  local exit_code=$?

  # Don't show error message if this is a clean exit
  if [ "$CLEAN_EXIT" = true ]; then
    exit 0
  fi

  # Don't show error message if exit code is 0 (normal exit)
  if [ $exit_code -eq 0 ]; then
    exit 0
  fi

  print_error "\n\nScript interrupted or crashed!"
  print_warning "State has been preserved in $STATE_FILE"
  print_info "Run the script again and choose option 'C' to clean up resources"
  print_info "Or run: $0 cleanup"
  exit 1
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

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

  TEST_DIR="test-manual-$(date +%s)"
  mkdir -p "$TEST_DIR/serverless-project"
  cd "$TEST_DIR/serverless-project"

  print_success "Created test directory: $TEST_DIR"

  # Save state
  cd "$PROJECT_ROOT"
  save_state
}

# Create test serverless project
create_serverless_project() {
  print_header "Creating Test Serverless Project"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if load_state; then
      print_info "Loaded test directory from state: $TEST_DIR"
    else
      print_error "No test directory found in state"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if files already exist (idempotent)
  if [ -f "$PROJECT_ROOT/$TEST_DIR/serverless-project/serverless.yml" ]; then
    print_warning "Serverless project files already exist"
    echo -n "Recreate files? This will overwrite existing files. (y/n) "
    read -r RECREATE_ANSWER
    if [[ ! $RECREATE_ANSWER =~ ^[Yy]$ ]]; then
      print_info "Skipping file creation"
      return 0
    fi
    print_info "Recreating serverless project files..."
  fi

  # Ensure directory exists
  local TARGET_DIR="$PROJECT_ROOT/$TEST_DIR/serverless-project"
  mkdir -p "$TARGET_DIR"

  # Validate directory was created
  if [ ! -d "$TARGET_DIR" ]; then
    print_error "Failed to create directory: $TARGET_DIR"
    return 1
  fi

  print_info "Creating files in: $TARGET_DIR"

  # Create serverless.yml with profile if set (using absolute path)
  if [ -n "$AWS_PROFILE" ]; then
    print_info "Configuring serverless.yml with AWS profile: $AWS_PROFILE"
    cat > "$TARGET_DIR/serverless.yml" << EOF
service: messy-env-test

plugins:
  - serverless-better-credentials

provider:
  name: aws
  runtime: nodejs18.x
  region: \${env:AWS_DEFAULT_REGION, 'eu-west-2'}
  profile: $AWS_PROFILE

resources:
EOF
  else
    print_info "Configuring serverless.yml without specific profile (using default)"
    cat > "$TARGET_DIR/serverless.yml" << 'EOF'
service: messy-env-test

plugins:
  - serverless-better-credentials

provider:
  name: aws
  runtime: nodejs18.x
  region: ${env:AWS_DEFAULT_REGION, 'eu-west-2'}

resources:
EOF
  fi

  # Continue with resources section (same for both cases)
  cat >> "$TARGET_DIR/serverless.yml" << 'EOF'
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

  # Create simple handler (using absolute path)
  cat > "$TARGET_DIR/handler.js" << 'EOF'
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

  # Create package.json (using absolute path)
  cat > "$TARGET_DIR/package.json" << 'EOF'
{
  "name": "messy-env-test",
  "version": "1.0.0",
  "description": "Test project for messy environment migration",
  "scripts": {
    "test": "echo \"No tests\""
  },
  "devDependencies": {
    "serverless": "^3.38.0",
    "serverless-better-credentials": "^2.0.0"
  }
}
EOF

  print_success "Created serverless.yml"
  print_success "Created handler.js"
  print_success "Created package.json"

  # Verify all files were created
  if [ ! -f "$TARGET_DIR/serverless.yml" ] || [ ! -f "$TARGET_DIR/handler.js" ] || [ ! -f "$TARGET_DIR/package.json" ]; then
    print_error "Failed to create all required files!"
    return 1
  fi

  # Install dependencies (including serverless-better-credentials)
  print_info "Installing serverless and plugins..."
  print_command "cd $TARGET_DIR && npm install --silent"
  (cd "$TARGET_DIR" && npm install --silent)

  print_success "Installed serverless-better-credentials plugin for AWS SSO support"
  print_success "All files created in: $TARGET_DIR"
}

# Export SSO credentials to ~/.aws/credentials
export_sso_credentials() {
  print_header "Exporting SSO Credentials to ~/.aws/credentials"

  if [ -z "$AWS_PROFILE" ]; then
    print_error "No AWS profile selected"
    return 1
  fi

  print_info "This creates a temporary credentials file for tools that don't support SSO"
  print_warning "Note: These credentials are temporary and will expire"

  # Get temporary credentials from current SSO session
  print_info "Extracting credentials from SSO session..."
  print_command "aws configure export-credentials --profile $AWS_PROFILE"

  # Capture both stdout and stderr for debugging
  EXPORT_OUTPUT=$(aws configure export-credentials --profile "$AWS_PROFILE" 2>&1)
  EXPORT_EXIT_CODE=$?

  if [ $EXPORT_EXIT_CODE -ne 0 ]; then
    print_error "Failed to export credentials from SSO session"
    print_warning "Error output:"
    echo "$EXPORT_OUTPUT"
    echo ""
    print_info "Trying alternative method using environment variables..."

    # Alternative: Use aws sts get-session-token or read from env
    if ! aws sts get-caller-identity $AWS_PROFILE_FLAG &> /dev/null; then
      print_error "SSO session is not active"
      print_warning "Please run: aws sso login --profile $AWS_PROFILE"
      return 1
    fi

    # Try to get credentials from environment after assuming profile
    print_info "Attempting to extract from current session..."

    # Export current AWS credentials to variables
    eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env 2>/dev/null)"

    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
      print_error "Could not extract credentials using any method"
      print_warning "Your AWS CLI version may not support 'configure export-credentials'"
      print_info "Alternative: Manually copy credentials from:"
      echo "  aws configure export-credentials --profile $AWS_PROFILE"
      return 1
    fi
  else
    # Parse JSON output using jq if available, otherwise use grep
    if command -v jq &> /dev/null; then
      print_info "Using jq to parse credentials..."
      AWS_ACCESS_KEY_ID=$(echo "$EXPORT_OUTPUT" | jq -r '.AccessKeyId // empty')
      AWS_SECRET_ACCESS_KEY=$(echo "$EXPORT_OUTPUT" | jq -r '.SecretAccessKey // empty')
      AWS_SESSION_TOKEN=$(echo "$EXPORT_OUTPUT" | jq -r '.SessionToken // empty')
    else
      print_info "Using grep to parse credentials (jq not available)..."
      AWS_ACCESS_KEY_ID=$(echo "$EXPORT_OUTPUT" | grep -o '"AccessKeyId": *"[^"]*' | sed 's/"AccessKeyId": *"//')
      AWS_SECRET_ACCESS_KEY=$(echo "$EXPORT_OUTPUT" | grep -o '"SecretAccessKey": *"[^"]*' | sed 's/"SecretAccessKey": *"//')
      AWS_SESSION_TOKEN=$(echo "$EXPORT_OUTPUT" | grep -o '"SessionToken": *"[^"]*' | sed 's/"SessionToken": *"//')
    fi
  fi

  # Validate we got the credentials
  if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    print_error "Failed to extract credentials from SSO session"
    print_warning "Credentials found:"
    echo "  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:+[SET]} ${AWS_ACCESS_KEY_ID:-[NOT SET]}"
    echo "  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+[SET]} ${AWS_SECRET_ACCESS_KEY:-[NOT SET]}"
    echo "  AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:+[SET]} ${AWS_SESSION_TOKEN:-[NOT SET]}"
    return 1
  fi

  print_success "Successfully extracted credentials"

  # Backup existing credentials if they exist
  if [ -f ~/.aws/credentials ]; then
    BACKUP_FILE=~/.aws/credentials.backup.$(date +%s)
    print_info "Backing up existing credentials to: $BACKUP_FILE"
    cp ~/.aws/credentials "$BACKUP_FILE"
  fi

  # Create credentials file
  mkdir -p ~/.aws

  print_info "Writing temporary credentials to ~/.aws/credentials"
  print_command "Creating credentials file for profile: $AWS_PROFILE"

  cat > ~/.aws/credentials << EOF
[$AWS_PROFILE]
aws_access_key_id = $AWS_ACCESS_KEY_ID
aws_secret_access_key = $AWS_SECRET_ACCESS_KEY
aws_session_token = $AWS_SESSION_TOKEN
region = eu-west-2
output = json
EOF

  print_success "Credentials exported to ~/.aws/credentials"
  print_warning "These are temporary credentials and will expire with your SSO session"
  print_info "Profile name: $AWS_PROFILE"

  # Test the credentials
  if aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
    print_success "Credentials verified successfully"

    # Show expiration info if available
    if command -v jq &> /dev/null; then
      EXPIRATION=$(echo "$EXPORT_OUTPUT" | jq -r '.Expiration // empty')
    else
      EXPIRATION=$(echo "$EXPORT_OUTPUT" | grep -o '"Expiration": *"[^"]*' | sed 's/"Expiration": *"//')
    fi

    if [ -n "$EXPIRATION" ]; then
      print_info "Credentials expire at: $EXPIRATION"
    fi
  else
    print_error "Credentials verification failed"
    return 1
  fi

  return 0
}

# Check AWS SSO credentials validity
check_sso_credentials() {
  print_info "Checking AWS SSO credentials..."

  if ! aws sts get-caller-identity $AWS_PROFILE_FLAG &> /dev/null; then
    print_error "AWS credentials are invalid or expired"

    if [ -n "$AWS_PROFILE" ]; then
      print_warning "Your AWS SSO session has expired"
      echo ""
      echo -n "Run 'aws sso login' now? (y/n) "
      read -r SSO_LOGIN_ANSWER

      if [[ $SSO_LOGIN_ANSWER =~ ^[Yy]$ ]]; then
        print_command "aws sso login --profile $AWS_PROFILE"
        aws sso login --profile "$AWS_PROFILE"

        # Verify login was successful
        if aws sts get-caller-identity $AWS_PROFILE_FLAG &> /dev/null; then
          print_success "AWS SSO login successful"

          # Offer to export credentials
          echo ""
          echo -n "Export SSO credentials to ~/.aws/credentials? (y/n) "
          read -r EXPORT_ANSWER

          if [[ $EXPORT_ANSWER =~ ^[Yy]$ ]]; then
            export_sso_credentials
          fi

          return 0
        else
          print_error "AWS SSO login failed"
          return 1
        fi
      else
        print_warning "Please run: aws sso login --profile $AWS_PROFILE"
        return 1
      fi
    else
      print_error "AWS credentials not configured"
      return 1
    fi
  fi

  print_success "AWS credentials are valid"
  return 0
}

# Deploy serverless project
deploy_serverless_project() {
  print_header "Deploying Serverless Project"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if ! load_state; then
      print_error "No test environment found!"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if test directory exists
  if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
    print_error "Test directory not found: $PROJECT_ROOT/$TEST_DIR/serverless-project"
    print_info "Please run option 2 (Setup test environment) first"
    return 1
  fi

  # Check if serverless.yml exists
  if [ ! -f "$PROJECT_ROOT/$TEST_DIR/serverless-project/serverless.yml" ]; then
    print_error "serverless.yml not found in test directory"
    print_info "Please run option 2 (Setup test environment) first"
    return 1
  fi

  # Check credentials before deploying
  if ! check_sso_credentials; then
    print_error "Cannot deploy without valid AWS credentials"
    return 1
  fi

  print_info "This will deploy the serverless project to AWS"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Skipping serverless deployment"
    return 0
  fi

  cd "$PROJECT_ROOT/$TEST_DIR/serverless-project"

  # Deploy using serverless framework with better-credentials plugin
  print_info "Deploying serverless project (using serverless-better-credentials)..."
  if [ -n "$AWS_PROFILE" ]; then
    print_command "AWS_PROFILE=$AWS_PROFILE npx serverless deploy --verbose"
    AWS_PROFILE=$AWS_PROFILE npx serverless deploy --verbose
  else
    print_command "npx serverless deploy --verbose"
    npx serverless deploy --verbose
  fi

  print_success "Serverless project deployed"
  print_info "CloudFormation stack created: messy-env-test-dev"

  cd "$PROJECT_ROOT"

  # Mark as deployed and save state
  SERVERLESS_DEPLOYED=true
  save_state
}

# Create messy AWS resources (not in serverless.yml)
create_messy_resources() {
  print_header "Creating Messy AWS Resources"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if ! load_state; then
      print_error "No test environment found!"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if serverless is deployed
  if [ "$SERVERLESS_DEPLOYED" != "true" ]; then
    print_warning "Serverless project doesn't appear to be deployed"
    print_info "It's recommended to run option 3 (Deploy serverless project) first"
    echo -n "Continue anyway? (y/n) "
    read -r CONTINUE_ANSWER
    if [[ ! $CONTINUE_ANSWER =~ ^[Yy]$ ]]; then
      print_warning "Skipping messy resource creation"
      return 0
    fi
  fi

  # Check credentials before creating resources
  if ! check_sso_credentials; then
    print_error "Cannot create resources without valid AWS credentials"
    return 1
  fi

  print_info "This will create additional AWS resources NOT managed by serverless"
  print_info "This simulates a real messy environment scenario"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Skipping messy resource creation"
    return 0
  fi

  # Create a manually-managed table (not in serverless.yml)
  print_info "Creating manually-managed ProductsTable..."
  print_command "aws dynamodb create-table $AWS_PROFILE_FLAG --table-name messy-test-products-manual ..."
  aws dynamodb create-table $AWS_PROFILE_FLAG \
    --table-name messy-test-products-manual \
    --attribute-definitions AttributeName=productId,AttributeType=S \
    --key-schema AttributeName=productId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Environment,Value=test Key=ManagedBy,Value=manual-cli \
    > /dev/null 2>&1 || print_warning "Table already exists"

  print_success "Created messy-test-products-manual (manual resource)"

  # Wait for deployed table to be active, then modify it to create drift
  print_info "Waiting for deployed SessionsTable to be active..."
  print_command "aws dynamodb wait table-exists $AWS_PROFILE_FLAG --table-name messy-test-sessions"
  aws dynamodb wait table-exists $AWS_PROFILE_FLAG --table-name messy-test-sessions 2>/dev/null || true

  sleep 3
  print_info "Modifying deployed SessionsTable (creates drift)..."
  print_command "aws dynamodb update-time-to-live $AWS_PROFILE_FLAG --table-name messy-test-sessions ..."
  aws dynamodb update-time-to-live $AWS_PROFILE_FLAG \
    --table-name messy-test-sessions \
    --time-to-live-specification "Enabled=true,AttributeName=ttl" \
    > /dev/null 2>&1 || print_warning "TTL already enabled or table not ready"

  print_success "Created drift in SessionsTable (TTL enabled manually)"

  # Create another manual resource - S3 bucket
  MANUAL_BUCKET="messy-test-manual-bucket-$(date +%s)"
  print_info "Creating manually-managed S3 bucket: $MANUAL_BUCKET..."
  print_command "aws s3 mb $AWS_PROFILE_FLAG s3://$MANUAL_BUCKET"
  aws s3 mb $AWS_PROFILE_FLAG "s3://$MANUAL_BUCKET" > /dev/null 2>&1 || print_warning "Bucket creation failed"

  print_success "Created $MANUAL_BUCKET (manual S3 bucket)"

  print_success "All messy resources created"
  print_warning "Environment now has:"
  print_warning "  - CloudFormation stack from serverless deploy"
  print_warning "  - Manually created DynamoDB table (not in stack)"
  print_warning "  - Manually created S3 bucket (not in stack)"
  print_warning "  - Drift in SessionsTable (TTL added manually)"

  # Mark as created and save state
  MESSY_RESOURCES_CREATED=true
  save_state
}

# Run basic migration test
run_basic_test() {
  print_header "Test 1: Basic Migration (Dry-Run)"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if ! load_state; then
      print_error "No test environment found!"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if test directory exists
  if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
    print_error "Test directory not found: $PROJECT_ROOT/$TEST_DIR/serverless-project"
    print_info "Please run option 2 (Setup test environment) first"
    return 1
  fi

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

  print_info "Running migration in dry-run mode..."
  print_command "AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate --source ./$TEST_DIR/serverless-project --dry-run --verbose"
  AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate \
    --source "./$TEST_DIR/serverless-project" \
    --dry-run \
    --verbose \
    2>&1 | tee "./$TEST_DIR/test-1-output.log"

  print_success "Test 1 complete - Check ./$TEST_DIR/test-1-output.log"
}

# Run with auto-approve test
run_drift_test() {
  print_header "Test 2: Migration with Auto-Approve"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if ! load_state; then
      print_error "No test environment found!"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if test directory exists
  if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
    print_error "Test directory not found"
    return 1
  fi

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

  print_info "Running migration with auto-approve..."
  print_command "AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate --source ./$TEST_DIR/serverless-project --dry-run --auto-approve --verbose"
  AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate \
    --source "./$TEST_DIR/serverless-project" \
    --dry-run \
    --auto-approve \
    --verbose \
    2>&1 | tee "./$TEST_DIR/test-2-output.log"

  print_success "Test 2 complete - Check ./$TEST_DIR/test-2-output.log"
}

# Run with specific stage/region
run_confidence_test() {
  print_header "Test 3: Migration with Stage and Region"

  # Load state if TEST_DIR not set
  if [ -z "$TEST_DIR" ]; then
    if ! load_state; then
      print_error "No test environment found!"
      print_info "Please run option 2 (Setup test environment) first"
      return 1
    fi
  fi

  # Check if test directory exists
  if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
    print_error "Test directory not found"
    return 1
  fi

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

  print_info "Running migration with custom stage and region..."
  print_command "AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate --source ./$TEST_DIR/serverless-project --stage production --region eu-west-2 --dry-run --verbose"
  AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate \
    --source "./$TEST_DIR/serverless-project" \
    --stage production \
    --region eu-west-2 \
    --dry-run \
    --verbose \
    2>&1 | tee "./$TEST_DIR/test-3-output.log"

  print_success "Test 3 complete - Check ./$TEST_DIR/test-3-output.log"
}

# Show generated CDK code
show_generated_code() {
  print_header "Generated CDK Code"

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

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

  # Ensure we're in project root
  cd "$PROJECT_ROOT"

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

# Detect leftover resources from previous runs
detect_leftover_resources() {
  print_header "Checking for Leftover Resources"

  local found_leftovers=false
  local found_incomplete=false

  # Check for state file
  if [ -f "$PROJECT_ROOT/$STATE_FILE" ]; then
    print_warning "Found previous test state file: $STATE_FILE"
    found_leftovers=true

    # Load and display state
    if load_state; then
      echo ""
      print_info "Previous test details:"
      print_info "  Test directory: ${TEST_DIR:-unknown}"
      print_info "  AWS Profile: ${AWS_PROFILE:-default}"
      print_info "  Serverless deployed: ${SERVERLESS_DEPLOYED:-unknown}"
      print_info "  Messy resources: ${MESSY_RESOURCES_CREATED:-unknown}"
      if [ -n "$MANUAL_BUCKET" ]; then
        print_info "  Manual bucket: $MANUAL_BUCKET"
      fi

      # Check if test directory exists but is incomplete
      if [ -n "$TEST_DIR" ] && [ -d "$PROJECT_ROOT/$TEST_DIR" ]; then
        if [ ! -f "$PROJECT_ROOT/$TEST_DIR/serverless-project/serverless.yml" ]; then
          print_warning "Test directory exists but is incomplete (missing serverless.yml)"
          found_incomplete=true
        fi
      fi
    fi
  fi

  # Check for test directories
  local test_dirs=$(find "$PROJECT_ROOT" -maxdepth 1 -type d -name "test-manual-*" 2>/dev/null)
  if [ -n "$test_dirs" ]; then
    print_warning "Found previous test directories:"
    echo "$test_dirs" | while read dir; do
      local dir_name=$(basename "$dir")
      if [ ! -f "$dir/serverless-project/serverless.yml" ]; then
        print_info "  $dir_name (INCOMPLETE - missing files)"
      else
        print_info "  $dir_name"
      fi
    done
    found_leftovers=true
  fi

  # Check for migration state
  if [ -d "$PROJECT_ROOT/.migration-state" ]; then
    print_warning "Found previous migration state directory"
    found_leftovers=true
  fi

  if [ "$found_incomplete" = true ]; then
    echo ""
    print_warning "Incomplete test setup detected!"
    print_info "The test directory was created but files weren't generated"
    echo -n "Complete the setup now? (y/n) "
    read -r COMPLETE_ANSWER
    if [[ $COMPLETE_ANSWER =~ ^[Yy]$ ]]; then
      create_serverless_project
      return
    fi
  fi

  if [ "$found_leftovers" = true ]; then
    echo ""
    print_warning "Leftover resources detected from previous test runs"
    echo -n "Clean up now? (y/n) "
    read -r CLEANUP_ANSWER
    if [[ $CLEANUP_ANSWER =~ ^[Yy]$ ]]; then
      cleanup
    else
      print_info "Continuing with leftovers. You can clean up later with option 'C'"
    fi
  else
    print_success "No leftover resources detected"
  fi
}

# Clean up test resources
cleanup() {
  print_header "Cleanup Test Resources"

  # Load state from file if it exists
  if load_state; then
    print_success "Loaded previous test state"
    print_info "Test directory: ${TEST_DIR:-none}"
    print_info "AWS Profile: ${AWS_PROFILE:-default}"
    print_info "Serverless deployed: ${SERVERLESS_DEPLOYED:-false}"
    print_info "Messy resources created: ${MESSY_RESOURCES_CREATED:-false}"
    if [ -n "$MANUAL_BUCKET" ]; then
      print_info "Manual bucket: $MANUAL_BUCKET"
    fi
    echo ""
  else
    print_warning "No saved state found - will attempt best-effort cleanup"
  fi

  # AWS resources cleanup
  echo -n "Delete AWS test resources? (y/n) "
  read -r AWS_ANSWER
  if [[ $AWS_ANSWER =~ ^[Yy]$ ]]; then
    print_info "Destroying serverless stack..."
    cd "$PROJECT_ROOT/$TEST_DIR/serverless-project" 2>/dev/null || true
    if [ -n "$AWS_PROFILE" ]; then
      print_command "AWS_PROFILE=$AWS_PROFILE npx serverless remove --verbose"
      AWS_PROFILE=$AWS_PROFILE npx serverless remove --verbose > /dev/null 2>&1 || print_warning "Serverless stack removal failed or not deployed"
    else
      print_command "npx serverless remove --verbose"
      npx serverless remove --verbose > /dev/null 2>&1 || print_warning "Serverless stack removal failed or not deployed"
    fi
    cd "$PROJECT_ROOT"

    print_info "Deleting manually created resources..."

    # Delete manual DynamoDB table
    print_command "aws dynamodb delete-table $AWS_PROFILE_FLAG --table-name messy-test-products-manual"
    aws dynamodb delete-table $AWS_PROFILE_FLAG --table-name messy-test-products-manual > /dev/null 2>&1 || true

    # Delete specific manual bucket if known
    if [ -n "$MANUAL_BUCKET" ]; then
      print_info "Deleting specific manual bucket: $MANUAL_BUCKET..."
      print_command "aws s3 rb $AWS_PROFILE_FLAG s3://$MANUAL_BUCKET --force"
      aws s3 rb $AWS_PROFILE_FLAG "s3://$MANUAL_BUCKET" --force > /dev/null 2>&1 || true
      print_success "Deleted bucket: $MANUAL_BUCKET"
    fi

    # Delete any other manual S3 buckets (find all matching pattern)
    print_info "Searching for other manual S3 buckets..."
    print_command "aws s3 ls $AWS_PROFILE_FLAG | grep messy-test-manual-bucket-"
    BUCKET_COUNT=$(aws s3 ls $AWS_PROFILE_FLAG 2>/dev/null | grep -c "messy-test-manual-bucket-" || echo "0")
    if [ "$BUCKET_COUNT" -gt 0 ]; then
      aws s3 ls $AWS_PROFILE_FLAG | grep "messy-test-manual-bucket-" | awk '{print $3}' | while read bucket; do
        print_command "aws s3 rb $AWS_PROFILE_FLAG s3://$bucket --force"
        aws s3 rb $AWS_PROFILE_FLAG "s3://$bucket" --force > /dev/null 2>&1 || true
        print_info "Deleted bucket: $bucket"
      done
    else
      print_info "No additional manual buckets found"
    fi

    print_success "AWS resources deleted"
  else
    print_info "Skipped AWS resource deletion"
  fi

  # Local directory cleanup
  echo ""
  echo -n "Delete local test directory? (y/n) "
  read -r LOCAL_ANSWER
  if [[ $LOCAL_ANSWER =~ ^[Yy]$ ]]; then
    # Ensure we're in project root
    cd "$PROJECT_ROOT"

    # Delete test directory and migration state
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
      rm -rf "$TEST_DIR"
      print_success "Deleted test directory: $TEST_DIR"
    else
      print_warning "Test directory not found: $TEST_DIR"
    fi

    if [ -d ".migration-state" ]; then
      rm -rf .migration-state
      print_success "Deleted migration state"
    fi
  else
    print_info "Skipped local directory deletion"
  fi

  # Clear state file after successful cleanup
  clear_state

  echo ""
  print_success "Cleanup complete!"
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
  echo "L. Check/refresh AWS SSO credentials"
  echo "E. Export SSO credentials to ~/.aws/credentials"
  echo "1. Check prerequisites"
  echo "2. Setup test environment (create serverless project)"
  echo "2b. Complete/fix incomplete setup (create files only)"
  echo "3. Deploy serverless project to AWS"
  echo "4. Create messy resources (manual resources + drift)"
  echo "5. Run Test 1: Basic migration (dry-run)"
  echo "6. Run Test 2: Migration with auto-approve (dry-run)"
  echo "7. Run Test 3: Migration with stage/region (dry-run)"
  echo "8. Show generated CDK code"
  echo "9. Show generated reports"
  echo "F. Run FULL migration (without dry-run)"
  echo "C. Clean up test resources"
  echo "0. Exit"
  echo ""
  read -p "Select option: " choice
  echo ""

  case $choice in
    P|p) select_aws_profile ;;
    L|l) check_sso_credentials ;;
    E|e) export_sso_credentials ;;
    1) check_prerequisites ;;
    2)
      setup_test_dir
      create_serverless_project
      ;;
    2b|2B)
      print_info "Completing/fixing incomplete setup..."
      create_serverless_project
      ;;
    3) deploy_serverless_project ;;
    4) create_messy_resources ;;
    5) run_basic_test ;;
    6) run_drift_test ;;
    7) run_confidence_test ;;
    8) show_generated_code ;;
    9) show_reports ;;
    F|f)
      print_header "Running FULL Migration"

      # Load state if TEST_DIR not set
      if [ -z "$TEST_DIR" ]; then
        if ! load_state; then
          print_error "No test environment found!"
          print_info "Please run option 2 (Setup test environment) first"
          read -p "Press Enter to continue..."
          continue
        fi
      fi

      # Check if test directory exists
      if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
        print_error "Test directory not found"
        read -p "Press Enter to continue..."
        continue
      fi

      print_warning "This will execute actual migration (NO dry-run)!"
      print_warning "This will create CDK project and initialize it."
      read -p "Are you sure? (yes/no) " -r
      echo
      if [[ $REPLY == "yes" ]]; then
        cd "$PROJECT_ROOT"
        print_command "AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate --source ./$TEST_DIR/serverless-project --verbose"
        AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate \
          --source "./$TEST_DIR/serverless-project" \
          --verbose \
          2>&1 | tee "./$TEST_DIR/full-migration.log"

        # Mark CDK as deployed
        CDK_DEPLOYED=true
        save_state
      else
        print_info "Cancelled"
      fi
      ;;
    C|c) cleanup ;;
    0)
      print_info "Goodbye!"
      CLEAN_EXIT=true
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
  ║   Version 2.0.0 (with Crash Recovery)                    ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"

  # Store absolute project root
  PROJECT_ROOT=$(pwd)

  # Set up trap handlers for graceful error handling
  trap cleanup_on_error EXIT ERR INT TERM

  # Parse command-line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --profile)
        AWS_PROFILE="$2"
        AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
        print_info "Using AWS profile: $AWS_PROFILE"
        shift 2
        ;;
      setup|deploy|messy|test1|test2|test3|full|cleanup)
        # Command argument - process below
        COMMAND="$1"
        shift
        ;;
      *)
        print_error "Unknown argument: $1"
        echo "Usage: $0 [--profile PROFILE_NAME] [setup|deploy|messy|test1|test2|test3|full|cleanup]"
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

    # Check for leftover resources from previous runs
    detect_leftover_resources

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
        ;;
      deploy) deploy_serverless_project ;;
      messy) create_messy_resources ;;
      test1) run_basic_test ;;
      test2) run_drift_test ;;
      test3) run_confidence_test ;;
      full)
        # Load state if TEST_DIR not set
        if [ -z "$TEST_DIR" ]; then
          if ! load_state; then
            print_error "No test environment found!"
            print_info "Please run: $0 setup"
            exit 1
          fi
        fi

        # Check if test directory exists
        if [ ! -d "$PROJECT_ROOT/$TEST_DIR/serverless-project" ]; then
          print_error "Test directory not found"
          exit 1
        fi

        print_warning "Running FULL migration (no dry-run)"
        cd "$PROJECT_ROOT"
        print_command "AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate --source ./$TEST_DIR/serverless-project --verbose"
        AWS_PROFILE=$AWS_PROFILE node dist/cli/index.js migrate \
          --source "./$TEST_DIR/serverless-project" \
          --verbose

        # Mark CDK as deployed
        CDK_DEPLOYED=true
        save_state
        ;;
      cleanup) cleanup ;;
      *)
        print_error "Unknown command: $COMMAND"
        echo "Usage: $0 [--profile PROFILE_NAME] [setup|deploy|messy|test1|test2|test3|full|cleanup]"
        exit 1
        ;;
    esac

    # Mark as clean exit after command completes
    CLEAN_EXIT=true
  fi
}

# Run main
main "$@"
