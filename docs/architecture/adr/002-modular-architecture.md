# ADR 002: Modular Architecture with Clear Boundaries

## Status
**Accepted** - 2025-01-20

## Context

The migration tool needs to handle multiple distinct responsibilities:
- Resource discovery and scanning
- Template comparison
- CDK code generation
- CloudFormation template editing
- Migration orchestration
- State management

We need to decide on the architectural approach to organize this complexity.

### Alternatives Considered

**Option 1: Monolithic Design**
- All logic in a single module or class
- Pros: Simple to start, fewer abstractions
- Cons: Becomes unmaintainable as complexity grows, tight coupling, difficult to test

**Option 2: Service-Oriented (Microservices-like)**
- Each responsibility as a separate service/process
- Pros: Maximum isolation, independent deployment
- Cons: Over-engineering for a CLI tool, communication overhead, complexity

**Option 3: Modular Architecture with Clear Boundaries**
- Distinct modules for each major responsibility
- Well-defined interfaces between modules
- Shared utilities layer
- Orchestrator coordinates modules
- Pros: Maintainable, testable, extensible, appropriate complexity
- Cons: Requires discipline to maintain boundaries

## Decision

We will implement a **Modular Architecture** with the following structure:

```
Core Modules (Business Logic):
├── Scanner Module      - Resource discovery
├── Comparator Module   - Template comparison
├── Generator Module    - CDK code generation
├── Editor Module       - CloudFormation editing
├── Verifier Module     - Migration verification
└── Orchestrator Module - Workflow coordination

Supporting Layers:
├── CLI Layer           - User interface
├── AWS Integration     - AWS service clients
└── Utilities           - Shared functions
```

**Module Design Principles:**

1. **Single Responsibility**: Each module has one clear purpose
2. **Dependency Inversion**: Modules depend on abstractions (interfaces), not concrete implementations
3. **Explicit Interfaces**: All module public APIs defined via TypeScript interfaces
4. **Minimal Coupling**: Modules communicate through orchestrator, not directly
5. **Independent Testing**: Each module testable in isolation
6. **Clear Ownership**: Module boundaries align with team ownership potential

## Consequences

### Positive

1. **Maintainability**: Each module can be understood and modified independently
2. **Testability**: Modules can be unit tested in isolation with mocked dependencies
3. **Extensibility**: New modules can be added without affecting existing ones
4. **Team Scalability**: Different team members can work on different modules
5. **Reusability**: Modules can be reused in different contexts (e.g., web UI, API)
6. **Clear Boundaries**: Easy to understand system architecture
7. **Flexibility**: Modules can be swapped out (e.g., different code generators)
8. **Gradual Development**: Can implement modules incrementally

### Negative

1. **Initial Overhead**: More upfront design work
2. **Abstraction Cost**: More interfaces and abstractions to maintain
3. **Communication**: Need clear contracts between modules
4. **Potential Over-Engineering**: Risk of creating too many layers

### Module Contracts

Each module must provide:
- TypeScript interface defining public API
- Implementation class
- Error types specific to module
- Unit tests with >80% coverage
- Module-specific documentation

Example interface:
```typescript
export interface ScannerModule {
  scan(config: ServerlessConfig): Promise<ResourceInventory>;
  // ... other methods
}

export class ScannerModuleImpl implements ScannerModule {
  // ... implementation
}
```

### Communication Patterns

1. **Orchestrator → Module**: Direct method calls via interface
2. **Module → Module**: Through orchestrator coordination only
3. **Module → AWS**: Through AWS integration layer
4. **Module → Utilities**: Direct calls to shared utilities

### Testing Strategy

1. **Unit Tests**: Each module tested independently with mocked dependencies
2. **Integration Tests**: Modules tested together through orchestrator
3. **E2E Tests**: Full migration scenarios
4. **Contract Tests**: Interface compliance verification

## Related Decisions

- ADR 010: Step-Based Migration Orchestration
- ADR 001: TypeScript for Implementation (enables strong interface definitions)
