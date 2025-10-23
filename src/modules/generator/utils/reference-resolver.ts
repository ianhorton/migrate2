/**
 * Reference Resolver - Sprint 2: IAM Role Generation
 * Converts CloudFormation references to CDK construct references
 */

import { ClassifiedResource } from '../../../types';

export class ReferenceResolver {
  /**
   * Mapping of CloudFormation resource types and attributes to CDK properties
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
    'AWS::Logs::LogGroup': {
      'Arn': 'logGroupArn',
      'LogGroupName': 'logGroupName'
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
    }

    // Fallback for unknown types
    return `'${JSON.stringify(ref)}'`;
  }

  /**
   * Resolves { Ref: 'LogicalId' } to construct reference
   */
  private resolveRef(logicalId: string): string {
    // Check for pseudo-parameters
    if (logicalId in ReferenceResolver.PSEUDO_PARAMETERS) {
      return ReferenceResolver.PSEUDO_PARAMETERS[logicalId];
    }

    // Look up resource
    const resource = this.resourceMap.get(logicalId);
    if (!resource) {
      return `'${logicalId}'`;
    }

    const constructName = this.getConstructName(logicalId);

    // Ref returns different properties depending on resource type
    const refProperty = this.getRefProperty(resource.Type);

    return refProperty ? `${constructName}.${refProperty}` : constructName;
  }

  /**
   * Resolves { Fn::GetAtt: ['LogicalId', 'Attribute'] } to construct property
   */
  private resolveGetAtt(logicalId: string, attribute: string): string {
    const resource = this.resourceMap.get(logicalId);
    if (!resource) {
      return `'${logicalId}.${attribute}'`;
    }

    const constructName = this.getConstructName(logicalId);
    const cdkProperty = this.mapAttributeToProperty(resource.Type, attribute);

    return `${constructName}.${cdkProperty}`;
  }

  /**
   * Resolves { Fn::Sub: 'template with ${variables}' } to template literal
   */
  private resolveSub(template: string, variables?: Record<string, any>): string {
    let result = template;

    // Replace ${AWS::PseudoParam} patterns (including :: in name)
    result = result.replace(/\$\{(AWS::\w+)\}/g, (match, name) => {
      if (name in ReferenceResolver.PSEUDO_PARAMETERS) {
        return '${' + ReferenceResolver.PSEUDO_PARAMETERS[name] + '}';
      }
      return match;
    });

    // Replace ${Resource.Attribute} patterns
    result = result.replace(/\$\{(\w+)\.(\w+)\}/g, (match, logicalId, attribute) => {
      const resolved = this.resolveGetAtt(logicalId, attribute);
      return '${' + resolved + '}';
    });

    // Replace ${Ref} patterns (simple names without ::)
    result = result.replace(/\$\{(\w+)\}/g, (match, name) => {
      // Skip if already processed (contains a dot from previous replacement)
      if (match.includes('.')) {
        return match;
      }

      // Check variables object first
      if (variables && name in variables) {
        const resolved = this.resolveResourceReference(variables[name]);
        return '${' + resolved + '}';
      }

      // Resolve as resource reference
      const resolved = this.resolveRef(name);
      return '${' + resolved + '}';
    });

    return '`' + result + '`';
  }

  /**
   * Resolves { Fn::Join: [delimiter, [parts]] } to string concatenation
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
   */
  private getConstructName(logicalId: string): string {
    // Convert PascalCase to camelCase
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }

  /**
   * Maps CloudFormation attribute to CDK property
   */
  private mapAttributeToProperty(resourceType: string, attribute: string): string {
    const mappings = ReferenceResolver.ATTRIBUTE_MAPPINGS[resourceType];

    if (mappings && attribute in mappings) {
      return mappings[attribute];
    }

    // Fallback: convert attribute to camelCase
    return attribute.charAt(0).toLowerCase() + attribute.slice(1);
  }

  /**
   * Gets the property returned by { Ref: 'LogicalId' }
   */
  private getRefProperty(resourceType: string): string | null {
    const refMappings: Record<string, string> = {
      'AWS::DynamoDB::Table': 'tableName',
      'AWS::S3::Bucket': 'bucketName',
      'AWS::Lambda::Function': 'functionName',
      'AWS::SNS::Topic': 'topicArn',
      'AWS::SQS::Queue': 'queueUrl',
      'AWS::Logs::LogGroup': 'logGroupName'
    };

    return refMappings[resourceType] || null;
  }
}
