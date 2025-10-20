# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Serverless-to-CDK Migration Tool.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences.

## ADR Format

Each ADR follows this structure:
- **Title**: Short noun phrase
- **Status**: Proposed, Accepted, Deprecated, Superseded
- **Context**: Forces at play (technical, political, social, project)
- **Decision**: Response to these forces
- **Consequences**: What becomes easier or more difficult

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](./001-typescript-for-implementation.md) | TypeScript for Implementation | Accepted |
| [002](./002-modular-architecture.md) | Modular Architecture with Clear Boundaries | Accepted |
| [003](./003-state-persistence-strategy.md) | State Persistence Strategy | Accepted |
| [004](./004-aws-sdk-v3.md) | AWS SDK v3 for AWS Integration | Accepted |
| [005](./005-interactive-and-automatic-modes.md) | Interactive and Automatic Migration Modes | Accepted |
| [006](./006-l2-constructs-preference.md) | Preference for CDK L2 Constructs | Accepted |
| [007](./007-comprehensive-backup-strategy.md) | Comprehensive Backup Strategy | Accepted |
| [008](./008-resource-classification-approach.md) | Resource Classification Approach | Accepted |
| [009](./009-template-comparison-rules-engine.md) | Template Comparison Rules Engine | Accepted |
| [010](./010-step-based-orchestration.md) | Step-Based Migration Orchestration | Accepted |
