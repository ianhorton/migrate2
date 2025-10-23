/**
 * Enhanced Comparator
 * Sprint 2: Integration with Analysis Modules
 *
 * Extends base comparator with difference analysis, confidence scoring, and manual review
 */

import { Comparator, type ComparatorOptions } from './index';
import { DifferenceAnalyzer, type DifferenceClassification } from '../analysis/difference-analyzer';
import { ConfidenceScoring, type ConfidenceScore, type ResourceConfidenceInput } from '../analysis/confidence-scoring';
import { ManualReviewReport, type ReviewReportData } from '../reporter/manual-review-report';
import { DriftDetector, type DriftInfo } from '../discovery/drift-detector';
import type { ComparisonReport, ComparisonResult } from '../../types/cloudformation';

export interface EnhancedComparatorOptions extends ComparatorOptions {
  enableDriftDetection?: boolean;
  stackName?: string;
  region?: string;
  generateReviewReport?: boolean;
  reviewReportPath?: string;
}

export interface EnhancedComparisonReport extends ComparisonReport {
  classifications: DifferenceClassification[];
  confidence_scores: Map<string, ConfidenceScore>;
  overall_confidence: ConfidenceScore;
  drift_info?: Map<string, DriftInfo>;
  review_report_path?: string;
}

/**
 * Enhanced Comparator with Sprint 2 analysis features
 */
export class EnhancedComparator extends Comparator {
  private differenceAnalyzer: DifferenceAnalyzer;
  private confidenceScoring: ConfidenceScoring;
  private manualReviewReport: ManualReviewReport;
  private driftDetector?: DriftDetector;

  constructor(options?: { region?: string }) {
    super();
    this.differenceAnalyzer = new DifferenceAnalyzer();
    this.confidenceScoring = new ConfidenceScoring();
    this.manualReviewReport = new ManualReviewReport();

    if (options?.region) {
      this.driftDetector = new DriftDetector(options.region);
    }
  }

  /**
   * Compare templates with enhanced analysis
   */
  async compareTemplatesEnhanced(
    slsTemplatePath: string,
    cdkTemplatePath: string,
    options: EnhancedComparatorOptions = {}
  ): Promise<EnhancedComparisonReport> {
    // Run base comparison
    const baseReport = await this.compareTemplates(
      slsTemplatePath,
      cdkTemplatePath,
      options
    );

    // Analyze all differences
    const allClassifications: DifferenceClassification[] = [];
    const confidenceScores = new Map<string, ConfidenceScore>();

    for (const resource of baseReport.resources) {
      // Classify differences
      const classifications = this.differenceAnalyzer.analyzeDifferences(
        resource.differences
      );
      allClassifications.push(...classifications);

      // Calculate confidence score
      const confidenceInput: ResourceConfidenceInput = {
        resourceType: resource.resourceType,
        physicalIdResolved: !!resource.physicalId,
        physicalIdConfidence: 1.0, // Assume resolved if present
        classifications,
      };

      const confidenceScore =
        this.confidenceScoring.calculateResourceConfidence(confidenceInput);
      confidenceScores.set(resource.slsLogicalId, confidenceScore);
    }

    // Detect drift if enabled
    let driftInfo: Map<string, DriftInfo> | undefined;
    if (options.enableDriftDetection && options.stackName) {
      if (!this.driftDetector) {
        this.driftDetector = new DriftDetector(options.region || 'us-east-1');
      }

      try {
        driftInfo = await this.driftDetector.detectDrift(options.stackName);

        // Update confidence scores with drift information
        for (const [logicalId, drift] of driftInfo.entries()) {
          const existingScore = confidenceScores.get(logicalId);
          if (existingScore && drift.drifted) {
            const driftSeverity = this.driftDetector.getDriftSeverity(drift);
            const updatedInput: ResourceConfidenceInput = {
              resourceType: drift.resourceType,
              physicalIdResolved: true,
              physicalIdConfidence: existingScore.overall,
              hasDrift: true,
              driftSeverity: driftSeverity === 'major' ? 'major' : 'minor',
            };

            const updatedScore =
              this.confidenceScoring.calculateResourceConfidence(updatedInput);
            confidenceScores.set(logicalId, updatedScore);
          }
        }
      } catch (error) {
        console.warn('Failed to detect drift:', error);
        // Continue without drift detection
      }
    }

    // Calculate overall confidence
    const overallConfidence = this.confidenceScoring.calculateMigrationConfidence(
      Array.from(confidenceScores.values())
    );

    // Generate manual review report if needed
    let reviewReportPath: string | undefined;
    if (options.generateReviewReport && options.reviewReportPath) {
      const reviewData = this.buildReviewReportData(
        baseReport,
        allClassifications,
        confidenceScores,
        overallConfidence
      );

      await this.manualReviewReport.saveReport(
        reviewData,
        options.reviewReportPath,
        'html'
      );
      reviewReportPath = options.reviewReportPath;

      // Also generate terminal summary
      const terminalSummary =
        this.manualReviewReport.generateTerminalSummary(reviewData);
      console.log(terminalSummary);
    }

    // Build enhanced report
    const enhancedReport: EnhancedComparisonReport = {
      ...baseReport,
      classifications: allClassifications,
      confidence_scores: confidenceScores,
      overall_confidence: overallConfidence,
      drift_info: driftInfo,
      review_report_path: reviewReportPath,
    };

    return enhancedReport;
  }

  /**
   * Build review report data structure
   */
  private buildReviewReportData(
    baseReport: ComparisonReport,
    allClassifications: DifferenceClassification[],
    confidenceScores: Map<string, ConfidenceScore>,
    overallConfidence: ConfidenceScore
  ): ReviewReportData {
    const resources = baseReport.resources.map((resource) => {
      const resourceClassifications = allClassifications.filter((c) =>
        resource.differences.includes(c.difference)
      );

      return {
        logicalId: resource.slsLogicalId,
        resourceType: resource.resourceType,
        physicalId: resource.physicalId,
        comparisonResult: resource,
        classifications: resourceClassifications,
        confidenceScore:
          confidenceScores.get(resource.slsLogicalId) ||
          this.getDefaultConfidenceScore(),
      };
    });

    const summary = this.differenceAnalyzer.getSummary(allClassifications);

    return {
      migrationId: baseReport.comparison_id,
      timestamp: new Date(baseReport.timestamp),
      resources,
      summary,
      overallConfidence,
    };
  }

  /**
   * Get default confidence score
   */
  private getDefaultConfidenceScore(): ConfidenceScore {
    return {
      overall: 1.0,
      factors: [],
      recommendation: 'auto-proceed',
      reasoning: 'No issues detected',
    };
  }

  /**
   * Quick validation with confidence scores
   */
  async validateForImportEnhanced(
    slsTemplatePath: string,
    cdkTemplatePath: string,
    options: EnhancedComparatorOptions = {}
  ): Promise<{
    ready: boolean;
    confidence: number;
    recommendation: string;
    issues: string[];
  }> {
    const report = await this.compareTemplatesEnhanced(
      slsTemplatePath,
      cdkTemplatePath,
      options
    );

    return {
      ready: report.ready_for_import && report.overall_confidence.overall >= 0.7,
      confidence: report.overall_confidence.overall,
      recommendation: report.overall_confidence.recommendation,
      issues: report.blocking_issues,
    };
  }
}

// Export singleton instance
export const enhancedComparator = new EnhancedComparator();
