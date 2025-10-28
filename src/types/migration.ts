/**
 * Core type definitions for the Serverless-to-CDK migration tool
 */

export interface CloudFormationTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, any>;
  Resources: Record<string, CloudFormationResource>;
  Outputs?: Record<string, any>;
  Metadata?: Record<string, any>;
}

export interface CloudFormationResource {
  Type: string;
  Properties: Record<string, any>;
  DependsOn?: string | string[];
  DeletionPolicy?: 'Delete' | 'Retain' | 'Snapshot';
  UpdateReplacePolicy?: 'Delete' | 'Retain' | 'Snapshot';
  Metadata?: Record<string, any>;
  Condition?: string;
}

export interface ParsedServerlessConfig {
  service: string;
  provider: {
    name: string;
    runtime?: string;
    stage?: string;
    region?: string;
    stackName?: string;
    environment?: Record<string, any>;
    [key: string]: any;
  };
  functions?: Record<string, any>;
  resources?: {
    Resources?: Record<string, any>;
    Outputs?: Record<string, any>;
  };
  custom?: Record<string, any>;
  plugins?: string[];
  [key: string]: any;
}

export interface Resource {
  logicalId: string;
  physicalId: string;
  type: string;
  properties: Record<string, any>;
  classification: ResourceAction;
  source: 'explicit' | 'abstracted';
  dependencies: string[];
  deletionPolicy?: 'Delete' | 'Retain' | 'Snapshot';
}

export type ResourceAction = 'IMPORT' | 'RECREATE';

export interface ResourceInventory {
  explicit: Resource[];
  abstracted: Resource[];
  stateful: Resource[];
  stateless: Resource[];
  all: Resource[];
}

export interface ResourceClassification {
  toImport: Resource[];
  toRecreate: Resource[];
  dependencies: Map<string, string[]>;
}

export interface DependencyGraph {
  nodes: Map<string, Resource>;
  edges: Map<string, Set<string>>;
  reverseEdges: Map<string, Set<string>>;
}

export interface ScanResult {
  scan_id: string;
  timestamp: string;
  serverless_stack: string;
  resources: {
    total: number;
    explicit: number;
    abstracted: number;
    stateful: number;
    stateless: number;
  };
  inventory: Resource[];
  dependency_graph: Record<string, string[]>;
  cloudformation_template?: CloudFormationTemplate;
}

export interface ScannerConfig {
  serverlessPath: string;
  stage: string;
  region: string;
  serverlessConfigFile?: string;
  packageDir?: string;
}

// Resource type constants
export const STATEFUL_RESOURCE_TYPES = [
  'AWS::DynamoDB::Table',
  'AWS::S3::Bucket',
  'AWS::RDS::DBInstance',
  'AWS::RDS::DBCluster',
  'AWS::Logs::LogGroup',
  'AWS::ECS::Cluster',
  'AWS::EFS::FileSystem',
  'AWS::ElastiCache::CacheCluster',
  'AWS::ElastiCache::ReplicationGroup',
] as const;

export const STATELESS_RESOURCE_TYPES = [
  'AWS::Lambda::Function',
  'AWS::Lambda::Version',
  'AWS::Lambda::Permission',
  'AWS::IAM::Role',
  'AWS::IAM::Policy',
  'AWS::ApiGateway::RestApi',
  'AWS::ApiGateway::Deployment',
  'AWS::ApiGateway::Stage',
  'AWS::ApiGatewayV2::Api',
  'AWS::ApiGatewayV2::Stage',
  'AWS::CloudWatch::Alarm',
  'AWS::Events::Rule',
  'AWS::SNS::Topic',
  'AWS::SQS::Queue',
] as const;

/**
 * Serverless Framework infrastructure resources (should NOT be migrated to CDK)
 * These are created by Serverless for its own deployment needs
 */
export const SERVERLESS_INFRASTRUCTURE_PATTERNS = [
  'ServerlessDeploymentBucket',           // S3 bucket for deployment artifacts
  'ServerlessDeploymentBucketPolicy',     // Policy for deployment bucket
  /.*LambdaVersion.*/,                    // Lambda versions (auto-generated with hash)
  /ApiGatewayDeployment\d+/,              // API Gateway deployments (timestamped)
] as const;

/**
 * Check if a resource is Serverless Framework infrastructure
 */
export function isServerlessInfrastructure(logicalId: string): boolean {
  return SERVERLESS_INFRASTRUCTURE_PATTERNS.some(pattern => {
    if (typeof pattern === 'string') {
      return logicalId === pattern;
    }
    return pattern.test(logicalId);
  });
}

export type StatefulResourceType = typeof STATEFUL_RESOURCE_TYPES[number];
export type StatelessResourceType = typeof STATELESS_RESOURCE_TYPES[number];
export type KnownResourceType = StatefulResourceType | StatelessResourceType;
