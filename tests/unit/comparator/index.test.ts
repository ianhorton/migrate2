/**
 * Integration tests for Comparator module
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Comparator } from '../../../src/modules/comparator';
import type { CloudFormationTemplate } from '../../../src/types/cloudformation';

describe('Comparator Integration', () => {
  let comparator: Comparator;
  let tempDir: string;

  beforeEach(async () => {
    comparator = new Comparator();
    tempDir = path.join(process.cwd(), 'tests', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadTemplate', () => {
    it('should load valid CloudFormation template', async () => {
      const template: CloudFormationTemplate = {
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          MyTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
            },
          },
        },
      };

      const templatePath = path.join(tempDir, 'template.json');
      await fs.writeFile(templatePath, JSON.stringify(template, null, 2));

      const loaded = await comparator.loadTemplate(templatePath);

      expect(loaded.Resources.MyTable).toBeDefined();
      expect(loaded.Resources.MyTable.Type).toBe('AWS::DynamoDB::Table');
    });

    it('should throw error for invalid JSON', async () => {
      const templatePath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(templatePath, 'invalid json {]');

      await expect(comparator.loadTemplate(templatePath)).rejects.toThrow(
        'Failed to parse'
      );
    });

    it('should throw error for missing Resources section', async () => {
      const template = {
        AWSTemplateFormatVersion: '2010-09-09',
      };

      const templatePath = path.join(tempDir, 'no-resources.json');
      await fs.writeFile(templatePath, JSON.stringify(template));

      await expect(comparator.loadTemplate(templatePath)).rejects.toThrow(
        'missing Resources'
      );
    });

    it('should throw error for non-existent file', async () => {
      const templatePath = path.join(tempDir, 'does-not-exist.json');

      await expect(comparator.loadTemplate(templatePath)).rejects.toThrow();
    });
  });

  describe('compareTemplates', () => {
    it('should compare identical templates', async () => {
      const template: CloudFormationTemplate = {
        Resources: {
          MyTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
              KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls-template.json');
      const cdkPath = path.join(tempDir, 'cdk-template.json');

      await fs.writeFile(slsPath, JSON.stringify(template));
      await fs.writeFile(cdkPath, JSON.stringify(template));

      const report = await comparator.compareTemplates(slsPath, cdkPath);

      expect(report.overall_status).toBe('MATCH');
      expect(report.ready_for_import).toBe(true);
      expect(report.resources).toHaveLength(1);
      expect(report.resources[0].status).toBe('MATCH');
    });

    it('should detect acceptable differences', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          LogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: '/aws/lambda/func',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          LogGroupXYZ: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: '/aws/lambda/func',
              RetentionInDays: 7,
            },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls-template.json');
      const cdkPath = path.join(tempDir, 'cdk-template.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);

      expect(report.overall_status).toBe('ACCEPTABLE');
      expect(report.ready_for_import).toBe(true);
      expect(report.resources[0].differences).toHaveLength(1);
      expect(report.resources[0].differences[0].severity).toBe('ACCEPTABLE');
    });

    it('should detect critical differences', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'table-one',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'table-two',
            },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls-template.json');
      const cdkPath = path.join(tempDir, 'cdk-template.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);

      // No matches because TableName differs
      expect(report.resources).toHaveLength(0);
    });

    it('should handle multiple resource types', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          Bucket: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' },
          },
          LogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/func' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableXYZ: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          BucketABC: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' },
          },
          LogGroupDEF: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/func', RetentionInDays: 7 },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls-template.json');
      const cdkPath = path.join(tempDir, 'cdk-template.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);

      expect(report.resources).toHaveLength(3);
      expect(report.summary.total_resources).toBe(3);
    });

    it('should include unmatched resources when requested', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table1' },
          },
          Table2: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table2' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          Table1CDK: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table1' },
          },
          Table3CDK: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table3' },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls-template.json');
      const cdkPath = path.join(tempDir, 'cdk-template.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath, {
        includeUnmatched: true,
      });

      expect(report.summary.unmatched_sls).toBe(1); // Table2
      expect(report.summary.unmatched_cdk).toBe(1); // Table3CDK
    });
  });

  describe('saveReport', () => {
    it('should save JSON report', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls.json');
      const cdkPath = path.join(tempDir, 'cdk.json');
      const reportPath = path.join(tempDir, 'report.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);
      await comparator.saveReport(report, reportPath, 'json');

      const savedContent = await fs.readFile(reportPath, 'utf-8');
      const savedReport = JSON.parse(savedContent);

      expect(savedReport.comparison_id).toBeDefined();
      expect(savedReport.resources).toHaveLength(1);
    });

    it('should save HTML report', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls.json');
      const cdkPath = path.join(tempDir, 'cdk.json');
      const reportPath = path.join(tempDir, 'report.html');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);
      await comparator.saveReport(report, reportPath, 'html');

      const savedContent = await fs.readFile(reportPath, 'utf-8');

      expect(savedContent).toContain('<!DOCTYPE html>');
      expect(savedContent).toContain('my-table');
      expect(savedContent).toContain('AWS::DynamoDB::Table');
    });

    it('should save both JSON and HTML reports', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls.json');
      const cdkPath = path.join(tempDir, 'cdk.json');
      const reportPath = path.join(tempDir, 'report');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const report = await comparator.compareTemplates(slsPath, cdkPath);
      await comparator.saveReport(report, reportPath, 'both');

      const jsonExists = await fs
        .access(path.join(tempDir, 'report.json'))
        .then(() => true)
        .catch(() => false);
      const htmlExists = await fs
        .access(path.join(tempDir, 'report.html'))
        .then(() => true)
        .catch(() => false);

      expect(jsonExists).toBe(true);
      expect(htmlExists).toBe(true);
    });
  });

  describe('validateForImport', () => {
    it('should return ready for matching templates', async () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls.json');
      const cdkPath = path.join(tempDir, 'cdk.json');

      await fs.writeFile(slsPath, JSON.stringify(template));
      await fs.writeFile(cdkPath, JSON.stringify(template));

      const result = await comparator.validateForImport(slsPath, cdkPath);

      expect(result.ready).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should return not ready with blocking issues', async () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
              KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          TableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
              KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
            },
          },
        },
      };

      const slsPath = path.join(tempDir, 'sls.json');
      const cdkPath = path.join(tempDir, 'cdk.json');

      await fs.writeFile(slsPath, JSON.stringify(slsTemplate));
      await fs.writeFile(cdkPath, JSON.stringify(cdkTemplate));

      const result = await comparator.validateForImport(slsPath, cdkPath);

      expect(result.ready).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});
