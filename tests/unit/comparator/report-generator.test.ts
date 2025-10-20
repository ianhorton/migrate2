/**
 * Unit tests for report-generator module
 */

import {
  generateReport,
  generateHTMLReport,
} from '../../../src/modules/comparator/report-generator';
import type { ComparisonResult } from '../../../src/types/cloudformation';

describe('report-generator', () => {
  describe('generateReport', () => {
    it('should generate report with MATCH status', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'my-table',
          slsLogicalId: 'MyTable',
          cdkLogicalId: 'MyTableABC',
          status: 'MATCH',
          differences: [],
          recommendation: 'Safe to import',
        },
      ];

      const report = generateReport(results);

      expect(report.overall_status).toBe('MATCH');
      expect(report.ready_for_import).toBe(true);
      expect(report.blocking_issues).toHaveLength(0);
      expect(report.summary.total_resources).toBe(1);
      expect(report.summary.status.MATCH).toBe(1);
    });

    it('should generate report with ACCEPTABLE status', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::Logs::LogGroup',
          physicalId: '/aws/lambda/func',
          slsLogicalId: 'LogGroup',
          cdkLogicalId: 'LogGroupXYZ',
          status: 'ACCEPTABLE',
          differences: [
            {
              property: 'RetentionInDays',
              slsValue: undefined,
              cdkValue: 7,
              severity: 'ACCEPTABLE',
              explanation: 'Acceptable addition',
              autoFixable: false,
            },
          ],
          recommendation: 'Safe to import',
        },
      ];

      const report = generateReport(results);

      expect(report.overall_status).toBe('ACCEPTABLE');
      expect(report.ready_for_import).toBe(true);
      expect(report.summary.status.ACCEPTABLE).toBe(1);
    });

    it('should generate report with WARNING status', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::S3::Bucket',
          physicalId: 'my-bucket',
          slsLogicalId: 'Bucket',
          cdkLogicalId: 'BucketDEF',
          status: 'WARNING',
          differences: [
            {
              property: 'VersioningConfiguration',
              slsValue: { Status: 'Enabled' },
              cdkValue: undefined,
              severity: 'WARNING',
              explanation: 'Review required',
              autoFixable: false,
            },
          ],
          recommendation: 'Review required',
        },
      ];

      const report = generateReport(results);

      expect(report.overall_status).toBe('WARNING');
      expect(report.ready_for_import).toBe(true);
      expect(report.summary.status.WARNING).toBe(1);
    });

    it('should generate report with CRITICAL status and blocking issues', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'my-table',
          slsLogicalId: 'MyTable',
          cdkLogicalId: 'MyTableABC',
          status: 'CRITICAL',
          differences: [
            {
              property: 'TableName',
              slsValue: 'table-one',
              cdkValue: 'table-two',
              severity: 'CRITICAL',
              explanation: 'Critical mismatch',
              autoFixable: false,
            },
          ],
          recommendation: 'Cannot import',
        },
      ];

      const report = generateReport(results);

      expect(report.overall_status).toBe('CRITICAL');
      expect(report.ready_for_import).toBe(false);
      expect(report.blocking_issues.length).toBeGreaterThan(0);
      expect(report.blocking_issues[0]).toContain('TableName');
      expect(report.summary.status.CRITICAL).toBe(1);
    });

    it('should handle multiple resources with mixed statuses', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'table1',
          slsLogicalId: 'Table1',
          cdkLogicalId: 'Table1ABC',
          status: 'MATCH',
          differences: [],
          recommendation: 'Safe',
        },
        {
          resourceType: 'AWS::Logs::LogGroup',
          physicalId: 'log1',
          slsLogicalId: 'Log1',
          cdkLogicalId: 'Log1XYZ',
          status: 'ACCEPTABLE',
          differences: [],
          recommendation: 'Safe',
        },
        {
          resourceType: 'AWS::S3::Bucket',
          physicalId: 'bucket1',
          slsLogicalId: 'Bucket1',
          cdkLogicalId: 'Bucket1DEF',
          status: 'WARNING',
          differences: [],
          recommendation: 'Review',
        },
      ];

      const report = generateReport(results);

      expect(report.summary.total_resources).toBe(3);
      expect(report.summary.status.MATCH).toBe(1);
      expect(report.summary.status.ACCEPTABLE).toBe(1);
      expect(report.summary.status.WARNING).toBe(1);
      expect(report.overall_status).toBe('WARNING');
    });

    it('should prioritize CRITICAL in overall status', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'table1',
          slsLogicalId: 'Table1',
          cdkLogicalId: 'Table1ABC',
          status: 'MATCH',
          differences: [],
          recommendation: 'Safe',
        },
        {
          resourceType: 'AWS::S3::Bucket',
          physicalId: 'bucket1',
          slsLogicalId: 'Bucket1',
          cdkLogicalId: 'Bucket1DEF',
          status: 'CRITICAL',
          differences: [
            {
              property: 'BucketName',
              slsValue: 'bucket-one',
              cdkValue: 'bucket-two',
              severity: 'CRITICAL',
              explanation: 'Critical',
              autoFixable: false,
            },
          ],
          recommendation: 'Cannot import',
        },
      ];

      const report = generateReport(results);

      expect(report.overall_status).toBe('CRITICAL');
      expect(report.ready_for_import).toBe(false);
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate valid HTML with summary', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'my-table',
          slsLogicalId: 'MyTable',
          cdkLogicalId: 'MyTableABC',
          status: 'MATCH',
          differences: [],
          recommendation: 'Safe to import',
        },
      ];

      const report = generateReport(results);
      const html = generateHTMLReport(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Comparison Report');
      expect(html).toContain('my-table');
      expect(html).toContain('AWS::DynamoDB::Table');
      expect(html).toContain('MATCH');
    });

    it('should include blocking issues section when present', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'my-table',
          slsLogicalId: 'MyTable',
          cdkLogicalId: 'MyTableABC',
          status: 'CRITICAL',
          differences: [
            {
              property: 'TableName',
              slsValue: 'table1',
              cdkValue: 'table2',
              severity: 'CRITICAL',
              explanation: 'Critical',
              autoFixable: false,
            },
          ],
          recommendation: 'Cannot import',
        },
      ];

      const report = generateReport(results);
      const html = generateHTMLReport(report);

      expect(html).toContain('Blocking Issues');
      expect(html).toContain('TableName');
    });

    it('should format property differences correctly', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::Logs::LogGroup',
          physicalId: '/aws/lambda/func',
          slsLogicalId: 'LogGroup',
          cdkLogicalId: 'LogGroupXYZ',
          status: 'ACCEPTABLE',
          differences: [
            {
              property: 'RetentionInDays',
              slsValue: undefined,
              cdkValue: 7,
              severity: 'ACCEPTABLE',
              explanation: 'Acceptable addition',
              autoFixable: false,
            },
          ],
          recommendation: 'Safe',
        },
      ];

      const report = generateReport(results);
      const html = generateHTMLReport(report);

      expect(html).toContain('RetentionInDays');
      expect(html).toContain('Serverless');
      expect(html).toContain('CDK');
      expect(html).toContain('undefined');
    });

    it('should show ready for import message when no blocking issues', () => {
      const results: ComparisonResult[] = [
        {
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'my-table',
          slsLogicalId: 'MyTable',
          cdkLogicalId: 'MyTableABC',
          status: 'MATCH',
          differences: [],
          recommendation: 'Safe',
        },
      ];

      const report = generateReport(results);
      const html = generateHTMLReport(report);

      expect(html).toContain('Ready for import');
    });
  });
});
