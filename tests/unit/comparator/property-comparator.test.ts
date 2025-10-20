/**
 * Unit tests for property-comparator module
 */

import {
  compareResource,
  compareProperties,
  analyzeDifference,
  deepEqual,
  determineStatus,
  generateRecommendation,
} from '../../../src/modules/comparator/property-comparator';
import type { ResourceMatch } from '../../../src/types/cloudformation';

describe('property-comparator', () => {
  describe('deepEqual', () => {
    it('should return true for equal primitives', () => {
      expect(deepEqual('test', 'test')).toBe(true);
      expect(deepEqual(123, 123)).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(deepEqual('test', 'other')).toBe(false);
      expect(deepEqual(123, 456)).toBe(false);
      expect(deepEqual(true, false)).toBe(false);
    });

    it('should return true for equal arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('should return false for different arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('should return true for equal objects', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('should return false for different objects', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('should handle nested structures', () => {
      const obj1 = {
        a: [1, 2, { x: 'test' }],
        b: { c: { d: 'value' } },
      };
      const obj2 = {
        a: [1, 2, { x: 'test' }],
        b: { c: { d: 'value' } },
      };
      expect(deepEqual(obj1, obj2)).toBe(true);
    });
  });

  describe('analyzeDifference', () => {
    it('should classify critical property mismatch', () => {
      const diff = analyzeDifference(
        'TableName',
        'table-one',
        'table-two',
        'AWS::DynamoDB::Table'
      );

      expect(diff.severity).toBe('CRITICAL');
      expect(diff.explanation).toContain('Critical property mismatch');
    });

    it('should classify acceptable CDK addition', () => {
      const diff = analyzeDifference(
        'RetentionInDays',
        undefined,
        7,
        'AWS::Logs::LogGroup'
      );

      expect(diff.severity).toBe('ACCEPTABLE');
      expect(diff.explanation).toContain('safe addition');
    });

    it('should classify warning for property differences', () => {
      const diff = analyzeDifference(
        'StreamSpecification',
        { StreamViewType: 'NEW_IMAGE' },
        { StreamViewType: 'NEW_AND_OLD_IMAGES' },
        'AWS::DynamoDB::Table'
      );

      expect(diff.severity).toBe('WARNING');
    });

    it('should mark missing critical property in CDK as CRITICAL', () => {
      const diff = analyzeDifference(
        'TableName',
        'my-table',
        undefined,
        'AWS::DynamoDB::Table'
      );

      expect(diff.severity).toBe('CRITICAL');
      expect(diff.autoFixable).toBe(true);
    });
  });

  describe('compareProperties', () => {
    it('should find no differences for identical properties', () => {
      const slsProps = {
        TableName: 'my-table',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      };
      const cdkProps = {
        TableName: 'my-table',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      };

      const diffs = compareProperties(
        slsProps,
        cdkProps,
        'AWS::DynamoDB::Table'
      );

      expect(diffs).toHaveLength(0);
    });

    it('should ignore DeletionPolicy and UpdateReplacePolicy', () => {
      const slsProps = {
        TableName: 'my-table',
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      };
      const cdkProps = {
        TableName: 'my-table',
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      };

      const diffs = compareProperties(
        slsProps,
        cdkProps,
        'AWS::DynamoDB::Table'
      );

      expect(diffs).toHaveLength(0);
    });

    it('should detect critical property differences', () => {
      const slsProps = {
        TableName: 'my-table',
      };
      const cdkProps = {
        TableName: 'different-table',
      };

      const diffs = compareProperties(
        slsProps,
        cdkProps,
        'AWS::DynamoDB::Table'
      );

      expect(diffs).toHaveLength(1);
      expect(diffs[0].severity).toBe('CRITICAL');
      expect(diffs[0].property).toBe('TableName');
    });

    it('should detect acceptable CDK additions', () => {
      const slsProps = {
        LogGroupName: '/aws/lambda/func',
      };
      const cdkProps = {
        LogGroupName: '/aws/lambda/func',
        RetentionInDays: 7,
      };

      const diffs = compareProperties(
        slsProps,
        cdkProps,
        'AWS::Logs::LogGroup'
      );

      expect(diffs).toHaveLength(1);
      expect(diffs[0].severity).toBe('ACCEPTABLE');
      expect(diffs[0].property).toBe('RetentionInDays');
    });

    it('should handle S3 bucket versioning differences', () => {
      const slsProps = {
        BucketName: 'my-bucket',
        VersioningConfiguration: { Status: 'Enabled' },
      };
      const cdkProps = {
        BucketName: 'my-bucket',
      };

      const diffs = compareProperties(slsProps, cdkProps, 'AWS::S3::Bucket');

      expect(diffs).toHaveLength(1);
      expect(diffs[0].severity).toBe('WARNING');
      expect(diffs[0].property).toBe('VersioningConfiguration');
    });
  });

  describe('determineStatus', () => {
    it('should return MATCH when no differences', () => {
      expect(determineStatus([])).toBe('MATCH');
    });

    it('should return CRITICAL when critical differences exist', () => {
      const diffs = [
        {
          property: 'TableName',
          slsValue: 'table1',
          cdkValue: 'table2',
          severity: 'CRITICAL' as const,
          explanation: 'Critical',
          autoFixable: false,
        },
      ];
      expect(determineStatus(diffs)).toBe('CRITICAL');
    });

    it('should return WARNING when only warnings exist', () => {
      const diffs = [
        {
          property: 'StreamSpecification',
          slsValue: {},
          cdkValue: {},
          severity: 'WARNING' as const,
          explanation: 'Warning',
          autoFixable: false,
        },
      ];
      expect(determineStatus(diffs)).toBe('WARNING');
    });

    it('should return ACCEPTABLE when only acceptable differences', () => {
      const diffs = [
        {
          property: 'RetentionInDays',
          slsValue: undefined,
          cdkValue: 7,
          severity: 'ACCEPTABLE' as const,
          explanation: 'Acceptable',
          autoFixable: false,
        },
      ];
      expect(determineStatus(diffs)).toBe('ACCEPTABLE');
    });

    it('should prioritize CRITICAL over WARNING', () => {
      const diffs = [
        {
          property: 'TableName',
          slsValue: 'table1',
          cdkValue: 'table2',
          severity: 'CRITICAL' as const,
          explanation: 'Critical',
          autoFixable: false,
        },
        {
          property: 'StreamSpecification',
          slsValue: {},
          cdkValue: {},
          severity: 'WARNING' as const,
          explanation: 'Warning',
          autoFixable: false,
        },
      ];
      expect(determineStatus(diffs)).toBe('CRITICAL');
    });
  });

  describe('generateRecommendation', () => {
    it('should generate positive recommendation for MATCH', () => {
      const rec = generateRecommendation('MATCH', []);
      expect(rec).toContain('Safe to import');
      expect(rec).toContain('No differences');
    });

    it('should generate positive recommendation for ACCEPTABLE', () => {
      const diffs = [
        {
          property: 'RetentionInDays',
          slsValue: undefined,
          cdkValue: 7,
          severity: 'ACCEPTABLE' as const,
          explanation: 'Acceptable',
          autoFixable: false,
        },
      ];
      const rec = generateRecommendation('ACCEPTABLE', diffs);
      expect(rec).toContain('Safe to import');
      expect(rec).toContain('1 acceptable');
    });

    it('should generate warning recommendation for WARNING', () => {
      const diffs = [
        {
          property: 'StreamSpecification',
          slsValue: {},
          cdkValue: {},
          severity: 'WARNING' as const,
          explanation: 'Warning',
          autoFixable: false,
        },
      ];
      const rec = generateRecommendation('WARNING', diffs);
      expect(rec).toContain('Review required');
      expect(rec).toContain('1 property differs');
    });

    it('should generate critical recommendation for CRITICAL', () => {
      const diffs = [
        {
          property: 'TableName',
          slsValue: 'table1',
          cdkValue: 'table2',
          severity: 'CRITICAL' as const,
          explanation: 'Critical',
          autoFixable: false,
        },
      ];
      const rec = generateRecommendation('CRITICAL', diffs);
      expect(rec).toContain('Cannot import');
      expect(rec).toContain('1 critical');
    });
  });

  describe('compareResource', () => {
    it('should compare a complete resource match', () => {
      const match: ResourceMatch = {
        slsLogicalId: 'MyTable',
        cdkLogicalId: 'MyTableABC',
        physicalId: 'my-table',
        resourceType: 'AWS::DynamoDB::Table',
        slsResource: {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: 'my-table',
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          },
        },
        cdkResource: {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: 'my-table',
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          },
        },
      };

      const result = compareResource(match);

      expect(result.status).toBe('MATCH');
      expect(result.differences).toHaveLength(0);
      expect(result.recommendation).toContain('Safe to import');
    });

    it('should detect and classify multiple differences', () => {
      const match: ResourceMatch = {
        slsLogicalId: 'MyLogGroup',
        cdkLogicalId: 'MyLogGroupXYZ',
        physicalId: '/aws/lambda/func',
        resourceType: 'AWS::Logs::LogGroup',
        slsResource: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/func',
          },
        },
        cdkResource: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/func',
            RetentionInDays: 7,
          },
        },
      };

      const result = compareResource(match);

      expect(result.status).toBe('ACCEPTABLE');
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].property).toBe('RetentionInDays');
    });
  });
});
