/**
 * Generate CDK Step Executor
 * Generates CDK code from CloudFormation template
 */

import { BaseStepExecutor } from '../step-executor';
import {
  MigrationState,
  MigrationStep,
  CloudFormationTemplate,
  Resource
} from '../../../types';
import { Generator, GeneratedCode } from '../../generator';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

interface GenerateResult {
  cdkCode: GeneratedCode;
  projectPath: string;
  synthesized: boolean;
  templatePath?: string;
}

export class GenerateExecutor extends BaseStepExecutor {
  constructor() {
    super(MigrationStep.CDK_GENERATION);
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // Ensure scan step is completed
    const scanResult = state.stepResults[MigrationStep.INITIAL_SCAN];
    if (!scanResult || !scanResult.data?.cloudFormationTemplate) {
      this.logger.error('Scan step must be completed before generating CDK code');
      return false;
    }

    // Verify CDK CLI is installed
    try {
      execSync('cdk --version', { stdio: 'pipe' });
    } catch (error) {
      this.logger.error('CDK CLI not found. Please install: npm install -g aws-cdk');
      return false;
    }

    return true;
  }

  protected async executeStep(state: MigrationState): Promise<GenerateResult> {
    this.logger.info('Generating CDK code from CloudFormation template...');

    const { targetDir, cdkLanguage, stackName } = state.config;
    const scanData = state.stepResults[MigrationStep.INITIAL_SCAN].data;
    const cfTemplate: CloudFormationTemplate = scanData.cloudFormationTemplate;

    // Step 1: Initialize CDK project if it doesn't exist
    await this.ensureCDKProject(targetDir, cdkLanguage);

    // Step 2: Generate CDK code
    this.logger.info('Generating CDK constructs...');
    const generator = new Generator();

    // Convert CloudFormation resources to Resource array
    const resources = Object.entries(cfTemplate.Resources).map(([logicalId, resource]) => ({
      logicalId,
      type: resource.Type,
      properties: resource.Properties,
      dependencies: Array.isArray(resource.DependsOn)
        ? resource.DependsOn
        : resource.DependsOn
        ? [resource.DependsOn]
        : [],
      metadata: resource.Metadata
    }));

    const cdkCode = await generator.generate(resources, {
      stackName,
      language: cdkLanguage as 'typescript' | 'python',
      useL2Constructs: true,
      includeComments: true
    });

    // Step 3: Write CDK code to files
    const stackFilePath = await this.writeCDKStack(
      targetDir,
      cdkLanguage,
      stackName,
      cdkCode
    );
    this.logger.info(`CDK stack written to: ${stackFilePath}`);

    // Step 4: Install dependencies
    if (!state.config.dryRun) {
      await this.installDependencies(targetDir, cdkLanguage);
    }

    // Step 5: Synthesize CDK stack
    let synthesized = false;
    let templatePath: string | undefined;

    if (!state.config.dryRun) {
      this.logger.info('Synthesizing CDK stack...');
      try {
        await this.synthesizeCDK(targetDir);
        synthesized = true;

        // Find synthesized template
        templatePath = path.join(targetDir, 'cdk.out', `${stackName}.template.json`);
        const exists = await fs.access(templatePath).then(() => true).catch(() => false);

        if (exists) {
          this.logger.info(`Synthesized template: ${templatePath}`);
        } else {
          this.logger.warn('Synthesized template not found at expected location');
        }
      } catch (error) {
        this.logger.error('CDK synthesis failed', error);
        throw new Error(`Failed to synthesize CDK stack: ${error}`);
      }
    } else {
      this.logger.info('Skipping synthesis (dry-run mode)');
    }

    const result: GenerateResult = {
      cdkCode,
      projectPath: targetDir,
      synthesized,
      templatePath
    };

    this.logger.info('CDK code generation completed');

    return result;
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    this.logger.warn('Rolling back CDK generation...');

    // Remove generated CDK files
    const { targetDir } = state.config;
    const result = state.stepResults[MigrationStep.CDK_GENERATION];

    if (result?.data?.projectPath) {
      this.logger.info('CDK project files will be preserved for review');
      this.logger.info('Manual cleanup may be required');
    }
  }

  protected async runValidationChecks(state: MigrationState) {
    const checks = [];
    const result = state.stepResults[MigrationStep.CDK_GENERATION];

    // Check 1: CDK project exists
    if (result?.data?.projectPath) {
      const projectPath = result.data.projectPath;
      const cdkJsonPath = path.join(projectPath, 'cdk.json');

      try {
        await fs.access(cdkJsonPath);
        checks.push({
          name: 'cdk-project-initialized',
          passed: true,
          message: 'CDK project initialized successfully',
          severity: 'error' as const
        });
      } catch (error) {
        checks.push({
          name: 'cdk-project-initialized',
          passed: false,
          message: 'CDK project not properly initialized',
          severity: 'error' as const
        });
      }
    }

    // Check 2: CDK code generated
    if (result?.data?.cdkCode) {
      const hasCode = result.data.cdkCode.stackCode.length > 0;
      const resourceCount = result.data.cdkCode.constructs.length;

      checks.push({
        name: 'cdk-code-generated',
        passed: hasCode,
        message: hasCode
          ? `Generated CDK code with ${resourceCount} resources`
          : 'CDK code is empty',
        severity: 'error' as const
      });
    }

    // Check 3: CDK synthesis successful
    if (result?.data?.synthesized) {
      checks.push({
        name: 'cdk-synthesized',
        passed: true,
        message: 'CDK stack synthesized successfully',
        severity: 'error' as const
      });

      // Check 4: Synthesized template exists
      if (result.data.templatePath) {
        try {
          await fs.access(result.data.templatePath);
          const content = await fs.readFile(result.data.templatePath, 'utf-8');
          const template = JSON.parse(content);
          const resourceCount = Object.keys(template.Resources || {}).length;

          checks.push({
            name: 'synthesized-template-valid',
            passed: resourceCount > 0,
            message: `Synthesized template contains ${resourceCount} resources`,
            severity: 'error' as const
          });
        } catch (error) {
          checks.push({
            name: 'synthesized-template-valid',
            passed: false,
            message: 'Failed to read synthesized template',
            severity: 'error' as const
          });
        }
      }
    } else if (state.config.dryRun) {
      checks.push({
        name: 'cdk-synthesized',
        passed: true,
        message: 'Synthesis skipped (dry-run mode)',
        severity: 'info' as const
      });
    }

    return checks;
  }

  private async ensureCDKProject(targetDir: string, language: string): Promise<void> {
    const cdkJsonPath = path.join(targetDir, 'cdk.json');

    try {
      await fs.access(cdkJsonPath);
      this.logger.info('CDK project already exists');
    } catch (error) {
      this.logger.info(`Initializing CDK project with ${language}...`);
      await fs.mkdir(targetDir, { recursive: true });

      // Authenticate with AWS CodeArtifact before CDK init (organization-specific)
      try {
        this.logger.info('Authenticating with AWS CodeArtifact...');
        execSync(
          'aws codeartifact login --tool npm --repository smart-packages --domain essensys-smart-packages --domain-owner 786267582114 --region eu-west-1',
          { stdio: 'pipe' }
        );
        this.logger.info('✅ AWS CodeArtifact authentication successful');
      } catch (authError) {
        this.logger.warn('⚠️  AWS CodeArtifact authentication failed (continuing anyway)');
        this.logger.warn('If CDK init fails, run: npm run auth:codeartifact');
      }

      execSync(`cdk init app --language ${language}`, {
        cwd: targetDir,
        stdio: 'inherit'
      });
    }
  }

  private async writeCDKStack(
    targetDir: string,
    language: string,
    stackName: string,
    cdkCode: GeneratedCode
  ): Promise<string> {
    let filePath: string;

    switch (language) {
      case 'typescript':
        filePath = path.join(targetDir, 'lib', `${stackName.toLowerCase()}-stack.ts`);
        break;
      case 'python':
        filePath = path.join(targetDir, stackName.toLowerCase().replace(/-/g, '_'), `${stackName.toLowerCase()}_stack.py`);
        break;
      default:
        throw new Error(`Unsupported CDK language: ${language}`);
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, cdkCode.stackCode);

    return filePath;
  }

  private async installDependencies(targetDir: string, language: string): Promise<void> {
    this.logger.info('Installing dependencies...');

    if (language === 'typescript') {
      execSync('npm install', {
        cwd: targetDir,
        stdio: 'inherit'
      });
    } else if (language === 'python') {
      execSync('pip install -r requirements.txt', {
        cwd: targetDir,
        stdio: 'inherit'
      });
    }
  }

  private async synthesizeCDK(targetDir: string): Promise<void> {
    execSync('cdk synth', {
      cwd: targetDir,
      stdio: 'inherit'
    });
  }
}
