/**
 * Resource Matcher
 *
 * Matches CloudFormation logical IDs to physical AWS resources using
 * confidence scoring algorithms. Considers name similarity, tags,
 * configuration, and creation time.
 *
 * Features:
 * - Fuzzy string matching
 * - Tag comparison
 * - Configuration matching
 * - Confidence scoring (0.0 to 1.0)
 * - Ranked candidate results
 */

import { DiscoveredResource, MatchCandidate, MatchResult } from '../../types/discovery';

export class ResourceMatcher {
  private readonly confidenceThreshold: number;

  constructor(confidenceThreshold: number = 0.7) {
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Match template resource to discovered resources
   */
  match(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, unknown>,
    discoveredResources: DiscoveredResource[]
  ): MatchResult {
    const candidates: MatchCandidate[] = [];

    // Filter resources by type
    const typeMatches = discoveredResources.filter((r) => r.resourceType === resourceType);

    // Calculate confidence for each candidate
    for (const discovered of typeMatches) {
      const { score, reasons } = this.calculateConfidence(
        logicalId,
        templateProperties,
        discovered
      );

      if (score > 0) {
        candidates.push({
          physicalId: discovered.physicalId,
          confidence: score,
          matchReasons: reasons,
          discoveredResource: discovered,
        });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Determine best match
    const bestMatch = candidates.length > 0 && candidates[0].confidence >= this.confidenceThreshold
      ? candidates[0]
      : undefined;

    // Requires human review if no high-confidence match
    const requiresHumanReview = !bestMatch || bestMatch.confidence < 0.9;

    return {
      logicalId,
      resourceType,
      matches: candidates,
      bestMatch,
      requiresHumanReview,
    };
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(
    logicalId: string,
    templateProps: Record<string, unknown>,
    discovered: DiscoveredResource
  ): { score: number; reasons: string[] } {
    let score = 0.0;
    const reasons: string[] = [];

    // Get expected physical name from template
    const expectedName = this.getPhysicalNameFromTemplate(
      discovered.resourceType,
      templateProps,
      logicalId
    );

    // 1. Exact name match = 90% confidence
    if (expectedName && expectedName === discovered.physicalId) {
      score += 0.9;
      reasons.push('Exact name match');
      return { score: Math.min(score, 1.0), reasons };
    }

    // 2. Name similarity (fuzzy) = 0-50% confidence
    if (expectedName) {
      const similarity = this.calculateStringSimilarity(expectedName, discovered.physicalId);
      if (similarity > 0.7) {
        const similarityScore = similarity * 0.5;
        score += similarityScore;
        reasons.push(`Name similarity: ${(similarity * 100).toFixed(0)}%`);
      }
    }

    // 3. Logical ID similarity = 0-40% confidence
    const logicalIdSimilarity = this.calculateStringSimilarity(
      logicalId.toLowerCase(),
      discovered.physicalId.toLowerCase()
    );
    if (logicalIdSimilarity > 0.7) {
      const logicalIdScore = logicalIdSimilarity * 0.4;
      score += logicalIdScore;
      reasons.push(`Logical ID similarity: ${(logicalIdSimilarity * 100).toFixed(0)}%`);
    }

    // 4. Tag match = +20% confidence
    if (this.tagsMatch(templateProps.Tags, discovered.tags)) {
      score += 0.2;
      reasons.push('Tags match');
    }

    // 5. Configuration match = +30% confidence
    if (this.configurationMatches(discovered.resourceType, templateProps, discovered.metadata)) {
      score += 0.3;
      reasons.push('Configuration matches');
    }

    // 6. Recently created = +10% confidence
    if (this.isRecentlyCreated(discovered.createdAt)) {
      score += 0.1;
      reasons.push('Recently created');
    }

    return { score: Math.min(score, 1.0), reasons };
  }

  /**
   * Get physical name property from template based on resource type
   */
  private getPhysicalNameFromTemplate(
    resourceType: string,
    props: Record<string, unknown>,
    logicalId: string
  ): string | null {
    const namePropertyMap: Record<string, string> = {
      'AWS::DynamoDB::Table': 'TableName',
      'AWS::S3::Bucket': 'BucketName',
      'AWS::Logs::LogGroup': 'LogGroupName',
      'AWS::Lambda::Function': 'FunctionName',
      'AWS::IAM::Role': 'RoleName',
    };

    const nameProperty = namePropertyMap[resourceType];
    if (!nameProperty) return null;

    const value = props[nameProperty];
    return typeof value === 'string' ? value : null;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1 - distance / maxLen;
  }

  /**
   * Type guard for tag object structure
   */
  private isTagObject(obj: unknown): obj is { Key: string; Value: string } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'Key' in obj &&
      'Value' in obj &&
      typeof (obj as { Key: unknown }).Key === 'string' &&
      typeof (obj as { Value: unknown }).Value === 'string'
    );
  }

  /**
   * Type guard for tag array
   */
  private isTagArray(tags: unknown): tags is Array<{ Key: string; Value: string }> {
    return Array.isArray(tags) && tags.every((tag) => this.isTagObject(tag));
  }

  /**
   * Type guard for tag record
   */
  private isTagRecord(tags: unknown): tags is Record<string, string> {
    if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) {
      return false;
    }
    return Object.values(tags).every((val) => typeof val === 'string');
  }

  /**
   * Check if tags match
   */
  private tagsMatch(
    templateTags: unknown,
    discoveredTags: Record<string, string>
  ): boolean {
    if (!templateTags || Object.keys(discoveredTags).length === 0) {
      return false;
    }

    // Normalize template tags to object
    let normalizedTemplateTags: Record<string, string> = {};

    if (this.isTagArray(templateTags)) {
      normalizedTemplateTags = templateTags.reduce(
        (acc, tag) => ({
          ...acc,
          [tag.Key]: tag.Value,
        }),
        {}
      );
    } else if (this.isTagRecord(templateTags)) {
      normalizedTemplateTags = templateTags;
    } else {
      // Invalid tag structure
      return false;
    }

    // Check if any template tags match discovered tags
    let matchCount = 0;
    const templateTagKeys = Object.keys(normalizedTemplateTags);

    for (const key of templateTagKeys) {
      if (discoveredTags[key] === normalizedTemplateTags[key]) {
        matchCount++;
      }
    }

    // Consider it a match if at least 50% of template tags match
    return templateTagKeys.length > 0 && matchCount / templateTagKeys.length >= 0.5;
  }

  /**
   * Type guard for key schema structure
   */
  private isKeySchemaValid(value: unknown): value is Array<{ AttributeName: string; KeyType: string }> {
    return Array.isArray(value) && value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'AttributeName' in item &&
        'KeyType' in item &&
        typeof item.AttributeName === 'string' &&
        typeof item.KeyType === 'string'
    );
  }

  /**
   * Check if configuration matches
   */
  private configurationMatches(
    resourceType: string,
    templateProps: Record<string, unknown>,
    discoveredMetadata: Record<string, unknown>
  ): boolean {
    switch (resourceType) {
      case 'AWS::DynamoDB::Table':
        return this.dynamoDBConfigMatches(templateProps, discoveredMetadata);
      case 'AWS::Lambda::Function':
        return this.lambdaConfigMatches(templateProps, discoveredMetadata);
      case 'AWS::Logs::LogGroup':
        return this.logGroupConfigMatches(templateProps, discoveredMetadata);
      default:
        return false;
    }
  }

  /**
   * Check DynamoDB configuration match
   */
  private dynamoDBConfigMatches(
    templateProps: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): boolean {
    // Check key schema
    const templateKeySchema = templateProps.KeySchema;
    const discoveredKeySchema = metadata.keySchema;

    if (templateKeySchema && discoveredKeySchema) {
      if (this.isKeySchemaValid(templateKeySchema) && this.isKeySchemaValid(discoveredKeySchema)) {
        const templateKeys = JSON.stringify(templateKeySchema);
        const discoveredKeys = JSON.stringify(discoveredKeySchema);
        if (templateKeys === discoveredKeys) {
          return true;
        }
      }
    }

    // Check billing mode
    const templateBillingMode = templateProps.BillingMode;
    const discoveredBillingMode = metadata.billingMode;

    if (
      templateBillingMode &&
      discoveredBillingMode &&
      typeof templateBillingMode === 'string' &&
      typeof discoveredBillingMode === 'string'
    ) {
      if (templateBillingMode === discoveredBillingMode) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check Lambda configuration match
   */
  private lambdaConfigMatches(
    templateProps: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): boolean {
    // Check runtime
    const templateRuntime = templateProps.Runtime;
    const discoveredRuntime = metadata.runtime;

    if (
      templateRuntime &&
      discoveredRuntime &&
      typeof templateRuntime === 'string' &&
      typeof discoveredRuntime === 'string'
    ) {
      if (templateRuntime === discoveredRuntime) {
        return true;
      }
    }

    // Check handler
    const templateHandler = templateProps.Handler;
    const discoveredHandler = metadata.handler;

    if (
      templateHandler &&
      discoveredHandler &&
      typeof templateHandler === 'string' &&
      typeof discoveredHandler === 'string'
    ) {
      if (templateHandler === discoveredHandler) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check LogGroup configuration match
   */
  private logGroupConfigMatches(
    templateProps: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): boolean {
    // Check retention
    const templateRetention = templateProps.RetentionInDays;
    const discoveredRetention = metadata.retentionInDays;

    if (
      templateRetention !== undefined &&
      discoveredRetention !== undefined &&
      typeof templateRetention === 'number' &&
      typeof discoveredRetention === 'number'
    ) {
      if (templateRetention === discoveredRetention) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if resource was recently created (within last 30 days)
   */
  private isRecentlyCreated(createdAt?: Date): boolean {
    if (!createdAt) return false;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return createdAt.getTime() > thirtyDaysAgo;
  }
}
