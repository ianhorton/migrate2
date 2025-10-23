/**
 * ConfidenceScoring
 * Sprint 2: Template Analysis
 *
 * Assigns confidence levels to migration decisions
 */

import type { DifferenceClassification } from './difference-analyzer';

export interface ConfidenceFactor {
  factor: string;
  impact: number; // 0.0 to 1.0
  description: string;
}

export interface ConfidenceScore {
  overall: number; // 0.0 to 1.0
  factors: ConfidenceFactor[];
  recommendation: 'auto-proceed' | 'review-recommended' | 'human-required';
  reasoning: string;
}

export interface ResourceConfidenceInput {
  resourceType: string;
  physicalIdResolved: boolean;
  physicalIdConfidence?: number;
  classifications?: DifferenceClassification[];
  hasDrift?: boolean;
  driftSeverity?: 'minor' | 'major';
}

/**
 * ConfidenceScoring class
 */
export class ConfidenceScoring {
  /**
   * Calculate resource-level confidence
   */
  calculateResourceConfidence(
    input: ResourceConfidenceInput
  ): ConfidenceScore {
    let score = 1.0;
    const factors: ConfidenceFactor[] = [];

    // Factor 1: Physical ID resolution
    if (!input.physicalIdResolved) {
      score *= 0.3;
      factors.push({
        factor: 'Physical ID Unknown',
        impact: 0.3,
        description:
          'Physical resource ID could not be determined automatically',
      });
    } else if (
      input.physicalIdConfidence !== undefined &&
      input.physicalIdConfidence < 1.0
    ) {
      score *= input.physicalIdConfidence;
      factors.push({
        factor: 'Physical ID Match',
        impact: input.physicalIdConfidence,
        description: `Physical ID matched with ${(input.physicalIdConfidence * 100).toFixed(0)}% confidence`,
      });
    } else {
      factors.push({
        factor: 'Physical ID Confirmed',
        impact: 1.0,
        description: 'Physical resource ID confirmed and validated',
      });
    }

    // Factor 2: Template differences
    if (input.classifications && input.classifications.length > 0) {
      const criticalCount = input.classifications.filter(
        (c) => c.category === 'critical'
      ).length;
      const warningCount = input.classifications.filter(
        (c) => c.category === 'warning'
      ).length;

      if (criticalCount > 0) {
        score *= 0.2;
        factors.push({
          factor: 'Critical Differences',
          impact: 0.2,
          description: `${criticalCount} critical ${criticalCount === 1 ? 'difference' : 'differences'} found that must be resolved`,
        });
      }

      if (warningCount > 0) {
        const warningImpact = Math.max(0.5, 1.0 - warningCount * 0.1);
        score *= warningImpact;
        factors.push({
          factor: 'Warning Differences',
          impact: warningImpact,
          description: `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'} found requiring review`,
        });
      }

      const acceptableCount = input.classifications.filter(
        (c) => c.category === 'acceptable'
      ).length;
      if (acceptableCount > 0) {
        factors.push({
          factor: 'Acceptable Differences',
          impact: 1.0,
          description: `${acceptableCount} acceptable ${acceptableCount === 1 ? 'difference' : 'differences'} (safe additions by CDK)`,
        });
      }
    }

    // Factor 3: CloudFormation drift
    if (input.hasDrift) {
      if (input.driftSeverity === 'major') {
        score *= 0.4;
        factors.push({
          factor: 'Major Drift Detected',
          impact: 0.4,
          description:
            'Significant drift detected - manual changes require reconciliation',
        });
      } else {
        score *= 0.7;
        factors.push({
          factor: 'Minor Drift Detected',
          impact: 0.7,
          description: 'Minor drift detected - review recommended',
        });
      }
    }

    // Factor 4: Resource type complexity
    const complexTypes = [
      'AWS::RDS::DBInstance',
      'AWS::RDS::DBCluster',
      'AWS::ECS::Service',
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      'AWS::CloudFront::Distribution',
    ];

    if (complexTypes.includes(input.resourceType)) {
      score *= 0.8;
      factors.push({
        factor: 'Complex Resource Type',
        impact: 0.8,
        description:
          'Resource type has complex configuration requiring careful review',
      });
    }

    // Determine recommendation
    const { recommendation, reasoning } = this.determineRecommendation(
      score,
      factors
    );

    return {
      overall: Math.max(0, Math.min(1, score)), // Clamp to [0, 1]
      factors,
      recommendation,
      reasoning,
    };
  }

  /**
   * Calculate overall migration confidence from multiple resources
   */
  calculateMigrationConfidence(
    resourceScores: ConfidenceScore[]
  ): ConfidenceScore {
    if (resourceScores.length === 0) {
      return {
        overall: 1.0,
        factors: [],
        recommendation: 'auto-proceed',
        reasoning: 'No resources to migrate',
      };
    }

    // Calculate average score
    const avgScore =
      resourceScores.reduce((sum, score) => sum + score.overall, 0) /
      resourceScores.length;

    // Calculate minimum score (weakest link)
    const minScore = Math.min(...resourceScores.map((s) => s.overall));

    // Overall confidence is weighted average (70% min, 30% avg)
    const overallScore = minScore * 0.7 + avgScore * 0.3;

    // Aggregate factors
    const factors: ConfidenceFactor[] = [];

    const humanRequiredCount = resourceScores.filter(
      (s) => s.recommendation === 'human-required'
    ).length;
    const reviewRecommendedCount = resourceScores.filter(
      (s) => s.recommendation === 'review-recommended'
    ).length;
    const autoProceedCount = resourceScores.filter(
      (s) => s.recommendation === 'auto-proceed'
    ).length;

    if (humanRequiredCount > 0) {
      factors.push({
        factor: 'Resources Requiring Human Intervention',
        impact: minScore,
        description: `${humanRequiredCount} ${humanRequiredCount === 1 ? 'resource requires' : 'resources require'} manual intervention`,
      });
    }

    if (reviewRecommendedCount > 0) {
      factors.push({
        factor: 'Resources Requiring Review',
        impact: 0.7,
        description: `${reviewRecommendedCount} ${reviewRecommendedCount === 1 ? 'resource requires' : 'resources require'} review before proceeding`,
      });
    }

    factors.push({
      factor: 'Overall Resource Confidence',
      impact: avgScore,
      description: `Average confidence across ${resourceScores.length} ${resourceScores.length === 1 ? 'resource' : 'resources'}: ${(avgScore * 100).toFixed(0)}%`,
    });

    const { recommendation, reasoning } = this.determineRecommendation(
      overallScore,
      factors
    );

    return {
      overall: overallScore,
      factors,
      recommendation,
      reasoning,
    };
  }

  /**
   * Determine recommendation based on score and factors
   */
  private determineRecommendation(
    score: number,
    factors: ConfidenceFactor[]
  ): { recommendation: ConfidenceScore['recommendation']; reasoning: string } {
    // Check for critical factors
    const hasCriticalIssues = factors.some(
      (f) => f.impact < 0.5 || f.factor.includes('Critical')
    );

    if (hasCriticalIssues || score < 0.5) {
      return {
        recommendation: 'human-required',
        reasoning:
          'Critical issues detected that require human intervention before proceeding. Review all flagged concerns and resolve blocking issues.',
      };
    }

    if (score >= 0.9) {
      return {
        recommendation: 'auto-proceed',
        reasoning:
          'High confidence in migration success. All checks passed with minimal concerns. Safe to proceed automatically.',
      };
    }

    if (score >= 0.7) {
      return {
        recommendation: 'review-recommended',
        reasoning:
          'Migration appears feasible but review is recommended. Several warnings or minor concerns detected that should be verified before proceeding.',
      };
    }

    return {
      recommendation: 'human-required',
      reasoning:
        'Confidence below threshold for automatic migration. Multiple concerns detected that require careful review and manual intervention.',
    };
  }

  /**
   * Format confidence score as percentage string
   */
  formatConfidence(score: number): string {
    const percentage = (score * 100).toFixed(1);
    if (score >= 0.9) return `${percentage}% ✅`;
    if (score >= 0.7) return `${percentage}% ⚠️`;
    return `${percentage}% ❌`;
  }

  /**
   * Get color code for terminal output
   */
  getConfidenceColor(score: number): 'green' | 'yellow' | 'red' {
    if (score >= 0.9) return 'green';
    if (score >= 0.7) return 'yellow';
    return 'red';
  }
}
