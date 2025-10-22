/**
 * Resource Classifier - Sprint 1: Resource Classification Enhancement
 * Enhances CloudFormation resources with classification metadata for clean CDK generation
 */

import { CloudFormationResource, ClassifiedResource } from '../../types';

export class ResourceClassifier {
  /**
   * Stateful resources that should be imported and retained
   */
  private readonly STATEFUL_TYPES = new Set([
    'AWS::DynamoDB::Table',
    'AWS::S3::Bucket',
    'AWS::Logs::LogGroup',
    'AWS::RDS::DBInstance',
    'AWS::RDS::DBCluster',
    'AWS::EFS::FileSystem',
    'AWS::Backup::BackupVault'
  ]);

  /**
   * Resource type to group mapping
   */
  private readonly TYPE_TO_GROUP: Record<string, string> = {
    'AWS::DynamoDB::Table': 'databases',
    'AWS::RDS::DBInstance': 'databases',
    'AWS::RDS::DBCluster': 'databases',
    'AWS::S3::Bucket': 'storage',
    'AWS::EFS::FileSystem': 'storage',
    'AWS::IAM::Role': 'iam',
    'AWS::IAM::Policy': 'iam',
    'AWS::Lambda::Function': 'compute',
    'AWS::Logs::LogGroup': 'logging',
    'AWS::CloudFront::Distribution': 'cdn',
    'AWS::ApiGateway::RestApi': 'api',
    'AWS::ApiGatewayV2::Api': 'api'
  };

  /**
   * Basic Lambda Execution Role actions
   */
  private readonly BASIC_EXECUTION_ACTIONS = new Set([
    'logs:CreateLogGroup',
    'logs:CreateLogStream',
    'logs:PutLogEvents'
  ]);

  /**
   * Classifies a single resource with all metadata
   */
  classifyResources(
    resources: CloudFormationResource[],
    logicalId: string
  ): ClassifiedResource[] {
    // This is called with a single resource but returns array for consistency
    const resource = resources[0];

    const isStateful = this.isStateful(resource);
    const needsImport = isStateful; // Stateful resources need import

    const classified: ClassifiedResource = {
      ...resource,
      LogicalId: logicalId,
      needsImport,
      isStateful,
      isExplicit: false, // Will be set by scanner
      managedPolicyEquivalent: this.detectManagedPolicy(resource),
      relatedResources: [],
      groupId: this.assignGroup(resource),
      codeLocation: undefined,
      suppressLogicalIdOverride: !needsImport,
      suppressRemovalPolicy: !isStateful,
      suppressComments: !needsImport
    };

    return [classified];
  }

  /**
   * Find related resources for a classified resource
   */
  findRelatedResources(
    resource: ClassifiedResource,
    allResources: ClassifiedResource[]
  ): ClassifiedResource {
    const relatedIds: string[] = [];

    // Lambda function relationships
    if (resource.Type === 'AWS::Lambda::Function') {
      // Find IAM role
      const roleRef = this.extractRoleReference(resource);
      if (roleRef) {
        relatedIds.push(roleRef);
      }

      // Find LogGroup by function name
      const functionName = resource.Properties?.FunctionName;
      if (functionName) {
        const logGroupName = `/aws/lambda/${functionName}`;
        const logGroup = allResources.find(r =>
          r.Type === 'AWS::Logs::LogGroup' &&
          r.Properties?.LogGroupName === logGroupName
        );
        if (logGroup) {
          relatedIds.push(logGroup.LogicalId);
        }
      }
    }

    return {
      ...resource,
      relatedResources: relatedIds
    };
  }

  /**
   * Determines if a resource is stateful (requires RETAIN policy)
   */
  private isStateful(resource: CloudFormationResource): boolean {
    return this.STATEFUL_TYPES.has(resource.Type);
  }

  /**
   * Detects if an IAM role matches a managed policy pattern
   */
  private detectManagedPolicy(resource: CloudFormationResource): string | undefined {
    if (resource.Type !== 'AWS::IAM::Role') {
      return undefined;
    }

    // Check if this is a Lambda execution role
    const assumeRolePolicy = resource.Properties?.AssumedRolePolicyDocument;
    if (!assumeRolePolicy) {
      return undefined;
    }

    // Check if it assumes role for Lambda
    const statements = assumeRolePolicy.Statement || [];
    const isLambdaRole = statements.some((stmt: any) =>
      stmt.Principal?.Service === 'lambda.amazonaws.com' &&
      stmt.Action === 'sts:AssumeRole'
    );

    if (!isLambdaRole) {
      return undefined;
    }

    // Check if policies match BasicExecutionRole
    const policies = resource.Properties?.Policies || [];
    if (policies.length === 0) {
      return undefined;
    }

    // Must have exactly ONE policy to match BasicExecutionRole
    if (policies.length !== 1) {
      return undefined;
    }

    // Check first policy for basic execution actions
    const firstPolicy = policies[0];
    const policyDoc = firstPolicy?.PolicyDocument;
    if (!policyDoc) {
      return undefined;
    }

    const policyStatements = policyDoc.Statement || [];

    // Must have exactly ONE statement
    if (policyStatements.length !== 1) {
      return undefined;
    }

    const stmt = policyStatements[0];
    const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];

    // Must have exactly the basic execution actions, no more, no less
    if (actions.length !== this.BASIC_EXECUTION_ACTIONS.size) {
      return undefined;
    }

    const matchesBasicActions = actions.every((action: string) =>
      this.BASIC_EXECUTION_ACTIONS.has(action)
    );

    if (stmt.Effect === 'Allow' && matchesBasicActions) {
      return 'service-role/AWSLambdaBasicExecutionRole';
    }

    return undefined;
  }

  /**
   * Extracts IAM role reference from Lambda function
   */
  private extractRoleReference(resource: CloudFormationResource): string | undefined {
    const role = resource.Properties?.Role;

    if (!role) {
      return undefined;
    }

    // Handle Fn::GetAtt reference
    if (role['Fn::GetAtt']) {
      const parts = role['Fn::GetAtt'];
      return Array.isArray(parts) ? parts[0] : undefined;
    }

    // Handle Ref
    if (role.Ref) {
      return role.Ref;
    }

    return undefined;
  }

  /**
   * Assigns a resource to a logical group
   */
  private assignGroup(resource: CloudFormationResource): string {
    return this.TYPE_TO_GROUP[resource.Type] || 'other';
  }
}
