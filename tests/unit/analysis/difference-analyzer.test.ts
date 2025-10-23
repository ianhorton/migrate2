/**
 * Unit tests for DifferenceAnalyzer
 * Sprint 2: Template Analysis
 */

import { describe, it, expect } from '@jest/globals';
import { DifferenceAnalyzer } from '../../../src/modules/analysis/difference-analyzer';
import type { PropertyDifference } from '../../../src/types/cloudformation';

describe('DifferenceAnalyzer', () => {
  let analyzer: DifferenceAnalyzer;

  beforeEach(() => {
    analyzer = new DifferenceAnalyzer();
  });

  describe('classifyDifference', () => {
    it('should classify CDK metadata addition as acceptable', () => {
      const difference: PropertyDifference = {
        property: 'Metadata',
        slsValue: undefined,
        cdkValue: { 'aws:cdk:path': 'Stack/Resource' },
        severity: 'INFO',
        explanation: 'CDK adds metadata',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications).toHaveLength(1);
      expect(classifications[0].category).toBe('acceptable');
      expect(classifications[0].autoResolvable).toBe(true);
      expect(classifications[0].requiresHumanReview).toBe(false);
      expect(classifications[0].explanation).toContain('metadata');
    });

    it('should classify UpdateReplacePolicy addition as acceptable', () => {
      const difference: PropertyDifference = {
        property: 'UpdateReplacePolicy',
        slsValue: undefined,
        cdkValue: 'Retain',
        severity: 'INFO',
        explanation: 'CDK adds UpdateReplacePolicy',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('acceptable');
      expect(classifications[0].autoResolvable).toBe(true);
      expect(classifications[0].explanation).toContain('UpdateReplacePolicy');
    });

    it('should classify physical name mismatch as critical', () => {
      const difference: PropertyDifference = {
        property: 'TableName',
        slsValue: 'users-table-dev',
        cdkValue: 'users-table-prod',
        severity: 'CRITICAL',
        explanation: 'Table names differ',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('critical');
      expect(classifications[0].autoResolvable).toBe(false);
      expect(classifications[0].requiresHumanReview).toBe(true);
      expect(classifications[0].explanation).toContain('Physical resource name');
    });

    it('should classify key schema change as critical', () => {
      const difference: PropertyDifference = {
        property: 'KeySchema',
        slsValue: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        cdkValue: [{ AttributeName: 'id', KeyType: 'HASH' }],
        severity: 'CRITICAL',
        explanation: 'Key schema differs',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('critical');
      expect(classifications[0].autoResolvable).toBe(false);
      expect(classifications[0].explanation).toContain('key schema');
    });

    it('should classify attribute definition change as warning', () => {
      const difference: PropertyDifference = {
        property: 'AttributeDefinitions',
        slsValue: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'email', AttributeType: 'S' },
        ],
        cdkValue: [{ AttributeName: 'userId', AttributeType: 'S' }],
        severity: 'WARNING',
        explanation: 'Attribute definitions differ',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('warning');
      expect(classifications[0].autoResolvable).toBe(false);
      expect(classifications[0].requiresHumanReview).toBe(true);
      expect(classifications[0].explanation).toContain('attribute definitions');
    });

    it('should classify billing mode change as warning', () => {
      const difference: PropertyDifference = {
        property: 'BillingMode',
        slsValue: 'PROVISIONED',
        cdkValue: 'PAY_PER_REQUEST',
        severity: 'WARNING',
        explanation: 'Billing mode differs',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('warning');
      expect(classifications[0].requiresHumanReview).toBe(true);
      expect(classifications[0].explanation).toContain('billing mode');
    });

    it('should classify environment variable change as warning', () => {
      const difference: PropertyDifference = {
        property: 'Environment',
        slsValue: { Variables: { KEY: 'value1' } },
        cdkValue: { Variables: { KEY: 'value2' } },
        severity: 'WARNING',
        explanation: 'Environment differs',
        autoFixable: true,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('warning');
      expect(classifications[0].autoResolvable).toBe(true);
      expect(classifications[0].requiresHumanReview).toBe(true);
    });

    it('should classify tags addition as acceptable', () => {
      const difference: PropertyDifference = {
        property: 'Tags',
        slsValue: undefined,
        cdkValue: [{ Key: 'Environment', Value: 'dev' }],
        severity: 'ACCEPTABLE',
        explanation: 'CDK adds tags',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('acceptable');
      expect(classifications[0].autoResolvable).toBe(true);
      expect(classifications[0].resolutionStrategy).toBe('merge');
    });
  });

  describe('groupByResolution', () => {
    it('should group differences by resolution requirement', () => {
      const differences: PropertyDifference[] = [
        {
          property: 'Metadata',
          slsValue: undefined,
          cdkValue: {},
          severity: 'INFO',
          explanation: 'Metadata',
          autoFixable: false,
        },
        {
          property: 'TableName',
          slsValue: 'table1',
          cdkValue: 'table2',
          severity: 'CRITICAL',
          explanation: 'Name mismatch',
          autoFixable: false,
        },
        {
          property: 'BillingMode',
          slsValue: 'PROVISIONED',
          cdkValue: 'PAY_PER_REQUEST',
          severity: 'WARNING',
          explanation: 'Billing mode',
          autoFixable: false,
        },
      ];

      const classifications = analyzer.analyzeDifferences(differences);
      const grouped = analyzer.groupByResolution(classifications);

      expect(grouped.autoResolvable).toHaveLength(1);
      expect(grouped.autoResolvable[0].difference.property).toBe('Metadata');
      expect(grouped.requiresReview).toHaveLength(2);
    });
  });

  describe('getSummary', () => {
    it('should generate classification summary', () => {
      const differences: PropertyDifference[] = [
        {
          property: 'Metadata',
          slsValue: undefined,
          cdkValue: {},
          severity: 'ACCEPTABLE',
          explanation: '',
          autoFixable: false,
        },
        {
          property: 'TableName',
          slsValue: 'table1',
          cdkValue: 'table2',
          severity: 'CRITICAL',
          explanation: '',
          autoFixable: false,
        },
        {
          property: 'BillingMode',
          slsValue: 'PROVISIONED',
          cdkValue: 'PAY_PER_REQUEST',
          severity: 'WARNING',
          explanation: '',
          autoFixable: false,
        },
        {
          property: 'UpdateReplacePolicy',
          slsValue: undefined,
          cdkValue: 'Retain',
          severity: 'ACCEPTABLE',
          explanation: '',
          autoFixable: false,
        },
      ];

      const classifications = analyzer.analyzeDifferences(differences);
      const summary = analyzer.getSummary(classifications);

      expect(summary.total).toBe(4);
      expect(summary.acceptable).toBe(2);
      expect(summary.warning).toBe(1);
      expect(summary.critical).toBe(1);
      expect(summary.autoResolvable).toBeGreaterThan(0);
      expect(summary.requiresReview).toBeGreaterThan(0);
    });
  });

  describe('explainDifference', () => {
    it('should generate human-readable explanation', () => {
      const difference: PropertyDifference = {
        property: 'TableName',
        slsValue: 'users-table',
        cdkValue: 'users-prod',
        severity: 'CRITICAL',
        explanation: 'Name mismatch',
        autoFixable: false,
      };

      const explanation = analyzer.explainDifference(difference);

      expect(explanation).toContain('Physical resource name');
      expect(explanation).toContain('CDK import will fail');
    });
  });

  describe('edge cases', () => {
    it('should handle empty differences array', () => {
      const classifications = analyzer.analyzeDifferences([]);
      expect(classifications).toHaveLength(0);

      const summary = analyzer.getSummary(classifications);
      expect(summary.total).toBe(0);
    });

    it('should handle unknown property differences', () => {
      const difference: PropertyDifference = {
        property: 'UnknownProperty',
        slsValue: 'value1',
        cdkValue: 'value2',
        severity: 'WARNING',
        explanation: 'Unknown difference',
        autoFixable: false,
      };

      const classifications = analyzer.analyzeDifferences([difference]);

      expect(classifications[0].category).toBe('warning');
      expect(classifications[0].autoResolvable).toBe(false);
    });

    it('should handle all physical name properties', () => {
      const nameProperties = [
        'TableName',
        'BucketName',
        'FunctionName',
        'RoleName',
        'LogGroupName',
        'DBInstanceIdentifier',
        'DBClusterIdentifier',
        'ClusterName',
      ];

      nameProperties.forEach((prop) => {
        const difference: PropertyDifference = {
          property: prop,
          slsValue: 'name1',
          cdkValue: 'name2',
          severity: 'CRITICAL',
          explanation: '',
          autoFixable: false,
        };

        const classifications = analyzer.analyzeDifferences([difference]);
        expect(classifications[0].category).toBe('critical');
        expect(classifications[0].explanation).toContain('Physical resource name');
      });
    });
  });
});
