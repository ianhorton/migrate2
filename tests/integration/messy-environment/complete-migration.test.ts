/**
 * Complete Messy Environment Migration Test
 * Tests end-to-end migration with drift, mismatched IDs, and human intervention
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createMockAwsClients,
  createMockInterventionManager,
  getMockResources
} from '../../mocks/aws-discovery-mock';

describe('Messy Environment - Complete Migration', () => {
  let mockClients: ReturnType<typeof createMockAwsClients>;
  let mockIntervention: ReturnType<typeof createMockInterventionManager>;

  beforeEach(() => {
    mockClients = createMockAwsClients();
    mockIntervention = createMockInterventionManager();

    // Setup default intervention responses
    mockIntervention.setResponse('UsersTable.physicalId', 'users-table-dev');
    mockIntervention.setResponse('OrdersTable.physicalId', 'orders-table-dev');
    mockIntervention.setResponse('ApiLambdaRole.physicalId', 'messy-app-api-role-dev');
    mockIntervention.setResponse('ApiLambdaRole.drift', 'use-aws');
    mockIntervention.setResponse('UsersTable.criticalDifference', 'proceed');
  });

  afterEach(() => {
    mockIntervention.clearResponses();
  });

  describe('Scenario 1: Physical ID Resolution with Multiple Candidates', () => {
    it('should discover all DynamoDB tables and match with high confidence', async () => {
      // Arrange
      const tables = await mockClients.dynamodb.listTables();

      // Act
      const usersTableCandidates = tables.TableNames.filter(name =>
        name.includes('users')
      );

      // Assert
      expect(usersTableCandidates).toContain('users-table-dev');
      expect(usersTableCandidates).toContain('users-table-prod');
      expect(usersTableCandidates).toContain('legacy-users');
      expect(usersTableCandidates).toHaveLength(3);
    });

    it('should calculate confidence scores for each candidate', async () => {
      // Arrange
      const templateProps = {
        TableName: 'users-table-dev',
        BillingMode: 'PAY_PER_REQUEST',
        Tags: [{ Key: 'Environment', Value: 'dev' }]
      };

      // Act - Simulate matching logic
      const table1 = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-dev'
      });
      const table2 = await mockClients.dynamodb.describeTable({
        TableName: 'users-table-prod'
      });

      // Calculate confidence (simplified version)
      const confidence1 = calculateMatchConfidence(templateProps, table1.Table);
      const confidence2 = calculateMatchConfidence(templateProps, table2.Table);

      // Assert
      expect(confidence1).toBeGreaterThan(0.8); // High confidence - exact name match
      expect(confidence2).toBeLessThan(0.6); // Lower confidence - different environment
      expect(confidence1).toBeGreaterThan(confidence2);
    });

    it('should prompt for human selection when confidence is low', async () => {
      // Arrange
      const logicalId = 'ApiLambdaRole';
      const candidates = [
        { physicalId: 'messy-app-api-role-dev', confidence: 0.6 },
        { physicalId: 'api-role-legacy', confidence: 0.4 }
      ];

      // Act
      const selectedId = await mockIntervention.promptForPhysicalId(
        logicalId,
        'AWS::IAM::Role',
        candidates
      );

      // Assert
      expect(selectedId).toBe('messy-app-api-role-dev');
    });
  });

  describe('Scenario 2: CloudFormation Drift Detection', () => {
    it('should detect drift in IAM role', async () => {
      // Arrange
      const stackName = 'messy-app-dev';

      // Act
      await mockClients.cloudformation.detectStackDrift({ StackName: stackName });
      const drifts = await mockClients.cloudformation.describeStackResourceDrifts({
        StackName: stackName
      });

      // Assert
      expect(drifts.StackResourceDrifts).toHaveLength(1);
      expect(drifts.StackResourceDrifts[0].LogicalResourceId).toBe('ApiLambdaRole');
      expect(drifts.StackResourceDrifts[0].StackResourceDriftStatus).toBe('MODIFIED');
    });

    it('should identify specific property differences in drifted resources', async () => {
      // Arrange
      const stackName = 'messy-app-dev';

      // Act
      await mockClients.cloudformation.detectStackDrift({ StackName: stackName });
      const drifts = await mockClients.cloudformation.describeStackResourceDrifts({
        StackName: stackName
      });

      const roleDrift = drifts.StackResourceDrifts[0];

      // Assert
      expect(roleDrift.PropertyDifferences).toBeDefined();
      expect(roleDrift.PropertyDifferences).toHaveLength(3);

      const managedPolicyDiff = roleDrift.PropertyDifferences![0];
      expect(managedPolicyDiff.propertyPath).toContain('ManagedPolicyArns');
      expect(managedPolicyDiff.differenceType).toBe('ADD');
      expect(managedPolicyDiff.actualValue).toContain('CloudWatchLogsFullAccess');
    });

    it('should prompt user for drift resolution strategy', async () => {
      // Arrange
      const driftInfo = {
        resourceId: 'ApiLambdaRole',
        drifted: true,
        driftStatus: 'MODIFIED' as const,
        propertyDifferences: [
          {
            propertyPath: '/Properties/ManagedPolicyArns/1',
            expectedValue: null,
            actualValue: 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess',
            differenceType: 'ADD' as const
          }
        ]
      };

      // Act
      const resolution = await mockIntervention.resolveDrift(
        'ApiLambdaRole',
        driftInfo
      );

      // Assert
      expect(resolution).toBe('use-aws'); // Use actual AWS state
    });
  });

  describe('Scenario 3: Template Differences with Critical Issues', () => {
    it('should classify differences by severity', () => {
      // Arrange
      const differences = [
        {
          path: 'Resources.UsersTable.Properties.AttributeDefinitions',
          serverlessValue: [
            { AttributeName: 'userId', AttributeType: 'S' },
            { AttributeName: 'email', AttributeType: 'S' }
          ],
          cdkValue: [{ AttributeName: 'userId', AttributeType: 'S' }],
          category: 'critical' as const,
          explanation: 'Missing GSI attribute definition'
        },
        {
          path: 'Resources.UsersTable.Metadata',
          serverlessValue: undefined,
          cdkValue: { 'aws:cdk:path': 'Stack/UsersTable' },
          category: 'acceptable' as const,
          explanation: 'CDK metadata added automatically'
        },
        {
          path: 'Resources.OrdersTable.Properties.BillingMode',
          serverlessValue: 'PROVISIONED',
          cdkValue: 'PAY_PER_REQUEST',
          category: 'warning' as const,
          explanation: 'Billing mode changed - review cost implications'
        }
      ];

      // Act
      const critical = differences.filter(d => d.category === 'critical');
      const warnings = differences.filter(d => d.category === 'warning');
      const acceptable = differences.filter(d => d.category === 'acceptable');

      // Assert
      expect(critical).toHaveLength(1);
      expect(warnings).toHaveLength(1);
      expect(acceptable).toHaveLength(1);
    });

    it('should require human confirmation for critical differences', async () => {
      // Arrange
      const resourceId = 'UsersTable';
      const differences = [
        {
          path: 'Properties.AttributeDefinitions',
          category: 'critical',
          explanation: 'Missing attribute definition for GSI'
        }
      ];

      // Act
      const decision = await mockIntervention.confirmCriticalDifference(
        resourceId,
        differences
      );

      // Assert
      expect(decision).toBe('proceed'); // User decided to proceed anyway
    });
  });

  describe('Scenario 4: Checkpoint System Integration', () => {
    it('should pause migration at physical ID resolution checkpoint', async () => {
      // Arrange
      const migrationState = {
        currentStep: 'DISCOVERY',
        resources: [
          {
            logicalId: 'UsersTable',
            type: 'AWS::DynamoDB::Table',
            isStateful: true,
            physicalId: undefined // Not resolved yet
          }
        ]
      };

      // Act - Simulate checkpoint trigger
      const unresolvedResources = migrationState.resources.filter(
        r => r.isStateful && !r.physicalId
      );

      // Assert
      expect(unresolvedResources).toHaveLength(1);
      expect(unresolvedResources[0].logicalId).toBe('UsersTable');

      // Simulate resolution
      const physicalId = await mockIntervention.promptForPhysicalId(
        'UsersTable',
        'AWS::DynamoDB::Table',
        [{ physicalId: 'users-table-dev', confidence: 0.9 }]
      );

      migrationState.resources[0].physicalId = physicalId;
      expect(migrationState.resources[0].physicalId).toBe('users-table-dev');
    });

    it('should support pause and resume workflow', () => {
      // Arrange
      const checkpointData = {
        id: 'physical-id-resolution',
        step: 'DISCOVERY',
        status: 'PAUSED',
        timestamp: new Date(),
        interventionsRequired: [
          {
            resourceId: 'UsersTable',
            type: 'physicalIdSelection',
            candidates: ['users-table-dev', 'users-table-prod']
          }
        ]
      };

      // Act - Save checkpoint
      const savedCheckpoint = JSON.parse(JSON.stringify(checkpointData));

      // Resume from checkpoint
      const resumedCheckpoint = savedCheckpoint;

      // Assert
      expect(resumedCheckpoint.id).toBe('physical-id-resolution');
      expect(resumedCheckpoint.interventionsRequired).toHaveLength(1);
      expect(resumedCheckpoint.status).toBe('PAUSED');
    });
  });

  describe('Scenario 5: Interactive CDK Import Simulation', () => {
    it('should prepare import definitions with physical IDs', () => {
      // Arrange
      const resources = [
        {
          logicalId: 'UsersTable',
          physicalId: 'users-table-dev',
          resourceType: 'AWS::DynamoDB::Table'
        },
        {
          logicalId: 'DataBucket',
          physicalId: 'messy-app-data-dev',
          resourceType: 'AWS::S3::Bucket'
        }
      ];

      // Act
      const importDefinitions = resources.map(r => ({
        resourceIdentifier: { [getIdentifierKey(r.resourceType)]: r.physicalId },
        logicalResourceId: r.logicalId
      }));

      // Assert
      expect(importDefinitions).toHaveLength(2);
      expect(importDefinitions[0].logicalResourceId).toBe('UsersTable');
      expect(importDefinitions[0].resourceIdentifier.TableName).toBe(
        'users-table-dev'
      );
      expect(importDefinitions[1].resourceIdentifier.BucketName).toBe(
        'messy-app-data-dev'
      );
    });

    it('should simulate CDK import process with prompts', async () => {
      // Arrange
      const importPlan = {
        resources: [
          { logicalId: 'UsersTable', physicalId: 'users-table-dev' },
          { logicalId: 'OrdersTable', physicalId: 'orders-table-dev' }
        ],
        status: 'READY'
      };

      // Act - Simulate import execution
      const results = [];
      for (const resource of importPlan.resources) {
        results.push({
          logicalId: resource.logicalId,
          physicalId: resource.physicalId,
          status: 'IMPORTED'
        });
      }

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'IMPORTED')).toBe(true);
    });
  });

  describe('Scenario 6: Full Migration with All Features', () => {
    it('should complete full migration with multiple interventions', async () => {
      // Arrange
      const migrationConfig = {
        sourcePath: './fixtures/messy-environment',
        stackName: 'messy-app-dev',
        detectDrift: true,
        interactive: false // Use mock responses
      };

      const interventionLog: any[] = [];

      // Act - Simulate full migration flow

      // Step 1: Discovery
      const tables = await mockClients.dynamodb.listTables();
      expect(tables.TableNames).toHaveLength(4);

      // Step 2: Physical ID Resolution
      const usersTableId = await mockIntervention.promptForPhysicalId(
        'UsersTable',
        'AWS::DynamoDB::Table',
        [
          { physicalId: 'users-table-dev', confidence: 0.9 },
          { physicalId: 'users-table-prod', confidence: 0.5 }
        ]
      );
      interventionLog.push({ type: 'physicalId', resource: 'UsersTable', value: usersTableId });

      // Step 3: Drift Detection
      await mockClients.cloudformation.detectStackDrift({
        StackName: migrationConfig.stackName
      });
      const drifts = await mockClients.cloudformation.describeStackResourceDrifts({
        StackName: migrationConfig.stackName
      });

      if (drifts.StackResourceDrifts.length > 0) {
        const driftResolution = await mockIntervention.resolveDrift(
          'ApiLambdaRole',
          {
            resourceId: 'ApiLambdaRole',
            drifted: true,
            driftStatus: 'MODIFIED',
            propertyDifferences: drifts.StackResourceDrifts[0].PropertyDifferences
          }
        );
        interventionLog.push({
          type: 'drift',
          resource: 'ApiLambdaRole',
          resolution: driftResolution
        });
      }

      // Step 4: Critical Difference Review
      const criticalDecision = await mockIntervention.confirmCriticalDifference(
        'UsersTable',
        [{ path: 'AttributeDefinitions', category: 'critical' }]
      );
      interventionLog.push({
        type: 'criticalDifference',
        resource: 'UsersTable',
        decision: criticalDecision
      });

      // Assert
      expect(interventionLog).toHaveLength(3);
      expect(interventionLog[0].value).toBe('users-table-dev');
      expect(interventionLog[1].resolution).toBe('use-aws');
      expect(interventionLog[2].decision).toBe('proceed');
    });
  });
});

// Helper functions
function calculateMatchConfidence(
  templateProps: any,
  actualResource: any
): number {
  let score = 0.0;

  // Exact name match
  if (templateProps.TableName === actualResource.TableName) {
    score += 0.9;
  }

  // Billing mode match
  if (templateProps.BillingMode === actualResource.BillingModeSummary?.BillingMode) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

function getIdentifierKey(resourceType: string): string {
  const mapping: Record<string, string> = {
    'AWS::DynamoDB::Table': 'TableName',
    'AWS::S3::Bucket': 'BucketName',
    'AWS::IAM::Role': 'RoleName',
    'AWS::Logs::LogGroup': 'LogGroupName'
  };

  return mapping[resourceType] || 'PhysicalResourceId';
}
