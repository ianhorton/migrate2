# ADR 001: TypeScript for Implementation Language

## Status
**Accepted** - 2025-01-20

## Context

We need to choose an implementation language for the Serverless-to-CDK migration tool. Key considerations:

1. **Target Ecosystem**: Both Serverless Framework and AWS CDK are JavaScript/TypeScript-first tools
2. **Developer Experience**: Need strong IDE support, type checking, and error detection
3. **AWS SDK**: AWS SDK v3 is written in TypeScript with first-class support
4. **Code Generation**: Must generate CDK code, starting with TypeScript
5. **Maintainability**: Complex template manipulation and comparison logic requires type safety
6. **Community**: Large ecosystem of CLI tools and libraries in Node.js/TypeScript
7. **Team Familiarity**: Target users (AWS/Serverless developers) typically know JavaScript/TypeScript

### Alternatives Considered

**Option 1: Python**
- Pros: Popular for DevOps tooling, good AWS Boto3 support, readable
- Cons: Less natural for generating TypeScript CDK code, weaker type safety, not primary language for Serverless/CDK

**Option 2: Go**
- Pros: Fast, compiled binary, excellent concurrency, popular for CLI tools
- Cons: Less natural for generating TypeScript code, smaller ecosystem for CloudFormation/CDK tooling, steeper learning curve for target audience

**Option 3: TypeScript**
- Pros: Type safety, excellent IDE support, native CDK/Serverless ecosystem, easy code generation, strong AWS SDK support, familiar to target users
- Cons: Runtime overhead (Node.js), requires compilation step

## Decision

We will use **TypeScript** with strict type checking enabled for the entire codebase.

Configuration:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": false,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

## Consequences

### Positive

1. **Type Safety**: Catch errors at compile time, especially critical for template manipulation
2. **IDE Support**: Excellent autocomplete, refactoring, and inline documentation
3. **Ecosystem Alignment**: Seamless integration with Serverless Framework and AWS CDK
4. **Code Generation**: Natural to generate TypeScript CDK code from TypeScript
5. **AWS SDK v3**: First-class TypeScript support with strong typing
6. **Developer Experience**: Familiar to target audience, easier adoption
7. **Refactoring**: Type system makes large refactorings safer
8. **Documentation**: Types serve as inline documentation

### Negative

1. **Build Step**: Requires compilation before execution
2. **Runtime**: Node.js startup time slower than compiled languages
3. **Type Complexity**: Complex CloudFormation types can be verbose
4. **Learning Curve**: Strict TypeScript requires discipline (mitigated by target audience familiarity)

### Mitigation Strategies

1. **Build Step**: Use `ts-node` for development, distribute compiled JavaScript for production
2. **Runtime**: Acceptable for a CLI tool that runs infrequently, focus on total execution time not startup
3. **Type Complexity**: Create utility types and type guards to simplify common patterns
4. **Learning Curve**: Comprehensive documentation and examples, leverage familiar patterns from Serverless/CDK

## Related Decisions

- ADR 004: AWS SDK v3 for AWS Integration
- ADR 006: Preference for CDK L2 Constructs (TypeScript CDK code generation)
