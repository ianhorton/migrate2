/**
 * Unit Tests for ReferenceResolver (Sprint 2: TDD Phase 2)
 * RED PHASE: Tests written BEFORE implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ReferenceResolver } from '../../../src/modules/generator/utils/reference-resolver';
import { ClassifiedResource } from '../../../src/types';

describe('ReferenceResolver - Sprint 2 Phase 2', () => {
  let resolver: ReferenceResolver;
  let testResources: ClassifiedResource[];

  beforeEach(() => {
    // Setup test resources
    testResources = [
      {
        Type: 'AWS::DynamoDB::Table',
        LogicalId: 'CounterTable',
        Properties: { TableName: 'counter-table' },
        needsImport: true,
        isStateful: true,
        isExplicit: false,
        relatedResources: [],
        groupId: 'databases',
        codeLocation: undefined,
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      },
      {
        Type: 'AWS::S3::Bucket',
        LogicalId: 'DeploymentBucket',
        Properties: { BucketName: 'my-bucket' },
        needsImport: true,
        isStateful: true,
        isExplicit: false,
        relatedResources: [],
        groupId: 'storage',
        codeLocation: undefined,
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      },
      {
        Type: 'AWS::Lambda::Function',
        LogicalId: 'MyFunction',
        Properties: { FunctionName: 'my-function' },
        needsImport: false,
        isStateful: false,
        isExplicit: false,
        relatedResources: [],
        groupId: 'compute',
        codeLocation: undefined,
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      }
    ];

    resolver = new ReferenceResolver(testResources);
  });

  describe('Test 1: Should resolve Ref to construct name', () => {
    it('should resolve table Ref to tableName', () => {
      const result = resolver.resolveResourceReference({ Ref: 'CounterTable' });
      expect(result).toBe('counterTable.tableName');
    });

    it('should resolve bucket Ref to bucketName', () => {
      const result = resolver.resolveResourceReference({ Ref: 'DeploymentBucket' });
      expect(result).toBe('deploymentBucket.bucketName');
    });

    it('should resolve function Ref to functionName', () => {
      const result = resolver.resolveResourceReference({ Ref: 'MyFunction' });
      expect(result).toBe('myFunction.functionName');
    });
  });

  describe('Test 2: Should resolve GetAtt to construct property', () => {
    it('should resolve table Arn attribute to tableArn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['CounterTable', 'Arn'] });
      expect(result).toBe('counterTable.tableArn');
    });

    it('should resolve bucket Arn attribute to bucketArn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['DeploymentBucket', 'Arn'] });
      expect(result).toBe('deploymentBucket.bucketArn');
    });

    it('should resolve function Arn attribute to functionArn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['MyFunction', 'Arn'] });
      expect(result).toBe('myFunction.functionArn');
    });
  });

  describe('Test 3: Should map DynamoDB Arn to tableArn', () => {
    it('should use correct CDK property for DynamoDB Arn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['CounterTable', 'Arn'] });
      expect(result).toContain('.tableArn');
    });

    it('should handle DynamoDB StreamArn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['CounterTable', 'StreamArn'] });
      expect(result).toBe('counterTable.tableStreamArn');
    });
  });

  describe('Test 4: Should map S3 Arn to bucketArn', () => {
    it('should use correct CDK property for S3 Arn', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['DeploymentBucket', 'Arn'] });
      expect(result).toContain('.bucketArn');
    });
  });

  describe('Test 5: Should resolve Fn::Sub with AWS::Region', () => {
    it('should replace AWS::Region with this.region', () => {
      const result = resolver.resolveResourceReference({
        'Fn::Sub': 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:test'
      });
      expect(result).toContain('this.region');
      expect(result).toContain('this.account');
    });
  });

  describe('Test 6: Should resolve Fn::Sub with references', () => {
    it('should replace resource references in Fn::Sub', () => {
      const result = resolver.resolveResourceReference({
        'Fn::Sub': 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${CounterTable}'
      });
      expect(result).toContain('counterTable.tableName');
    });
  });

  describe('Test 7: Should resolve Fn::Join', () => {
    it('should join static strings', () => {
      const result = resolver.resolveResourceReference({
        'Fn::Join': [':', ['arn', 'aws', 'lambda']]
      });
      expect(result).toBe('`arn:aws:lambda`');
    });

    it('should join with resource references', () => {
      const result = resolver.resolveResourceReference({
        'Fn::Join': ['/', [{ 'Fn::GetAtt': ['DeploymentBucket', 'Arn'] }, '*']]
      });
      expect(result).toContain('deploymentBucket.bucketArn');
      expect(result).toContain('*');
    });
  });

  describe('Test 8: Should handle unknown logical IDs', () => {
    it('should return string fallback for unknown resource', () => {
      const result = resolver.resolveResourceReference({ Ref: 'UnknownResource' });
      expect(result).toBe("'UnknownResource'");
    });
  });

  describe('Test 9: Should handle unknown attributes', () => {
    it('should use camelCase fallback for unknown attribute', () => {
      const result = resolver.resolveResourceReference({ 'Fn::GetAtt': ['CounterTable', 'CustomAttribute'] });
      expect(result).toBe('counterTable.customAttribute');
    });
  });

  describe('Test 10: Should construct variable name from logical ID', () => {
    it('should convert PascalCase to camelCase', () => {
      const result = resolver.resolveResourceReference({ Ref: 'CounterTable' });
      expect(result).toMatch(/^counterTable\./);
    });

    it('should handle multi-word logical IDs', () => {
      const result = resolver.resolveResourceReference({ Ref: 'DeploymentBucket' });
      expect(result).toMatch(/^deploymentBucket\./);
    });
  });
});
