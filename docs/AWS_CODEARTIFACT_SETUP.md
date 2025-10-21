# AWS CodeArtifact Setup

## Organization Configuration

This project uses **essensys-smart-packages** private npm registry hosted on AWS CodeArtifact.

## Quick Fix for Authentication Errors

If you see this error:
```
npm error Unable to authenticate, your authentication token seems to be invalid.
```

Run one of these commands:

### Option 1: Using npm script (Recommended)
```bash
npm run auth:codeartifact
```

### Option 2: Using setup script
```bash
./scripts/setup-npm.sh
```

### Option 3: Manual command
```bash
aws codeartifact login \
  --tool npm \
  --repository smart-packages \
  --domain essensys-smart-packages \
  --domain-owner 786267582114 \
  --region eu-west-1
```

## How It Works

1. The login command retrieves a temporary authentication token from AWS CodeArtifact
2. It automatically updates your `~/.npmrc` file with the token
3. The token is valid for 12 hours
4. After 12 hours, you'll need to re-authenticate

## Prerequisites

- **AWS CLI** installed and configured
- **AWS credentials** with access to the CodeArtifact repository
- **Permissions** to read from the `smart-packages` repository

## Automatic Authentication

The `preinstall` script in `package.json` will attempt to authenticate automatically when you run `npm install`, but only if AWS CLI is available.

## Troubleshooting

### Error: "Unable to locate credentials"
Your AWS credentials are not configured. Run:
```bash
aws configure
```

### Error: "An error occurred (AccessDeniedException)"
You don't have permission to access the CodeArtifact repository. Contact your AWS administrator.

### Error: "aws: command not found"
AWS CLI is not installed. Install it:
```bash
# macOS
brew install awscli

# Linux
pip install awscli

# Windows
choco install awscli
```

## Token Expiration

CodeArtifact tokens expire after **12 hours**. If you see authentication errors after that time, simply re-run the authentication command.

## Repository Details

- **Repository**: smart-packages
- **Domain**: essensys-smart-packages
- **Domain Owner**: 786267582114
- **Region**: eu-west-1

---

*This is an organization-specific configuration for essensys private packages.*
