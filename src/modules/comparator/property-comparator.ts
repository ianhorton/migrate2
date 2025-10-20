/**
 * Property Comparator
 * Deep comparison of CloudFormation resource properties
 */

import type {
  CloudFormationResource,
  PropertyDifference,
  ComparisonResult,
  ResourceMatch,
} from '../../types/cloudformation';
import { getComparisonRules } from './comparison-rules';

/**
 * Compare a matched resource pair
 * @param match - Matched resource pair
 * @returns Comparison result with differences and status
 */
export function compareResource(match: ResourceMatch): ComparisonResult {
  const differences = compareProperties(
    match.slsResource.Properties || {},
    match.cdkResource.Properties || {},
    match.resourceType
  );

  const status = determineStatus(differences);
  const recommendation = generateRecommendation(status, differences);

  return {
    resourceType: match.resourceType,
    physicalId: match.physicalId,
    slsLogicalId: match.slsLogicalId,
    cdkLogicalId: match.cdkLogicalId,
    status,
    differences,
    recommendation,
  };
}

/**
 * Compare properties between two resources
 * @param slsProps - Serverless resource properties
 * @param cdkProps - CDK resource properties
 * @param resourceType - AWS resource type
 * @returns Array of property differences
 */
export function compareProperties(
  slsProps: Record<string, any>,
  cdkProps: Record<string, any>,
  resourceType: string
): PropertyDifference[] {
  const rules = getComparisonRules(resourceType);
  const differences: PropertyDifference[] = [];

  // Get all unique property keys
  const allKeys = new Set([
    ...Object.keys(slsProps),
    ...Object.keys(cdkProps),
  ]);

  for (const key of allKeys) {
    // Skip ignored properties
    if (rules.ignoredProperties.includes(key)) {
      continue;
    }

    const slsValue = slsProps[key];
    const cdkValue = cdkProps[key];

    // Skip if values are equal
    if (deepEqual(slsValue, cdkValue)) {
      continue;
    }

    // Analyze the difference
    const difference = analyzeDifference(key, slsValue, cdkValue, resourceType);
    differences.push(difference);
  }

  return differences;
}

/**
 * Analyze a property difference and determine severity
 * @param property - Property name
 * @param slsValue - Serverless value
 * @param cdkValue - CDK value
 * @param resourceType - AWS resource type
 * @returns Property difference with severity and explanation
 */
export function analyzeDifference(
  property: string,
  slsValue: any,
  cdkValue: any,
  resourceType: string
): PropertyDifference {
  const rules = getComparisonRules(resourceType);

  // Critical property mismatch
  if (rules.criticalProperties.includes(property)) {
    return {
      property,
      slsValue,
      cdkValue,
      severity: 'CRITICAL',
      explanation: `Critical property mismatch. Must match exactly for import.`,
      autoFixable: false,
    };
  }

  // CDK added a property that's acceptable
  if (slsValue === undefined && rules.acceptableAdditions.includes(property)) {
    return {
      property,
      slsValue,
      cdkValue,
      severity: 'ACCEPTABLE',
      explanation: `CDK added ${property}. This is a safe addition.`,
      autoFixable: false,
    };
  }

  // SLS has property but CDK doesn't - might need to be added to CDK
  if (cdkValue === undefined && slsValue !== undefined) {
    if (rules.criticalProperties.includes(property)) {
      return {
        property,
        slsValue,
        cdkValue,
        severity: 'CRITICAL',
        explanation: `CDK missing critical property ${property}. Must be added.`,
        autoFixable: true,
      };
    }

    return {
      property,
      slsValue,
      cdkValue,
      severity: 'WARNING',
      explanation: `CDK missing property ${property}. Consider adding to CDK code.`,
      autoFixable: true,
    };
  }

  // Warning - should review but might be okay
  if (rules.warningProperties.includes(property)) {
    return {
      property,
      slsValue,
      cdkValue,
      severity: 'WARNING',
      explanation: `Property differs. Review carefully before proceeding.`,
      autoFixable: false,
    };
  }

  // Unknown difference
  return {
    property,
    slsValue,
    cdkValue,
    severity: 'WARNING',
    explanation: `Unknown property difference. Manual review recommended.`,
    autoFixable: false,
  };
}

/**
 * Deep equality check for values
 * @param a - First value
 * @param b - Second value
 * @returns True if values are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    if (keysA.length !== keysB.length) return false;
    if (!deepEqual(keysA, keysB)) return false;

    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Determine overall status from differences
 * @param differences - Array of property differences
 * @returns Overall status
 */
export function determineStatus(
  differences: PropertyDifference[]
): 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL' {
  if (differences.length === 0) {
    return 'MATCH';
  }

  const hasCritical = differences.some((d) => d.severity === 'CRITICAL');
  if (hasCritical) {
    return 'CRITICAL';
  }

  const hasWarning = differences.some((d) => d.severity === 'WARNING');
  if (hasWarning) {
    return 'WARNING';
  }

  return 'ACCEPTABLE';
}

/**
 * Generate recommendation based on status and differences
 * @param status - Overall status
 * @param differences - Array of property differences
 * @returns Human-readable recommendation
 */
export function generateRecommendation(
  status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL',
  differences: PropertyDifference[]
): string {
  switch (status) {
    case 'MATCH':
      return '✅ Safe to import. No differences detected.';

    case 'ACCEPTABLE':
      return `✅ Safe to import. CDK added ${differences.length} acceptable ${
        differences.length === 1 ? 'property' : 'properties'
      }.`;

    case 'WARNING':
      return `⚠️  Review required. ${differences.length} ${
        differences.length === 1 ? 'property differs' : 'properties differ'
      }.`;

    case 'CRITICAL':
      const criticalCount = differences.filter(
        (d) => d.severity === 'CRITICAL'
      ).length;
      return `❌ Cannot import. ${criticalCount} critical ${
        criticalCount === 1 ? 'mismatch' : 'mismatches'
      } must be fixed.`;

    default:
      return 'Unknown status';
  }
}
