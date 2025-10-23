/**
 * ConfidenceScoring Unit Tests
 * Tests confidence calculation for migration decisions
 */

import { describe, it, expect } from '@jest/globals';

describe('ConfidenceScoring', () => {
  describe('Resource-Level Confidence', () => {
    it('should give high confidence with exact physical ID match', () => {
      // Arrange
      const resource = {
        logicalId: 'UsersTable',
        type: 'AWS::DynamoDB::Table',
        properties: { TableName: 'users-table-dev' }
      };

      const matchResult = {
        bestMatch: { physicalId: 'users-table-dev', confidence: 0.95 }
      };

      // Act
      const confidence = calculateResourceConfidence(resource, matchResult);

      // Assert
      expect(confidence.overall).toBeGreaterThan(0.9);
      expect(confidence.recommendation).toBe('auto-proceed');
      expect(confidence.factors.some(f => f.factor.includes('Physical ID'))).toBe(true);
    });

    it('should reduce confidence with template differences', () => {
      // Arrange
      const resource = {
        logicalId: 'UsersTable',
        type: 'AWS::DynamoDB::Table'
      };

      const matchResult = {
        bestMatch: { physicalId: 'users-table-dev', confidence: 0.9 }
      };

      const differences = [
        { category: 'critical', path: 'Properties.TableName' },
        { category: 'warning', path: 'Properties.BillingMode' }
      ];

      // Act
      const confidence = calculateResourceConfidence(resource, matchResult, differences);

      // Assert
      expect(confidence.overall).toBeLessThan(0.5); // Critical difference heavily impacts
      expect(confidence.recommendation).toBe('human-required');
      expect(confidence.factors.some(f => f.factor.includes('Critical'))).toBe(true);
    });

    it('should adjust for resource complexity', () => {
      // Arrange
      const complexResource = {
        logicalId: 'MyDatabase',
        type: 'AWS::RDS::DBInstance' // Complex resource type
      };

      const simpleResource = {
        logicalId: 'MyBucket',
        type: 'AWS::S3::Bucket' // Simple resource type
      };

      // Act
      const complexConfidence = calculateResourceConfidence(complexResource);
      const simpleConfidence = calculateResourceConfidence(simpleResource);

      // Assert
      expect(complexConfidence.overall).toBeLessThan(simpleConfidence.overall);
      expect(complexConfidence.factors.some(f => f.factor.includes('Complex'))).toBe(true);
    });

    it('should handle missing physical ID match', () => {
      // Arrange
      const resource = {
        logicalId: 'UnknownTable',
        type: 'AWS::DynamoDB::Table'
      };

      const matchResult = {
        bestMatch: null,
        matches: []
      };

      // Act
      const confidence = calculateResourceConfidence(resource, matchResult);

      // Assert
      expect(confidence.overall).toBeLessThan(0.6);
      expect(confidence.recommendation).toBe('human-required');
      expect(confidence.factors.some(f => f.factor.includes('Unknown'))).toBe(true);
    });
  });

  describe('Overall Migration Confidence', () => {
    it('should calculate overall confidence from multiple resources', () => {
      // Arrange
      const resourceScores = [
        { overall: 0.95, recommendation: 'auto-proceed' },
        { overall: 0.92, recommendation: 'auto-proceed' },
        { overall: 0.88, recommendation: 'review-recommended' },
        { overall: 0.45, recommendation: 'human-required' }
      ];

      // Act
      const overallConfidence = calculateOverallConfidence(resourceScores);

      // Assert
      expect(overallConfidence.overall).toBeCloseTo(0.8, 1); // Average
      expect(overallConfidence.totalResources).toBe(4);
      expect(overallConfidence.humanReviewRequired).toBe(1);
    });

    it('should identify blocking resources', () => {
      // Arrange
      const resourceScores = [
        { logicalId: 'Table1', overall: 0.95, recommendation: 'auto-proceed' },
        { logicalId: 'Table2', overall: 0.3, recommendation: 'human-required' },
        { logicalId: 'Bucket1', overall: 0.85, recommendation: 'review-recommended' }
      ];

      // Act
      const blocking = resourceScores.filter(s => s.recommendation === 'human-required');

      // Assert
      expect(blocking).toHaveLength(1);
      expect(blocking[0].logicalId).toBe('Table2');
    });

    it('should weight stateful resources more heavily', () => {
      // Arrange
      const resources = [
        { logicalId: 'Table', type: 'AWS::DynamoDB::Table', isStateful: true, confidence: 0.7 },
        { logicalId: 'Role', type: 'AWS::IAM::Role', isStateful: false, confidence: 0.7 }
      ];

      // Act
      const weighted = resources.map(r => ({
        ...r,
        weightedConfidence: r.confidence * (r.isStateful ? 1.0 : 0.8)
      }));

      // Assert
      expect(weighted[0].weightedConfidence).toBeGreaterThan(weighted[1].weightedConfidence);
    });
  });

  describe('Confidence Factors', () => {
    it('should list all factors affecting confidence', () => {
      // Arrange
      const resource = {
        logicalId: 'UsersTable',
        type: 'AWS::DynamoDB::Table'
      };

      const matchResult = {
        bestMatch: { physicalId: 'users-table-dev', confidence: 0.85 }
      };

      const differences = [
        { category: 'warning', path: 'Properties.BillingMode' }
      ];

      // Act
      const confidence = calculateResourceConfidence(resource, matchResult, differences);

      // Assert
      expect(confidence.factors.length).toBeGreaterThanOrEqual(2);
      expect(confidence.factors.every(f => f.factor && f.impact && f.description)).toBe(true);
      expect(confidence.factors.every(f => f.impact >= 0 && f.impact <= 1)).toBe(true);
    });

    it('should explain impact of each factor', () => {
      // Arrange
      const factors = [
        {
          factor: 'Physical ID Match',
          impact: 0.9,
          description: 'Matched with 90% confidence'
        },
        {
          factor: 'Warning Differences',
          impact: 0.7,
          description: '2 warnings found'
        }
      ];

      // Act
      const explanations = factors.map(f => f.description);

      // Assert
      expect(explanations.every(e => e.length > 0)).toBe(true);
      expect(explanations[0]).toContain('90%');
      expect(explanations[1]).toContain('warnings');
    });
  });

  describe('Recommendation Logic', () => {
    it('should recommend auto-proceed for >90% confidence', () => {
      // Arrange
      const highConfidence = { overall: 0.92 };

      // Act
      const recommendation = getRecommendation(highConfidence.overall);

      // Assert
      expect(recommendation).toBe('auto-proceed');
    });

    it('should recommend review for 70-90% confidence', () => {
      // Arrange
      const mediumConfidence = { overall: 0.78 };

      // Act
      const recommendation = getRecommendation(mediumConfidence.overall);

      // Assert
      expect(recommendation).toBe('review-recommended');
    });

    it('should require human intervention for <70% confidence', () => {
      // Arrange
      const lowConfidence = { overall: 0.55 };

      // Act
      const recommendation = getRecommendation(lowConfidence.overall);

      // Assert
      expect(recommendation).toBe('human-required');
    });

    it('should override recommendation for critical differences', () => {
      // Arrange
      const confidence = {
        overall: 0.92, // High score
        hasCriticalDifferences: true
      };

      // Act
      const recommendation = getRecommendation(
        confidence.overall,
        confidence.hasCriticalDifferences
      );

      // Assert
      expect(recommendation).toBe('human-required'); // Override due to critical issue
    });
  });

  describe('Step-Level Confidence', () => {
    it('should calculate confidence for discovery step', () => {
      // Arrange
      const step = 'DISCOVERY';
      const resources = [
        { physicalId: 'table-1', matchConfidence: 0.95 },
        { physicalId: 'table-2', matchConfidence: 0.88 },
        { physicalId: null, matchConfidence: 0.0 }
      ];

      // Act
      const confidence = calculateStepConfidence(step, { resources });

      // Assert
      expect(confidence.overall).toBeCloseTo(0.61, 1); // Average
      expect(confidence.step).toBe('DISCOVERY');
      expect(confidence.issues).toContain('1 resource without physical ID');
    });

    it('should calculate confidence for comparison step', () => {
      // Arrange
      const step = 'COMPARISON';
      const differences = [
        { category: 'acceptable' },
        { category: 'acceptable' },
        { category: 'warning' },
        { category: 'critical' }
      ];

      // Act
      const confidence = calculateStepConfidence(step, { differences });

      // Assert
      expect(confidence.overall).toBeLessThan(0.7); // Critical difference present
      expect(confidence.issues).toContain('1 critical difference');
    });

    it('should calculate confidence for import preparation step', () => {
      // Arrange
      const step = 'IMPORT_PREPARATION';
      const resources = [
        { logicalId: 'Table1', physicalId: 'table-1', differences: [] },
        { logicalId: 'Table2', physicalId: 'table-2', differences: [{ category: 'warning' }] }
      ];

      // Act
      const confidence = calculateStepConfidence(step, { resources });

      // Assert
      expect(confidence.overall).toBeGreaterThan(0.7);
      expect(confidence.readyForImport).toBe(true);
    });
  });

  describe('Confidence Trends', () => {
    it('should track confidence changes over time', () => {
      // Arrange
      const history = [
        { step: 'SCAN', confidence: 1.0, timestamp: new Date('2024-01-01T10:00:00Z') },
        { step: 'DISCOVERY', confidence: 0.85, timestamp: new Date('2024-01-01T10:05:00Z') },
        { step: 'COMPARISON', confidence: 0.75, timestamp: new Date('2024-01-01T10:10:00Z') }
      ];

      // Act
      const trend = calculateTrend(history);

      // Assert
      expect(trend.direction).toBe('decreasing');
      expect(trend.totalDrop).toBeCloseTo(0.25, 2);
    });

    it('should identify confidence improvements after interventions', () => {
      // Arrange
      const beforeIntervention = { overall: 0.6, recommendation: 'human-required' };
      const afterIntervention = { overall: 0.92, recommendation: 'auto-proceed' };

      // Act
      const improvement = afterIntervention.overall - beforeIntervention.overall;

      // Assert
      expect(improvement).toBeCloseTo(0.32, 2);
      expect(improvement).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero resources', () => {
      // Arrange
      const resourceScores: any[] = [];

      // Act
      const confidence = calculateOverallConfidence(resourceScores);

      // Assert
      expect(confidence.overall).toBe(0);
      expect(confidence.totalResources).toBe(0);
    });

    it('should handle perfect confidence', () => {
      // Arrange
      const resource = {
        logicalId: 'Table',
        type: 'AWS::DynamoDB::Table'
      };

      const matchResult = {
        bestMatch: { physicalId: 'table', confidence: 1.0 }
      };

      // Act
      const confidence = calculateResourceConfidence(resource, matchResult, []);

      // Assert
      expect(confidence.overall).toBe(1.0);
      expect(confidence.recommendation).toBe('auto-proceed');
    });

    it('should handle NaN and invalid values', () => {
      // Arrange
      const invalidScores = [NaN, -0.5, 1.5, undefined];

      // Act
      const normalized = invalidScores.map(score =>
        normalizeConfidence(score as number)
      );

      // Assert
      expect(normalized.every(n => n >= 0 && n <= 1)).toBe(true);
    });
  });
});

// Helper functions
function calculateResourceConfidence(
  resource: any,
  matchResult?: any,
  differences?: any[]
): any {
  let score = 1.0;
  const factors: any[] = [];

  // Physical ID matching
  if (matchResult?.bestMatch) {
    score *= matchResult.bestMatch.confidence;
    factors.push({
      factor: 'Physical ID Match',
      impact: matchResult.bestMatch.confidence,
      description: `Matched with ${(matchResult.bestMatch.confidence * 100).toFixed(0)}% confidence`
    });
  } else if (matchResult) {
    score *= 0.5;
    factors.push({
      factor: 'Physical ID Unknown',
      impact: 0.5,
      description: 'Could not auto-match physical resource'
    });
  }

  // Template differences
  if (differences && differences.length > 0) {
    const critical = differences.filter(d => d.category === 'critical').length;
    const warnings = differences.filter(d => d.category === 'warning').length;

    if (critical > 0) {
      score *= 0.3;
      factors.push({
        factor: 'Critical Differences',
        impact: 0.3,
        description: `${critical} critical difference${critical > 1 ? 's' : ''} found`
      });
    }

    if (warnings > 0) {
      score *= 0.7;
      factors.push({
        factor: 'Warning Differences',
        impact: 0.7,
        description: `${warnings} warning${warnings > 1 ? 's' : ''} found`
      });
    }
  }

  // Resource complexity
  const complexTypes = ['AWS::RDS::DBInstance', 'AWS::RDS::DBCluster', 'AWS::ECS::Service'];
  if (complexTypes.includes(resource.type)) {
    score *= 0.8;
    factors.push({
      factor: 'Complex Resource Type',
      impact: 0.8,
      description: 'Resource type requires careful review'
    });
  }

  const overall = Math.max(0, Math.min(1, score));
  const recommendation = getRecommendation(overall, differences?.some(d => d.category === 'critical'));

  return { overall, factors, recommendation };
}

function calculateOverallConfidence(resourceScores: any[]): any {
  if (resourceScores.length === 0) {
    return {
      overall: 0,
      totalResources: 0,
      humanReviewRequired: 0
    };
  }

  const overall = resourceScores.reduce((sum, s) => sum + s.overall, 0) / resourceScores.length;
  const humanReviewRequired = resourceScores.filter(
    s => s.recommendation === 'human-required'
  ).length;

  return {
    overall,
    totalResources: resourceScores.length,
    humanReviewRequired
  };
}

function calculateStepConfidence(step: string, data: any): any {
  const issues: string[] = [];
  let overall = 1.0;

  if (step === 'DISCOVERY' && data.resources) {
    const unresolved = data.resources.filter((r: any) => !r.physicalId).length;
    if (unresolved > 0) {
      issues.push(`${unresolved} resource${unresolved > 1 ? 's' : ''} without physical ID`);
      overall *= (data.resources.length - unresolved) / data.resources.length;
    }
  }

  if (step === 'COMPARISON' && data.differences) {
    const critical = data.differences.filter((d: any) => d.category === 'critical').length;
    const warnings = data.differences.filter((d: any) => d.category === 'warning').length;

    if (critical > 0) {
      issues.push(`${critical} critical difference${critical > 1 ? 's' : ''}`);
      overall *= 0.5;
    }
    if (warnings > 0) {
      issues.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
      overall *= 0.8;
    }
  }

  return {
    step,
    overall,
    issues,
    readyForImport: overall >= 0.7
  };
}

function getRecommendation(confidence: number, hasCritical?: boolean): string {
  if (hasCritical) {
    return 'human-required';
  }

  if (confidence >= 0.9) {
    return 'auto-proceed';
  } else if (confidence >= 0.7) {
    return 'review-recommended';
  } else {
    return 'human-required';
  }
}

function calculateTrend(history: any[]): any {
  if (history.length < 2) {
    return { direction: 'stable', totalDrop: 0 };
  }

  const first = history[0].confidence;
  const last = history[history.length - 1].confidence;
  const totalDrop = first - last;

  return {
    direction: totalDrop > 0.1 ? 'decreasing' : totalDrop < -0.1 ? 'increasing' : 'stable',
    totalDrop
  };
}

function normalizeConfidence(score: number): number {
  if (isNaN(score) || score === undefined || score === null) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}
