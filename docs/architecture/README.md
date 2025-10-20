# Serverless-to-CDK Migration Tool - Architecture Documentation

## Overview

This directory contains comprehensive architecture documentation for the Serverless-to-CDK Migration Tool, designed using clean architecture principles with a focus on maintainability, testability, and extensibility.

## Documentation Structure

### Core Architecture Documents

1. **[00-overview.md](./00-overview.md)** - System Architecture Overview
   - High-level architecture and design principles
   - Core components and their responsibilities
   - Technology stack and quality attributes
   - Deployment model and extensibility points

2. **[01-type-definitions.md](./01-type-definitions.md)** - Type Definitions and Interfaces
   - Complete TypeScript type system
   - Domain models (Resources, Templates, State)
   - Module interfaces and contracts
   - Configuration and result types

3. **[02-module-specifications.md](./02-module-specifications.md)** - Module Specifications
   - Detailed specifications for 5 core modules:
     - Scanner Module (resource discovery)
     - Comparator Module (template comparison)
     - Generator Module (CDK code generation)
     - Editor Module (CloudFormation editing)
     - Migration Orchestrator (workflow coordination)
   - Module interfaces, implementations, and error handling

4. **[03-cli-interface.md](./03-cli-interface.md)** - CLI Interface Design
   - Command structure and usage
   - Interactive and automatic modes
   - Configuration file format
   - Progress display and error handling

5. **[04-aws-integration.md](./04-aws-integration.md)** - AWS Service Integration Layer
   - Base AWS client with retry logic
   - Service-specific clients (CloudFormation, DynamoDB, S3, Logs)
   - Error handling and rate limiting
   - Client factory pattern

6. **[05-c4-diagrams.md](./05-c4-diagrams.md)** - C4 Model Architecture Diagrams
   - Level 1: System Context Diagram
   - Level 2: Container Diagram
   - Level 3: Component Diagram
   - Level 4: Code Diagram (key classes)
   - Data flow and sequence diagrams

### Architecture Decision Records (ADRs)

Located in `./adr/` directory:

1. **[001-typescript-for-implementation.md](./adr/001-typescript-for-implementation.md)**
   - Decision to use TypeScript with strict type checking
   - Rationale: Type safety, ecosystem alignment, code generation

2. **[002-modular-architecture.md](./adr/002-modular-architecture.md)**
   - Decision to use modular architecture with clear boundaries
   - Rationale: Maintainability, testability, extensibility

3. **[003-state-persistence-strategy.md](./adr/003-state-persistence-strategy.md)**
   - Decision to use JSON files with structured snapshots
   - Rationale: Simplicity, debuggability, resumability

4. **[010-step-based-orchestration.md](./adr/010-step-based-orchestration.md)**
   - Decision to use step-based state machine for orchestration
   - Rationale: Resumability, user control, progress visibility

See [adr/README.md](./adr/README.md) for complete list of ADRs.

## Key Architectural Decisions

### 1. Modular Design
- 5 independent modules with well-defined interfaces
- Orchestrator coordinates all modules
- Clear separation of concerns
- Independent testability

### 2. Type-Safe Implementation
- TypeScript with strict mode enabled
- Comprehensive type definitions for all domain models
- Type guards and validation utilities
- Runtime validation for external data

### 3. State Management
- JSON-based state persistence
- Timestamped backups before destructive operations
- Complete audit trail of all operations
- Support for resumability and rollback

### 4. AWS Integration
- Abstraction layer over AWS SDK v3
- Retry logic with exponential backoff
- Service-specific clients for each AWS service
- Centralized error handling

### 5. Migration Orchestration
- 9-step state machine
- Validation gates before destructive operations
- User approval points in interactive mode
- Comprehensive verification after completion

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  CLI Application                         │
│         (Commander.js + Inquirer.js)                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Migration Orchestrator                      │
│           (Step-Based State Machine)                     │
└─┬───────┬──────┬─────────┬─────────┬──────────────────┬┘
  │       │      │         │         │                  │
  ▼       ▼      ▼         ▼         ▼                  ▼
┌────┐ ┌─────┐ ┌────┐ ┌──────┐ ┌────────┐         ┌──────┐
│Scan│ │Comp │ │Gen │ │Editor│ │Verifier│         │State │
│ner │ │arator│ │erator│ │      │ │        │         │ Mgr  │
└────┘ └─────┘ └────┘ └──────┘ └────────┘         └──────┘
  │       │      │         │         │                  │
  └───────┴──────┴─────────┴─────────┴──────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  AWS Integration     │
          │  (SDK v3 Clients)    │
          └──────────────────────┘
```

## Migration Flow

1. **SCAN** - Discover all resources in Serverless application
2. **PROTECT** - Add DeletionPolicy: Retain to stateful resources
3. **GENERATE** - Generate CDK code from discovered resources
4. **COMPARE** - Compare Serverless and CDK CloudFormation templates
5. **REMOVE** - Remove resources from Serverless stack
6. **IMPORT** - Import resources into CDK stack
7. **DEPLOY** - Deploy CDK stack with new resources
8. **VERIFY** - Verify migration success (drift detection, resource verification)
9. **CLEANUP** - Optional cleanup of old Serverless stack

## Technology Stack

**Core:**
- TypeScript 5.0+ (strict mode)
- Node.js 18+ LTS

**CLI Framework:**
- Commander.js (command parsing)
- Inquirer.js (interactive prompts)
- Ora (spinners), Chalk (colors), CLI-Table3 (tables)

**AWS Integration:**
- @aws-sdk/client-cloudformation
- @aws-sdk/client-dynamodb
- @aws-sdk/client-s3
- @aws-sdk/client-logs

**Utilities:**
- js-yaml (YAML parsing)
- ajv (JSON schema validation)
- handlebars (template rendering)

## Design Principles

1. **Automation First** - Automate tedious tasks, require approval for critical operations
2. **Fail-Safe** - Comprehensive backups, validation gates, rollback capabilities
3. **Modular** - Independent, testable modules with clear responsibilities
4. **Type-Safe** - Strict TypeScript for compile-time error detection
5. **Resumable** - State persistence enables resuming after failures
6. **Transparent** - Clear progress indication and comprehensive logging
7. **Extensible** - Plugin architecture for custom resources and languages

## Quality Attributes

- **Performance**: Complete migration in <15 minutes for typical stack
- **Reliability**: Comprehensive error handling, automatic retry, state recovery
- **Security**: No credential storage, AWS standard authentication
- **Maintainability**: Modular architecture, >80% test coverage, clear documentation
- **Usability**: Interactive mode for beginners, automatic mode for CI/CD

## Getting Started

For implementation guidance, start with:
1. [00-overview.md](./00-overview.md) - Understand the big picture
2. [01-type-definitions.md](./01-type-definitions.md) - Review the type system
3. [02-module-specifications.md](./02-module-specifications.md) - Deep dive into modules
4. [adr/](./adr/) - Understand key architectural decisions

## Contributing

When making architectural changes:
1. Update relevant architecture documents
2. Create ADR for significant decisions
3. Update C4 diagrams if component structure changes
4. Ensure type definitions remain accurate
5. Update this README if new documents are added

## Questions?

For architectural questions or clarifications, please refer to:
- ADRs for rationale behind decisions
- Module specifications for implementation details
- C4 diagrams for visual understanding
- Type definitions for API contracts

---

**Last Updated**: 2025-01-20
**Architecture Version**: 1.0.0
**Status**: Design Complete, Ready for Implementation
