/**
 * Unit tests for resource-matcher module
 */

import {
  matchResources,
  matchResourcesByType,
  findUnmatchedResources,
} from '../../../src/modules/comparator/resource-matcher';
import type {
  CloudFormationTemplate,
  ResourceMatch,
} from '../../../src/types/cloudformation';

describe('resource-matcher', () => {
  describe('matchResourcesByType', () => {
    it('should match DynamoDB tables by TableName', () => {
      const slsTemplate: CloudFormationTemplate = {
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

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          MyTableABC123: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
              KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::DynamoDB::Table'
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        slsLogicalId: 'MyTable',
        cdkLogicalId: 'MyTableABC123',
        physicalId: 'my-table',
        resourceType: 'AWS::DynamoDB::Table',
      });
    });

    it('should match LogGroups by LogGroupName', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          MyLogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: '/aws/lambda/my-function',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          MyLogGroupXYZ789: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: '/aws/lambda/my-function',
              RetentionInDays: 7,
            },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::Logs::LogGroup'
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].physicalId).toBe('/aws/lambda/my-function');
    });

    it('should match S3 buckets by BucketName', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          MyBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'my-bucket-name',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          MyBucketDEF456: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'my-bucket-name',
              VersioningConfiguration: {
                Status: 'Enabled',
              },
            },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::S3::Bucket'
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].physicalId).toBe('my-bucket-name');
    });

    it('should return empty array when no matches found', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'table-one',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          Table2: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'table-two',
            },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::DynamoDB::Table'
      );

      expect(matches).toHaveLength(0);
    });

    it('should return empty array for unsupported resource types', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          MyResource: {
            Type: 'AWS::UnknownService::Resource',
            Properties: {
              SomeProperty: 'value',
            },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          MyResourceCDK: {
            Type: 'AWS::UnknownService::Resource',
            Properties: {
              SomeProperty: 'value',
            },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::UnknownService::Resource'
      );

      expect(matches).toHaveLength(0);
    });

    it('should handle multiple resources of same type', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-one' },
          },
          Table2: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-two' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          Table1CDK: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-one' },
          },
          Table2CDK: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table-two' },
          },
        },
      };

      const matches = matchResourcesByType(
        slsTemplate,
        cdkTemplate,
        'AWS::DynamoDB::Table'
      );

      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.physicalId).sort()).toEqual([
        'table-one',
        'table-two',
      ]);
    });
  });

  describe('matchResources', () => {
    it('should match resources across multiple types', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          MyTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          MyLogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/func' },
          },
          MyBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          MyTableABC: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          MyLogGroupXYZ: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/aws/lambda/func' },
          },
          MyBucketDEF: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'my-bucket' },
          },
        },
      };

      const matches = matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(3);
      expect(matches.map((m) => m.resourceType).sort()).toEqual([
        'AWS::DynamoDB::Table',
        'AWS::Logs::LogGroup',
        'AWS::S3::Bucket',
      ]);
    });

    it('should handle templates with no matching resources', () => {
      const slsTemplate: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'sls-table' },
          },
        },
      };

      const cdkTemplate: CloudFormationTemplate = {
        Resources: {
          Table2: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'cdk-table' },
          },
        },
      };

      const matches = matchResources(slsTemplate, cdkTemplate);

      expect(matches).toHaveLength(0);
    });
  });

  describe('findUnmatchedResources', () => {
    it('should find unmatched resources in SLS template', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Matched: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'matched' },
          },
          Unmatched1: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'unmatched1' },
          },
          Unmatched2: {
            Type: 'AWS::Logs::LogGroup',
            Properties: { LogGroupName: '/unmatched2' },
          },
        },
      };

      const matches: ResourceMatch[] = [
        {
          slsLogicalId: 'Matched',
          cdkLogicalId: 'MatchedCDK',
          physicalId: 'matched',
          resourceType: 'AWS::DynamoDB::Table',
          slsResource: template.Resources.Matched,
          cdkResource: template.Resources.Matched,
        },
      ];

      const unmatched = findUnmatchedResources(template, matches, 'sls');

      expect(unmatched).toHaveLength(2);
      expect(unmatched.sort()).toEqual(['Unmatched1', 'Unmatched2']);
    });

    it('should find unmatched resources in CDK template', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          MatchedCDK: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'matched' },
          },
          UnmatchedCDK1: {
            Type: 'AWS::Lambda::Function',
            Properties: { FunctionName: 'func1' },
          },
        },
      };

      const matches: ResourceMatch[] = [
        {
          slsLogicalId: 'Matched',
          cdkLogicalId: 'MatchedCDK',
          physicalId: 'matched',
          resourceType: 'AWS::DynamoDB::Table',
          slsResource: template.Resources.MatchedCDK,
          cdkResource: template.Resources.MatchedCDK,
        },
      ];

      const unmatched = findUnmatchedResources(template, matches, 'cdk');

      expect(unmatched).toHaveLength(1);
      expect(unmatched).toEqual(['UnmatchedCDK1']);
    });

    it('should return empty array when all resources matched', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Resource1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table1' },
          },
          Resource2: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'bucket1' },
          },
        },
      };

      const matches: ResourceMatch[] = [
        {
          slsLogicalId: 'Resource1',
          cdkLogicalId: 'Resource1CDK',
          physicalId: 'table1',
          resourceType: 'AWS::DynamoDB::Table',
          slsResource: template.Resources.Resource1,
          cdkResource: template.Resources.Resource1,
        },
        {
          slsLogicalId: 'Resource2',
          cdkLogicalId: 'Resource2CDK',
          physicalId: 'bucket1',
          resourceType: 'AWS::S3::Bucket',
          slsResource: template.Resources.Resource2,
          cdkResource: template.Resources.Resource2,
        },
      ];

      const unmatched = findUnmatchedResources(template, matches, 'sls');

      expect(unmatched).toHaveLength(0);
    });
  });
});
