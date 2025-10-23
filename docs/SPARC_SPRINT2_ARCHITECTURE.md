# Sprint 2 Architecture: IAM Role Generation

## Overview

Sprint 2 implements the IAM Role generation system that transforms CloudFormation IAM roles into CDK L2 constructs. The architecture consists of four main components:

1. **IAMRoleGenerator** - Orchestrates the entire role generation process
2. **ManagedPolicyDetector** - Identifies when managed policies can replace inline permissions
3. **ReferenceResolver** - Converts CloudFormation references to CDK construct references
4. **PolicyGenerator** - Creates PolicyStatement objects and addToRolePolicy() calls

### Design Principles

- **Separation of Concerns**: Each class has a single, well-defined responsibility
- **Dependency Injection**: Components receive dependencies via constructor for testability
- **Immutability**: Original ClassifiedResource objects are never modified
- **Error Recovery**: Graceful fallback to safe defaults when transformation fails
- **Integration-First**: Designed to integrate seamlessly with Sprint 1 (classifier) and Sprint 3 (cleaner)

### Key Architectural Decisions

1. **Composition Over Inheritance**: Use dependency injection rather than class hierarchies
2. **Prefer Managed Policies**: Always detect and use AWS managed policies when possible
3. **Reference Resolution**: Convert all CloudFormation references to CDK construct references (never ARN strings)
4. **Modular Testing**: Each component is independently testable with clear interfaces

## File Structure

```
src/modules/generator/templates/l2-constructs/
├── iam.ts                          # Main IAM role generator (300-400 lines)
│   └── IAMRoleGenerator class
│       ├── generateRole()          # Main entry point
│       ├── analyzePermissions()    # Separates managed vs custom policies
│       ├── generateRoleDeclaration() # Creates Role constructor
│       ├── generateCustomPermissions() # Creates addToRolePolicy() calls
│       └── optimizeIAMRole()       # Applies optimization flags
│
src/modules/generator/utils/
├── managed-policy-detector.ts      # Managed policy detection (200-250 lines)
│   └── ManagedPolicyDetector class
│       ├── detectManagedPolicy()   # Main detection logic
│       ├── checkPreDetected()      # Uses Sprint 1 pre-detection
│       ├── matchesBasicExecutionRole() # Lambda execution role matcher
│       ├── matchesActions()        # Action pattern matching
│       └── MANAGED_POLICY_PATTERNS # Static pattern definitions
│
├── reference-resolver.ts           # CloudFormation reference resolution (350-400 lines)
│   └── ReferenceResolver class
│       ├── resolveResourceReference() # Main entry point
│       ├── resolveRef()            # Handles { Ref: 'LogicalId' }
│       ├── resolveGetAtt()         # Handles { Fn::GetAtt: [...] }
│       ├── resolveSub()            # Handles { Fn::Sub: '...' }
│       ├── resolveJoin()           # Handles { Fn::Join: [...] }
│       ├── getConstructName()      # Maps LogicalId to variable name
│       ├── mapAttributeToProperty() # Maps CF attributes to CDK properties
│       └── ATTRIBUTE_MAPPINGS      # Static attribute mappings
│
├── policy-generator.ts             # PolicyStatement generation (250-300 lines)
│   └── PolicyGenerator class
│       ├── generatePolicyStatement() # Creates PolicyStatement code
│       ├── generateAddToRolePolicy() # Creates addToRolePolicy() call
│       ├── resolveActions()        # Resolves action strings
│       ├── resolveResources()      # Resolves resource references
│       └── generateConditions()    # Generates condition code
│
tests/unit/generator/
├── iam-role-generator.test.ts      # Main generator tests (20 test cases)
│   ├── generateRole() suite        # 8 tests
│   ├── analyzePermissions() suite  # 5 tests
│   ├── generateRoleDeclaration() suite # 4 tests
│   └── generateCustomPermissions() suite # 3 tests
│
├── managed-policy-detector.test.ts # Policy detection tests (8 test cases)
│   ├── detectManagedPolicy() suite # 5 tests
│   └── matchesBasicExecutionRole() suite # 3 tests
│
├── reference-resolver.test.ts      # Reference resolution tests (10 test cases)
│   ├── resolveRef() suite          # 3 tests
│   ├── resolveGetAtt() suite       # 3 tests
│   ├── resolveSub() suite          # 2 tests
│   └── resolveJoin() suite         # 2 tests
│
└── policy-generator.test.ts        # Statement generation tests (8 test cases)
    ├── generatePolicyStatement() suite # 4 tests
    └── generateAddToRolePolicy() suite # 4 tests
│
tests/integration/
└── iam-generation.test.ts          # End-to-end tests (5 test cases)
    ├── Lambda BasicExecutionRole test
    ├── DynamoDB custom policy test
    ├── Multi-service complex role test
    ├── Resource reference preservation test
    └── TypeScript compilation test
```

## Class Designs

### 1. IAMRoleGenerator

**Purpose**: Orchestrates the entire IAM role generation process, coordinating between managed policy detection, reference resolution, and policy statement generation.

**Location**: `src/modules/generator/templates/l2-constructs/iam.ts`

**Dependencies**:
- `ManagedPolicyDetector` - Detects managed policy equivalents
- `ReferenceResolver` - Resolves CloudFormation references
- `PolicyGenerator` - Generates PolicyStatement objects

```typescript
import { ClassifiedResource } from '../../../types';
import { ManagedPolicyDetector } from '../utils/managed-policy-detector';
import { ReferenceResolver } from '../utils/reference-resolver';
import { PolicyGenerator } from '../utils/policy-generator';

export interface IAMGeneratorOptions {
  /** Whether to prefer managed policies over inline (default: true) */
  preferManagedPolicies?: boolean;

  /** Whether to group policy statements by service (default: true) */
  groupByService?: boolean;

  /** Maximum number of statements per addToRolePolicy call (default: unlimited) */
  maxStatementsPerPolicy?: number;
}

export interface PermissionAnalysis {
  /** Detected managed policy ARN (if any) */
  managedPolicyArn?: string;

  /** Custom policy statements that need addToRolePolicy() */
  customStatements: any[];

  /** Explicit managed policy ARNs from template */
  explicitManagedPolicies: string[];

  /** Assume role policy document */
  assumeRolePolicy: any;
}

export class IAMRoleGenerator {
  private managedPolicyDetector: ManagedPolicyDetector;
  private referenceResolver: ReferenceResolver;
  private policyGenerator: PolicyGenerator;
  private options: Required<IAMGeneratorOptions>;

  constructor(
    allResources: ClassifiedResource[],
    options: IAMGeneratorOptions = {}
  ) {
    // Initialize dependencies
    this.managedPolicyDetector = new ManagedPolicyDetector();
    this.referenceResolver = new ReferenceResolver(allResources);
    this.policyGenerator = new PolicyGenerator(allResources, this.referenceResolver);

    // Set default options
    this.options = {
      preferManagedPolicies: options.preferManagedPolicies ?? true,
      groupByService: options.groupByService ?? true,
      maxStatementsPerPolicy: options.maxStatementsPerPolicy ?? Number.MAX_SAFE_INTEGER
    };
  }

  /**
   * Main entry point - generates complete CDK code for an IAM role
   *
   * @param resource - ClassifiedResource from Sprint 1
   * @returns Generated CDK TypeScript code
   *
   * @example
   * const iamGenerator = new IAMRoleGenerator(allResources);
   * const code = iamGenerator.generateRole(lambdaRoleResource);
   * // Returns:
   * // const lambdaRole = new iam.Role(this, 'LambdaRole', {
   * //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
   * //   managedPolicies: [
   * //     iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
   * //   ]
   * // });
   */
  public generateRole(resource: ClassifiedResource): string {
    // Step 1: Analyze permissions to detect managed policies
    const analysis = this.analyzePermissions(resource);

    // Step 2: Generate Role constructor with managed policies
    let code = this.generateRoleDeclaration(resource, analysis);

    // Step 3: Generate addToRolePolicy() calls for custom statements
    if (analysis.customStatements.length > 0) {
      const constructName = this.getConstructName(resource.LogicalId);
      code += this.generateCustomPermissions(constructName, analysis.customStatements);
    }

    // Step 4: Apply optimization flags (suppressions, comments)
    code = this.optimizeIAMRole(code, resource);

    return code;
  }

  /**
   * Analyzes role permissions to separate managed policies from custom statements
   *
   * @param resource - IAM role resource
   * @returns PermissionAnalysis with managed policy ARN and custom statements
   *
   * Logic:
   * 1. Extract assume role policy from AssumeRolePolicyDocument
   * 2. Check Sprint 1 pre-detected managedPolicyEquivalent
   * 3. Detect managed policy from Policies array
   * 4. Extract explicit ManagedPolicyArns
   * 5. Separate custom statements that need addToRolePolicy()
   */
  private analyzePermissions(resource: ClassifiedResource): PermissionAnalysis {
    const properties = resource.Properties || {};
    const analysis: PermissionAnalysis = {
      customStatements: [],
      explicitManagedPolicies: [],
      assumeRolePolicy: properties.AssumeRolePolicyDocument
    };

    // Check for pre-detected managed policy from Sprint 1
    if (resource.managedPolicyEquivalent && this.options.preferManagedPolicies) {
      analysis.managedPolicyArn = resource.managedPolicyEquivalent;
    }

    // If not pre-detected, try runtime detection
    if (!analysis.managedPolicyArn && this.options.preferManagedPolicies) {
      analysis.managedPolicyArn = this.managedPolicyDetector.detectManagedPolicy(resource);
    }

    // Extract explicit managed policy ARNs
    if (properties.ManagedPolicyArns) {
      analysis.explicitManagedPolicies = Array.isArray(properties.ManagedPolicyArns)
        ? properties.ManagedPolicyArns
        : [properties.ManagedPolicyArns];
    }

    // Extract custom policy statements
    if (properties.Policies) {
      const policies = Array.isArray(properties.Policies)
        ? properties.Policies
        : [properties.Policies];

      for (const policy of policies) {
        const document = policy.PolicyDocument;
        if (document?.Statement) {
          const statements = Array.isArray(document.Statement)
            ? document.Statement
            : [document.Statement];

          // Only include if not covered by detected managed policy
          if (!analysis.managedPolicyArn) {
            analysis.customStatements.push(...statements);
          }
        }
      }
    }

    return analysis;
  }

  /**
   * Generates the Role constructor declaration with assume role policy and managed policies
   *
   * @param resource - IAM role resource
   * @param analysis - Permission analysis results
   * @returns CDK code for Role constructor
   *
   * @example
   * // Returns:
   * // const lambdaRole = new iam.Role(this, 'LambdaRole', {
   * //   assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
   * //   managedPolicies: [
   * //     iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
   * //   ]
   * // });
   */
  private generateRoleDeclaration(
    resource: ClassifiedResource,
    analysis: PermissionAnalysis
  ): string {
    const constructName = this.getConstructName(resource.LogicalId);
    const logicalId = resource.LogicalId;
    const lines: string[] = [];

    // Start Role constructor
    lines.push(`const ${constructName} = new iam.Role(this, '${logicalId}', {`);

    // Generate assumedBy from AssumeRolePolicyDocument
    if (analysis.assumeRolePolicy?.Statement) {
      const statement = Array.isArray(analysis.assumeRolePolicy.Statement)
        ? analysis.assumeRolePolicy.Statement[0]
        : analysis.assumeRolePolicy.Statement;

      const principal = statement.Principal;
      if (principal?.Service) {
        const service = Array.isArray(principal.Service)
          ? principal.Service[0]
          : principal.Service;
        lines.push(`  assumedBy: new iam.ServicePrincipal('${service}'),`);
      }
    }

    // Add managed policies if detected or explicit
    const managedPolicies: string[] = [];

    if (analysis.managedPolicyArn) {
      managedPolicies.push(
        `iam.ManagedPolicy.fromAwsManagedPolicyName('${analysis.managedPolicyArn}')`
      );
    }

    for (const arn of analysis.explicitManagedPolicies) {
      if (typeof arn === 'string') {
        managedPolicies.push(`iam.ManagedPolicy.fromManagedPolicyArn(this, '${logicalId}ManagedPolicy', '${arn}')`);
      } else {
        // Handle CloudFormation references
        const resolved = this.referenceResolver.resolveResourceReference(arn);
        managedPolicies.push(`iam.ManagedPolicy.fromManagedPolicyArn(this, '${logicalId}ManagedPolicy', ${resolved})`);
      }
    }

    if (managedPolicies.length > 0) {
      lines.push(`  managedPolicies: [`);
      for (const policy of managedPolicies) {
        lines.push(`    ${policy},`);
      }
      lines.push(`  ],`);
    }

    // Add role name if specified
    if (resource.Properties?.RoleName) {
      const roleName = typeof resource.Properties.RoleName === 'string'
        ? `'${resource.Properties.RoleName}'`
        : this.referenceResolver.resolveResourceReference(resource.Properties.RoleName);
      lines.push(`  roleName: ${roleName},`);
    }

    // Close constructor
    lines.push(`});`);

    return lines.join('\n');
  }

  /**
   * Generates addToRolePolicy() calls for custom policy statements
   *
   * @param roleName - Variable name of the role construct
   * @param statements - Array of custom policy statements
   * @returns CDK code for addToRolePolicy() calls
   *
   * Logic:
   * 1. Group statements by service if groupByService option is true
   * 2. Respect maxStatementsPerPolicy limit
   * 3. Generate PolicyStatement for each statement/group
   * 4. Generate addToRolePolicy() call
   */
  private generateCustomPermissions(
    roleName: string,
    statements: any[]
  ): string {
    const lines: string[] = [''];

    // Group statements by service if option enabled
    let statementGroups: any[][] = [];

    if (this.options.groupByService) {
      const byService = new Map<string, any[]>();

      for (const statement of statements) {
        const actions = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action];
        const service = actions[0]?.split(':')[0] || 'unknown';

        if (!byService.has(service)) {
          byService.set(service, []);
        }
        byService.get(service)!.push(statement);
      }

      statementGroups = Array.from(byService.values());
    } else {
      statementGroups = statements.map(s => [s]);
    }

    // Generate addToRolePolicy() calls
    let policyIndex = 0;
    for (const group of statementGroups) {
      // Respect maxStatementsPerPolicy limit
      for (let i = 0; i < group.length; i += this.options.maxStatementsPerPolicy) {
        const chunk = group.slice(i, i + this.options.maxStatementsPerPolicy);

        for (const statement of chunk) {
          const policyCode = this.policyGenerator.generateAddToRolePolicy(
            roleName,
            statement
          );
          lines.push(policyCode);
        }

        policyIndex++;
      }
    }

    return lines.join('\n');
  }

  /**
   * Applies optimization flags from Sprint 1 classification
   *
   * @param code - Generated CDK code
   * @param resource - ClassifiedResource with optimization flags
   * @returns Optimized code
   *
   * Optimizations:
   * - suppressLogicalIdOverride: Remove overrideLogicalId() call
   * - suppressRemovalPolicy: Remove removalPolicy: RETAIN
   * - suppressComments: Remove code comments
   */
  private optimizeIAMRole(code: string, resource: ClassifiedResource): string {
    let optimized = code;

    // Note: Most optimizations handled by Sprint 3 (Code Cleaner)
    // This is a placeholder for IAM-specific optimizations

    // Add import comment for clarity (unless suppressComments)
    if (!resource.suppressComments) {
      optimized = `// IAM Role: ${resource.LogicalId}\n` + optimized;
    }

    return optimized;
  }

  /**
   * Converts logical ID to construct variable name
   *
   * @param logicalId - CloudFormation logical ID
   * @returns camelCase variable name
   *
   * @example
   * getConstructName('LambdaRole') // 'lambdaRole'
   * getConstructName('MyAPIGateway') // 'myApiGateway'
   */
  private getConstructName(logicalId: string): string {
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }
}

/**
 * Error class for IAM generation failures
 */
export class IAMGeneratorError extends Error {
  constructor(
    message: string,
    public readonly resource: ClassifiedResource,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'IAMGeneratorError';
  }
}
```

### 2. ManagedPolicyDetector

**Purpose**: Detects when IAM role permissions match AWS managed policy patterns, reducing code size and improving maintainability.

**Location**: `src/modules/generator/utils/managed-policy-detector.ts`

**Strategy**: Pattern matching against known managed policy action sets. Expandable over time as more patterns are discovered.

```typescript
import { ClassifiedResource } from '../../../types';

/**
 * Pattern definition for AWS managed policies
 */
export interface ManagedPolicyPattern {
  /** Friendly name of the managed policy */
  name: string;

  /** ARN suffix (e.g., 'service-role/AWSLambdaBasicExecutionRole') */
  arn: string;

  /** Required actions that must be present */
  requiredActions: string[];

  /** Optional: service principal that typically uses this policy */
  service?: string;

  /** Optional: actions that can be present but aren't required */
  optionalActions?: string[];

  /** Optional: required resources (e.g., wildcard '*') */
  requiredResources?: string[];
}

export class ManagedPolicyDetector {
  /**
   * Registry of managed policy patterns
   *
   * Phase 1: Lambda BasicExecutionRole
   * Phase 2: Lambda VPCAccessExecutionRole, X-Ray write access
   * Phase 3: DynamoDB, S3, SNS, SQS standard policies
   */
  private static readonly MANAGED_POLICY_PATTERNS: ManagedPolicyPattern[] = [
    {
      name: 'AWSLambdaBasicExecutionRole',
      arn: 'service-role/AWSLambdaBasicExecutionRole',
      requiredActions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      service: 'lambda.amazonaws.com',
      requiredResources: ['*']
    },
    // Future patterns will be added here:
    // {
    //   name: 'AWSLambdaVPCAccessExecutionRole',
    //   arn: 'service-role/AWSLambdaVPCAccessExecutionRole',
    //   requiredActions: [
    //     'ec2:CreateNetworkInterface',
    //     'ec2:DescribeNetworkInterfaces',
    //     'ec2:DeleteNetworkInterface'
    //   ],
    //   service: 'lambda.amazonaws.com'
    // }
  ];

  /**
   * Main detection logic - checks if role matches any managed policy pattern
   *
   * @param resource - IAM role resource to analyze
   * @returns Managed policy ARN suffix if detected, undefined otherwise
   *
   * Detection strategy:
   * 1. First check Sprint 1 pre-detected managedPolicyEquivalent
   * 2. If not pre-detected, analyze inline policies
   * 3. Match against registered patterns
   * 4. Return first matching pattern ARN
   */
  public detectManagedPolicy(resource: ClassifiedResource): string | undefined {
    // Check Sprint 1 pre-detection first
    const preDetected = this.checkPreDetected(resource);
    if (preDetected) {
      return preDetected;
    }

    // Extract inline policies
    const properties = resource.Properties || {};
    if (!properties.Policies) {
      return undefined;
    }

    const policies = Array.isArray(properties.Policies)
      ? properties.Policies
      : [properties.Policies];

    // Try to match each pattern
    for (const pattern of ManagedPolicyDetector.MANAGED_POLICY_PATTERNS) {
      if (this.matchesPattern(policies, pattern, resource)) {
        return pattern.arn;
      }
    }

    return undefined;
  }

  /**
   * Checks if Sprint 1 already detected a managed policy equivalent
   *
   * @param resource - ClassifiedResource with possible pre-detection
   * @returns Managed policy ARN if pre-detected
   */
  private checkPreDetected(resource: ClassifiedResource): string | undefined {
    return resource.managedPolicyEquivalent;
  }

  /**
   * Checks if policies match a specific managed policy pattern
   *
   * @param policies - Array of inline policy documents
   * @param pattern - Managed policy pattern to match against
   * @param resource - Resource for service principal validation
   * @returns true if policies match the pattern
   */
  private matchesPattern(
    policies: any[],
    pattern: ManagedPolicyPattern,
    resource: ClassifiedResource
  ): boolean {
    // Validate service principal if pattern specifies one
    if (pattern.service) {
      const assumePolicy = resource.Properties?.AssumeRolePolicyDocument;
      if (!this.hasServicePrincipal(assumePolicy, pattern.service)) {
        return false;
      }
    }

    // Collect all actions from all policies
    const allActions = new Set<string>();
    const allResources = new Set<string>();

    for (const policy of policies) {
      const document = policy.PolicyDocument;
      if (!document?.Statement) continue;

      const statements = Array.isArray(document.Statement)
        ? document.Statement
        : [document.Statement];

      for (const statement of statements) {
        if (statement.Effect !== 'Allow') continue;

        // Collect actions
        const actions = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action];
        actions.forEach(a => allActions.add(a));

        // Collect resources
        const resources = Array.isArray(statement.Resource)
          ? statement.Resource
          : [statement.Resource];
        resources.forEach(r => allResources.add(r));
      }
    }

    // Check if all required actions are present
    const hasRequiredActions = pattern.requiredActions.every(
      required => this.matchesAction(allActions, required)
    );

    if (!hasRequiredActions) {
      return false;
    }

    // Check if required resources match (if specified)
    if (pattern.requiredResources) {
      const hasRequiredResources = pattern.requiredResources.every(
        required => allResources.has(required)
      );

      if (!hasRequiredResources) {
        return false;
      }
    }

    // Check that there are no unexpected actions beyond required + optional
    const allowedActions = new Set([
      ...pattern.requiredActions,
      ...(pattern.optionalActions || [])
    ]);

    const hasUnexpectedActions = Array.from(allActions).some(
      action => !Array.from(allowedActions).some(
        allowed => this.matchesAction(new Set([action]), allowed)
      )
    );

    return !hasUnexpectedActions;
  }

  /**
   * Checks if an action matches a pattern (handles wildcards)
   *
   * @param actions - Set of actual actions
   * @param pattern - Action pattern (may contain wildcards)
   * @returns true if any action matches the pattern
   *
   * @example
   * matchesAction(['logs:CreateLogGroup'], 'logs:*') // true
   * matchesAction(['logs:CreateLogGroup'], 'logs:CreateLogGroup') // true
   * matchesAction(['logs:CreateLogGroup'], 's3:*') // false
   */
  private matchesAction(actions: Set<string>, pattern: string): boolean {
    // Direct match
    if (actions.has(pattern)) {
      return true;
    }

    // Wildcard match
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(actions).some(action => regex.test(action));
    }

    // Check if any action matches via wildcard
    for (const action of actions) {
      if (action.includes('*')) {
        const regex = new RegExp('^' + action.replace(/\*/g, '.*') + '$');
        if (regex.test(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Checks if assume role policy has a specific service principal
   *
   * @param assumePolicy - AssumeRolePolicyDocument
   * @param service - Service principal to check (e.g., 'lambda.amazonaws.com')
   * @returns true if service principal is present
   */
  private hasServicePrincipal(assumePolicy: any, service: string): boolean {
    if (!assumePolicy?.Statement) {
      return false;
    }

    const statements = Array.isArray(assumePolicy.Statement)
      ? assumePolicy.Statement
      : [assumePolicy.Statement];

    for (const statement of statements) {
      const principal = statement.Principal;
      if (!principal?.Service) continue;

      const services = Array.isArray(principal.Service)
        ? principal.Service
        : [principal.Service];

      if (services.includes(service)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convenience method: Checks if role matches Lambda BasicExecutionRole pattern
   *
   * @param policies - Array of inline policy documents
   * @returns true if matches BasicExecutionRole
   */
  public matchesBasicExecutionRole(policies: any[]): boolean {
    const pattern = ManagedPolicyDetector.MANAGED_POLICY_PATTERNS.find(
      p => p.name === 'AWSLambdaBasicExecutionRole'
    );

    if (!pattern) {
      return false;
    }

    return this.matchesPattern(policies, pattern, {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [{
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole'
          }]
        }
      }
    } as ClassifiedResource);
  }
}
```

### 3. ReferenceResolver

**Purpose**: Converts CloudFormation intrinsic functions and references to CDK construct property references.

**Location**: `src/modules/generator/utils/reference-resolver.ts`

**Key Challenge**: CloudFormation uses logical IDs and ARN strings, CDK uses construct references and properties.

```typescript
import { ClassifiedResource } from '../../../types';

/**
 * Resolved reference with metadata
 */
export interface ResolvedReference {
  /** Construct variable name (e.g., 'myTable') */
  constructName: string;

  /** CDK property name (e.g., 'tableArn') */
  property: string;

  /** Full reference string (e.g., 'myTable.tableArn') */
  fullReference: string;

  /** Original CloudFormation logical ID */
  logicalId: string;
}

export class ReferenceResolver {
  /**
   * Mapping of CloudFormation resource types and attributes to CDK properties
   *
   * Structure: { ResourceType: { CFAttribute: cdkProperty } }
   */
  private static readonly ATTRIBUTE_MAPPINGS: Record<string, Record<string, string>> = {
    'AWS::DynamoDB::Table': {
      'Arn': 'tableArn',
      'StreamArn': 'tableStreamArn',
      'TableName': 'tableName'
    },
    'AWS::S3::Bucket': {
      'Arn': 'bucketArn',
      'BucketName': 'bucketName',
      'DomainName': 'bucketDomainName',
      'WebsiteURL': 'bucketWebsiteUrl',
      'RegionalDomainName': 'bucketRegionalDomainName'
    },
    'AWS::Lambda::Function': {
      'Arn': 'functionArn',
      'FunctionName': 'functionName'
    },
    'AWS::SNS::Topic': {
      'Arn': 'topicArn',
      'TopicName': 'topicName'
    },
    'AWS::SQS::Queue': {
      'Arn': 'queueArn',
      'QueueName': 'queueName',
      'QueueUrl': 'queueUrl'
    },
    'AWS::ApiGateway::RestApi': {
      'RootResourceId': 'root.resourceId',
      'RestApiId': 'restApiId'
    },
    'AWS::Logs::LogGroup': {
      'Arn': 'logGroupArn',
      'LogGroupName': 'logGroupName'
    },
    'AWS::Events::Rule': {
      'Arn': 'ruleArn',
      'RuleName': 'ruleName'
    },
    'AWS::StepFunctions::StateMachine': {
      'Arn': 'stateMachineArn',
      'Name': 'stateMachineName'
    }
  };

  /**
   * Mapping of pseudo-parameters to CDK equivalents
   */
  private static readonly PSEUDO_PARAMETERS: Record<string, string> = {
    'AWS::AccountId': 'this.account',
    'AWS::Region': 'this.region',
    'AWS::StackName': 'this.stackName',
    'AWS::Partition': 'this.partition',
    'AWS::URLSuffix': 'this.urlSuffix'
  };

  /**
   * Resource lookup map: LogicalId -> ClassifiedResource
   */
  private resourceMap: Map<string, ClassifiedResource>;

  constructor(allResources: ClassifiedResource[]) {
    // Build lookup map for fast resource resolution
    this.resourceMap = new Map();
    for (const resource of allResources) {
      this.resourceMap.set(resource.LogicalId, resource);
    }
  }

  /**
   * Main entry point - resolves any CloudFormation reference to CDK code
   *
   * @param ref - CloudFormation reference (Ref, GetAtt, Sub, Join, etc.)
   * @returns CDK code string
   *
   * @example
   * resolveResourceReference({ Ref: 'MyTable' })
   * // Returns: 'myTable.tableName'
   *
   * resolveResourceReference({ 'Fn::GetAtt': ['MyTable', 'Arn'] })
   * // Returns: 'myTable.tableArn'
   *
   * resolveResourceReference({ 'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${MyFunction}' })
   * // Returns: '`arn:aws:lambda:${this.region}:${this.account}:function:${myFunction.functionName}`'
   */
  public resolveResourceReference(ref: any): string {
    // Handle null/undefined
    if (ref == null) {
      return "''";
    }

    // Handle string literals
    if (typeof ref === 'string') {
      return `'${ref}'`;
    }

    // Handle CloudFormation intrinsic functions
    if (typeof ref === 'object') {
      // Ref
      if ('Ref' in ref) {
        return this.resolveRef(ref.Ref);
      }

      // Fn::GetAtt
      if ('Fn::GetAtt' in ref) {
        const [logicalId, attribute] = ref['Fn::GetAtt'];
        return this.resolveGetAtt(logicalId, attribute);
      }

      // Fn::Sub
      if ('Fn::Sub' in ref) {
        const template = Array.isArray(ref['Fn::Sub'])
          ? ref['Fn::Sub'][0]
          : ref['Fn::Sub'];
        const variables = Array.isArray(ref['Fn::Sub'])
          ? ref['Fn::Sub'][1]
          : undefined;
        return this.resolveSub(template, variables);
      }

      // Fn::Join
      if ('Fn::Join' in ref) {
        const [delimiter, parts] = ref['Fn::Join'];
        return this.resolveJoin(delimiter, parts);
      }

      // Fn::Select
      if ('Fn::Select' in ref) {
        const [index, array] = ref['Fn::Select'];
        const resolvedArray = this.resolveResourceReference(array);
        return `${resolvedArray}[${index}]`;
      }

      // Fn::Split
      if ('Fn::Split' in ref) {
        const [delimiter, string] = ref['Fn::Split'];
        const resolvedString = this.resolveResourceReference(string);
        return `${resolvedString}.split('${delimiter}')`;
      }
    }

    // Fallback for unknown types
    console.warn(`Unknown reference type: ${JSON.stringify(ref)}`);
    return `'${JSON.stringify(ref)}'`;
  }

  /**
   * Resolves { Ref: 'LogicalId' } to construct reference
   *
   * @param logicalId - CloudFormation logical ID
   * @returns CDK construct reference
   *
   * @example
   * resolveRef('MyTable') // 'myTable.tableName'
   * resolveRef('MyBucket') // 'myBucket.bucketName'
   */
  private resolveRef(logicalId: string): string {
    // Check for pseudo-parameters
    if (logicalId in ReferenceResolver.PSEUDO_PARAMETERS) {
      return ReferenceResolver.PSEUDO_PARAMETERS[logicalId];
    }

    // Look up resource
    const resource = this.resourceMap.get(logicalId);
    if (!resource) {
      console.warn(`Resource not found: ${logicalId}`);
      return `'${logicalId}'`;
    }

    const constructName = this.getConstructName(logicalId);

    // Ref returns different properties depending on resource type
    const refProperty = this.getRefProperty(resource.Type);

    return refProperty ? `${constructName}.${refProperty}` : constructName;
  }

  /**
   * Resolves { Fn::GetAtt: ['LogicalId', 'Attribute'] } to construct property
   *
   * @param logicalId - CloudFormation logical ID
   * @param attribute - CloudFormation attribute name
   * @returns CDK property reference
   *
   * @example
   * resolveGetAtt('MyTable', 'Arn') // 'myTable.tableArn'
   * resolveGetAtt('MyFunction', 'Arn') // 'myFunction.functionArn'
   */
  private resolveGetAtt(logicalId: string, attribute: string): string {
    const resource = this.resourceMap.get(logicalId);
    if (!resource) {
      console.warn(`Resource not found: ${logicalId}`);
      return `'${logicalId}.${attribute}'`;
    }

    const constructName = this.getConstructName(logicalId);
    const cdkProperty = this.mapAttributeToProperty(resource.Type, attribute);

    return `${constructName}.${cdkProperty}`;
  }

  /**
   * Resolves { Fn::Sub: 'template with ${variables}' } to template literal
   *
   * @param template - Template string with ${} placeholders
   * @param variables - Optional variable substitutions
   * @returns CDK template literal
   *
   * @example
   * resolveSub('arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${MyFunction}')
   * // Returns: '`arn:aws:lambda:${this.region}:${this.account}:function:${myFunction.functionName}`'
   */
  private resolveSub(template: string, variables?: Record<string, any>): string {
    let result = template;

    // Replace ${Ref} patterns
    result = result.replace(/\$\{(\w+)\}/g, (match, name) => {
      // Check variables object first
      if (variables && name in variables) {
        const resolved = this.resolveResourceReference(variables[name]);
        return '${' + resolved + '}';
      }

      // Check pseudo-parameters
      if (name in ReferenceResolver.PSEUDO_PARAMETERS) {
        return '${' + ReferenceResolver.PSEUDO_PARAMETERS[name] + '}';
      }

      // Resolve as resource reference
      const resolved = this.resolveRef(name);
      return '${' + resolved + '}';
    });

    // Replace ${Resource.Attribute} patterns
    result = result.replace(/\$\{(\w+)\.(\w+)\}/g, (match, logicalId, attribute) => {
      const resolved = this.resolveGetAtt(logicalId, attribute);
      return '${' + resolved + '}';
    });

    return '`' + result + '`';
  }

  /**
   * Resolves { Fn::Join: [delimiter, [parts]] } to string concatenation
   *
   * @param delimiter - Join delimiter
   * @param parts - Array of parts to join
   * @returns CDK concatenation code
   *
   * @example
   * resolveJoin(':', ['arn', 'aws', 'lambda', { Ref: 'AWS::Region' }])
   * // Returns: "`arn:aws:lambda:${this.region}`"
   */
  private resolveJoin(delimiter: string, parts: any[]): string {
    const resolvedParts = parts.map(part => {
      const resolved = this.resolveResourceReference(part);
      // Remove quotes from resolved parts for template literal
      return resolved.replace(/^'|'$/g, '');
    });

    return '`' + resolvedParts.join(delimiter) + '`';
  }

  /**
   * Maps CloudFormation logical ID to CDK construct variable name
   *
   * @param logicalId - CloudFormation logical ID (PascalCase)
   * @returns CDK variable name (camelCase)
   *
   * @example
   * getConstructName('MyDynamoDBTable') // 'myDynamoDbTable'
   * getConstructName('ProcessQueue') // 'processQueue'
   */
  private getConstructName(logicalId: string): string {
    // Convert PascalCase to camelCase
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }

  /**
   * Maps CloudFormation attribute to CDK property
   *
   * @param resourceType - CloudFormation resource type
   * @param attribute - CloudFormation attribute name
   * @returns CDK property name
   *
   * Falls back to camelCase version of attribute if no mapping exists
   */
  private mapAttributeToProperty(resourceType: string, attribute: string): string {
    const mappings = ReferenceResolver.ATTRIBUTE_MAPPINGS[resourceType];

    if (mappings && attribute in mappings) {
      return mappings[attribute];
    }

    // Fallback: convert attribute to camelCase
    console.warn(`No mapping found for ${resourceType}.${attribute}, using fallback`);
    return attribute.charAt(0).toLowerCase() + attribute.slice(1);
  }

  /**
   * Gets the property returned by { Ref: 'LogicalId' }
   *
   * Different resource types return different properties for Ref:
   * - Tables return tableName
   * - Buckets return bucketName
   * - Functions return functionName
   * - Some resources return the resource itself
   */
  private getRefProperty(resourceType: string): string | null {
    const refMappings: Record<string, string> = {
      'AWS::DynamoDB::Table': 'tableName',
      'AWS::S3::Bucket': 'bucketName',
      'AWS::Lambda::Function': 'functionName',
      'AWS::SNS::Topic': 'topicArn',
      'AWS::SQS::Queue': 'queueUrl',
      'AWS::Logs::LogGroup': 'logGroupName',
      'AWS::ApiGateway::RestApi': 'restApiId'
    };

    return refMappings[resourceType] || null;
  }

  /**
   * Public accessor for detailed reference resolution information
   *
   * @param logicalId - CloudFormation logical ID
   * @param attribute - Optional attribute name
   * @returns Detailed resolution information
   */
  public resolveWithMetadata(
    logicalId: string,
    attribute?: string
  ): ResolvedReference | null {
    const resource = this.resourceMap.get(logicalId);
    if (!resource) {
      return null;
    }

    const constructName = this.getConstructName(logicalId);
    const property = attribute
      ? this.mapAttributeToProperty(resource.Type, attribute)
      : this.getRefProperty(resource.Type) || '';

    return {
      constructName,
      property,
      fullReference: property ? `${constructName}.${property}` : constructName,
      logicalId
    };
  }
}
```

### 4. PolicyGenerator

**Purpose**: Generates CDK PolicyStatement objects and addToRolePolicy() calls from CloudFormation policy statements.

**Location**: `src/modules/generator/utils/policy-generator.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { ReferenceResolver } from './reference-resolver';

/**
 * Generated policy statement with metadata
 */
export interface GeneratedPolicyStatement {
  /** Generated CDK code */
  code: string;

  /** Resolved action strings */
  actions: string[];

  /** Resolved resource references */
  resources: string[];

  /** Statement effect (Allow/Deny) */
  effect: string;

  /** Optional conditions */
  conditions?: any;
}

export class PolicyGenerator {
  constructor(
    private allResources: ClassifiedResource[],
    private referenceResolver: ReferenceResolver
  ) {}

  /**
   * Generates PolicyStatement object code from CloudFormation statement
   *
   * @param statement - CloudFormation policy statement
   * @returns Generated PolicyStatement code
   *
   * @example
   * generatePolicyStatement({
   *   Effect: 'Allow',
   *   Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
   *   Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
   * })
   * // Returns:
   * // new iam.PolicyStatement({
   * //   effect: iam.Effect.ALLOW,
   * //   actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
   * //   resources: [myTable.tableArn]
   * // })
   */
  public generatePolicyStatement(statement: any): GeneratedPolicyStatement {
    const effect = statement.Effect || 'Allow';
    const actions = this.resolveActions(statement.Action);
    const resources = this.resolveResources(statement.Resource);
    const conditions = statement.Condition
      ? this.generateConditions(statement.Condition)
      : undefined;

    const lines: string[] = [];
    lines.push('new iam.PolicyStatement({');

    // Effect
    const effectEnum = effect === 'Allow' ? 'iam.Effect.ALLOW' : 'iam.Effect.DENY';
    lines.push(`  effect: ${effectEnum},`);

    // Actions
    if (actions.length > 0) {
      lines.push(`  actions: [${actions.map(a => `'${a}'`).join(', ')}],`);
    }

    // Resources
    if (resources.length > 0) {
      lines.push(`  resources: [${resources.join(', ')}],`);
    }

    // Conditions
    if (conditions) {
      lines.push(`  conditions: ${conditions}`);
    }

    // Principals (if present)
    if (statement.Principal) {
      const principals = this.generatePrincipals(statement.Principal);
      if (principals) {
        lines.push(`  principals: [${principals}],`);
      }
    }

    lines.push('})');

    return {
      code: lines.join('\n'),
      actions,
      resources,
      effect,
      conditions: statement.Condition
    };
  }

  /**
   * Generates complete addToRolePolicy() call
   *
   * @param roleName - Variable name of the role
   * @param statement - CloudFormation policy statement
   * @returns Complete addToRolePolicy() code
   *
   * @example
   * generateAddToRolePolicy('lambdaRole', statement)
   * // Returns:
   * // lambdaRole.addToRolePolicy(
   * //   new iam.PolicyStatement({
   * //     effect: iam.Effect.ALLOW,
   * //     actions: ['dynamodb:GetItem'],
   * //     resources: [myTable.tableArn]
   * //   })
   * // );
   */
  public generateAddToRolePolicy(
    roleName: string,
    statement: any
  ): string {
    const policyStatement = this.generatePolicyStatement(statement);

    return `${roleName}.addToRolePolicy(\n  ${policyStatement.code}\n);`;
  }

  /**
   * Resolves action strings from CloudFormation format
   *
   * @param actions - String or array of action strings
   * @returns Array of resolved action strings
   *
   * Handles:
   * - Single action string
   * - Array of actions
   * - Wildcard actions
   */
  private resolveActions(actions: string | string[]): string[] {
    if (!actions) {
      return [];
    }

    const actionArray = Array.isArray(actions) ? actions : [actions];

    // Actions are typically plain strings, no references to resolve
    return actionArray;
  }

  /**
   * Resolves resource references from CloudFormation format
   *
   * @param resources - String, array, or CloudFormation reference
   * @returns Array of resolved CDK resource references
   *
   * @example
   * resolveResources({ 'Fn::GetAtt': ['MyTable', 'Arn'] })
   * // Returns: ['myTable.tableArn']
   *
   * resolveResources('*')
   * // Returns: ["'*'"]
   *
   * resolveResources([{ Ref: 'MyBucket' }, '*'])
   * // Returns: ['myBucket.bucketArn', "'*'"]
   */
  private resolveResources(resources: any): string[] {
    if (!resources) {
      return [];
    }

    const resourceArray = Array.isArray(resources) ? resources : [resources];

    return resourceArray.map(resource => {
      return this.referenceResolver.resolveResourceReference(resource);
    });
  }

  /**
   * Generates condition code from CloudFormation conditions
   *
   * @param conditions - CloudFormation condition object
   * @returns CDK condition code
   *
   * @example
   * generateConditions({
   *   StringEquals: { 'aws:PrincipalOrgID': 'o-xxxxxxxxx' }
   * })
   * // Returns:
   * // {
   * //   StringEquals: { 'aws:PrincipalOrgID': 'o-xxxxxxxxx' }
   * // }
   */
  private generateConditions(conditions: any): string {
    // Conditions are typically preserved as-is
    return JSON.stringify(conditions, null, 2);
  }

  /**
   * Generates principal code from CloudFormation principal object
   *
   * @param principal - CloudFormation principal object
   * @returns CDK principal code
   *
   * @example
   * generatePrincipals({ Service: 'lambda.amazonaws.com' })
   * // Returns: 'new iam.ServicePrincipal("lambda.amazonaws.com")'
   *
   * generatePrincipals({ AWS: 'arn:aws:iam::123456789012:root' })
   * // Returns: 'new iam.AccountPrincipal("123456789012")'
   */
  private generatePrincipals(principal: any): string | null {
    if (!principal) {
      return null;
    }

    const principals: string[] = [];

    // Service principal
    if (principal.Service) {
      const services = Array.isArray(principal.Service)
        ? principal.Service
        : [principal.Service];

      for (const service of services) {
        principals.push(`new iam.ServicePrincipal('${service}')`);
      }
    }

    // AWS account principal
    if (principal.AWS) {
      const accounts = Array.isArray(principal.AWS)
        ? principal.AWS
        : [principal.AWS];

      for (const account of accounts) {
        if (account === '*') {
          principals.push(`new iam.AnyPrincipal()`);
        } else if (account.includes(':root')) {
          const accountId = account.split(':')[4];
          principals.push(`new iam.AccountPrincipal('${accountId}')`);
        } else {
          principals.push(`new iam.ArnPrincipal('${account}')`);
        }
      }
    }

    // Federated principal
    if (principal.Federated) {
      principals.push(`new iam.FederatedPrincipal('${principal.Federated}')`);
    }

    return principals.length > 0 ? principals.join(', ') : null;
  }

  /**
   * Groups policy statements by AWS service
   *
   * @param statements - Array of CloudFormation statements
   * @returns Map of service -> statements
   *
   * Used for grouping related permissions together
   */
  public groupStatementsByService(statements: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const statement of statements) {
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action];

      const service = actions[0]?.split(':')[0] || 'unknown';

      if (!grouped.has(service)) {
        grouped.set(service, []);
      }
      grouped.get(service)!.push(statement);
    }

    return grouped;
  }

  /**
   * Checks if a statement is simple enough to inline
   *
   * @param statement - CloudFormation statement
   * @returns true if statement should be inlined
   *
   * Simple statements:
   * - Single action
   * - Single resource
   * - No conditions
   * - Allow effect
   */
  public isSimpleStatement(statement: any): boolean {
    const hasMultipleActions = Array.isArray(statement.Action)
      && statement.Action.length > 1;
    const hasMultipleResources = Array.isArray(statement.Resource)
      && statement.Resource.length > 1;
    const hasConditions = !!statement.Condition;
    const isDeny = statement.Effect === 'Deny';

    return !hasMultipleActions
      && !hasMultipleResources
      && !hasConditions
      && !isDeny;
  }
}
```

## Interface Definitions

All interface additions to `src/types/index.ts`:

```typescript
// =============================================================================
// Sprint 2: IAM Role Generation Interfaces
// =============================================================================

/**
 * Options for IAM role generation
 */
export interface IAMGeneratorOptions {
  /** Whether to prefer managed policies over inline (default: true) */
  preferManagedPolicies?: boolean;

  /** Whether to group policy statements by service (default: true) */
  groupByService?: boolean;

  /** Maximum number of statements per addToRolePolicy call (default: unlimited) */
  maxStatementsPerPolicy?: number;
}

/**
 * Result of analyzing IAM role permissions
 */
export interface PermissionAnalysis {
  /** Detected managed policy ARN (if any) */
  managedPolicyArn?: string;

  /** Custom policy statements that need addToRolePolicy() */
  customStatements: any[];

  /** Explicit managed policy ARNs from template */
  explicitManagedPolicies: string[];

  /** Assume role policy document */
  assumeRolePolicy: any;
}

/**
 * Pattern definition for AWS managed policies
 */
export interface ManagedPolicyPattern {
  /** Friendly name of the managed policy */
  name: string;

  /** ARN suffix (e.g., 'service-role/AWSLambdaBasicExecutionRole') */
  arn: string;

  /** Required actions that must be present */
  requiredActions: string[];

  /** Optional: service principal that typically uses this policy */
  service?: string;

  /** Optional: actions that can be present but aren't required */
  optionalActions?: string[];

  /** Optional: required resources (e.g., wildcard '*') */
  requiredResources?: string[];
}

/**
 * Resolved CloudFormation reference with metadata
 */
export interface ResolvedReference {
  /** Construct variable name (e.g., 'myTable') */
  constructName: string;

  /** CDK property name (e.g., 'tableArn') */
  property: string;

  /** Full reference string (e.g., 'myTable.tableArn') */
  fullReference: string;

  /** Original CloudFormation logical ID */
  logicalId: string;
}

/**
 * Generated policy statement with metadata
 */
export interface GeneratedPolicyStatement {
  /** Generated CDK code */
  code: string;

  /** Resolved action strings */
  actions: string[];

  /** Resolved resource references */
  resources: string[];

  /** Statement effect (Allow/Deny) */
  effect: string;

  /** Optional conditions */
  conditions?: any;
}
```

## Integration Points

### Integration with Sprint 1 (ResourceClassifier)

**Sprint 1 Provides**:
```typescript
// ClassifiedResource from Sprint 1
interface ClassifiedResource {
  Type: string;
  LogicalId: string;
  Properties: any;

  // Sprint 1 classifications used by Sprint 2:
  managedPolicyEquivalent?: string;     // Pre-detected managed policy
  relatedResources: string[];           // Related Lambda, LogGroup, etc.
  suppressLogicalIdOverride: boolean;   // Skip overrideLogicalId()
  suppressRemovalPolicy: boolean;       // Skip removalPolicy: RETAIN
  suppressComments: boolean;            // Skip code comments
  needsImport: boolean;                 // Whether resource is imported
}
```

**Sprint 2 Uses**:
```typescript
// In IAMRoleGenerator constructor
constructor(allResources: ClassifiedResource[]) {
  // Use all resources for reference resolution
  this.referenceResolver = new ReferenceResolver(allResources);
}

// In analyzePermissions()
if (resource.managedPolicyEquivalent) {
  // Use Sprint 1's pre-detection
  analysis.managedPolicyArn = resource.managedPolicyEquivalent;
}

// In optimizeIAMRole()
if (resource.suppressComments) {
  // Skip comment generation
}
```

**Data Flow**:
```
Sprint 1 (Classifier)
  → ClassifiedResource[] with managedPolicyEquivalent
    → Sprint 2 (IAMRoleGenerator)
      → Uses managedPolicyEquivalent directly
      → Falls back to runtime detection if not pre-detected
      → Resolves references to other classified resources
```

### Integration with Sprint 3 (Code Cleaner)

**Sprint 2 Produces**:
```typescript
// Generated IAM role code
const lambdaRole = new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  ]
});

// Sprint 3 will:
// 1. Remove unnecessary comments (if suppressComments)
// 2. Remove logical ID overrides (if suppressLogicalIdOverride)
// 3. Format and organize code
// 4. Group IAM roles in "iam" section
```

**Sprint 3 Receives**:
- IAM role code strings
- ClassifiedResource optimization flags
- Code that may need cleanup/formatting

**Division of Responsibility**:
- **Sprint 2**: Generate correct CDK code with proper references
- **Sprint 3**: Clean, format, and organize the code

### Integration with Generator Pipeline

**Main Generator Flow**:
```typescript
// In src/modules/generator/index.ts (or similar)

import { ResourceClassifier } from './resource-classifier';
import { IAMRoleGenerator } from './templates/l2-constructs/iam';

class CDKGenerator {
  async generateStack(cloudFormationTemplate: any): Promise<string> {
    // Sprint 1: Classify resources
    const classifier = new ResourceClassifier();
    const classifiedResources = classifier.classifyResources(
      cloudFormationTemplate.Resources
    );

    // Sprint 2: Generate IAM roles
    const iamGenerator = new IAMRoleGenerator(classifiedResources);

    let stackCode = '';

    for (const resource of classifiedResources) {
      if (resource.Type === 'AWS::IAM::Role') {
        const roleCode = iamGenerator.generateRole(resource);
        stackCode += roleCode + '\n\n';
      }
      // Other resource types handled by other generators
    }

    // Sprint 3: Clean and organize code
    // (handled later in pipeline)

    return stackCode;
  }
}
```

**Pipeline Sequence**:
1. **Parse CloudFormation** → JSON template
2. **Sprint 1 Classify** → ClassifiedResource[]
3. **Sprint 2 Generate IAM** → IAM role code strings
4. **Generate Other Resources** → Other resource code
5. **Sprint 3 Clean** → Formatted, organized code
6. **Sprint 4 Validate** → Compilation check

## Test Architecture

### Unit Test Structure

#### 1. IAM Role Generator Tests

**File**: `tests/unit/generator/iam-role-generator.test.ts`

**Test Suites** (20 total tests):

```typescript
import { IAMRoleGenerator } from '../../../src/modules/generator/templates/l2-constructs/iam';
import { ClassifiedResource } from '../../../src/types';

describe('IAMRoleGenerator', () => {
  describe('generateRole()', () => {
    it('should generate role with managed policy when detected', () => {
      // Setup: Role with BasicExecutionRole pattern
      // Expected: managedPolicies with AWSLambdaBasicExecutionRole
    });

    it('should generate role with custom policies', () => {
      // Setup: Role with custom DynamoDB permissions
      // Expected: addToRolePolicy() calls
    });

    it('should use construct references not ARN strings', () => {
      // Setup: Role with Resource: { Ref: 'MyTable' }
      // Expected: myTable.tableArn, not hardcoded ARN
    });

    it('should respect suppressLogicalIdOverride flag', () => {
      // Setup: Resource with suppressLogicalIdOverride: true
      // Expected: No overrideLogicalId() call
    });

    it('should respect suppressRemovalPolicy flag', () => {
      // Setup: Resource with suppressRemovalPolicy: true
      // Expected: No removalPolicy: RETAIN
    });

    it('should handle multiple managed policies', () => {
      // Setup: Role with ManagedPolicyArns array
      // Expected: Multiple managedPolicies entries
    });

    it('should generate assume role policy from AssumeRolePolicyDocument', () => {
      // Setup: Role with custom assume role policy
      // Expected: assumedBy with correct principal
    });

    it('should handle roles with no inline policies', () => {
      // Setup: Role with only managed policies
      // Expected: No addToRolePolicy() calls
    });
  });

  describe('analyzePermissions()', () => {
    it('should detect managed policy equivalent', () => {
      // Setup: Role matching BasicExecutionRole pattern
      // Expected: managedPolicyArn = 'service-role/AWSLambdaBasicExecutionRole'
    });

    it('should separate managed vs custom statements', () => {
      // Setup: Role with mixed permissions
      // Expected: Managed policy detected, custom statements separated
    });

    it('should handle explicit managed policy ARNs', () => {
      // Setup: Role with ManagedPolicyArns property
      // Expected: explicitManagedPolicies populated
    });

    it('should use Sprint 1 pre-detected managed policies', () => {
      // Setup: ClassifiedResource with managedPolicyEquivalent
      // Expected: Use pre-detected value
    });

    it('should extract assume role policy', () => {
      // Setup: Role with AssumeRolePolicyDocument
      // Expected: assumeRolePolicy populated
    });
  });

  describe('generateRoleDeclaration()', () => {
    it('should generate basic role constructor', () => {
      // Expected: new iam.Role(this, 'LogicalId', { ... })
    });

    it('should generate service principal from assume policy', () => {
      // Setup: Lambda assume role policy
      // Expected: assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    });

    it('should include role name if specified', () => {
      // Setup: Role with RoleName property
      // Expected: roleName: '...' in constructor
    });

    it('should include managed policies in constructor', () => {
      // Setup: Role with detected managed policy
      // Expected: managedPolicies: [...] in constructor
    });
  });

  describe('generateCustomPermissions()', () => {
    it('should group statements by service when enabled', () => {
      // Setup: Multiple statements for different services
      // Expected: Grouped addToRolePolicy() calls
    });

    it('should generate multiple addToRolePolicy calls', () => {
      // Setup: Role with 3 custom statements
      // Expected: 3 addToRolePolicy() calls
    });

    it('should resolve resource references in statements', () => {
      // Setup: Statement with { Ref: 'MyTable' }
      // Expected: myTable.tableArn in resources
    });
  });
});
```

#### 2. Managed Policy Detector Tests

**File**: `tests/unit/generator/managed-policy-detector.test.ts`

**Test Suites** (8 total tests):

```typescript
import { ManagedPolicyDetector } from '../../../src/modules/generator/utils/managed-policy-detector';

describe('ManagedPolicyDetector', () => {
  describe('detectManagedPolicy()', () => {
    it('should detect AWSLambdaBasicExecutionRole', () => {
      // Setup: Role with logs:CreateLogGroup, CreateLogStream, PutLogEvents
      // Expected: 'service-role/AWSLambdaBasicExecutionRole'
    });

    it('should return undefined for non-matching roles', () => {
      // Setup: Role with custom DynamoDB permissions
      // Expected: undefined
    });

    it('should use Sprint 1 pre-detected value', () => {
      // Setup: ClassifiedResource with managedPolicyEquivalent
      // Expected: Return pre-detected value
    });

    it('should handle roles with extra permissions', () => {
      // Setup: Role with BasicExecutionRole + extra permissions
      // Expected: undefined (doesn't match pattern exactly)
    });

    it('should match wildcard actions', () => {
      // Setup: Role with 'logs:*' action
      // Expected: Match BasicExecutionRole pattern
    });
  });

  describe('matchesBasicExecutionRole()', () => {
    it('should match exact action set', () => {
      // Setup: Policies with exact BasicExecutionRole actions
      // Expected: true
    });

    it('should reject incomplete action sets', () => {
      // Setup: Policies missing PutLogEvents
      // Expected: false
    });

    it('should reject roles with extra actions', () => {
      // Setup: Policies with BasicExecutionRole + s3:GetObject
      // Expected: false
    });
  });
});
```

#### 3. Reference Resolver Tests

**File**: `tests/unit/generator/reference-resolver.test.ts`

**Test Suites** (10 total tests):

```typescript
import { ReferenceResolver } from '../../../src/modules/generator/utils/reference-resolver';

describe('ReferenceResolver', () => {
  describe('resolveRef()', () => {
    it('should resolve table reference', () => {
      // Setup: { Ref: 'MyTable' }
      // Expected: 'myTable.tableName'
    });

    it('should resolve bucket reference', () => {
      // Setup: { Ref: 'MyBucket' }
      // Expected: 'myBucket.bucketName'
    });

    it('should resolve pseudo-parameters', () => {
      // Setup: { Ref: 'AWS::Region' }
      // Expected: 'this.region'
    });
  });

  describe('resolveGetAtt()', () => {
    it('should resolve table ARN attribute', () => {
      // Setup: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
      // Expected: 'myTable.tableArn'
    });

    it('should resolve function ARN attribute', () => {
      // Setup: { 'Fn::GetAtt': ['MyFunction', 'Arn'] }
      // Expected: 'myFunction.functionArn'
    });

    it('should fallback for unknown attributes', () => {
      // Setup: { 'Fn::GetAtt': ['MyResource', 'UnknownAttr'] }
      // Expected: 'myResource.unknownAttr' (camelCase fallback)
    });
  });

  describe('resolveSub()', () => {
    it('should resolve Sub with pseudo-parameters', () => {
      // Setup: { 'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:...' }
      // Expected: Template literal with this.region
    });

    it('should resolve Sub with resource references', () => {
      // Setup: { 'Fn::Sub': '${MyTable}' }
      // Expected: Template literal with myTable.tableName
    });
  });

  describe('resolveJoin()', () => {
    it('should resolve Join with static strings', () => {
      // Setup: { 'Fn::Join': [':', ['arn', 'aws', 'lambda']] }
      // Expected: '`arn:aws:lambda`'
    });

    it('should resolve Join with references', () => {
      // Setup: { 'Fn::Join': ['/', [{ Ref: 'MyBucket' }, 'key']] }
      // Expected: Template literal with bucket reference
    });
  });
});
```

#### 4. Policy Generator Tests

**File**: `tests/unit/generator/policy-generator.test.ts`

**Test Suites** (8 total tests):

```typescript
import { PolicyGenerator } from '../../../src/modules/generator/utils/policy-generator';

describe('PolicyGenerator', () => {
  describe('generatePolicyStatement()', () => {
    it('should generate basic Allow statement', () => {
      // Setup: { Effect: 'Allow', Action: [...], Resource: [...] }
      // Expected: new iam.PolicyStatement({ effect: ALLOW, ... })
    });

    it('should generate Deny statement', () => {
      // Setup: { Effect: 'Deny', ... }
      // Expected: effect: iam.Effect.DENY
    });

    it('should resolve resource references', () => {
      // Setup: Resource: { Ref: 'MyTable' }
      // Expected: resources: [myTable.tableArn]
    });

    it('should handle wildcard resources', () => {
      // Setup: Resource: '*'
      // Expected: resources: ["'*'"]
    });
  });

  describe('generateAddToRolePolicy()', () => {
    it('should generate complete addToRolePolicy call', () => {
      // Expected: roleName.addToRolePolicy(\n  new iam.PolicyStatement(...)
    });

    it('should include statement in call', () => {
      // Expected: Full PolicyStatement nested inside
    });

    it('should use correct role variable name', () => {
      // Setup: roleName = 'lambdaRole'
      // Expected: 'lambdaRole.addToRolePolicy(...)'
    });

    it('should handle multiple actions', () => {
      // Setup: Action: ['dynamodb:GetItem', 'dynamodb:PutItem']
      // Expected: actions: ['dynamodb:GetItem', 'dynamodb:PutItem']
    });
  });
});
```

### Integration Test Structure

**File**: `tests/integration/iam-generation.test.ts`

**Test Scenarios** (5 total tests):

```typescript
import { ResourceClassifier } from '../../../src/modules/generator/resource-classifier';
import { IAMRoleGenerator } from '../../../src/modules/generator/templates/l2-constructs/iam';

describe('IAM Generation Integration', () => {
  it('should generate Lambda role with BasicExecutionRole', () => {
    // Setup: CloudFormation template with Lambda + IAM role
    // Expected:
    // - Role with managedPolicies: [BasicExecutionRole]
    // - No addToRolePolicy() calls
    // - Correct assume role policy
  });

  it('should generate custom role with DynamoDB permissions', () => {
    // Setup: CloudFormation template with DynamoDB table + IAM role
    // Expected:
    // - Role with custom DynamoDB permissions
    // - addToRolePolicy() with table.tableArn reference
    // - No managed policies
  });

  it('should handle complex multi-service roles', () => {
    // Setup: Role with DynamoDB, S3, SNS permissions
    // Expected:
    // - Multiple addToRolePolicy() calls grouped by service
    // - All resource references resolved correctly
    // - Proper action arrays
  });

  it('should preserve resource references across services', () => {
    // Setup: Template with Lambda, DynamoDB, S3 bucket, IAM role
    // Expected:
    // - Role references table ARN via construct reference
    // - Role references bucket ARN via construct reference
    // - No hardcoded ARN strings
  });

  it('should generate code that compiles successfully', () => {
    // Setup: Full CloudFormation template
    // Expected:
    // - Generated code passes TypeScript compilation
    // - No import errors
    // - Syntactically valid CDK code
  });
});
```

### Test Coverage Goals

- **Unit Tests**: 90%+ coverage of all classes and methods
- **Integration Tests**: 100% coverage of major use cases
- **Edge Cases**: Comprehensive handling of:
  - Missing properties
  - Invalid references
  - Malformed CloudFormation
  - Empty policy statements
  - Complex nested references

### Test Data Strategy

**Fixtures** (`tests/fixtures/iam-roles/`):
```
tests/fixtures/iam-roles/
├── lambda-basic-execution.json      # Simple Lambda role
├── lambda-custom-dynamodb.json      # Lambda + DynamoDB
├── complex-multi-service.json       # Multi-service role
├── explicit-managed-policies.json   # Role with ManagedPolicyArns
└── nested-references.json           # Complex Fn::Sub, Fn::Join
```

**Mock Data**:
```typescript
// tests/helpers/mock-resources.ts

export const mockLambdaRole: ClassifiedResource = {
  Type: 'AWS::IAM::Role',
  LogicalId: 'LambdaRole',
  Properties: {
    AssumeRolePolicyDocument: { /* ... */ },
    Policies: [ /* BasicExecutionRole pattern */ ]
  },
  managedPolicyEquivalent: 'service-role/AWSLambdaBasicExecutionRole',
  // ... other fields
};
```

## Dependencies

### New Dependencies

**None expected** - Sprint 2 uses only existing dependencies:
- `aws-cdk-lib` - Already present for CDK constructs
- `@jest/globals` - Already present for testing

### Existing Dependencies (Confirmed Usage)

```json
{
  "dependencies": {
    "aws-cdk-lib": "^2.x.x"  // For iam.Role, iam.PolicyStatement types
  },
  "devDependencies": {
    "@types/jest": "^29.x.x",
    "@jest/globals": "^29.x.x",
    "typescript": "^5.x.x"
  }
}
```

### Peer Dependencies

Sprint 2 depends on Sprint 1's output:
- `ClassifiedResource` type from `src/types/index.ts`
- `ResourceClassifier` from `src/modules/generator/resource-classifier.ts`

## Error Handling

### Error Types

```typescript
/**
 * Base error for IAM generation failures
 */
export class IAMGeneratorError extends Error {
  constructor(
    message: string,
    public readonly resource: ClassifiedResource,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'IAMGeneratorError';
  }
}

/**
 * Error when reference cannot be resolved
 */
export class ReferenceResolutionError extends IAMGeneratorError {
  constructor(
    public readonly reference: any,
    resource: ClassifiedResource,
    cause?: Error
  ) {
    super(`Failed to resolve reference: ${JSON.stringify(reference)}`, resource, cause);
    this.name = 'ReferenceResolutionError';
  }
}

/**
 * Error when managed policy detection fails
 */
export class ManagedPolicyDetectionError extends IAMGeneratorError {
  constructor(
    message: string,
    resource: ClassifiedResource,
    cause?: Error
  ) {
    super(message, resource, cause);
    this.name = 'ManagedPolicyDetectionError';
  }
}
```

### Error Recovery Strategy

```typescript
// In IAMRoleGenerator.generateRole()
public generateRole(resource: ClassifiedResource): string {
  try {
    // Normal generation flow
    const analysis = this.analyzePermissions(resource);
    let code = this.generateRoleDeclaration(resource, analysis);
    // ...
    return code;
  } catch (error) {
    if (error instanceof IAMGeneratorError) {
      console.warn(`Warning: Failed to generate IAM role for ${error.resource.LogicalId}`);
      console.warn(`Falling back to basic role generation`);
      console.warn(`Error: ${error.message}`);

      // Fallback: Generate basic role without optimizations
      return this.generateFallbackRole(resource);
    }

    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Generates a safe, basic role when normal generation fails
 */
private generateFallbackRole(resource: ClassifiedResource): string {
  const constructName = this.getConstructName(resource.LogicalId);
  const logicalId = resource.LogicalId;

  // Generate minimal role with assume policy only
  return `const ${constructName} = new iam.Role(this, '${logicalId}', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  // TODO: Manual review required - automatic generation failed
});`;
}
```

### Validation Strategy

```typescript
/**
 * Validates generated code before returning
 */
private validateGeneratedCode(code: string, resource: ClassifiedResource): void {
  // Check for syntax errors
  if (!code.includes('new iam.Role')) {
    throw new IAMGeneratorError('Generated code missing Role constructor', resource);
  }

  // Check for unclosed braces
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    throw new IAMGeneratorError('Generated code has mismatched braces', resource);
  }

  // Check for unresolved references
  if (code.includes('undefined') || code.includes('null')) {
    console.warn(`Warning: Generated code may contain unresolved references for ${resource.LogicalId}`);
  }
}
```

## File Ownership

### Sprint 2 Exclusively Owns

```
src/modules/generator/templates/l2-constructs/
├── iam.ts                          # Sprint 2 exclusive

src/modules/generator/utils/
├── managed-policy-detector.ts      # Sprint 2 exclusive
├── reference-resolver.ts           # Sprint 2 exclusive
└── policy-generator.ts             # Sprint 2 exclusive

tests/unit/generator/
├── iam-role-generator.test.ts      # Sprint 2 exclusive
├── managed-policy-detector.test.ts # Sprint 2 exclusive
├── reference-resolver.test.ts      # Sprint 2 exclusive
└── policy-generator.test.ts        # Sprint 2 exclusive

tests/integration/
└── iam-generation.test.ts          # Sprint 2 exclusive
```

### Shared Files (Read-Only for Sprint 2)

```
src/types/index.ts                  # Sprint 2 adds interfaces, Sprint 1 owns base
src/modules/generator/resource-classifier.ts  # Sprint 1 owns, Sprint 2 reads
```

### Sprint 2 Does NOT Touch

```
src/modules/cleaner/                # Sprint 3 territory
src/modules/validator/              # Sprint 4 territory
src/modules/parser/                 # Sprint 0 territory
```

## Module Boundaries

### Clear Interface: Sprint 1 → Sprint 2

**Input**: `ClassifiedResource[]` with:
- `Type: 'AWS::IAM::Role'`
- `Properties` with role definition
- `managedPolicyEquivalent` (optional pre-detection)
- `relatedResources` (linked Lambda, etc.)
- Optimization flags

**Output**: None (Sprint 2 doesn't modify ClassifiedResource)

### Clear Interface: Sprint 2 → Sprint 3

**Input**: Sprint 3 receives:
- Generated IAM role code strings
- ClassifiedResource optimization flags
- Code that may need formatting

**Output**: None (Sprint 2 doesn't call Sprint 3)

### Clear Interface: Sprint 2 → Generator Pipeline

**Input**: Sprint 2 receives:
- All `ClassifiedResource[]` from Sprint 1
- Generator options (if any)

**Output**: Sprint 2 provides:
- CDK code strings for each IAM role
- Ready for concatenation into stack

## Build Integration

### TypeScript Configuration

**No changes required** - Uses existing `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Jest Configuration

**Test pattern additions** to `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/unit/generator/**/*.test.ts',
    '**/tests/integration/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/modules/generator/templates/l2-constructs/**/*.ts',
    'src/modules/generator/utils/**/*.ts',
    '!src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

### Build Scripts

**No changes required** to `package.json` scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests --ext .ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### CI/CD Integration

Sprint 2 tests run in existing CI pipeline:
```yaml
# .github/workflows/test.yml (example)
- name: Run Unit Tests
  run: npm run test:unit

- name: Run Integration Tests
  run: npm run test:integration

- name: Check Coverage
  run: npm run test:coverage
```

## Phase Gate 3 Criteria

Before proceeding to Refinement (implementation), this architecture must satisfy:

### ✅ Completeness Criteria

- [ ] All 4 classes fully specified with methods
- [ ] All interfaces defined in types/index.ts
- [ ] All integration points documented
- [ ] Test architecture covers all use cases
- [ ] Error handling strategy defined
- [ ] File structure complete

### ✅ Integration Criteria

- [ ] No conflicts with Sprint 1 (classifier)
- [ ] No conflicts with Sprint 3 (cleaner)
- [ ] No conflicts with Sprint 4 (validator)
- [ ] Clear module boundaries defined
- [ ] Integration points well-documented

### ✅ Quality Criteria

- [ ] Design follows SOLID principles
- [ ] Classes have single responsibilities
- [ ] Dependencies properly injected
- [ ] Error recovery well-defined
- [ ] Test coverage plan comprehensive

### ✅ Readiness Criteria

- [ ] Ready for TDD implementation
- [ ] All edge cases considered
- [ ] Build integration defined
- [ ] File ownership clear
- [ ] Ready for Phase Gate 3 review

---

**Status**: Architecture Complete - Awaiting Phase Gate 3 Approval

**Next Phase**: Refinement (TDD Implementation) - DO NOT START until approved

**Coordinator Review Required**: Integration conflicts, module boundaries, test architecture
