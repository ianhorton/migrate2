/**
 * Resource Classifier
 * Classifies resources as stateful/stateless and determines import/recreate actions
 */

import {
  Resource,
  ResourceAction,
  ResourceClassification,
  STATEFUL_RESOURCE_TYPES,
} from '../../types/migration';

export class ResourceClassifier {
  /**
   * Classify a single resource
   */
  classifyResource(resource: Partial<Resource>): ResourceAction {
    const resourceType = resource.type;

    if (!resourceType) {
      throw new Error('Resource type is required for classification');
    }

    // Check if it's a known stateful type
    if (STATEFUL_RESOURCE_TYPES.includes(resourceType as any)) {
      return 'IMPORT';
    }

    // Default: recreate for stateless resources
    return 'RECREATE';
  }

  /**
   * Classify an array of resources
   */
  classifyResources(resources: Resource[]): ResourceClassification {
    const toImport: Resource[] = [];
    const toRecreate: Resource[] = [];
    const dependencies = new Map<string, string[]>();

    for (const resource of resources) {
      const action = this.classifyResource(resource);
      resource.classification = action;

      if (action === 'IMPORT') {
        toImport.push(resource);
      } else {
        toRecreate.push(resource);
      }

      // Store dependencies
      if (resource.dependencies && resource.dependencies.length > 0) {
        dependencies.set(resource.logicalId, resource.dependencies);
      }
    }

    return {
      toImport,
      toRecreate,
      dependencies,
    };
  }

  /**
   * Check if a resource type is stateful
   */
  isStateful(resourceType: string): boolean {
    return STATEFUL_RESOURCE_TYPES.includes(resourceType as any);
  }

  /**
   * Check if a resource type is stateless
   */
  isStateless(resourceType: string): boolean {
    return !this.isStateful(resourceType);
  }

  /**
   * Get recommended deletion policy for a resource
   */
  getRecommendedDeletionPolicy(
    resource: Resource
  ): 'Delete' | 'Retain' | 'Snapshot' {
    if (this.isStateful(resource.type)) {
      return 'Retain';
    }
    return 'Delete';
  }
}
