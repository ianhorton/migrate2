/**
 * Interactive CDK Import
 * Spawns and monitors CDK import process with interactive prompt handling
 * Sprint 3: Interactive Import & Checkpoints
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { ImportDefinition, ImportResult } from '../../types/checkpoint';
import { Logger } from '../../utils/logger';

export interface InteractiveCDKImportOptions {
  dryRun?: boolean;
  verbose?: boolean;
  autoRespond?: boolean;
}

/**
 * Type guard for import definition structure
 */
function isValidImportDefinition(obj: unknown): obj is ImportDefinition {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const def = obj as Record<string, unknown>;

  return (
    typeof def.logicalId === 'string' &&
    def.logicalId.length > 0 &&
    typeof def.resourceType === 'string' &&
    def.resourceType.length > 0 &&
    typeof def.physicalId === 'string' &&
    def.physicalId.length > 0 &&
    typeof def.resourceIdentifier === 'object' &&
    def.resourceIdentifier !== null &&
    !Array.isArray(def.resourceIdentifier)
  );
}

/**
 * Type guard for process exit code
 */
function isValidExitCode(code: unknown): code is number {
  return typeof code === 'number' && Number.isInteger(code);
}

/**
 * Type guard for buffer data
 */
function isBuffer(data: unknown): data is Buffer {
  return Buffer.isBuffer(data);
}

export class InteractiveCDKImport {
  private logger: Logger;
  private currentProcess?: ChildProcess;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];
  private signalHandlersRegistered: boolean = false;
  private cleanupTimeout?: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger('InteractiveCDKImport');
    this.registerSignalHandlers();
  }

  /**
   * Validate array of import definitions
   */
  private validateImportDefinitions(definitions: unknown): ImportDefinition[] {
    if (!Array.isArray(definitions)) {
      throw new TypeError('Import definitions must be an array');
    }

    if (definitions.length === 0) {
      throw new TypeError('Import definitions array cannot be empty');
    }

    const validated: ImportDefinition[] = [];

    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      if (!isValidImportDefinition(def)) {
        throw new TypeError(
          `Invalid import definition at index ${i}: must have logicalId, resourceType, physicalId, and resourceIdentifier`
        );
      }
      validated.push(def);
    }

    return validated;
  }

  /**
   * Run interactive CDK import process
   */
  public async runImport(
    cdkProjectPath: string,
    importDefinitions: unknown,
    options: InteractiveCDKImportOptions = {}
  ): Promise<ImportResult> {
    // Validate input
    if (!cdkProjectPath || typeof cdkProjectPath !== 'string') {
      throw new TypeError('CDK project path must be a non-empty string');
    }

    // Validate and type-check import definitions
    const validatedDefinitions = this.validateImportDefinitions(importDefinitions);

    this.logger.info('Starting interactive CDK import...', {
      projectPath: cdkProjectPath,
      resourceCount: validatedDefinitions.length
    });

    // Validate CDK project
    await this.validateCDKProject(cdkProjectPath);

    // Show import plan
    this.showImportPlan(validatedDefinitions);

    if (options.dryRun) {
      this.logger.info('Dry-run mode: skipping actual import');
      return {
        status: 'success',
        resourcesImported: validatedDefinitions.length,
        output: ['Dry-run completed successfully']
      };
    }

    // Spawn CDK import process
    try {
      const result = await this.spawnImportProcess(
        cdkProjectPath,
        validatedDefinitions,
        options
      );
      return result;
    } catch (error) {
      this.logger.error('CDK import failed', error);
      return {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        output: this.outputBuffer
      };
    } finally {
      // Ensure cleanup happens even on error
      await this.dispose();
    }
  }

  /**
   * Validate CDK project exists and has required files
   */
  private async validateCDKProject(projectPath: string): Promise<void> {
    const fs = require('fs').promises;

    try {
      // Check if directory exists
      await fs.access(projectPath);

      // Check for cdk.json
      const cdkJsonPath = path.join(projectPath, 'cdk.json');
      await fs.access(cdkJsonPath);

      this.logger.info('CDK project validated', { projectPath });
    } catch (error) {
      throw new Error(`Invalid CDK project at ${projectPath}: ${error}`);
    }
  }

  /**
   * Show import plan to user
   */
  private showImportPlan(importDefinitions: ImportDefinition[]): void {
    console.log('\n📋 CDK Import Plan\n');
    console.log(`Resources to import: ${importDefinitions.length}\n`);

    for (const def of importDefinitions) {
      console.log(`  ✓ ${def.logicalId} (${def.resourceType})`);
      console.log(`    Physical ID: ${def.physicalId}`);
    }

    console.log('');
  }

  /**
   * Spawn CDK import process and monitor output
   */
  private async spawnImportProcess(
    cdkProjectPath: string,
    importDefinitions: ImportDefinition[],
    options: InteractiveCDKImportOptions
  ): Promise<ImportResult> {
    return new Promise((resolve, reject) => {
      const args = ['cdk', 'import', '--force'];

      if (options.verbose) {
        args.push('--verbose');
      }

      this.logger.info('Spawning CDK import process', { args });

      this.currentProcess = spawn('npx', args, {
        cwd: cdkProjectPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let currentResourceIndex = 0;
      let importedCount = 0;

      // Monitor stdout
      this.currentProcess.stdout?.on('data', (data: unknown) => {
        if (!isBuffer(data)) {
          this.logger.warn('Received non-buffer data from stdout');
          return;
        }

        const output = data.toString();
        this.outputBuffer.push(output);

        if (options.verbose) {
          console.log(output);
        }

        // Detect import prompts and auto-respond
        if (output.includes('import with') || output.includes('Enter the identifier')) {
          if (currentResourceIndex < importDefinitions.length) {
            const definition = importDefinitions[currentResourceIndex];
            const response = this.formatImportResponse(definition);

            this.logger.info(`Auto-responding for ${definition.logicalId}`, { response });
            this.currentProcess?.stdin?.write(response + '\n');
            currentResourceIndex++;
          }
        }

        // Track successful imports
        if (output.includes('✅') || output.includes('successfully imported')) {
          importedCount++;
          const resourceName = this.extractResourceNameFromOutput(output);
          console.log(`  ✅ Imported: ${resourceName}`);
        }
      });

      // Monitor stderr
      this.currentProcess.stderr?.on('data', (data: unknown) => {
        if (!isBuffer(data)) {
          this.logger.warn('Received non-buffer data from stderr');
          return;
        }

        const error = data.toString();
        this.errorBuffer.push(error);

        if (!error.includes('npm WARN')) {
          console.error('❌ Error:', error);
        }
      });

      // Handle process exit
      this.currentProcess.on('close', (code: unknown) => {
        let exitCode: number;
        if (!isValidExitCode(code)) {
          this.logger.error('Invalid exit code received from process', { code });
          exitCode = -1;
        } else {
          exitCode = code;
        }
        this.logger.info('CDK import process exited', { code: exitCode, importedCount });

        // Clear cleanup timeout since process exited
        if (this.cleanupTimeout) {
          clearTimeout(this.cleanupTimeout);
          this.cleanupTimeout = undefined;
        }

        if (exitCode === 0) {
          console.log(`\n✅ Import completed successfully! (${importedCount}/${importDefinitions.length} resources)`);
          resolve({
            status: 'success',
            resourcesImported: importedCount,
            output: this.outputBuffer
          });
        } else {
          console.error(`\n❌ Import failed with exit code ${exitCode}`);
          resolve({
            status: 'failed',
            errorCode: exitCode,
            errorMessage: this.errorBuffer.join('\n'),
            output: this.outputBuffer
          });
        }

        this.currentProcess = undefined;
      });

      // Handle process errors
      this.currentProcess.on('error', (error: Error) => {
        this.logger.error('Process error', error);
        reject(error);
      });
    });
  }

  /**
   * Validate resource identifier structure
   */
  private validateResourceIdentifier(identifier: unknown): Record<string, string> {
    if (typeof identifier !== 'object' || identifier === null || Array.isArray(identifier)) {
      throw new TypeError('Resource identifier must be a non-null object');
    }

    const result: Record<string, string> = {};
    const identifierObj = identifier as Record<string, unknown>;

    for (const [key, value] of Object.entries(identifierObj)) {
      if (typeof value !== 'string') {
        throw new TypeError(
          `Resource identifier value for key "${key}" must be a string, got ${typeof value}`
        );
      }
      result[key] = value;
    }

    return result;
  }

  /**
   * Format import response based on resource definition
   */
  private formatImportResponse(definition: ImportDefinition): string {
    // Validate resource identifier
    const validatedIdentifier = this.validateResourceIdentifier(definition.resourceIdentifier);

    // For most resources, physical ID is the identifier
    // Format: key1=value1,key2=value2
    const identifiers = Object.entries(validatedIdentifier)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return identifiers || definition.physicalId;
  }

  /**
   * Extract resource name from CDK output
   */
  private extractResourceNameFromOutput(output: string): string {
    // Try to extract resource name from patterns like:
    // "✅ MyResource successfully imported"
    // "Resource MyResource imported"
    const match = output.match(/(?:✅|Resource)\s+(\w+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Handle CDK prompts interactively
   */
  public async handlePrompt(prompt: string, definition: ImportDefinition): Promise<string> {
    this.logger.info('Handling CDK prompt', { prompt, logicalId: definition.logicalId });

    // Auto-respond based on resource type and prompt
    if (prompt.includes('physical resource id')) {
      return definition.physicalId;
    }

    if (prompt.includes('Enter the identifier')) {
      return this.formatImportResponse(definition);
    }

    // Default: return physical ID
    return definition.physicalId;
  }

  /**
   * Abort running import process
   */
  public abort(): void {
    this.cleanup();
  }

  /**
   * Clean up resources (child processes, timers)
   */
  private cleanup(): void {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.logger.warn('Aborting CDK import process');

      // Try graceful shutdown first
      this.currentProcess.kill('SIGTERM');

      // Force kill after timeout
      this.cleanupTimeout = setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.logger.warn('Force killing CDK import process');
          this.currentProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    this.currentProcess = undefined;
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;

    const handleShutdown = () => {
      this.logger.info('Received shutdown signal, cleaning up...');
      this.dispose();
      process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
    this.signalHandlersRegistered = true;
  }

  /**
   * Dispose of all resources
   */
  public async dispose(): Promise<void> {
    // Clear cleanup timeout
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = undefined;
    }

    // Kill child process
    this.cleanup();

    // Clear buffers to free memory
    this.outputBuffer = [];
    this.errorBuffer = [];
  }

  /**
   * Get current import progress
   */
  public getProgress(): {
    outputLines: number;
    errors: number;
    isRunning: boolean;
  } {
    return {
      outputLines: this.outputBuffer.length,
      errors: this.errorBuffer.length,
      isRunning: !!this.currentProcess
    };
  }
}
