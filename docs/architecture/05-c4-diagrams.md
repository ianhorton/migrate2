# C4 Model Architecture Diagrams

## Overview

This document presents the system architecture using the C4 model (Context, Container, Component, Code), providing multiple levels of abstraction for understanding the Serverless-to-CDK Migration Tool.

## Level 1: System Context Diagram

### Purpose
Shows how the migration tool fits into the overall ecosystem and its interactions with external systems and users.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                     AWS Cloud Environment                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │CloudFormation│  │   DynamoDB   │  │      S3      │          │
│  │   Stacks     │  │    Tables    │  │   Buckets    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
│         └─────────────────┼──────────────────┘                  │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            │ AWS SDK API Calls
                            │
                            ▼
        ┌───────────────────────────────────────────┐
        │                                           │
        │   Serverless-to-CDK Migration Tool        │
        │                                           │
        │   • Resource Discovery                    │
        │   • Template Comparison                   │
        │   • CDK Code Generation                   │
        │   • Migration Orchestration               │
        │                                           │
        └───┬────────────────────────────────┬──────┘
            │                                │
            │ CLI                            │ File System
            │ Commands                       │ Operations
            │                                │
            ▼                                ▼
    ┌──────────────┐              ┌──────────────────┐
    │              │              │                  │
    │  Developer   │              │  Serverless App  │
    │              │              │  CDK Project     │
    │              │              │                  │
    └──────────────┘              └──────────────────┘
```

### Key Relationships

1. **Developer → Migration Tool**
   - Executes CLI commands
   - Reviews comparison reports
   - Approves migration steps

2. **Migration Tool → AWS Cloud**
   - Reads CloudFormation stacks
   - Verifies resource existence
   - Detects configuration drift

3. **Migration Tool → Serverless/CDK Projects**
   - Reads Serverless configuration
   - Generates CDK code
   - Modifies templates

## Level 2: Container Diagram

### Purpose
Shows the high-level technology choices and how containers communicate.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│              Serverless-to-CDK Migration Tool                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │                   CLI Application                           │    │
│  │                   (Node.js/TypeScript)                      │    │
│  │                                                             │    │
│  │  • Command parsing (Commander.js)                          │    │
│  │  • Interactive prompts (Inquirer.js)                       │    │
│  │  • Progress display (Ora, Chalk)                           │    │
│  │                                                             │    │
│  └─────────┬───────────────────────────────────────┬──────────┘    │
│            │                                       │                │
│            │ Function Calls                        │ Function Calls │
│            │                                       │                │
│            ▼                                       ▼                │
│  ┌──────────────────────┐              ┌──────────────────────┐    │
│  │                      │              │                      │    │
│  │  Core Engine         │              │  AWS Integration     │    │
│  │  (TypeScript)        │◄────────────►│  Layer               │    │
│  │                      │  AWS SDK     │  (TypeScript)        │    │
│  │  • Scanner Module    │  Calls       │                      │    │
│  │  • Comparator Module │              │  • CloudFormation    │    │
│  │  • Generator Module  │              │  • DynamoDB          │    │
│  │  • Editor Module     │              │  • S3                │    │
│  │  • Orchestrator      │              │  • Lambda            │    │
│  │                      │              │  • Logs              │    │
│  └──────────┬───────────┘              └──────────────────────┘    │
│             │                                                       │
│             │ Read/Write                                            │
│             │                                                       │
│             ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                                                           │     │
│  │           State & Storage (SQLite/JSON)                   │     │
│  │                                                           │     │
│  │  • Migration state                                        │     │
│  │  • Resource tracking                                      │     │
│  │  • Audit logs                                             │     │
│  │  • Backups                                                │     │
│  │                                                           │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           │ File System Operations
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │                                          │
        │         File System                      │
        │                                          │
        │  • serverless.yml                        │
        │  • CloudFormation templates              │
        │  • Generated CDK code                    │
        │  • Configuration files                   │
        │  • Backup files                          │
        │                                          │
        └──────────────────────────────────────────┘
```

### Technology Stack

**CLI Application:**
- Runtime: Node.js 18+ LTS
- Language: TypeScript 5.0+
- CLI Framework: Commander.js
- Interactive UI: Inquirer.js, Ora, Chalk, CLI-Table3

**Core Engine:**
- Language: TypeScript (strict mode)
- YAML Parser: js-yaml
- JSON Schema Validation: ajv
- Template Rendering: Handlebars

**AWS Integration Layer:**
- AWS SDK: @aws-sdk/client-* (v3)
- Retry Logic: Exponential backoff with jitter
- Error Handling: Custom error types

**State & Storage:**
- Format: JSON files + SQLite (optional)
- Location: `.sls-to-cdk/` directory
- Backup Strategy: Timestamped snapshots

## Level 3: Component Diagram

### Purpose
Shows the internal components and their interactions within the Core Engine.

```
┌────────────────────────────────────────────────────────────────────┐
│                         Core Engine                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │                  Migration Orchestrator                       │ │
│  │                                                               │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │ │
│  │  │  State Machine  │  │  State Manager  │                   │ │
│  │  │  • Step flow    │  │  • Persistence  │                   │ │
│  │  │  • Validation   │  │  • Snapshots    │                   │ │
│  │  └─────────────────┘  └─────────────────┘                   │ │
│  │                                                               │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                   │ │
│  │  │ Step Executor   │  │ Rollback Mgr    │                   │ │
│  │  │  • Run steps    │  │  • Revert       │                   │ │
│  │  │  • Error handle │  │  • Restore      │                   │ │
│  │  └─────────────────┘  └─────────────────┘                   │ │
│  │                                                               │ │
│  └───────┬───────────────────────────────────────────┬──────────┘ │
│          │                                           │            │
│          │ Coordinates                               │            │
│          ▼                                           ▼            │
│  ┌────────────────┐                          ┌────────────────┐  │
│  │     Scanner    │                          │   Comparator   │  │
│  │     Module     │                          │     Module     │  │
│  ├────────────────┤                          ├────────────────┤  │
│  │ • SLS Parser   │                          │ • Resource     │  │
│  │ • CF Generator │                          │   Matcher      │  │
│  │ • Resource     │                          │ • Property     │  │
│  │   Discoverer   │                          │   Comparator   │  │
│  │ • Dependency   │                          │ • Rules Engine │  │
│  │   Builder      │                          │ • Report Gen   │  │
│  │ • Classifier   │                          │                │  │
│  └────────────────┘                          └────────────────┘  │
│          │                                           │            │
│          │                                           │            │
│          ▼                                           ▼            │
│  ┌────────────────┐                          ┌────────────────┐  │
│  │   Generator    │                          │     Editor     │  │
│  │     Module     │                          │     Module     │  │
│  ├────────────────┤                          ├────────────────┤  │
│  │ • CDK Code Gen │                          │ • Template     │  │
│  │ • Construct    │                          │   Editor       │  │
│  │   Factory      │                          │ • Dependency   │  │
│  │ • Template     │                          │   Updater      │  │
│  │   Renderer     │                          │ • Validator    │  │
│  │ • Naming       │                          │ • Backup Mgr   │  │
│  │   Strategy     │                          │                │  │
│  └────────────────┘                          └────────────────┘  │
│          │                                           │            │
│          │                                           │            │
│          └───────────────────┬───────────────────────┘            │
│                              │                                    │
│                              │ Shared Utilities                   │
│                              ▼                                    │
│                     ┌────────────────┐                            │
│                     │   Utilities    │                            │
│                     ├────────────────┤                            │
│                     │ • File I/O     │                            │
│                     │ • JSON/YAML    │                            │
│                     │ • Logging      │                            │
│                     │ • Validation   │                            │
│                     │ • Exec         │                            │
│                     └────────────────┘                            │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Migration Orchestrator:**
- Coordinates all migration steps
- Manages state transitions
- Handles errors and rollbacks
- Tracks progress and generates reports

**Scanner Module:**
- Parses Serverless configuration
- Generates CloudFormation templates
- Discovers all resources
- Builds dependency graph
- Classifies resources

**Comparator Module:**
- Matches resources between templates
- Deep compares properties
- Applies comparison rules
- Generates reports (JSON, HTML)

**Generator Module:**
- Generates CDK stack code
- Creates constructs
- Renders templates
- Applies naming conventions

**Editor Module:**
- Modifies CloudFormation templates
- Updates dependencies
- Validates templates
- Creates backups

**Utilities:**
- File system operations
- JSON/YAML parsing
- Logging and debugging
- Schema validation
- Command execution

## Level 4: Code Diagram (Key Classes)

### Scanner Module Class Diagram

```
┌─────────────────────────────────────┐
│      <<interface>>                  │
│      ScannerModule                  │
├─────────────────────────────────────┤
│ + scan()                            │
│ + parseServerlessConfig()           │
│ + generateCloudFormation()          │
│ + discoverResources()               │
│ + buildDependencyGraph()            │
│ + classifyResources()               │
└──────────────▲──────────────────────┘
               │
               │ implements
               │
┌──────────────┴──────────────────────┐
│     ScannerModuleImpl               │
├─────────────────────────────────────┤
│ - serverlessParser                  │
│ - cfnGenerator                      │
│ - resourceDiscoverer                │
│ - dependencyBuilder                 │
│ - resourceClassifier                │
├─────────────────────────────────────┤
│ + scan()                            │
│ + parseServerlessConfig()           │
│ + generateCloudFormation()          │
│ + discoverResources()               │
│ + buildDependencyGraph()            │
│ + classifyResources()               │
└─────────────────────────────────────┘
         │
         │ uses
         │
         ▼
┌──────────────────────────┐
│  ResourceClassifier      │
├──────────────────────────┤
│ - STATEFUL_TYPES         │
│ - RECREATE_TYPES         │
│ - MANUAL_TYPES           │
├──────────────────────────┤
│ + classify()             │
│ + isStateful()           │
│ + isRecreate()           │
│ - isManualResource()     │
└──────────────────────────┘
```

### Comparator Module Class Diagram

```
┌─────────────────────────────────────┐
│      <<interface>>                  │
│      ComparatorModule               │
├─────────────────────────────────────┤
│ + compare()                         │
│ + matchResources()                  │
│ + compareResource()                 │
│ + generateHTMLReport()              │
│ + generateJSONReport()              │
└──────────────▲──────────────────────┘
               │
               │ implements
               │
┌──────────────┴──────────────────────┐
│     ComparatorModuleImpl            │
├─────────────────────────────────────┤
│ - resourceMatcher                   │
│ - propertyComparator                │
│ - rulesEngine                       │
│ - reportGenerator                   │
├─────────────────────────────────────┤
│ + compare()                         │
│ + matchResources()                  │
│ + compareResource()                 │
│ + generateHTMLReport()              │
│ + generateJSONReport()              │
└─────────────────────────────────────┘
         │
         │ uses
         │
         ▼
┌──────────────────────────┐
│  ComparisonRulesEngine   │
├──────────────────────────┤
│ - rules: Map             │
├──────────────────────────┤
│ + getRule()              │
│ - registerDefaultRules() │
│ - createDynamoDBRule()   │
│ - createS3Rule()         │
└──────────────────────────┘
         │
         │ uses
         │
         ▼
┌──────────────────────────┐
│  DeepComparator          │
├──────────────────────────┤
│ + deepEqual()            │
│ + getDifference()        │
│ - arraysEqual()          │
│ - objectsEqual()         │
└──────────────────────────┘
```

### Orchestrator Class Diagram

```
┌─────────────────────────────────────┐
│      <<interface>>                  │
│   MigrationOrchestrator             │
├─────────────────────────────────────┤
│ + initialize()                      │
│ + executeStep()                     │
│ + runMigration()                    │
│ + verify()                          │
│ + rollback()                        │
│ + resume()                          │
│ + getState()                        │
│ + cancel()                          │
└──────────────▲──────────────────────┘
               │
               │ implements
               │
┌──────────────┴──────────────────────┐
│   MigrationStateMachine             │
├─────────────────────────────────────┤
│ - state: MigrationState             │
│ - config: MigrationConfig           │
│ - stateManager: StateManager        │
│ - STEPS: MigrationStep[]            │
├─────────────────────────────────────┤
│ + executeStep()                     │
│ + runMigration()                    │
│ - validateStep()                    │
│ - executeScan()                     │
│ - executeProtect()                  │
│ - executeGenerate()                 │
│ - executeCompare()                  │
│ - executeRemove()                   │
│ - executeImport()                   │
│ - executeDeploy()                   │
│ - executeVerify()                   │
│ - executeCleanup()                  │
│ - logAuditEntry()                   │
│ - updateState()                     │
└─────────────────────────────────────┘
         │
         │ uses
         │
         ▼
┌──────────────────────────┐
│     StateManager         │
├──────────────────────────┤
│ - statePath: string      │
├──────────────────────────┤
│ + saveState()            │
│ + loadState()            │
│ + listBackups()          │
│ + restoreBackup()        │
│ - isValidState()         │
└──────────────────────────┘
```

## Data Flow Diagram

### Migration Execution Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Execute: sls-to-cdk migrate
     ▼
┌────────────────┐
│  CLI Parser    │
│  (Commander)   │
└────┬───────────┘
     │
     │ 2. Parse config & options
     ▼
┌────────────────────┐
│   Orchestrator     │
│   Initialize       │
└────┬───────────────┘
     │
     │ 3. Load/Create state
     ▼
┌────────────────────┐     4. Scan Serverless app
│   Scanner Module   │◄────────────────────────┐
└────┬───────────────┘                         │
     │                                          │
     │ 5. Resources discovered                  │
     ▼                                          │
┌────────────────────┐     6. Generate CDK     │
│  Generator Module  │◄────────────────────────┤
└────┬───────────────┘                         │
     │                                          │
     │ 7. CDK code generated                    │
     ▼                                          │
┌────────────────────┐     8. Compare templates│
│ Comparator Module  │◄────────────────────────┤
└────┬───────────────┘                         │
     │                                          │
     │ 9. Comparison report                     │
     ▼                                          │
┌────────────────────┐                         │
│   User Approval    │                         │
│   (Interactive)    │                         │
└────┬───────────────┘                         │
     │                                          │
     │ 10. Approved                             │
     ▼                                          │
┌────────────────────┐     11. Edit template   │
│   Editor Module    │◄────────────────────────┤
└────┬───────────────┘                         │
     │                                          │
     │ 12. Template modified                    │
     ▼                                          │
┌────────────────────┐     13. Update stack    │
│   AWS Integration  │◄────────────────────────┤
│   (CloudFormation) │                         │
└────┬───────────────┘                         │
     │                                          │
     │ 14. Resources orphaned                   │
     ▼                                          │
┌────────────────────┐     15. Import resources│
│   AWS Integration  │◄────────────────────────┤
│   (CDK Import)     │                         │
└────┬───────────────┘                         │
     │                                          │
     │ 16. Import complete                      │
     ▼                                          │
┌────────────────────┐     17. Verify          │
│  Verify Module     │◄────────────────────────┤
└────┬───────────────┘                         │
     │                                          │
     │ 18. Verification report                  │
     ▼                                          │
┌────────────────────┐                         │
│   State Manager    │─────────────────────────┘
│   Save state       │     (Updates state after each step)
└────┬───────────────┘
     │
     │ 19. Migration complete
     ▼
┌─────────┐
│  User   │
└─────────┘
```

## Deployment Diagram

```
┌────────────────────────────────────────────────────────────┐
│                    Developer Machine                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           Runtime Environment (Node.js)                │ │
│  │                                                        │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │   sls-to-cdk CLI Application                    │  │ │
│  │  │   (TypeScript → JavaScript)                     │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                             │
│  ┌────────────────────────────┼───────────────────────────┐ │
│  │         File System        │                           │ │
│  │                            │                           │ │
│  │  ┌──────────────────┐  ┌──┴──────────────┐           │ │
│  │  │ Serverless App   │  │  CDK Project    │           │ │
│  │  │ - serverless.yml │  │  - lib/*.ts     │           │ │
│  │  │ - .serverless/   │  │  - bin/*.ts     │           │ │
│  │  │ - functions/     │  │  - cdk.out/     │           │ │
│  │  └──────────────────┘  └─────────────────┘           │ │
│  │                                                        │ │
│  │  ┌─────────────────────────────────────────────────┐  │ │
│  │  │  .sls-to-cdk/ (State & Backups)                 │  │ │
│  │  │  - migration-state.json                         │  │ │
│  │  │  - backups/                                     │  │ │
│  │  │  - reports/                                     │  │ │
│  │  └─────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                               │                             │
└───────────────────────────────┼─────────────────────────────┘
                                │
                                │ HTTPS/AWS SDK
                                │
┌───────────────────────────────┼─────────────────────────────┐
│                    AWS Cloud  │                              │
│                               ▼                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           AWS Services (us-east-1)                  │    │
│  │                                                      │    │
│  │  ┌────────────────┐  ┌────────────┐  ┌──────────┐  │    │
│  │  │ CloudFormation │  │  DynamoDB  │  │    S3    │  │    │
│  │  │    Stacks      │  │   Tables   │  │  Buckets │  │    │
│  │  └────────────────┘  └────────────┘  └──────────┘  │    │
│  │                                                      │    │
│  │  ┌────────────────┐  ┌────────────┐  ┌──────────┐  │    │
│  │  │     Lambda     │  │    IAM     │  │   Logs   │  │    │
│  │  │   Functions    │  │   Roles    │  │  Groups  │  │    │
│  │  └────────────────┘  └────────────┘  └──────────┘  │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Sequence Diagrams

### Resource Import Sequence

```
User        CLI      Orchestrator  Scanner  Comparator  Editor  AWS
 │           │            │          │          │         │      │
 │  migrate  │            │          │          │         │      │
 ├──────────>│            │          │          │         │      │
 │           │ initialize │          │          │         │      │
 │           ├───────────>│          │          │         │      │
 │           │            │  scan    │          │         │      │
 │           │            ├─────────>│          │         │      │
 │           │            │          │ package  │         │      │
 │           │            │          ├─────────────────────────>│
 │           │            │          │<──────────────────────────┤
 │           │            │<─────────┤          │         │      │
 │           │            │ generate │          │         │      │
 │           │            ├─────────────────────>│         │      │
 │           │            │<─────────────────────┤         │      │
 │           │            │ compare  │          │         │      │
 │           │            ├──────────────────────┼────────>│      │
 │           │            │<─────────────────────┼─────────┤      │
 │           │<───────────┤          │          │         │      │
 │  prompt   │            │          │          │         │      │
 │<──────────┤            │          │          │         │      │
 │  approve  │            │          │          │         │      │
 ├──────────>│            │          │          │         │      │
 │           │  remove    │          │          │         │      │
 │           ├───────────>│          │          │ edit    │      │
 │           │            ├──────────────────────┼────────>│      │
 │           │            │          │          │ update  │      │
 │           │            ├──────────────────────┼─────────┼─────>│
 │           │            │<─────────────────────┼─────────┼──────┤
 │           │  import    │          │          │         │      │
 │           ├───────────>│          │          │         │ import│
 │           │            ├──────────────────────┼─────────┼─────>│
 │           │            │<─────────────────────┼─────────┼──────┤
 │           │<───────────┤          │          │         │      │
 │  complete │            │          │          │         │      │
 │<──────────┤            │          │          │         │      │
```
