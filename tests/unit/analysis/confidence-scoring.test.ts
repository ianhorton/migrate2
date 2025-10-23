/**
 * Unit tests for ConfidenceScoring
 * Sprint 2: Template Analysis
 */

import { describe, it, expect } from '@jest/globals';
import { ConfidenceScoring } from '../../../src/modules/analysis/confidence-scoring';
import type {
  ResourceConfidenceInput,
  ConfidenceScore,
} from '../../../src/modules/analysis/confidence-scoring';
import type { DifferenceClassification } from '../../../src/modules/analysis/difference-analyzer';

describe('ConfidenceScoring', () => {
  let scoring: ConfidenceScoring;

  beforeEach(() => {
    scoring = new ConfidenceScoring();
  });

  describe('calculateResourceConfidence', () => {
    it('should return high confidence for fully resolved resource with no issues', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        physicalIdConfidence: 1.0,
        classifications: [],
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(1.0);
      expect(score.recommendation).toBe('auto-proceed');
      expect(score.factors).toHaveLength(1);
      expect(score.factors[0].factor).toBe('Physical ID Confirmed');
    });

    it('should reduce confidence when physical ID is unknown', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: false,
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(0.3);
      expect(score.recommendation).toBe('human-required');
      expect(score.factors.some((f) => f.factor === 'Physical ID Unknown')).toBe(true);
    });

    it('should reduce confidence for critical differences', () => {
      const classifications: DifferenceClassification[] = [
        {
          difference: {
            property: 'TableName',
            slsValue: 'table1',
            cdkValue: 'table2',
            severity: 'CRITICAL',
            explanation: 'Name mismatch',
            autoFixable: false,
          },
          category: 'critical',
          autoResolvable: false,
          requiresHumanReview: true,
          explanation: 'Critical difference',
        },
      ];

      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        classifications,
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBeLessThan(0.5);
      expect(score.recommendation).toBe('human-required');
      expect(score.factors.some((f) => f.factor === 'Critical Differences')).toBe(true);
    });

    it('should reduce confidence for warning differences', () => {
      const classifications: DifferenceClassification[] = [
        {
          difference: {
            property: 'BillingMode',
            slsValue: 'PROVISIONED',
            cdkValue: 'PAY_PER_REQUEST',
            severity: 'WARNING',
            explanation: 'Billing mode',
            autoFixable: false,
          },
          category: 'warning',
          autoResolvable: false,
          requiresHumanReview: true,
          explanation: 'Warning difference',
        },
        {
          difference: {
            property: 'Environment',
            slsValue: {},
            cdkValue: {},
            severity: 'WARNING',
            explanation: 'Environment',
            autoFixable: false,
          },
          category: 'warning',
          autoResolvable: false,
          requiresHumanReview: true,
          explanation: 'Warning difference',
        },
      ];

      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::Lambda::Function',
        physicalIdResolved: true,
        classifications,
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBeLessThan(1.0);
      expect(score.overall).toBeGreaterThan(0.5);
      expect(score.factors.some((f) => f.factor === 'Warning Differences')).toBe(true);
    });

    it('should not penalize acceptable differences', () => {
      const classifications: DifferenceClassification[] = [
        {
          difference: {
            property: 'Metadata',
            slsValue: undefined,
            cdkValue: {},
            severity: 'ACCEPTABLE',
            explanation: 'Metadata',
            autoFixable: false,
          },
          category: 'acceptable',
          autoResolvable: true,
          requiresHumanReview: false,
          explanation: 'Acceptable',
        },
      ];

      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        classifications,
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(1.0);
      expect(score.recommendation).toBe('auto-proceed');
    });

    it('should reduce confidence for major drift', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::IAM::Role',
        physicalIdResolved: true,
        hasDrift: true,
        driftSeverity: 'major',
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(0.4);
      expect(score.recommendation).toBe('human-required');
      expect(score.factors.some((f) => f.factor === 'Major Drift Detected')).toBe(true);
    });

    it('should slightly reduce confidence for minor drift', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::Lambda::Function',
        physicalIdResolved: true,
        hasDrift: true,
        driftSeverity: 'minor',
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(0.7);
      expect(score.recommendation).toBe('review-recommended');
      expect(score.factors.some((f) => f.factor === 'Minor Drift Detected')).toBe(true);
    });

    it('should reduce confidence for complex resource types', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::RDS::DBInstance',
        physicalIdResolved: true,
      };

      const score = scoring.calculateResourceConfidence(input);

      expect(score.overall).toBe(0.8);
      expect(score.recommendation).toBe('review-recommended');
      expect(score.factors.some((f) => f.factor === 'Complex Resource Type')).toBe(true);
    });
  });

  describe('calculateMigrationConfidence', () => {
    it('should return high confidence when all resources have high confidence', () => {
      const resourceScores: ConfidenceScore[] = [
        {
          overall: 1.0,
          factors: [],
          recommendation: 'auto-proceed',
          reasoning: 'No issues',
        },
        {
          overall: 0.95,
          factors: [],
          recommendation: 'auto-proceed',
          reasoning: 'No issues',
        },
        {
          overall: 0.9,
          factors: [],
          recommendation: 'auto-proceed',
          reasoning: 'No issues',
        },
      ];

      const score = scoring.calculateMigrationConfidence(resourceScores);

      expect(score.overall).toBeGreaterThan(0.9);
      expect(score.recommendation).toBe('auto-proceed');
    });

    it('should use minimum score as weakest link', () => {
      const resourceScores: ConfidenceScore[] = [
        {
          overall: 1.0,
          factors: [],
          recommendation: 'auto-proceed',
          reasoning: 'No issues',
        },
        {
          overall: 0.3,
          factors: [],
          recommendation: 'human-required',
          reasoning: 'Critical issues',
        },
        {
          overall: 0.9,
          factors: [],
          recommendation: 'auto-proceed',
          reasoning: 'No issues',
        },
      ];

      const score = scoring.calculateMigrationConfidence(resourceScores);

      expect(score.overall).toBeLessThan(0.5);
      expect(score.recommendation).toBe('human-required');
    });

    it('should recommend review when some resources need review', () => {
      const resourceScores: ConfidenceScore[] = [
        {
          overall: 0.85,
          factors: [],
          recommendation: 'review-recommended',
          reasoning: 'Minor issues',
        },
        {
          overall: 0.75,
          factors: [],
          recommendation: 'review-recommended',
          reasoning: 'Minor issues',
        },
      ];

      const score = scoring.calculateMigrationConfidence(resourceScores);

      expect(score.overall).toBeGreaterThan(0.5);
      expect(score.overall).toBeLessThan(0.9);
      expect(score.factors.some((f) => f.factor === 'Resources Requiring Review')).toBe(true);
    });

    it('should handle empty resource array', () => {
      const score = scoring.calculateMigrationConfidence([]);

      expect(score.overall).toBe(1.0);
      expect(score.recommendation).toBe('auto-proceed');
      expect(score.reasoning).toContain('No resources');
    });
  });

  describe('formatConfidence', () => {
    it('should format high confidence with checkmark', () => {
      const formatted = scoring.formatConfidence(0.95);
      expect(formatted).toContain('95.0%');
      expect(formatted).toContain('✅');
    });

    it('should format medium confidence with warning', () => {
      const formatted = scoring.formatConfidence(0.75);
      expect(formatted).toContain('75.0%');
      expect(formatted).toContain('⚠️');
    });

    it('should format low confidence with X mark', () => {
      const formatted = scoring.formatConfidence(0.45);
      expect(formatted).toContain('45.0%');
      expect(formatted).toContain('❌');
    });
  });

  describe('getConfidenceColor', () => {
    it('should return green for high confidence', () => {
      expect(scoring.getConfidenceColor(0.95)).toBe('green');
    });

    it('should return yellow for medium confidence', () => {
      expect(scoring.getConfidenceColor(0.75)).toBe('yellow');
    });

    it('should return red for low confidence', () => {
      expect(scoring.getConfidenceColor(0.45)).toBe('red');
    });
  });

  describe('recommendation thresholds', () => {
    it('should recommend auto-proceed for score >= 0.9', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        physicalIdConfidence: 0.95,
      };

      const score = scoring.calculateResourceConfidence(input);
      expect(score.recommendation).toBe('auto-proceed');
    });

    it('should recommend review for score between 0.7 and 0.9', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        physicalIdConfidence: 0.8,
      };

      const score = scoring.calculateResourceConfidence(input);
      expect(score.recommendation).toBe('review-recommended');
    });

    it('should require human intervention for score < 0.7', () => {
      const input: ResourceConfidenceInput = {
        resourceType: 'AWS::DynamoDB::Table',
        physicalIdResolved: true,
        physicalIdConfidence: 0.5,
      };

      const score = scoring.calculateResourceConfidence(input);
      expect(score.recommendation).toBe('human-required');
    });
  });
});
