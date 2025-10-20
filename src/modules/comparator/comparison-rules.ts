/**
 * Comparison Rules Engine
 * Defines resource-specific comparison rules for CloudFormation properties
 */

export interface ResourceRule {
  criticalProperties: string[];
  warningProperties: string[];
  acceptableAdditions: string[];
  ignoredProperties: string[];
}

/**
 * Resource-specific comparison rules
 * Defines which properties are critical, warnings, acceptable additions, or ignored
 */
export const comparisonRules: Record<string, ResourceRule> = {
  'AWS::DynamoDB::Table': {
    criticalProperties: [
      'TableName',
      'KeySchema',
      'AttributeDefinitions',
      'BillingMode',
    ],
    warningProperties: [
      'StreamSpecification',
      'GlobalSecondaryIndexes',
      'LocalSecondaryIndexes',
      'ProvisionedThroughput',
    ],
    acceptableAdditions: [
      'PointInTimeRecoverySpecification',
      'TimeToLiveSpecification',
      'Tags',
      'SSESpecification',
    ],
    ignoredProperties: [
      'UpdateReplacePolicy',
      'DeletionPolicy',
      'Metadata',
    ],
  },

  'AWS::Logs::LogGroup': {
    criticalProperties: ['LogGroupName'],
    warningProperties: [],
    acceptableAdditions: ['RetentionInDays', 'KmsKeyId', 'Tags'],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::S3::Bucket': {
    criticalProperties: ['BucketName'],
    warningProperties: [
      'VersioningConfiguration',
      'LifecycleConfiguration',
      'BucketEncryption',
      'ReplicationConfiguration',
    ],
    acceptableAdditions: [
      'PublicAccessBlockConfiguration',
      'Tags',
      'ObjectLockConfiguration',
      'NotificationConfiguration',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::Lambda::Function': {
    criticalProperties: ['FunctionName', 'Handler', 'Runtime', 'Code'],
    warningProperties: [
      'Environment',
      'MemorySize',
      'Timeout',
      'VpcConfig',
      'Layers',
    ],
    acceptableAdditions: [
      'ReservedConcurrentExecutions',
      'TracingConfig',
      'DeadLetterConfig',
      'Tags',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::IAM::Role': {
    criticalProperties: ['AssumeRolePolicyDocument', 'RoleName'],
    warningProperties: ['Policies', 'ManagedPolicyArns', 'PermissionsBoundary'],
    acceptableAdditions: [
      'MaxSessionDuration',
      'Description',
      'Tags',
      'Path',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::RDS::DBInstance': {
    criticalProperties: [
      'DBInstanceIdentifier',
      'DBInstanceClass',
      'Engine',
      'AllocatedStorage',
    ],
    warningProperties: [
      'DBParameterGroupName',
      'DBSecurityGroups',
      'VPCSecurityGroups',
      'BackupRetentionPeriod',
    ],
    acceptableAdditions: [
      'EnableCloudwatchLogsExports',
      'PerformanceInsightsEnabled',
      'DeletionProtection',
      'Tags',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::RDS::DBCluster': {
    criticalProperties: [
      'DBClusterIdentifier',
      'Engine',
      'DatabaseName',
    ],
    warningProperties: [
      'DBClusterParameterGroupName',
      'VpcSecurityGroupIds',
      'BackupRetentionPeriod',
    ],
    acceptableAdditions: [
      'EnableCloudwatchLogsExports',
      'DeletionProtection',
      'Tags',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::ECS::Cluster': {
    criticalProperties: ['ClusterName'],
    warningProperties: ['Configuration', 'CapacityProviders'],
    acceptableAdditions: ['ClusterSettings', 'Tags'],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },

  'AWS::EFS::FileSystem': {
    criticalProperties: ['FileSystemId'],
    warningProperties: ['PerformanceMode', 'ThroughputMode'],
    acceptableAdditions: [
      'LifecyclePolicies',
      'Encrypted',
      'KmsKeyId',
      'Tags',
    ],
    ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
  },
};

/**
 * Get the physical ID property name for a resource type
 * @param resourceType - AWS resource type
 * @returns Property name that contains the physical ID
 */
export function getPhysicalIdProperty(resourceType: string): string | null {
  const propertyMap: Record<string, string> = {
    'AWS::DynamoDB::Table': 'TableName',
    'AWS::Logs::LogGroup': 'LogGroupName',
    'AWS::S3::Bucket': 'BucketName',
    'AWS::Lambda::Function': 'FunctionName',
    'AWS::IAM::Role': 'RoleName',
    'AWS::RDS::DBInstance': 'DBInstanceIdentifier',
    'AWS::RDS::DBCluster': 'DBClusterIdentifier',
    'AWS::ECS::Cluster': 'ClusterName',
    'AWS::EFS::FileSystem': 'FileSystemId',
  };

  return propertyMap[resourceType] || null;
}

/**
 * Get comparison rules for a resource type
 * Falls back to default rules if specific rules not found
 * @param resourceType - AWS resource type
 * @returns Resource comparison rules
 */
export function getComparisonRules(resourceType: string): ResourceRule {
  return (
    comparisonRules[resourceType] || {
      criticalProperties: [],
      warningProperties: [],
      acceptableAdditions: [],
      ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy', 'Metadata'],
    }
  );
}
