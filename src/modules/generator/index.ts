/**
 * Generator Module - Main entry point
 *
 * Converts CloudFormation resources to CDK TypeScript code
 */

import { Resource } from '../../types';
import { TypeScriptGenerator } from './typescript-generator';
import { CDKCodeGenerator } from './cdk-code-generator';

/**
 * Configuration for CDK code generation
 */
export interface GeneratorConfig {
  /** Stack name for the CDK stack */
  stackName: string;

  /** Target language (currently only TypeScript) */
  language?: 'typescript' | 'python';

  /** Use L2 constructs when available */
  useL2Constructs?: boolean;

  /** Output directory for generated code */
  outputDir?: string;

  /** CDK version to target */
  cdkVersion?: string;

  /** Include comments in generated code */
  includeComments?: boolean;

  /** Format code with Prettier */
  formatCode?: boolean;
}

/**
 * Generated code output
 */
export interface GeneratedCode {
  /** Stack file content */
  stackCode: string;

  /** App entry point content */
  appCode: string;

  /** CDK configuration (cdk.json) */
  cdkConfig: string;

  /** Package.json content */
  packageJson: string;

  /** Generated construct codes */
  constructs: ConstructCode[];

  /** Import statements */
  imports: string[];
}

/**
 * Individual construct code
 */
export interface ConstructCode {
  /** Variable name for the construct */
  name: string;

  /** Resource type */
  resourceType: string;

  /** Generated code for this construct */
  code: string;

  /** Comments to include */
  comments: string[];

  /** Dependencies (other construct names) */
  dependencies: string[];
}

/**
 * Main Generator class
 */
export class Generator {
  private typeScriptGenerator: TypeScriptGenerator;
  private cdkCodeGenerator: CDKCodeGenerator;

  constructor() {
    this.typeScriptGenerator = new TypeScriptGenerator();
    this.cdkCodeGenerator = new CDKCodeGenerator();
  }

  /**
   * Generate complete CDK project from resources
   */
  async generate(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<GeneratedCode> {
    const language = config.language || 'typescript';

    if (language !== 'typescript') {
      throw new Error(`Language ${language} is not yet supported`);
    }

    // Generate constructs for each resource
    const constructs = await this.generateConstructs(resources, config);

    // Generate import statements
    const imports = this.generateImports(resources);

    // Generate stack code
    const stackCode = await this.generateStack(resources, config);

    // Generate supporting files
    const appCode = await this.cdkCodeGenerator.generateApp(config);
    const cdkConfig = await this.cdkCodeGenerator.generateCDKConfig(config);
    const packageJson = await this.cdkCodeGenerator.generatePackageJson(config);

    return {
      stackCode,
      appCode,
      cdkConfig,
      packageJson,
      constructs,
      imports,
    };
  }

  /**
   * Generate CDK stack file
   */
  async generateStack(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<string> {
    return this.cdkCodeGenerator.generateStack(resources, config);
  }

  /**
   * Generate individual construct
   */
  async generateConstruct(
    resource: Resource,
    config: GeneratorConfig
  ): Promise<ConstructCode> {
    const useL2 = config.useL2Constructs !== false;
    return this.typeScriptGenerator.generateConstruct(resource, useL2);
  }

  /**
   * Generate constructs for all resources
   */
  private async generateConstructs(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<ConstructCode[]> {
    const constructs: ConstructCode[] = [];

    for (const resource of resources) {
      try {
        const construct = await this.generateConstruct(resource, config);
        constructs.push(construct);
      } catch (error) {
        console.warn(
          `Failed to generate construct for ${resource.logicalId}:`,
          error
        );
        // Continue with other resources
      }
    }

    return constructs;
  }

  /**
   * Generate import statements
   */
  generateImports(resources: Resource[]): string[] {
    const resourceTypes = new Set(resources.map((r) => r.type));
    return this.typeScriptGenerator.generateImports(resourceTypes);
  }

  /**
   * Convert CloudFormation properties to CDK format
   */
  convertProperties(
    properties: Record<string, unknown>,
    resourceType: string
  ): string {
    return this.typeScriptGenerator.convertProperties(properties, resourceType);
  }
}

/**
 * Generator error class
 */
export class GeneratorError extends Error {
  constructor(
    message: string,
    public readonly code: GeneratorErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GeneratorError';
  }
}

/**
 * Generator error codes
 */
export enum GeneratorErrorCode {
  UNSUPPORTED_RESOURCE_TYPE = 'UNSUPPORTED_RESOURCE_TYPE',
  INVALID_PROPERTIES = 'INVALID_PROPERTIES',
  TEMPLATE_RENDERING_FAILED = 'TEMPLATE_RENDERING_FAILED',
  CODE_FORMATTING_FAILED = 'CODE_FORMATTING_FAILED',
}

// Export all interfaces and classes
export * from './typescript-generator';
export * from './cdk-code-generator';
