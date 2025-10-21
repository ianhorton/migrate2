#!/bin/bash

# AWS CodeArtifact Authentication for essensys-smart-packages
# Run this script if you get npm authentication errors

echo "🔐 Authenticating with AWS CodeArtifact..."

aws codeartifact login \
  --tool npm \
  --repository smart-packages \
  --domain essensys-smart-packages \
  --domain-owner 786267582114 \
  --region eu-west-1

if [ $? -eq 0 ]; then
  echo "✅ Successfully authenticated with AWS CodeArtifact"
  echo "You can now run npm install"
else
  echo "❌ Authentication failed. Please check:"
  echo "  1. AWS CLI is installed and configured"
  echo "  2. You have access to the CodeArtifact repository"
  echo "  3. Your AWS credentials are valid"
  exit 1
fi
