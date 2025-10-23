/**
 * Type definitions for AWS Resource Discovery system
 * Supports scanning AWS accounts to find actual resources
 */

/**
 * Discovered AWS resource with metadata
 */
export interface DiscoveredResource {
  physicalId: string;
  resourceType: string;
  region: string;
  arn: string;
  tags: Record<string, string>;
  createdAt?: Date;
  metadata: Record<string, any>;
}

/**
 * Match candidate for a template resource
 */
export interface MatchCandidate {
  physicalId: string;
  confidence: number; // 0.0 to 1.0
  matchReasons: string[];
  discoveredResource: DiscoveredResource;
}

/**
 * Result of matching a logical ID to physical resources
 */
export interface MatchResult {
  logicalId: string;
  resourceType: string;
  matches: MatchCandidate[];
  bestMatch?: MatchCandidate;
  requiresHumanReview: boolean;
}

/**
 * Resolution strategy for finding physical IDs
 */
export interface ResolutionStrategy {
  name: string;
  confidence: number;
  execute(): Promise<string | null>;
}

/**
 * Discovery options for AWS resource scanning
 */
export interface DiscoveryOptions {
  region?: string;
  includeTags?: boolean;
  maxResults?: number;
  useCache?: boolean;
  cacheExpiry?: number; // milliseconds
}
