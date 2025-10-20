/**
 * Serverless Configuration Parser
 * Parses serverless.yml and resolves variable substitutions
 */

import { readFileSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';
import { ParsedServerlessConfig, CloudFormationTemplate } from '../../types/migration';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ServerlessParser {
  private config: ParsedServerlessConfig | null = null;

  /**
   * Parse serverless.yml configuration
   */
  async parseServerlessConfig(configPath: string): Promise<ParsedServerlessConfig> {
    try {
      const fileContents = readFileSync(configPath, 'utf8');
      const parsed = yamlLoad(fileContents) as ParsedServerlessConfig;

      // Basic validation
      if (!parsed.service) {
        throw new Error('Invalid serverless.yml: missing "service" field');
      }

      if (!parsed.provider) {
        throw new Error('Invalid serverless.yml: missing "provider" field');
      }

      // Resolve simple variable substitutions
      const resolved = this.resolveVariables(parsed) as ParsedServerlessConfig;
      this.config = resolved;
      return this.config;
    } catch (error) {
      throw new Error(
        `Failed to parse serverless.yml: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate CloudFormation by executing serverless package
   */
  async generateCloudFormation(
    serverlessPath: string,
    stage: string
  ): Promise<CloudFormationTemplate> {
    try {
      // Execute serverless package command
      const command = `cd ${serverlessPath} && npx serverless package --stage ${stage}`;
      await execAsync(command);

      // Read generated CloudFormation template
      const templatePath = `${serverlessPath}/.serverless/cloudformation-template-update-stack.json`;
      const templateContents = readFileSync(templatePath, 'utf8');
      const template = JSON.parse(templateContents) as CloudFormationTemplate;

      return template;
    } catch (error) {
      throw new Error(
        `Failed to generate CloudFormation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract explicit resources from serverless.yml
   */
  getExplicitResources(): Record<string, any> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call parseServerlessConfig first.');
    }

    return this.config.resources?.Resources || {};
  }

  /**
   * Get stack name from serverless config
   */
  getStackName(stage: string): string {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call parseServerlessConfig first.');
    }

    // Check for explicit stack name in provider
    if (this.config.provider.stackName) {
      return this.resolveString(this.config.provider.stackName, { stage });
    }

    // Default naming convention: {service}-{stage}
    return `${this.config.service}-${stage}`;
  }

  /**
   * Resolve variable substitutions in serverless config
   */
  private resolveVariables(config: any): any {
    const context = {
      stage: config.provider?.stage || 'dev',
      region: config.provider?.region || 'us-east-1',
      service: config.service,
    };

    const resolve = (obj: any): any => {
      if (typeof obj === 'string') {
        return this.resolveString(obj, context);
      } else if (Array.isArray(obj)) {
        return obj.map(resolve);
      } else if (obj && typeof obj === 'object') {
        const resolved: any = {};
        for (const [key, value] of Object.entries(obj)) {
          resolved[key] = resolve(value);
        }
        return resolved;
      }
      return obj;
    };

    return resolve(config);
  }

  /**
   * Resolve variable substitution in a string
   */
  private resolveString(str: string, context: Record<string, any>): string {
    // Handle ${env:VAR} substitutions
    str = str.replace(/\$\{env:(\w+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });

    // Handle ${self:path.to.value} substitutions
    str = str.replace(/\$\{self:([^}]+)\}/g, (_, path) => {
      return this.getNestedValue(this.config, path) || '';
    });

    // Handle ${opt:option} substitutions
    str = str.replace(/\$\{opt:(\w+)\}/g, (_, option) => {
      return context[option] || '';
    });

    // Handle simple variable references like ${stage}
    str = str.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return context[varName] || '';
    });

    return str;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Get all functions defined in serverless.yml
   */
  getFunctions(): Record<string, any> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call parseServerlessConfig first.');
    }

    return this.config.functions || {};
  }

  /**
   * Get custom configuration
   */
  getCustomConfig(): Record<string, any> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call parseServerlessConfig first.');
    }

    return this.config.custom || {};
  }
}
