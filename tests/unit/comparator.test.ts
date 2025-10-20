/**
 * Comparator Module Tests
 * Tests template comparison, resource matching, and property diff analysis
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ComparatorModule } from '@/modules/comparator';

describe('ComparatorModule', () => {
  let comparator: ComparatorModule;
  let fixturesPath: string;

  beforeEach(() => {
    comparator = new ComparatorModule();
    fixturesPath = path.join(__dirname, '../fixtures');
  });

  describe('loadTemplates', () => {
    it('should load both SLS and CDK templates', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const templates = await comparator.loadTemplates(slsPath, cdkPath);

      expect(templates).toHaveProperty('sls');
      expect(templates).toHaveProperty('cdk');
      expect(templates.sls).toHaveProperty('Resources');
      expect(templates.cdk).toHaveProperty('Resources');
    });

    it('should throw on missing template files', async () => {
      await expect(
        comparator.loadTemplates('/nonexistent/sls.json', '/nonexistent/cdk.json')
      ).rejects.toThrow();
    });

    it('should validate template format', async () => {
      const invalidTemplate = path.join(fixturesPath, 'invalid.json');
      await fs.writeFile(invalidTemplate, '{ invalid json }');

      await expect(
        comparator.loadTemplates(invalidTemplate, invalidTemplate)
      ).rejects.toThrow();

      await fs.unlink(invalidTemplate);
    });
  });

  describe('matchResources', () => {
    it('should match resources by physical ID (TableName)', async () => {
      const slsTemplate = {
        Resources: {
          MyTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'test-table' }
          }
        }
      };

      const cdkTemplate = {
        Resources: {
          MyTableCDK123: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'test-table' }
          }
        }
      };

      const matches = comparator.matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        slsLogicalId: 'MyTable',
        cdkLogicalId: 'MyTableCDK123',
        physicalId: 'test-table',
        resourceType: 'AWS::DynamoDB::Table'
      });
    });

    it('should match S3 buckets by BucketName', async () => {
      const slsTemplate = {
        Resources: {
          MyBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' }
          }
        }
      };

      const cdkTemplate = {
        Resources: {
          Bucket123: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' }
          }
        }
      };

      const matches = comparator.matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(1);
      expect(matches[0].physicalId).toBe('my-bucket');
    });

    it('should match LogGroups by LogGroupName', async () => {
      const slsTemplate = {
        Resources: {
          MyLogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/test' }
          }
        }
      };

      const cdkTemplate = {
        Resources: {
          LogGroup456: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/test' }
          }
        }
      };

      const matches = comparator.matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(1);
      expect(matches[0].physicalId).toBe('/aws/lambda/test');
    });

    it('should return empty array for no matches', () => {
      const slsTemplate = {
        Resources: {
          TableA: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-a' }
          }
        }
      };

      const cdkTemplate = {
        Resources: {
          TableB: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-b' }
          }
        }
      };

      const matches = comparator.matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(0);
    });
  });

  describe('compareResource', () => {
    it('should return MATCH for identical resources', () => {
      const slsResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: 'test-table',
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }]
        }
      };

      const cdkResource = { ...slsResource };

      const result = comparator.compareResource(slsResource, cdkResource);

      expect(result.status).toBe('MATCH');
      expect(result.differences).toHaveLength(0);
    });

    it('should detect ACCEPTABLE differences (added properties)', () => {
      const slsResource = {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/test'
        }
      };

      const cdkResource = {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/test',
          RetentionInDays: 7
        }
      };

      const result = comparator.compareResource(slsResource, cdkResource);

      expect(result.status).toBe('ACCEPTABLE');
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({
        property: 'RetentionInDays',
        severity: 'ACCEPTABLE',
        slsValue: undefined,
        cdkValue: 7
      });
    });

    it('should detect CRITICAL differences (key properties)', () => {
      const slsResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: 'table-a',
          BillingMode: 'PAY_PER_REQUEST'
        }
      };

      const cdkResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: 'table-b',
          BillingMode: 'PAY_PER_REQUEST'
        }
      };

      const result = comparator.compareResource(slsResource, cdkResource);

      expect(result.status).toBe('CRITICAL');
      expect(result.differences).toContainEqual(
        expect.objectContaining({
          property: 'TableName',
          severity: 'CRITICAL'
        })
      );
    });

    it('should detect WARNING for configuration changes', () => {
      const slsResource = {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: 'my-bucket',
          VersioningConfiguration: { Status: 'Enabled' }
        }
      };

      const cdkResource = {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: 'my-bucket'
          // Missing VersioningConfiguration
        }
      };

      const result = comparator.compareResource(slsResource, cdkResource);

      expect(result.status).toBe('WARNING');
      expect(result.differences).toContainEqual(
        expect.objectContaining({
          property: 'VersioningConfiguration',
          severity: 'WARNING'
        })
      );
    });

    it('should ignore metadata properties', () => {
      const slsResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: { TableName: 'test-table' }
      };

      const cdkResource = {
        Type: 'AWS::DynamoDB::Table',
        Properties: { TableName: 'test-table' },
        Metadata: { SomeData: 'value' },
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain'
      };

      const result = comparator.compareResource(slsResource, cdkResource);

      expect(result.status).toBe('MATCH');
      expect(result.differences).toHaveLength(0);
    });
  });

  describe('deepEqual', () => {
    it('should compare primitive values', () => {
      expect(comparator.deepEqual('hello', 'hello')).toBe(true);
      expect(comparator.deepEqual(42, 42)).toBe(true);
      expect(comparator.deepEqual(true, true)).toBe(true);
      expect(comparator.deepEqual('a', 'b')).toBe(false);
    });

    it('should compare arrays', () => {
      expect(comparator.deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(comparator.deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(comparator.deepEqual([1, 2], [2, 1])).toBe(false);
    });

    it('should compare nested objects', () => {
      const obj1 = {
        a: { b: { c: 'd' } },
        e: [1, 2, { f: 'g' }]
      };
      const obj2 = {
        a: { b: { c: 'd' } },
        e: [1, 2, { f: 'g' }]
      };

      expect(comparator.deepEqual(obj1, obj2)).toBe(true);
    });

    it('should handle null and undefined', () => {
      expect(comparator.deepEqual(null, null)).toBe(true);
      expect(comparator.deepEqual(undefined, undefined)).toBe(true);
      expect(comparator.deepEqual(null, undefined)).toBe(false);
    });
  });

  describe('generateReport', () => {
    it('should generate comparison report', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const comparison = await comparator.compare(slsPath, cdkPath);
      const report = comparator.generateReport(comparison);

      expect(report).toHaveProperty('comparison_id');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('resources');
      expect(report).toHaveProperty('overall_status');
      expect(report).toHaveProperty('ready_for_import');
    });

    it('should calculate summary statistics', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const comparison = await comparator.compare(slsPath, cdkPath);
      const report = comparator.generateReport(comparison);

      expect(report.summary).toHaveProperty('total_resources');
      expect(report.summary).toHaveProperty('matched');
      expect(report.summary).toHaveProperty('status');
      expect(report.summary.status).toHaveProperty('MATCH');
      expect(report.summary.status).toHaveProperty('ACCEPTABLE');
      expect(report.summary.status).toHaveProperty('WARNING');
      expect(report.summary.status).toHaveProperty('CRITICAL');
    });

    it('should identify blocking issues', async () => {
      const slsTemplate = {
        Resources: {
          TableA: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-a' }
          }
        }
      };

      const cdkTemplate = {
        Resources: {
          TableB: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-b' }
          }
        }
      };

      const comparison = await comparator.compareTemplates(slsTemplate, cdkTemplate);
      const report = comparator.generateReport(comparison);

      expect(report.ready_for_import).toBe(false);
      expect(report.blocking_issues.length).toBeGreaterThan(0);
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate valid HTML', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const comparison = await comparator.compare(slsPath, cdkPath);
      const html = comparator.generateHTMLReport(comparison);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('Comparison Report');
      expect(html).toContain('</html>');
    });

    it('should include resource details in HTML', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const comparison = await comparator.compare(slsPath, cdkPath);
      const html = comparator.generateHTMLReport(comparison);

      expect(html).toContain('AWS::DynamoDB::Table');
      expect(html).toContain('migration-sandbox-table');
    });

    it('should color-code status', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const comparison = await comparator.compare(slsPath, cdkPath);
      const html = comparator.generateHTMLReport(comparison);

      expect(html).toContain('status-MATCH');
      expect(html).toContain('status-ACCEPTABLE');
    });
  });

  describe('Integration - Full Comparison', () => {
    it('should perform end-to-end comparison', async () => {
      const slsPath = path.join(fixturesPath, 'cloudformation-sls.json');
      const cdkPath = path.join(fixturesPath, 'cloudformation-cdk.json');

      const result = await comparator.compare(slsPath, cdkPath);

      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('comparisons');
      expect(result.matches.length).toBeGreaterThan(0);

      // Verify DynamoDB table match
      const tableMatch = result.matches.find(
        m => m.resourceType === 'AWS::DynamoDB::Table'
      );
      expect(tableMatch).toBeDefined();
      expect(tableMatch?.physicalId).toBe('migration-sandbox-table');

      // Verify LogGroup match with acceptable difference
      const logGroupComparison = result.comparisons.find(
        c => c.resourceType === 'AWS::Logs::LogGroup'
      );
      expect(logGroupComparison).toBeDefined();
      expect(logGroupComparison?.status).toBe('ACCEPTABLE');
    });
  });
});
