/**
 * TypeScript Code Generator
 *
 * Generates TypeScript CDK code for CloudFormation resources
 */

import { Resource } from '../../types';
import { ConstructCode } from './index';

/**
 * Construct definition for CDK resources
 */
interface ConstructDefinition {
  /** L1 CloudFormation construct class */
  l1Class: string;

  /** L2 higher-level construct class (if available) */
  l2Class?: string;

  /** CDK module name */
  module: string;

  /** Full module path */
  modulePath: string;
}

/**
 * Property transformer function type
 */
type PropertyTransformer = (
  properties: Record<string, unknown>,
  resourceRefs: Map<string, string>
) => Record<string, unknown>;

/**
 * TypeScript code generator
 */
export class TypeScriptGenerator {
  /**
   * Mapping from CloudFormation resource types to CDK constructs
   */
  private readonly CONSTRUCT_MAPPING: Record<string, ConstructDefinition> = {
    'AWS::DynamoDB::Table': {
      l1Class: 'CfnTable',
      l2Class: 'Table',
      module: 'dynamodb',
      modulePath: 'aws-dynamodb',
    },
    'AWS::S3::Bucket': {
      l1Class: 'CfnBucket',
      l2Class: 'Bucket',
      module: 's3',
      modulePath: 'aws-s3',
    },
    'AWS::Logs::LogGroup': {
      l1Class: 'CfnLogGroup',
      l2Class: 'LogGroup',
      module: 'logs',
      modulePath: 'aws-logs',
    },
    'AWS::Lambda::Function': {
      l1Class: 'CfnFunction',
      l2Class: 'Function',
      module: 'lambda',
      modulePath: 'aws-lambda',
    },
    'AWS::IAM::Role': {
      l1Class: 'CfnRole',
      l2Class: 'Role',
      module: 'iam',
      modulePath: 'aws-iam',
    },
  };

  /**
   * Property transformers for L2 constructs
   */
  private readonly PROPERTY_TRANSFORMERS: Record<string, PropertyTransformer> = {
    'AWS::S3::Bucket': this.transformS3BucketProps.bind(this),
    'AWS::IAM::Role': this.transformIAMRoleProps.bind(this),
    'AWS::Lambda::Function': this.transformLambdaFunctionProps.bind(this),
    'AWS::DynamoDB::Table': this.transformDynamoDBTableProps.bind(this),
    'AWS::Logs::LogGroup': this.transformLogGroupProps.bind(this),
  };

  /**
   * Track resource variable names for cross-references
   */
  private resourceRefs: Map<string, string> = new Map();

  /**
   * Generate construct code for a resource
   */
  generateConstruct(resource: Resource, useL2: boolean = true): ConstructCode {
    const definition = this.CONSTRUCT_MAPPING[resource.type];

    if (!definition) {
      throw new Error(
        `Unsupported resource type: ${resource.type}. Only L1 constructs will be generated.`
      );
    }

    // Choose L1 or L2 construct
    const constructClass = useL2 && definition.l2Class
      ? definition.l2Class
      : definition.l1Class;

    const varName = this.toCamelCase(resource.logicalId);

    // Store resource reference for cross-references
    this.resourceRefs.set(resource.logicalId, varName);

    // Transform properties if using L2 and transformer exists
    let transformedProps = resource.properties;
    if (useL2 && this.PROPERTY_TRANSFORMERS[resource.type]) {
      transformedProps = this.PROPERTY_TRANSFORMERS[resource.type](
        resource.properties,
        this.resourceRefs
      );
    }

    const properties = this.convertProperties(
      transformedProps,
      resource.type,
      useL2
    );

    // Generate the construct code
    const code = this.renderConstruct(
      varName,
      constructClass,
      resource.logicalId,
      properties,
      definition.module
    );

    return {
      name: varName,
      resourceType: resource.type,
      code,
      comments: [
        `${resource.type}: ${this.getPhysicalId(resource)}`,
        'IMPORTANT: This resource will be imported, not created',
      ],
      dependencies: this.extractDependencies(resource.properties),
    };
  }

  /**
   * Generate import statements for resource types
   */
  generateImports(resourceTypes: Set<string>): string[] {
    const imports = new Set<string>();

    // Always include core CDK
    imports.add("import * as cdk from 'aws-cdk-lib';");
    imports.add("import { Construct } from 'constructs';");

    // Add resource-specific imports
    for (const resourceType of resourceTypes) {
      const definition = this.CONSTRUCT_MAPPING[resourceType];
      if (definition) {
        imports.add(
          `import * as ${definition.module} from 'aws-cdk-lib/${definition.modulePath}';`
        );
      }
    }

    return Array.from(imports).sort();
  }

  /**
   * Convert CloudFormation properties to CDK format
   */
  convertProperties(
    properties: Record<string, unknown>,
    resourceType: string,
    useL2: boolean = true
  ): string {
    const entries: string[] = [];

    for (const [key, value] of Object.entries(properties)) {
      // Skip metadata properties
      if (this.shouldSkipProperty(key)) {
        continue;
      }

      const cdkKey = this.toCamelCase(key);
      const cdkValue = this.convertValue(value);
      entries.push(`      ${cdkKey}: ${cdkValue}`);
    }

    return entries.join(',\n');
  }

  /**
   * Convert a value to CDK TypeScript format
   */
  private convertValue(value: unknown, indent: number = 6): string {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return 'undefined';
    }

    // Handle primitives
    if (typeof value === 'string') {
      // Check if this is raw CDK code (starts with known CDK patterns)
      if (this.isRawCDKCode(value)) {
        return value;
      }
      return `'${value.replace(/'/g, "\\'")}'`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // Handle CloudFormation intrinsic functions
    if (this.isIntrinsicFunction(value)) {
      return this.convertIntrinsic(value as Record<string, unknown>);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '[]';
      }
      const items = value.map((item) => this.convertValue(item, indent + 2));
      const spaces = ' '.repeat(indent);
      return `[\n${spaces}  ${items.join(`,\n${spaces}  `)}\n${spaces}]`;
    }

    // Handle objects
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const entries = Object.entries(obj).map(([key, val]) => {
        const cdkKey = this.toCamelCase(key);
        const cdkValue = this.convertValue(val, indent + 2);
        return `${' '.repeat(indent + 2)}${cdkKey}: ${cdkValue}`;
      });

      if (entries.length === 0) {
        return '{}';
      }

      const spaces = ' '.repeat(indent);
      return `{\n${entries.join(',\n')}\n${spaces}}`;
    }

    return 'undefined';
  }

  /**
   * Check if string is raw CDK code that should not be quoted
   */
  private isRawCDKCode(value: string): boolean {
    const cdkPatterns = [
      /^(lambda|dynamodb|s3|iam|logs|cdk)\./,  // Module references
      /^new (lambda|dynamodb|s3|iam|logs|cdk)\./,  // Constructor calls
      /^\{[\s\S]*\}$/,  // Object literals
      /^\[[\s\S]*\]$/,  // Array literals
    ];

    return cdkPatterns.some((pattern) => pattern.test(value));
  }

  /**
   * Check if value is a CloudFormation intrinsic function
   */
  private isIntrinsicFunction(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const obj = value as Record<string, unknown>;
    const intrinsics = ['Ref', 'Fn::GetAtt', 'Fn::Sub', 'Fn::Join', 'Fn::Select'];

    return intrinsics.some((fn) => fn in obj);
  }

  /**
   * Convert CloudFormation intrinsic functions to CDK
   */
  private convertIntrinsic(value: Record<string, unknown>): string {
    // Handle Ref
    if ('Ref' in value) {
      const ref = value.Ref as string;
      // Check if it's a pseudo parameter
      if (ref.startsWith('AWS::')) {
        const pseudoParam = ref.replace('AWS::', '');
        // Map pseudo parameters to CDK equivalents
        const pseudoParamMap: Record<string, string> = {
          'Region': 'cdk.Stack.of(this).region',
          'AccountId': 'cdk.Stack.of(this).account',
          'Partition': 'cdk.Stack.of(this).partition',
          'URLSuffix': 'cdk.Stack.of(this).urlSuffix',
        };
        return pseudoParamMap[pseudoParam] || `cdk.${this.toCamelCase(pseudoParam)}`;
      }
      // For L2 constructs, just reference the variable directly
      return `${this.toCamelCase(ref)}`;
    }

    // Handle Fn::GetAtt
    if ('Fn::GetAtt' in value) {
      const getAtt = value['Fn::GetAtt'] as [string, string];
      const [resource, attribute] = getAtt;
      const varName = this.toCamelCase(resource);

      // Map common CloudFormation attributes to L2 properties
      const attributeMap: Record<string, string> = {
        'Arn': 'roleArn',
        'RoleArn': 'roleArn',
        'FunctionArn': 'functionArn',
        'BucketArn': 'bucketArn',
        'TableArn': 'tableArn',
        'LogGroupArn': 'logGroupArn',
      };

      const l2Property = attributeMap[attribute];
      if (l2Property) {
        return `${varName}.${l2Property}`;
      }

      // Fallback to attr* pattern for L1
      return `${varName}.attr${attribute}`;
    }

    // Handle Fn::Sub
    if ('Fn::Sub' in value) {
      const sub = value['Fn::Sub'];
      if (typeof sub === 'string') {
        // Simple substitution
        return `cdk.Fn.sub('${sub}')`;
      } else if (Array.isArray(sub)) {
        // Substitution with variables
        const [template, vars] = sub;
        return `cdk.Fn.sub('${template}', ${this.convertValue(vars)})`;
      }
    }

    // Handle Fn::Join
    if ('Fn::Join' in value) {
      const join = value['Fn::Join'] as [string, unknown[]];
      const [delimiter, parts] = join;
      const convertedParts = parts.map((p) => this.convertValue(p));
      return `[${convertedParts.join(', ')}].join('${delimiter}')`;
    }

    // Handle Fn::Select
    if ('Fn::Select' in value) {
      const select = value['Fn::Select'] as [number, unknown[]];
      const [index, list] = select;
      return `cdk.Fn.select(${index}, ${this.convertValue(list)})`;
    }

    return JSON.stringify(value);
  }

  /**
   * Render construct code
   */
  private renderConstruct(
    varName: string,
    constructClass: string,
    logicalId: string,
    properties: string,
    module: string
  ): string {
    return `    const ${varName} = new ${module}.${constructClass}(this, '${logicalId}', {
${properties}
    });
    ${varName}.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    // Preserve exact CloudFormation logical ID for resource import
    (${varName}.node.defaultChild as cdk.CfnResource).overrideLogicalId('${logicalId}');`;
  }

  /**
   * Convert PascalCase to camelCase
   */
  private toCamelCase(str: string): string {
    if (!str) return str;
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  /**
   * Get physical ID from resource properties
   */
  private getPhysicalId(resource: Resource): string {
    const physicalIdProps: Record<string, string> = {
      'AWS::DynamoDB::Table': 'TableName',
      'AWS::S3::Bucket': 'BucketName',
      'AWS::Logs::LogGroup': 'LogGroupName',
      'AWS::Lambda::Function': 'FunctionName',
      'AWS::IAM::Role': 'RoleName',
    };

    const prop = physicalIdProps[resource.type];
    if (prop && resource.properties[prop]) {
      return resource.properties[prop] as string;
    }

    return resource.logicalId;
  }

  /**
   * Check if property should be skipped
   */
  private shouldSkipProperty(key: string): boolean {
    const skipProps = [
      'UpdateReplacePolicy',
      'DeletionPolicy',
      'Metadata',
      'Condition',
    ];
    return skipProps.includes(key);
  }

  /**
   * Transform S3 Bucket properties from CloudFormation to CDK L2
   */
  private transformS3BucketProps(
    properties: Record<string, unknown>,
    resourceRefs: Map<string, string>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'BucketEncryption') {
        // Transform BucketEncryption to encryption
        transformed.encryption = 's3.BucketEncryption.S3_MANAGED';
      } else if (key === 'BucketName') {
        transformed.bucketName = value;
      } else {
        // Keep other properties with camelCase
        transformed[this.toCamelCase(key)] = value;
      }
    }

    return transformed;
  }

  /**
   * Transform IAM Role properties from CloudFormation to CDK L2
   */
  private transformIAMRoleProps(
    properties: Record<string, unknown>,
    resourceRefs: Map<string, string>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'AssumeRolePolicyDocument') {
        // Extract service principal from assume role policy
        const doc = value as any;
        if (doc?.Statement?.[0]?.Principal?.Service) {
          const services = doc.Statement[0].Principal.Service;
          const service = Array.isArray(services) ? services[0] : services;
          transformed.assumedBy = `new iam.ServicePrincipal('${service}')`;
        }
      } else if (key === 'Policies') {
        // Transform inline policies
        const policies = value as any[];
        const firstPolicy = policies[0] as any;

        // PolicyName might be a string or an object (Fn::Join)
        let policyKey = 'policy';
        if (typeof firstPolicy.PolicyName === 'string') {
          policyKey = this.toCamelCase(firstPolicy.PolicyName);
        } else if (firstPolicy.PolicyName && typeof firstPolicy.PolicyName === 'object') {
          // Use a generic name if PolicyName is an intrinsic function
          policyKey = 'lambdaPolicy';
        }

        transformed.inlinePolicies = `{
        ${policyKey}: new iam.PolicyDocument({
          statements: ${this.convertPolicyStatements(firstPolicy.PolicyDocument.Statement)}
        })
      }`;
      } else if (key === 'RoleName') {
        transformed.roleName = value;
      } else if (key === 'Path') {
        transformed.path = value;
      }
      // Skip other properties
    }

    return transformed;
  }

  /**
   * Transform Lambda Function properties from CloudFormation to CDK L2
   */
  private transformLambdaFunctionProps(
    properties: Record<string, unknown>,
    resourceRefs: Map<string, string>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'Code') {
        // Transform Code to use Code.fromBucket
        const code = value as any;
        if (code.S3Bucket && code.S3Key) {
          const bucketRef = code.S3Bucket.Ref;
          const bucketVar = bucketRef ? this.toCamelCase(bucketRef) : code.S3Bucket;
          transformed.code = `lambda.Code.fromBucket(${bucketVar}, '${code.S3Key}')`;
        }
      } else if (key === 'Runtime') {
        // Transform runtime string to Runtime enum
        const runtime = value as string;
        // Convert nodejs20.x -> NODEJS_20_X, python3.9 -> PYTHON_3_9
        const runtimeEnum = runtime.replace(/([a-z]+)(\d+)\.(\w+)/i, (match, name, major, minor) => {
          return `${name.toUpperCase()}_${major}_${minor.toUpperCase()}`;
        });
        transformed.runtime = `lambda.Runtime.${runtimeEnum}`;
      } else if (key === 'Timeout') {
        // Transform timeout to Duration
        transformed.timeout = `cdk.Duration.seconds(${value})`;
      } else if (key === 'MemorySize') {
        transformed.memorySize = value;
      } else if (key === 'Handler') {
        transformed.handler = value;
      } else if (key === 'FunctionName') {
        transformed.functionName = value;
      } else if (key === 'Description') {
        transformed.description = value;
      } else if (key === 'Architectures') {
        // Transform architecture to enum
        const archs = value as string[];
        if (archs && archs.length > 0) {
          const arch = archs[0].toLowerCase();
          if (arch === 'arm64') {
            transformed.architecture = 'lambda.Architecture.ARM_64';
          } else if (arch === 'x86_64') {
            transformed.architecture = 'lambda.Architecture.X86_64';
          }
        }
      } else if (key === 'Role') {
        // Skip role property - Lambda L2 construct doesn't support role directly
        // The role association should be handled via grantInvoke() or addToRolePolicy()
        // For imported resources, we'll let CDK infer the role
      }
    }

    return transformed;
  }

  /**
   * Transform DynamoDB Table properties from CloudFormation to CDK L2
   */
  private transformDynamoDBTableProps(
    properties: Record<string, unknown>,
    resourceRefs: Map<string, string>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'BillingMode') {
        // Transform billing mode to enum
        const mode = value as string;
        if (mode === 'PAY_PER_REQUEST') {
          transformed.billingMode = 'dynamodb.BillingMode.PAY_PER_REQUEST';
        } else if (mode === 'PROVISIONED') {
          transformed.billingMode = 'dynamodb.BillingMode.PROVISIONED';
        }
      } else if (key === 'KeySchema') {
        // Transform key schema
        const keySchema = value as any[];
        const partitionKey = keySchema.find((k: any) => k.KeyType === 'HASH');
        if (partitionKey) {
          transformed.partitionKey = `{
          name: '${partitionKey.AttributeName}',
          type: dynamodb.AttributeType.STRING
        }`;
        }
        const sortKey = keySchema.find((k: any) => k.KeyType === 'RANGE');
        if (sortKey) {
          transformed.sortKey = `{
          name: '${sortKey.AttributeName}',
          type: dynamodb.AttributeType.STRING
        }`;
        }
      } else if (key === 'TableName') {
        transformed.tableName = value;
      }
      // Skip AttributeDefinitions as they're inferred from keys
    }

    return transformed;
  }

  /**
   * Transform Log Group properties from CloudFormation to CDK L2
   */
  private transformLogGroupProps(
    properties: Record<string, unknown>,
    resourceRefs: Map<string, string>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (key === 'LogGroupName') {
        transformed.logGroupName = value;
      } else if (key === 'RetentionInDays') {
        transformed.retention = `logs.RetentionDays.${value}_DAYS`;
      }
    }

    return transformed;
  }

  /**
   * Convert IAM policy statements to CDK format
   */
  private convertPolicyStatements(statements: any[]): string {
    const convertedStatements = statements.map((stmt) => {
      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
      const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];

      const actionList = actions.map((a: string) => `'${a}'`).join(', ');
      const resourceList = resources.map((r: any) => {
        if (typeof r === 'string') {
          return `'${r}'`;
        } else if (r['Fn::Sub']) {
          return `cdk.Fn.sub('${r['Fn::Sub']}')`;
        }
        return `'${JSON.stringify(r)}'`;
      }).join(', ');

      return `new iam.PolicyStatement({
          effect: iam.Effect.${stmt.Effect.toUpperCase()},
          actions: [${actionList}],
          resources: [${resourceList}]
        })`;
    });

    return `[
        ${convertedStatements.join(',\n        ')}
      ]`;
  }

  /**
   * Extract dependencies from properties
   */
  private extractDependencies(
    properties: Record<string, unknown>
  ): string[] {
    const dependencies = new Set<string>();

    const findRefs = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;

      const objRecord = obj as Record<string, unknown>;

      if ('Ref' in objRecord && typeof objRecord.Ref === 'string') {
        dependencies.add(this.toCamelCase(objRecord.Ref));
      }

      if ('Fn::GetAtt' in objRecord) {
        const getAtt = objRecord['Fn::GetAtt'];
        if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') {
          dependencies.add(this.toCamelCase(getAtt[0]));
        }
      }

      for (const value of Object.values(objRecord)) {
        findRefs(value);
      }
    };

    findRefs(properties);
    return Array.from(dependencies);
  }
}
