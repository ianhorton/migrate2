# Serverless to CDK Migration Tool

Automated migration tool from Serverless Framework to AWS CDK with intelligent orchestration and state management.

## Features

- **9-Step State Machine**: Systematic migration process with state persistence
- **Interactive CLI**: User-friendly wizard for configuration
- **Dry-Run Mode**: Preview changes before applying
- **Rollback Support**: Safely rollback to any previous step
- **Resume Capability**: Continue interrupted migrations
- **Progress Tracking**: Real-time progress indicators
- **Automatic Backups**: State snapshots at critical steps

## Architecture

### Orchestrator
- State machine with 9 migration steps
- State persistence and restoration
- Rollback mechanism
- Verification checks at each step

### CLI Commands

```bash
# Full migration
sls-to-cdk migrate

# Scan Serverless configuration
sls-to-cdk scan --source ./my-service

# Compare templates
sls-to-cdk compare --source ./serverless.json --target ./cdk.json

# Generate CDK code
sls-to-cdk generate --input ./template.json --output ./cdk-app

# Verify migration readiness
sls-to-cdk verify --source ./my-service

# Rollback to previous step
sls-to-cdk rollback <migration-id> --to INITIAL_SCAN

# List all migrations
sls-to-cdk list

# Check migration status
sls-to-cdk status <migration-id>
```

## Installation

```bash
npm install
npm run build
```

## Usage

### Interactive Mode

```bash
npm run migrate
```

The interactive wizard will guide you through:
1. Source directory selection
2. Target directory configuration
3. Stage and region selection
4. CDK language preference
5. Dry-run and backup options

### Command Line Mode

```bash
sls-to-cdk migrate \
  --source ./my-serverless-app \
  --target ./my-cdk-app \
  --stage production \
  --region us-west-2 \
  --dry-run
```

### Resume Migration

```bash
sls-to-cdk migrate --resume migration-1234567890-abc123
```

## Migration Steps

1. **INITIAL_SCAN**: Parse serverless.yml and generate CloudFormation
2. **DISCOVERY**: Discover all resources including abstracted ones
3. **CLASSIFICATION**: Classify resources (import vs recreate)
4. **COMPARISON**: Compare templates and identify differences
5. **TEMPLATE_MODIFICATION**: Modify CloudFormation for migration
6. **CDK_GENERATION**: Generate CDK code
7. **IMPORT_PREPARATION**: Prepare resource import definitions
8. **VERIFICATION**: Verify migration readiness
9. **COMPLETE**: Migration complete

## State Management

Migration state is stored in `.migration-state/`:
- `state.json`: Current migration state
- `state-<id>.json`: Historical states
- `backups/`: State snapshots
- `logs/`: Migration logs

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Project Structure

```
src/
├── cli/                    # CLI interface
│   ├── commands/          # Command implementations
│   ├── interactive.ts     # Interactive wizard
│   ├── display.ts         # Output formatting
│   └── index.ts           # CLI entry point
├── modules/
│   ├── orchestrator/      # Migration orchestrator
│   │   ├── state-machine.ts
│   │   ├── state-manager.ts
│   │   └── step-executor.ts
│   ├── scanner/           # Resource scanner
│   ├── comparator/        # Template comparator
│   ├── generator/         # CDK generator
│   └── editor/            # Template editor
├── types/                 # TypeScript types
└── utils/                 # Utilities
    └── logger.ts          # Winston logger
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## License

MIT
