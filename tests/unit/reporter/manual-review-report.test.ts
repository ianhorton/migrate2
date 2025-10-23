/**
 * Unit tests for ManualReviewReport
 * Sprint 2: Template Analysis
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs/promises';
import { ManualReviewReport, type ReviewReportData } from '../../../src/modules/reporter/manual-review-report';
import type { ComparisonResult } from '../../../src/types/cloudformation';
import type { DifferenceClassification } from '../../../src/modules/analysis/difference-analyzer';
import type { ConfidenceScore } from '../../../src/modules/analysis/confidence-scoring';

// Mock fs
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ManualReviewReport', () => {
  let reporter: ManualReviewReport;
  let mockReportData: ReviewReportData;

  beforeEach(() => {
    reporter = new ManualReviewReport();
    jest.clearAllMocks();

    // Setup mock data
    const mockDifferenceClassification: DifferenceClassification = {
      difference: {
        property: 'TableName',
        slsValue: 'users-table-dev',
        cdkValue: 'users-table-prod',
        severity: 'CRITICAL',
        explanation: 'Name mismatch',
        autoFixable: false,
      },
      category: 'critical',
      autoResolvable: false,
      requiresHumanReview: true,
      explanation: 'Physical resource name mismatch',
    };

    const mockComparisonResult: ComparisonResult = {
      resourceType: 'AWS::DynamoDB::Table',
      physicalId: 'users-table-dev',
      slsLogicalId: 'UsersTable',
      cdkLogicalId: 'UsersTable',
      status: 'CRITICAL',
      differences: [mockDifferenceClassification.difference],
      recommendation: 'Cannot import',
    };

    const mockConfidenceScore: ConfidenceScore = {
      overall: 0.45,
      factors: [
        {
          factor: 'Physical ID Match',
          impact: 0.9,
          description: 'Physical ID matched with 90% confidence',
        },
        {
          factor: 'Critical Differences',
          impact: 0.2,
          description: '1 critical difference found',
        },
      ],
      recommendation: 'human-required',
      reasoning: 'Critical issues require human intervention',
    };

    mockReportData = {
      migrationId: 'test-migration-123',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      resources: [
        {
          logicalId: 'UsersTable',
          resourceType: 'AWS::DynamoDB::Table',
          physicalId: 'users-table-dev',
          comparisonResult: mockComparisonResult,
          classifications: [mockDifferenceClassification],
          confidenceScore: mockConfidenceScore,
        },
      ],
      summary: {
        total: 1,
        acceptable: 0,
        warning: 0,
        critical: 1,
        autoResolvable: 0,
        requiresReview: 1,
      },
      overallConfidence: mockConfidenceScore,
    };
  });

  describe('generateHTMLReport', () => {
    it('should generate valid HTML report', () => {
      const html = reporter.generateHTMLReport(mockReportData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('Migration Manual Review Report');
      expect(html).toContain('test-migration-123');
      expect(html).toContain('UsersTable');
      expect(html).toContain('AWS::DynamoDB::Table');
    });

    it('should include summary statistics', () => {
      const html = reporter.generateHTMLReport(mockReportData);

      expect(html).toContain('Overall Confidence');
      expect(html).toContain('45%');
      expect(html).toContain('Total Resources');
      expect(html).toContain('Critical Issues');
    });

    it('should include resource details', () => {
      const html = reporter.generateHTMLReport(mockReportData);

      expect(html).toContain('UsersTable');
      expect(html).toContain('users-table-dev');
      expect(html).toContain('TableName');
      expect(html).toContain('users-table-prod');
    });

    it('should show no issues section when no resources require review', () => {
      const cleanData: ReviewReportData = {
        ...mockReportData,
        resources: mockReportData.resources.map((r) => ({
          ...r,
          confidenceScore: {
            overall: 0.95,
            factors: [],
            recommendation: 'auto-proceed',
            reasoning: 'No issues',
          },
        })),
      };

      const html = reporter.generateHTMLReport(cleanData);

      expect(html).toContain('No Issues Found');
      expect(html).toContain('✅');
    });

    it('should handle multiple resources', () => {
      const multiResourceData: ReviewReportData = {
        ...mockReportData,
        resources: [
          ...mockReportData.resources,
          {
            logicalId: 'ApiRole',
            resourceType: 'AWS::IAM::Role',
            physicalId: 'api-role-dev',
            comparisonResult: {
              resourceType: 'AWS::IAM::Role',
              physicalId: 'api-role-dev',
              slsLogicalId: 'ApiRole',
              cdkLogicalId: 'ApiRole',
              status: 'WARNING',
              differences: [],
              recommendation: 'Review',
            },
            classifications: [],
            confidenceScore: {
              overall: 0.75,
              factors: [],
              recommendation: 'review-recommended',
              reasoning: 'Minor issues',
            },
          },
        ],
        summary: {
          total: 2,
          acceptable: 0,
          warning: 1,
          critical: 1,
          autoResolvable: 0,
          requiresReview: 2,
        },
      };

      const html = reporter.generateHTMLReport(multiResourceData);

      expect(html).toContain('UsersTable');
      expect(html).toContain('ApiRole');
    });
  });

  describe('generateTerminalSummary', () => {
    it('should generate colored terminal output', () => {
      const terminal = reporter.generateTerminalSummary(mockReportData);

      expect(terminal).toContain('Migration Manual Review Report');
      expect(terminal).toContain('Summary');
      expect(terminal).toContain('Total Resources:');
      expect(terminal).toContain('Critical Issues:');
      expect(terminal).toContain('UsersTable');
    });

    it('should include confidence scores', () => {
      const terminal = reporter.generateTerminalSummary(mockReportData);

      expect(terminal).toContain('Overall Confidence:');
      expect(terminal).toContain('45%');
      expect(terminal).toContain('Recommendation:');
    });

    it('should list resources requiring review', () => {
      const terminal = reporter.generateTerminalSummary(mockReportData);

      expect(terminal).toContain('Resources Requiring Review');
      expect(terminal).toContain('UsersTable');
      expect(terminal).toContain('AWS::DynamoDB::Table');
      expect(terminal).toContain('TableName');
    });

    it('should show success message when no issues', () => {
      const cleanData: ReviewReportData = {
        ...mockReportData,
        resources: mockReportData.resources.map((r) => ({
          ...r,
          confidenceScore: {
            overall: 0.95,
            factors: [],
            recommendation: 'auto-proceed',
            reasoning: 'No issues',
          },
        })),
      };

      const terminal = reporter.generateTerminalSummary(cleanData);

      expect(terminal).toContain('No resources require manual review');
    });

    it('should use ANSI color codes', () => {
      const terminal = reporter.generateTerminalSummary(mockReportData);

      // Check for ANSI escape codes (color codes)
      expect(terminal).toMatch(/\x1b\[\d+m/);
    });
  });

  describe('exportToJSON', () => {
    it('should export valid JSON', () => {
      const json = reporter.exportToJSON(mockReportData);
      const parsed = JSON.parse(json);

      expect(parsed.migrationId).toBe('test-migration-123');
      expect(parsed.resources).toHaveLength(1);
      expect(parsed.resources[0].logicalId).toBe('UsersTable');
    });

    it('should include all data fields', () => {
      const json = reporter.exportToJSON(mockReportData);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('migrationId');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('resources');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('overallConfidence');
    });

    it('should be pretty-formatted', () => {
      const json = reporter.exportToJSON(mockReportData);

      // Check for indentation (pretty print)
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('exportToMarkdown', () => {
    it('should generate valid markdown', () => {
      const md = reporter.exportToMarkdown(mockReportData);

      expect(md).toContain('# Migration Manual Review Report');
      expect(md).toContain('## Summary');
      expect(md).toContain('## Resources Requiring Review');
    });

    it('should include summary statistics', () => {
      const md = reporter.exportToMarkdown(mockReportData);

      expect(md).toContain('**Total Resources:** 1');
      expect(md).toContain('**Critical Issues:** 1');
      expect(md).toContain('**Overall Confidence:** 45%');
    });

    it('should include resource details', () => {
      const md = reporter.exportToMarkdown(mockReportData);

      expect(md).toContain('### 1. UsersTable');
      expect(md).toContain('**Resource Type:** AWS::DynamoDB::Table');
      expect(md).toContain('**Physical ID:** users-table-dev');
      expect(md).toContain('#### ❌ Critical Issues');
    });

    it('should show success message when no issues', () => {
      const cleanData: ReviewReportData = {
        ...mockReportData,
        resources: mockReportData.resources.map((r) => ({
          ...r,
          confidenceScore: {
            overall: 0.95,
            factors: [],
            recommendation: 'auto-proceed',
            reasoning: 'No issues',
          },
        })),
      };

      const md = reporter.exportToMarkdown(cleanData);

      expect(md).toContain('✅ No resources require manual review');
    });

    it('should use markdown formatting', () => {
      const md = reporter.exportToMarkdown(mockReportData);

      // Check for markdown elements
      expect(md).toMatch(/^#\s/m); // Headers
      expect(md).toMatch(/^-\s/m); // Lists
      expect(md).toMatch(/\*\*.*?\*\*/); // Bold
      expect(md).toMatch(/`.*?`/); // Code
    });
  });

  describe('saveReport', () => {
    beforeEach(() => {
      mockedFs.writeFile.mockResolvedValue(undefined);
    });

    it('should save HTML report', async () => {
      await reporter.saveReport(
        mockReportData,
        '/output/report.html',
        'html'
      );

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '/output/report.html',
        expect.stringContaining('<!DOCTYPE html>'),
        'utf-8'
      );
    });

    it('should save JSON report', async () => {
      await reporter.saveReport(
        mockReportData,
        '/output/report.json',
        'json'
      );

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '/output/report.json',
        expect.stringContaining('"migrationId"'),
        'utf-8'
      );
    });

    it('should save Markdown report', async () => {
      await reporter.saveReport(
        mockReportData,
        '/output/report.md',
        'markdown'
      );

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '/output/report.md',
        expect.stringContaining('# Migration Manual Review Report'),
        'utf-8'
      );
    });

    it('should handle file write errors', async () => {
      mockedFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        reporter.saveReport(mockReportData, '/output/report.html', 'html')
      ).rejects.toThrow('Write failed');
    });
  });

  describe('edge cases', () => {
    it('should handle empty resources array', () => {
      const emptyData: ReviewReportData = {
        ...mockReportData,
        resources: [],
        summary: {
          total: 0,
          acceptable: 0,
          warning: 0,
          critical: 0,
          autoResolvable: 0,
          requiresReview: 0,
        },
      };

      const html = reporter.generateHTMLReport(emptyData);
      expect(html).toContain('No Issues Found');

      const terminal = reporter.generateTerminalSummary(emptyData);
      expect(terminal).toContain('0');

      const md = reporter.exportToMarkdown(emptyData);
      expect(md).toContain('0');
    });

    it('should handle undefined physical IDs', () => {
      const dataWithoutPhysicalId: ReviewReportData = {
        ...mockReportData,
        resources: [
          {
            ...mockReportData.resources[0],
            physicalId: undefined,
          },
        ],
      };

      const html = reporter.generateHTMLReport(dataWithoutPhysicalId);
      expect(html).toContain('Unknown');
    });

    it('should handle multiple difference categories', () => {
      const mixedClassifications: DifferenceClassification[] = [
        {
          difference: {
            property: 'TableName',
            slsValue: 'table1',
            cdkValue: 'table2',
            severity: 'CRITICAL',
            explanation: '',
            autoFixable: false,
          },
          category: 'critical',
          autoResolvable: false,
          requiresHumanReview: true,
          explanation: 'Critical',
        },
        {
          difference: {
            property: 'BillingMode',
            slsValue: 'PROVISIONED',
            cdkValue: 'PAY_PER_REQUEST',
            severity: 'WARNING',
            explanation: '',
            autoFixable: false,
          },
          category: 'warning',
          autoResolvable: false,
          requiresHumanReview: true,
          explanation: 'Warning',
        },
        {
          difference: {
            property: 'Tags',
            slsValue: undefined,
            cdkValue: [],
            severity: 'ACCEPTABLE',
            explanation: '',
            autoFixable: true,
          },
          category: 'acceptable',
          autoResolvable: true,
          requiresHumanReview: false,
          explanation: 'Acceptable',
        },
      ];

      const mixedData: ReviewReportData = {
        ...mockReportData,
        resources: [
          {
            ...mockReportData.resources[0],
            classifications: mixedClassifications,
          },
        ],
        summary: {
          total: 3,
          acceptable: 1,
          warning: 1,
          critical: 1,
          autoResolvable: 1,
          requiresReview: 2,
        },
      };

      const html = reporter.generateHTMLReport(mixedData);
      expect(html).toContain('❌ Critical Issues');
      expect(html).toContain('⚠️ Warnings');

      const terminal = reporter.generateTerminalSummary(mixedData);
      expect(terminal).toContain('Critical Issues:');
      expect(terminal).toContain('Warnings:');
    });
  });
});
