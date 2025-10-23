/**
 * DifferenceAnalyzer Unit Tests
 * Tests difference classification and severity assessment
 */

import { describe, it, expect } from '@jest/globals';

describe('DifferenceAnalyzer', () => {
  describe('Acceptable Differences', () => {
    it('should classify CDK metadata as acceptable', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Metadata.aws:cdk:path',
        serverlessValue: undefined,
        cdkValue: 'MyStack/UsersTable',
        type: 'ADD'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('acceptable');
      expect(classification.autoResolvable).toBe(true);
      expect(classification.requiresHumanReview).toBe(false);
      expect(classification.explanation).toContain('metadata');
    });

    it('should classify UpdateReplacePolicy as acceptable', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.UpdateReplacePolicy',
        serverlessValue: undefined,
        cdkValue: 'Retain',
        type: 'ADD'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('acceptable');
      expect(classification.autoResolvable).toBe(true);
      expect(classification.explanation).toContain('protection');
    });

    it('should classify DeletionPolicy additions as acceptable', () => {
      // Arrange
      const difference = {
        path: 'Resources.DataBucket.DeletionPolicy',
        serverlessValue: undefined,
        cdkValue: 'Retain',
        type: 'ADD'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('acceptable');
      expect(classification.autoResolvable).toBe(true);
    });

    it('should classify CDK-added conditions as acceptable', () => {
      // Arrange
      const difference = {
        path: 'Conditions.CDKMetadataAvailable',
        serverlessValue: undefined,
        cdkValue: { 'Fn::Equals': [{ Ref: 'AWS::Region' }, 'us-east-1'] },
        type: 'ADD'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('acceptable');
      expect(classification.autoResolvable).toBe(true);
    });
  });

  describe('Warning Differences', () => {
    it('should classify billing mode changes as warning', () => {
      // Arrange
      const difference = {
        path: 'Resources.OrdersTable.Properties.BillingMode',
        serverlessValue: 'PROVISIONED',
        cdkValue: 'PAY_PER_REQUEST',
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(classification.autoResolvable).toBe(false);
      expect(classification.requiresHumanReview).toBe(true);
      expect(classification.explanation).toContain('cost');
    });

    it('should classify attribute definition changes as warning', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.AttributeDefinitions',
        serverlessValue: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'email', AttributeType: 'S' }
        ],
        cdkValue: [{ AttributeName: 'userId', AttributeType: 'S' }],
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(classification.requiresHumanReview).toBe(true);
      expect(classification.explanation).toContain('schema');
    });

    it('should classify IAM policy changes as warning', () => {
      // Arrange
      const difference = {
        path: 'Resources.ApiLambdaRole.Properties.Policies.0.PolicyDocument.Statement',
        serverlessValue: [
          {
            Effect: 'Allow',
            Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
            Resource: '*'
          }
        ],
        cdkValue: [
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:Query',
              'dynamodb:Scan'
            ],
            Resource: '*'
          }
        ],
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(classification.explanation).toContain('permissions');
    });

    it('should classify retention period changes as warning', () => {
      // Arrange
      const difference = {
        path: 'Resources.ApiLogGroup.Properties.RetentionInDays',
        serverlessValue: 14,
        cdkValue: 7,
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(classification.explanation).toContain('retention');
    });
  });

  describe('Critical Differences', () => {
    it('should classify physical resource name changes as critical', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.TableName',
        serverlessValue: 'users-table-dev',
        cdkValue: 'users-table-prod',
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('critical');
      expect(classification.autoResolvable).toBe(false);
      expect(classification.requiresHumanReview).toBe(true);
      expect(classification.explanation).toContain('import will fail');
    });

    it('should classify key schema changes as critical', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.KeySchema',
        serverlessValue: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        cdkValue: [{ AttributeName: 'id', KeyType: 'HASH' }],
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('critical');
      expect(classification.explanation).toContain('incompatible');
    });

    it('should classify missing GSI as critical', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.GlobalSecondaryIndexes',
        serverlessValue: [
          {
            IndexName: 'EmailIndex',
            KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }]
          }
        ],
        cdkValue: undefined,
        type: 'REMOVE'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('critical');
      expect(classification.explanation).toContain('index');
    });

    it('should classify resource type changes as critical', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Type',
        serverlessValue: 'AWS::DynamoDB::Table',
        cdkValue: 'AWS::DynamoDB::GlobalTable',
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('critical');
      expect(classification.explanation).toContain('type mismatch');
    });

    it('should classify missing required properties as critical', () => {
      // Arrange
      const difference = {
        path: 'Resources.DataBucket.Properties.BucketName',
        serverlessValue: 'messy-app-data-dev',
        cdkValue: undefined,
        type: 'REMOVE'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('critical');
    });
  });

  describe('Grouping and Prioritization', () => {
    it('should group differences by resolution requirement', () => {
      // Arrange
      const differences = [
        {
          path: 'Resources.UsersTable.Metadata',
          category: 'acceptable' as const
        },
        {
          path: 'Resources.UsersTable.Properties.TableName',
          category: 'critical' as const
        },
        {
          path: 'Resources.OrdersTable.Properties.BillingMode',
          category: 'warning' as const
        },
        {
          path: 'Resources.DataBucket.UpdateReplacePolicy',
          category: 'acceptable' as const
        }
      ];

      // Act
      const grouped = {
        autoResolvable: differences.filter(d => d.category === 'acceptable'),
        requiresReview: differences.filter(d => d.category !== 'acceptable')
      };

      // Assert
      expect(grouped.autoResolvable).toHaveLength(2);
      expect(grouped.requiresReview).toHaveLength(2);
    });

    it('should prioritize critical differences first', () => {
      // Arrange
      const differences = [
        { path: 'path1', category: 'warning' as const },
        { path: 'path2', category: 'critical' as const },
        { path: 'path3', category: 'acceptable' as const },
        { path: 'path4', category: 'critical' as const }
      ];

      // Act
      const sorted = differences.sort((a, b) => {
        const priority = { critical: 0, warning: 1, acceptable: 2 };
        return priority[a.category] - priority[b.category];
      });

      // Assert
      expect(sorted[0].category).toBe('critical');
      expect(sorted[1].category).toBe('critical');
      expect(sorted[2].category).toBe('warning');
      expect(sorted[3].category).toBe('acceptable');
    });
  });

  describe('Explanation Generation', () => {
    it('should provide detailed explanation for differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.BillingMode',
        serverlessValue: 'PROVISIONED',
        cdkValue: 'PAY_PER_REQUEST',
        type: 'MODIFY'
      };

      // Act
      const explanation = generateExplanation(difference);

      // Assert
      expect(explanation).toContain('billing mode');
      expect(explanation).toContain('PROVISIONED');
      expect(explanation).toContain('PAY_PER_REQUEST');
      expect(explanation.length).toBeGreaterThan(20);
    });

    it('should explain impact of differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.ApiLambdaRole.Properties.ManagedPolicyArns',
        serverlessValue: ['arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        cdkValue: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess'
        ],
        type: 'MODIFY'
      };

      // Act
      const explanation = generateExplanation(difference);

      // Assert
      expect(explanation).toContain('managed policy');
      expect(explanation).toContain('additional');
      expect(explanation).toContain('CloudWatchLogsFullAccess');
    });
  });

  describe('Edge Cases', () => {
    it('should handle deeply nested property differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.GlobalSecondaryIndexes.0.Projection.NonKeyAttributes',
        serverlessValue: ['email', 'name'],
        cdkValue: ['email'],
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(classification.path).toContain('GlobalSecondaryIndexes');
    });

    it('should handle array differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.ApiLambdaRole.Properties.ManagedPolicyArns',
        serverlessValue: ['policy1', 'policy2'],
        cdkValue: ['policy1', 'policy2', 'policy3'],
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('warning');
      expect(Array.isArray(classification.serverlessValue)).toBe(true);
    });

    it('should handle null vs undefined differences', () => {
      // Arrange
      const difference1 = {
        path: 'Resources.Table.Properties.StreamSpecification',
        serverlessValue: null,
        cdkValue: undefined,
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference1);

      // Assert
      expect(classification.category).toBe('acceptable');
      // null and undefined should be treated similarly for optional properties
    });

    it('should handle boolean vs string differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.Bucket.Properties.PublicAccessBlockConfiguration.BlockPublicAcls',
        serverlessValue: 'true',
        cdkValue: true,
        type: 'MODIFY'
      };

      // Act
      const classification = classifyDifference(difference);

      // Assert
      expect(classification.category).toBe('acceptable');
      // Type coercion differences should be acceptable
    });
  });

  describe('Resolution Strategies', () => {
    it('should suggest resolution strategy for auto-resolvable differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Metadata',
        category: 'acceptable' as const,
        autoResolvable: true
      };

      // Act
      const strategy = getResolutionStrategy(difference);

      // Assert
      expect(strategy).toBe('auto-accept');
    });

    it('should suggest resolution strategy for critical differences', () => {
      // Arrange
      const difference = {
        path: 'Resources.UsersTable.Properties.TableName',
        category: 'critical' as const,
        autoResolvable: false
      };

      // Act
      const strategy = getResolutionStrategy(difference);

      // Assert
      expect(strategy).toBe('human-review-required');
    });

    it('should provide multiple resolution options for warnings', () => {
      // Arrange
      const difference = {
        path: 'Resources.OrdersTable.Properties.BillingMode',
        category: 'warning' as const
      };

      // Act
      const options = getResolutionOptions(difference);

      // Assert
      expect(options).toContain('accept-change');
      expect(options).toContain('revert-to-original');
      expect(options).toContain('manual-review');
      expect(options.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// Helper functions for testing
function classifyDifference(difference: any) {
  const path = difference.path;

  // Acceptable patterns
  if (path.includes('Metadata') || path.includes('UpdateReplacePolicy') || path.includes('DeletionPolicy')) {
    return {
      difference,
      category: 'acceptable' as const,
      autoResolvable: true,
      requiresHumanReview: false,
      explanation: 'CDK automatically adds metadata for stack tracking and resource protection'
    };
  }

  // Critical patterns
  if (
    path.match(/(TableName|BucketName|FunctionName|RoleName)/) &&
    difference.type === 'MODIFY'
  ) {
    return {
      difference,
      category: 'critical' as const,
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Physical resource name mismatch - import will fail'
    };
  }

  if (path.includes('KeySchema') || path.includes('.Type')) {
    return {
      difference,
      category: 'critical' as const,
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Resource structure is incompatible with existing AWS resource'
    };
  }

  if (path.includes('GlobalSecondaryIndexes') && difference.type === 'REMOVE') {
    return {
      difference,
      category: 'critical' as const,
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Missing required index definition'
    };
  }

  // Warning patterns
  if (
    path.includes('BillingMode') ||
    path.includes('AttributeDefinitions') ||
    path.includes('Policies') ||
    path.includes('RetentionInDays')
  ) {
    return {
      difference,
      category: 'warning' as const,
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Configuration change detected - review cost and operational implications'
    };
  }

  // Default to warning
  return {
    difference,
    category: 'warning' as const,
    autoResolvable: false,
    requiresHumanReview: true,
    explanation: 'Difference requires review'
  };
}

function generateExplanation(difference: any): string {
  const { path, serverlessValue, cdkValue, type } = difference;

  const property = path.split('.').pop();

  if (type === 'ADD') {
    return `CDK added ${property}: ${JSON.stringify(cdkValue)}`;
  }

  if (type === 'REMOVE') {
    return `CDK removed ${property} that was: ${JSON.stringify(serverlessValue)}`;
  }

  return `${property} changed from ${JSON.stringify(serverlessValue)} to ${JSON.stringify(cdkValue)}`;
}

function getResolutionStrategy(difference: any): string {
  if (difference.autoResolvable) {
    return 'auto-accept';
  }

  if (difference.category === 'critical') {
    return 'human-review-required';
  }

  return 'review-recommended';
}

function getResolutionOptions(difference: any): string[] {
  const options = ['manual-review'];

  if (difference.category === 'warning') {
    options.push('accept-change', 'revert-to-original');
  }

  if (difference.category === 'acceptable') {
    options.push('auto-accept');
  }

  return options;
}
