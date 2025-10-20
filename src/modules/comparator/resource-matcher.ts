/**
 * Resource Matcher
 * Matches resources between Serverless and CDK templates by physical identifiers
 */

import type {
  CloudFormationTemplate,
  CloudFormationResource,
  ResourceMatch,
} from '../../types/cloudformation';
import { getPhysicalIdProperty } from './comparison-rules';

/**
 * Match resources between Serverless and CDK templates by physical ID
 * @param slsTemplate - Serverless CloudFormation template
 * @param cdkTemplate - CDK CloudFormation template
 * @returns Array of matched resources
 */
export function matchResources(
  slsTemplate: CloudFormationTemplate,
  cdkTemplate: CloudFormationTemplate
): ResourceMatch[] {
  const matches: ResourceMatch[] = [];

  // Get all unique resource types from both templates
  const resourceTypes = new Set<string>();
  Object.values(slsTemplate.Resources).forEach((r) =>
    resourceTypes.add(r.Type)
  );
  Object.values(cdkTemplate.Resources).forEach((r) =>
    resourceTypes.add(r.Type)
  );

  // Match resources by type and physical ID
  for (const resourceType of resourceTypes) {
    const typeMatches = matchResourcesByType(
      slsTemplate,
      cdkTemplate,
      resourceType
    );
    matches.push(...typeMatches);
  }

  return matches;
}

/**
 * Match resources of a specific type by physical ID
 * @param slsTemplate - Serverless CloudFormation template
 * @param cdkTemplate - CDK CloudFormation template
 * @param resourceType - AWS resource type to match
 * @returns Array of matched resources of this type
 */
export function matchResourcesByType(
  slsTemplate: CloudFormationTemplate,
  cdkTemplate: CloudFormationTemplate,
  resourceType: string
): ResourceMatch[] {
  const matches: ResourceMatch[] = [];

  // Get physical ID property for this resource type
  const idProperty = getPhysicalIdProperty(resourceType);
  if (!idProperty) {
    // Can't match resources without knowing physical ID property
    return matches;
  }

  // Filter resources by type
  const slsResources = filterByType(slsTemplate.Resources, resourceType);
  const cdkResources = filterByType(cdkTemplate.Resources, resourceType);

  // Match by physical ID
  for (const [slsId, slsResource] of Object.entries(slsResources)) {
    const slsPhysicalId = getPhysicalId(slsResource, idProperty);
    if (!slsPhysicalId) continue;

    for (const [cdkId, cdkResource] of Object.entries(cdkResources)) {
      const cdkPhysicalId = getPhysicalId(cdkResource, idProperty);
      if (!cdkPhysicalId) continue;

      if (slsPhysicalId === cdkPhysicalId) {
        matches.push({
          slsLogicalId: slsId,
          cdkLogicalId: cdkId,
          physicalId: slsPhysicalId,
          resourceType,
          slsResource,
          cdkResource,
        });
      }
    }
  }

  return matches;
}

/**
 * Filter resources by type
 * @param resources - Resource map
 * @param resourceType - Type to filter by
 * @returns Filtered resources
 */
function filterByType(
  resources: Record<string, CloudFormationResource>,
  resourceType: string
): Record<string, CloudFormationResource> {
  const filtered: Record<string, CloudFormationResource> = {};

  for (const [id, resource] of Object.entries(resources)) {
    if (resource.Type === resourceType) {
      filtered[id] = resource;
    }
  }

  return filtered;
}

/**
 * Extract physical ID from resource properties
 * Handles Ref, Fn::Sub, and other intrinsic functions
 * @param resource - CloudFormation resource
 * @param idProperty - Property name containing physical ID
 * @returns Physical ID or null if not found/resolvable
 */
function getPhysicalId(
  resource: CloudFormationResource,
  idProperty: string
): string | null {
  const value = resource.Properties?.[idProperty];

  if (!value) {
    return null;
  }

  // Direct string value
  if (typeof value === 'string') {
    return value;
  }

  // Handle CloudFormation intrinsic functions
  if (typeof value === 'object') {
    // Ref
    if (value.Ref) {
      return null; // Can't resolve refs without parameter values
    }

    // Fn::Sub - try to extract static parts
    if (value['Fn::Sub']) {
      const subValue = value['Fn::Sub'];
      if (typeof subValue === 'string' && !subValue.includes('${')) {
        return subValue; // No variables, static string
      }
      return null; // Has variables, can't resolve
    }

    // Fn::Join
    if (value['Fn::Join']) {
      return null; // Too complex to resolve
    }
  }

  return null;
}

/**
 * Find unmatched resources in a template
 * @param template - CloudFormation template
 * @param matches - Existing matches
 * @param templateType - 'sls' or 'cdk' to indicate which template
 * @returns Array of unmatched logical IDs
 */
export function findUnmatchedResources(
  template: CloudFormationTemplate,
  matches: ResourceMatch[],
  templateType: 'sls' | 'cdk'
): string[] {
  const matchedIds = new Set(
    matches.map((m) =>
      templateType === 'sls' ? m.slsLogicalId : m.cdkLogicalId
    )
  );

  return Object.keys(template.Resources).filter((id) => !matchedIds.has(id));
}
