/**
 * AdvancedConstructsGenerator - Sprint 4 Phase 6 (Main Orchestrator)
 * Coordinates all advanced construct generation (Alias, Function URL, CloudFront)
 */

import { ClassifiedResource } from '../../../../types';
import { AliasGenerator, AdvancedConstructsOptions } from '../../advanced/alias-generator';
import { FunctionUrlGenerator } from '../../advanced/function-url-generator';
import { CloudFrontSuggester } from '../../advanced/cloudfront-suggester';

export interface AdvancedConstructsResult {
  code: string; // Generated TypeScript code
  hasAlias: boolean; // Flags for what was generated
  hasFunctionUrl: boolean;
  hasCloudFrontSuggestion: boolean;
  consoleSuggestions: string[]; // User-facing messages
}

export { AdvancedConstructsOptions };

export class AdvancedConstructsGenerator {
  private aliasGenerator: AliasGenerator;
  private functionUrlGenerator: FunctionUrlGenerator;
  private cloudFrontSuggester: CloudFrontSuggester;

  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions = {}
  ) {
    this.aliasGenerator = new AliasGenerator(allResources, options);
    this.functionUrlGenerator = new FunctionUrlGenerator(allResources, options);
    this.cloudFrontSuggester = new CloudFrontSuggester(allResources, options);
  }

  /**
   * Main entry point - generates all advanced constructs for a Lambda
   *
   * @param lambdaResource - The Lambda function resource (from Sprint 1 classifier)
   * @param lambdaConstructName - Variable name of the Lambda construct
   * @returns Generated code and metadata
   */
  public generateAdvancedConstructs(
    lambdaResource: ClassifiedResource,
    lambdaConstructName: string
  ): AdvancedConstructsResult {
    const result: AdvancedConstructsResult = {
      code: '',
      hasAlias: false,
      hasFunctionUrl: false,
      hasCloudFrontSuggestion: false,
      consoleSuggestions: []
    };

    try {
      // Step 1: Determine if we need an alias
      const aliasDecision = this.aliasGenerator.shouldGenerateAlias(lambdaResource);

      if (aliasDecision.shouldGenerate) {
        const aliasResult = this.aliasGenerator.generateAlias(
          lambdaResource,
          lambdaConstructName
        );
        result.code += aliasResult.code;
        result.hasAlias = true;

        // Step 2: Generate Function URL (uses alias if present)
        const targetConstructName = aliasResult.aliasVariableName;
        const urlDecision = this.functionUrlGenerator.shouldGenerateUrl(lambdaResource);

        if (urlDecision.shouldGenerate) {
          const urlResult = this.functionUrlGenerator.generateFunctionUrl(
            targetConstructName,
            lambdaResource
          );
          result.code += urlResult.code;
          result.hasFunctionUrl = true;

          // Step 3: Suggest CloudFront if appropriate
          const cfSuggestion = this.cloudFrontSuggester.shouldSuggestCloudFront(
            lambdaResource,
            true // has Function URL
          );

          if (cfSuggestion.shouldSuggest) {
            result.code += this.cloudFrontSuggester.generateSuggestion(
              urlResult.urlOutputName,
              lambdaResource.Properties?.FunctionName || lambdaResource.LogicalId
            );
            result.hasCloudFrontSuggestion = true;
            result.consoleSuggestions.push(
              this.cloudFrontSuggester.generateConsoleSuggestion(
                lambdaResource.Properties?.FunctionName || lambdaResource.LogicalId
              )
            );
          }
        }
      } else {
        // No alias - check if Function URL is still needed
        const urlDecision = this.functionUrlGenerator.shouldGenerateUrl(lambdaResource);

        if (urlDecision.shouldGenerate) {
          // Generate Function URL on raw function (not recommended, but supported)
          const urlResult = this.functionUrlGenerator.generateFunctionUrl(
            lambdaConstructName,
            lambdaResource
          );
          result.code += urlResult.code;
          result.hasFunctionUrl = true;

          // Note: CloudFront suggestion skipped when no alias
          // (CloudFront requires alias for stable endpoints)
        }
      }

      return result;

    } catch (error) {
      // Graceful degradation - log warning but don't break basic Lambda generation
      console.warn(
        `Warning: Failed to generate advanced constructs for ${lambdaConstructName}:`,
        error instanceof Error ? error.message : String(error)
      );
      console.warn('Continuing with basic Lambda generation');

      return {
        code: '',
        hasAlias: false,
        hasFunctionUrl: false,
        hasCloudFrontSuggestion: false,
        consoleSuggestions: []
      };
    }
  }

  /**
   * Gets all console suggestions to display to user
   */
  public getConsoleSuggestions(): string[] {
    return [];
  }
}
