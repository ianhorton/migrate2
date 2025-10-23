/**
 * DetectionUtils - Sprint 4 Phase 1 (GREEN)
 * Shared detection logic for advanced constructs
 */

import { ClassifiedResource } from '../../../../types';

export interface EventConfig {
  type: 'http' | 'httpApi' | 'other';
  path?: string;
  method?: string;
  authorizer?: any;
  cors?: any;
}

export class DetectionUtils {
  /**
   * Checks if Lambda has http or httpApi events
   */
  public static hasHttpEvents(
    lambdaResource: ClassifiedResource,
    serverlessConfig: any
  ): boolean {
    // Handle null/undefined config
    if (!serverlessConfig || !serverlessConfig.functions) {
      return false;
    }

    const functionName = this.getFunctionName(lambdaResource);
    const functionConfig = serverlessConfig.functions[functionName];

    // Handle missing or malformed function config
    if (!functionConfig || !functionConfig.events) {
      return false;
    }

    // Check if any event is http or httpApi
    return functionConfig.events.some(
      (event: any) => event && (event.http || event.httpApi)
    );
  }

  /**
   * Checks if function is production (stage, name, tags)
   */
  public static isProductionFunction(
    lambdaResource: ClassifiedResource,
    stage?: string
  ): boolean {
    // Check stage parameter
    if (stage === 'production' || stage === 'prod') {
      return true;
    }

    // Check tags
    const tags = lambdaResource.Properties?.Tags || [];
    const envTag = tags.find(
      (tag: any) => tag.Key === 'environment' || tag.Key === 'Environment'
    );
    if (envTag && (envTag.Value === 'production' || envTag.Value === 'prod')) {
      return true;
    }

    // Check function name
    const functionName = this.getFunctionName(lambdaResource);
    const nameLower = functionName.toLowerCase();
    if (nameLower.includes('prod') || nameLower.includes('production')) {
      return true;
    }

    return false;
  }

  /**
   * Checks if custom domain is configured
   */
  public static hasCustomDomain(serverlessConfig: any): boolean {
    if (!serverlessConfig) {
      return false;
    }

    return Boolean(
      serverlessConfig?.custom?.customDomain?.domainName ||
      serverlessConfig?.provider?.domain
    );
  }

  /**
   * Extracts event configuration from serverless.yml
   */
  public static extractEventConfig(
    lambdaResource: ClassifiedResource,
    serverlessConfig: any
  ): EventConfig[] {
    const configs: EventConfig[] = [];

    if (!serverlessConfig || !serverlessConfig.functions) {
      return configs;
    }

    const functionName = this.getFunctionName(lambdaResource);
    const functionConfig = serverlessConfig.functions[functionName];

    if (!functionConfig || !functionConfig.events) {
      return configs;
    }

    for (const event of functionConfig.events) {
      if (!event) {
        continue;
      }

      if (event.http) {
        configs.push({
          type: 'http',
          path: event.http.path,
          method: event.http.method,
          authorizer: event.http.authorizer,
          cors: event.http.cors
        });
      } else if (event.httpApi) {
        configs.push({
          type: 'httpApi',
          path: event.httpApi.path,
          method: event.httpApi.method,
          authorizer: event.httpApi.authorizer,
          cors: event.httpApi.cors
        });
      } else {
        configs.push({ type: 'other' });
      }
    }

    return configs;
  }

  /**
   * Extracts function name from resource
   */
  public static getFunctionName(lambdaResource: ClassifiedResource): string {
    return (
      lambdaResource.Properties?.FunctionName ||
      lambdaResource.LogicalId ||
      'unknown'
    );
  }
}
