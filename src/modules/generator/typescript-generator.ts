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
    const properties = this.convertProperties(
      resource.properties,
      resource.type
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
    resourceType: string
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
        return `cdk.${this.toCamelCase(ref.replace('AWS::', ''))}`;
      }
      return `${this.toCamelCase(ref)}.ref`;
    }

    // Handle Fn::GetAtt
    if ('Fn::GetAtt' in value) {
      const getAtt = value['Fn::GetAtt'] as [string, string];
      const [resource, attribute] = getAtt;
      return `${this.toCamelCase(resource)}.attr${attribute}`;
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
    ${varName}.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);`;
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
