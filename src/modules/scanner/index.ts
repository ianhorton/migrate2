/**
 * Scanner Module
 * Discovers and analyzes Serverless resources
 */

import * as path from 'path';
import { Resource, ResourceInventory, CloudFormationTemplate } from '../../types/migration';
import { ServerlessParser } from './serverless-parser';
import { ResourceClassifier } from './resource-classifier';

export class Scanner {
  private parser: ServerlessParser;
  private classifier: ResourceClassifier;

  constructor(private readonly sourceDir: string) {
    this.parser = new ServerlessParser();
    this.classifier = new ResourceClassifier();
  }

  /**
   * Parse serverless.yml configuration
   */
  public async parseServerlessConfig(): Promise<any> {
    const configPath = path.join(this.sourceDir, 'serverless.yml');
    return await this.parser.parseServerlessConfig(configPath);
  }

  /**
   * Generate CloudFormation template using serverless package
   */
  public async generateCloudFormation(stage: string): Promise<CloudFormationTemplate> {
    return await this.parser.generateCloudFormation(this.sourceDir, stage);
  }

  /**
   * Discover all resources from CloudFormation template
   */
  public async discoverResources(template: CloudFormationTemplate): Promise<ResourceInventory> {
    const allResources: Resource[] = [];
    const explicitResourceIds = new Set<string>();

    // Get explicit resources from serverless.yml
    const serverlessConfig = await this.parseServerlessConfig();
    const explicitResourcesConfig = serverlessConfig?.resources?.Resources || {};

    // Track which resources were explicitly defined
    Object.keys(explicitResourcesConfig).forEach(id => {
      explicitResourceIds.add(id);
    });

    // Parse all resources from CloudFormation template
    const templateResources = template.Resources || {};
    for (const [logicalId, resourceDef] of Object.entries(templateResources)) {
      const resource: Resource = {
        logicalId,
        type: resourceDef.Type,
        properties: resourceDef.Properties || {},
        classification: 'RECREATE', // Will be set by classifier
        physicalId: '', // Will be populated during discovery step
        source: explicitResourceIds.has(logicalId) ? 'explicit' : 'abstracted',
        dependencies: this.extractDependencies(resourceDef),
        deletionPolicy: resourceDef.DeletionPolicy
      };

      allResources.push(resource);
    }

    // Classify resources
    const classification = this.classifier.classifyResources(allResources);

    // Separate into explicit and abstracted
    const explicit = allResources.filter(r => r.source === 'explicit');
    const abstracted = allResources.filter(r => r.source === 'abstracted');

    // Build inventory
    const inventory: ResourceInventory = {
      explicit,
      abstracted,
      stateful: classification.toImport,
      stateless: classification.toRecreate,
      all: allResources
    };

    return inventory;
  }

  /**
   * Extract resource dependencies from CloudFormation resource definition
   */
  private extractDependencies(resourceDef: any): string[] {
    const dependencies: Set<string> = new Set();

    // Check explicit DependsOn
    if (resourceDef.DependsOn) {
      if (Array.isArray(resourceDef.DependsOn)) {
        resourceDef.DependsOn.forEach((dep: string) => dependencies.add(dep));
      } else {
        dependencies.add(resourceDef.DependsOn);
      }
    }

    // Extract Ref dependencies from properties
    const extractRefs = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.Ref && typeof obj.Ref === 'string') {
        // Skip AWS pseudo parameters
        if (!obj.Ref.startsWith('AWS::')) {
          dependencies.add(obj.Ref);
        }
      }

      if (obj['Fn::GetAtt'] && Array.isArray(obj['Fn::GetAtt'])) {
        dependencies.add(obj['Fn::GetAtt'][0]);
      }

      // Recursively check nested objects
      for (const value of Object.values(obj)) {
        if (typeof value === 'object') {
          extractRefs(value);
        }
      }
    };

    if (resourceDef.Properties) {
      extractRefs(resourceDef.Properties);
    }

    return Array.from(dependencies);
  }
}
