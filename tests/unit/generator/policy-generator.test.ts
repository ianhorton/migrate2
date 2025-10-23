/**
 * Unit Tests for PolicyGenerator (Sprint 2: TDD Phase 3)
 * RED PHASE: Tests written BEFORE implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PolicyGenerator } from '../../../src/modules/generator/utils/policy-generator';
import { ReferenceResolver } from '../../../src/modules/generator/utils/reference-resolver';
import { ClassifiedResource } from '../../../src/types';

describe('PolicyGenerator - Sprint 2 Phase 3', () => {
  let generator: PolicyGenerator;
  let resolver: ReferenceResolver;
  let testResources: ClassifiedResource[];

  beforeEach(() => {
    testResources = [
      {
        Type: 'AWS::DynamoDB::Table',
        LogicalId: 'MyTable',
        Properties: { TableName: 'my-table' },
        needsImport: true,
        isStateful: true,
        isExplicit: false,
        relatedResources: [],
        groupId: 'databases',
        codeLocation: undefined,
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      }
    ];

    resolver = new ReferenceResolver(testResources);
    generator = new PolicyGenerator(testResources, resolver);
  });

  describe('Test 1: Generate PolicyStatement with actions', () => {
    it('should generate basic PolicyStatement with single action', () => {
      const statement = {
        Effect: 'Allow',
        Action: 'dynamodb:GetItem',
        Resource: '*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain('new iam.PolicyStatement({');
      expect(result.code).toContain('effect: iam.Effect.ALLOW');
      expect(result.code).toContain('actions: ["dynamodb:GetItem"]');
      expect(result.actions).toEqual(['dynamodb:GetItem']);
    });

    it('should generate PolicyStatement with multiple actions', () => {
      const statement = {
        Effect: 'Allow',
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
        Resource: '*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain('actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]');
      expect(result.actions).toHaveLength(3);
    });
  });

  describe('Test 2: Handle single action string', () => {
    it('should normalize single action string to array', () => {
      const statement = {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: '*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.actions).toEqual(['s3:GetObject']);
    });
  });

  describe('Test 3: Handle action array', () => {
    it('should handle array of actions', () => {
      const statement = {
        Effect: 'Allow',
        Action: ['logs:CreateLogGroup', 'logs:CreateLogStream'],
        Resource: '*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.actions).toHaveLength(2);
      expect(result.actions).toContain('logs:CreateLogGroup');
      expect(result.actions).toContain('logs:CreateLogStream');
    });
  });

  describe('Test 4: Resolve resource references', () => {
    it('should resolve Fn::GetAtt resource reference', () => {
      const statement = {
        Effect: 'Allow',
        Action: 'dynamodb:GetItem',
        Resource: { 'Fn::GetAtt': ['MyTable', 'Arn'] }
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain('myTable.tableArn');
      expect(result.resources).toContain('myTable.tableArn');
    });
  });

  describe('Test 5: Handle resource ARN strings', () => {
    it('should handle wildcard resource', () => {
      const statement = {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: '*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain("resources: ['*']");
      expect(result.resources).toContain("'*'");
    });

    it('should handle literal ARN string', () => {
      const statement = {
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::my-bucket/*'
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain('arn:aws:s3:::my-bucket/*');
    });
  });

  describe('Test 6: Generate addToRolePolicy code', () => {
    it('should generate complete addToRolePolicy call', () => {
      const statement = {
        Effect: 'Allow',
        Action: 'dynamodb:GetItem',
        Resource: '*'
      };

      const result = generator.generateAddToRolePolicy('myRole', statement);

      expect(result).toContain('myRole.addToRolePolicy(');
      expect(result).toContain('new iam.PolicyStatement({');
      expect(result).toContain('})');
      expect(result).toContain(');');
    });
  });

  describe('Test 7: Handle conditions', () => {
    it('should generate conditions in PolicyStatement', () => {
      const statement = {
        Effect: 'Allow',
        Action: 's3:PutObject',
        Resource: '*',
        Condition: {
          'StringEquals': {
            's3:x-amz-server-side-encryption': 'AES256'
          }
        }
      };

      const result = generator.generatePolicyStatement(statement);

      expect(result.code).toContain('conditions:');
      expect(result.conditions).toBeDefined();
    });
  });

  describe('Test 8: Group statements by service', () => {
    it('should group statements by AWS service', () => {
      const statements = [
        {
          Effect: 'Allow',
          Action: 'dynamodb:GetItem',
          Resource: '*'
        },
        {
          Effect: 'Allow',
          Action: 's3:GetObject',
          Resource: '*'
        },
        {
          Effect: 'Allow',
          Action: 'dynamodb:PutItem',
          Resource: '*'
        }
      ];

      const grouped = generator.groupStatementsByService(statements);

      expect(grouped.has('dynamodb')).toBe(true);
      expect(grouped.has('s3')).toBe(true);
      expect(grouped.get('dynamodb')).toHaveLength(2);
      expect(grouped.get('s3')).toHaveLength(1);
    });
  });
});
