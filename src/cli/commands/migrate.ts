/**
 * Migrate Command
 * Main command to execute the migration process
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs';
import { MigrationOrchestrator } from '../../modules/orchestrator';
import { MigrationConfig, MigrationStep, StepResult } from '../../types';
import { interactiveWizard } from '../interactive';
import { displayProgress, displayStepResult, displayError } from '../display';
import { Logger } from '../../utils/logger';
import { ConfigBuilder } from '../../utils/config-builder';
import { DirectoryValidator } from '../../utils/directory-validator';
import { GitignoreManager } from '../../utils/gitignore-manager';

const logger = new Logger('MigrateCommand');

export function createMigrateCommand(): Command {
  const command = new Command('migrate');

  command
    .description('Execute the complete migration from Serverless to CDK')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-s, --source <dir>', 'Source directory containing serverless.yml')
    .option('-t, --target <dir>', 'Target directory for CDK output')
    .option('--stage <stage>', 'Serverless stage to migrate')
    .option('--region <region>', 'AWS region')
    .option('--dry-run', 'Run migration in dry-run mode (no changes applied)')
    .option('--auto-approve', 'Skip approval prompts')
    .option('--resume <id>', 'Resume a previous migration')
    .option('--skip-backup', 'Skip creating backups')
    .option('-v, --verbose', 'Verbose logging')
    .action(async (options) => {
      try {
        await executeMigration(options);
      } catch (error) {
        displayError(error as Error);
        process.exit(1);
      }
    });

  return command;
}

async function executeMigration(options: any): Promise<void> {
  const spinner = ora();

  try {
    // Get configuration
    let config: MigrationConfig;

    if (options.resume) {
      spinner.start('Loading migration state...');
      const orchestrator = new MigrationOrchestrator();
      const { state } = await orchestrator.getProgress(options.resume);
      config = state.config;
      spinner.succeed('Migration state loaded');
    } else if (options.config) {
      spinner.start('Loading configuration...');
      config = await loadConfigFromFile(options.config);
      spinner.succeed('Configuration loaded');
    } else if (options.source) {
      // Use ConfigBuilder to resolve target directory
      const configBuilder = new ConfigBuilder();
      const resolvedConfig = configBuilder.buildConfig({
        source: options.source,
        target: options.target, // optional - defaults to <source>/cdk
        dryRun: options.dryRun
      });

      // Validate target directory before migration
      const validation = DirectoryValidator.validateTargetDirectory(
        resolvedConfig.targetDir
      );

      if (!validation.valid) {
        throw new Error(
          `Target directory validation failed: ${validation.error}\n\n` +
          `Attempted to create CDK project at: ${resolvedConfig.targetDir}\n` +
          (resolvedConfig.isInPlace
            ? `(In-place mode: target was not specified, defaulting to <source>/cdk)`
            : `(Explicit target mode)`)
        );
      }

      // Create parent directory if needed
      if (validation.shouldCreateParent) {
        const parentDir = path.dirname(resolvedConfig.targetDir);
        spinner.start(`Creating parent directory: ${parentDir}`);
        fs.mkdirSync(parentDir, { recursive: true });
        spinner.succeed('Parent directory created');
      }

      config = {
        sourceDir: resolvedConfig.sourceDir,
        targetDir: resolvedConfig.targetDir,
        stage: options.stage || 'dev',
        region: options.region || process.env.AWS_REGION || 'us-east-1',
        accountId: process.env.AWS_ACCOUNT_ID || '',
        stackName: '',
        dryRun: resolvedConfig.dryRun,
        autoApprove: options.autoApprove || false,
        backupEnabled: !options.skipBackup,
        cdkLanguage: 'typescript'
      };

      // Inform user about in-place mode
      if (resolvedConfig.isInPlace) {
        console.log(chalk.blue.bold('ℹ️  In-place mode: CDK project will be created at:'));
        console.log(chalk.cyan(`   ${config.targetDir}\n`));
      }
    } else {
      // Interactive mode
      console.log(chalk.blue.bold('\n🚀 Serverless to CDK Migration Tool\n'));
      const answers = await interactiveWizard();

      // Use ConfigBuilder to resolve target directory (handles empty string)
      const configBuilder = new ConfigBuilder();
      const resolvedConfig = configBuilder.buildConfig({
        source: answers.sourceDir,
        target: answers.targetDir, // May be empty string -> defaults to <source>/cdk
        dryRun: answers.dryRun
      });

      // Validate target directory before migration
      const validation = DirectoryValidator.validateTargetDirectory(
        resolvedConfig.targetDir
      );

      if (!validation.valid) {
        throw new Error(
          `Target directory validation failed: ${validation.error}\n\n` +
          `Attempted to create CDK project at: ${resolvedConfig.targetDir}\n` +
          (resolvedConfig.isInPlace
            ? `(In-place mode: target was not specified, defaulting to <source>/cdk)`
            : `(Explicit target mode)`)
        );
      }

      // Create parent directory if needed
      if (validation.shouldCreateParent) {
        const parentDir = path.dirname(resolvedConfig.targetDir);
        spinner.start(`Creating parent directory: ${parentDir}`);
        fs.mkdirSync(parentDir, { recursive: true });
        spinner.succeed('Parent directory created');
      }

      config = {
        sourceDir: resolvedConfig.sourceDir,
        targetDir: resolvedConfig.targetDir,
        stage: answers.stage,
        region: answers.region,
        accountId: process.env.AWS_ACCOUNT_ID || '',
        stackName: answers.stackName,
        dryRun: resolvedConfig.dryRun,
        autoApprove: false,
        backupEnabled: answers.backupEnabled,
        cdkLanguage: answers.cdkLanguage
      };

      // Inform user about in-place mode
      if (resolvedConfig.isInPlace) {
        console.log(chalk.blue.bold('ℹ️  In-place mode: CDK project will be created at:'));
        console.log(chalk.cyan(`   ${config.targetDir}\n`));
      }
    }

    // Validate configuration
    validateConfig(config);

    // Display migration summary
    displayMigrationSummary(config);

    // Initialize orchestrator
    const orchestrator = new MigrationOrchestrator();

    // Set up progress tracking
    let currentSpinner: any = null;

    const onProgress = (step: MigrationStep, progress: number) => {
      displayProgress(step, progress);
    };

    const onStepComplete = (result: StepResult) => {
      if (currentSpinner && typeof currentSpinner.stop === 'function') {
        currentSpinner.stop();
      }
      displayStepResult(result);
    };

    // Execute migration
    console.log(chalk.blue('\n📋 Starting migration...\n'));

    let state;
    if (options.resume) {
      state = await orchestrator.resumeMigration(options.resume, {
        onProgress,
        onStepComplete
      });
    } else {
      state = await orchestrator.startMigration(config, {
        onProgress,
        onStepComplete
      });
    }

    // Display final status
    console.log('\n');
    if (state.status === 'COMPLETED') {
      console.log(chalk.green.bold('✅ Migration completed successfully!\n'));
      console.log(chalk.white('Migration ID:'), chalk.cyan(state.id));
      console.log(chalk.white('Started:'), chalk.cyan(state.startedAt.toISOString()));
      console.log(chalk.white('Completed:'), chalk.cyan(state.completedAt?.toISOString()));

      // Update .gitignore with /cdk/ entry (skip in dry-run mode)
      if (!config.dryRun) {
        try {
          const gitignoreResult = GitignoreManager.ensureCdkIgnored(config.sourceDir);

          if (gitignoreResult.created) {
            console.log(chalk.gray('  ✓ Created .gitignore with /cdk/ entry'));
          } else if (gitignoreResult.updated) {
            console.log(chalk.gray('  ✓ Updated .gitignore with /cdk/ entry'));
          } else if (gitignoreResult.alreadyExists) {
            console.log(chalk.gray('  ✓ .gitignore already contains /cdk/'));
          }

          if (gitignoreResult.error) {
            console.log(chalk.yellow(`  ⚠️  Could not update .gitignore: ${gitignoreResult.error}`));
          }
        } catch (error) {
          // Non-fatal error - just warn
          console.log(chalk.yellow(`  ⚠️  Could not update .gitignore: ${error}`));
        }
      }

      console.log(chalk.white('\nNext steps:'));
      console.log(chalk.gray('  1. Review the generated CDK code in:'), chalk.cyan(config.targetDir));
      console.log(chalk.gray('  2. Run:'), chalk.cyan('npm install'), chalk.gray('in the target directory'));
      console.log(chalk.gray('  3. Deploy with:'), chalk.cyan('cdk deploy'));
    } else if (state.status === 'FAILED') {
      console.log(chalk.red.bold('❌ Migration failed\n'));
      console.log(chalk.white('Migration ID:'), chalk.cyan(state.id));
      console.log(chalk.white('Error:'), chalk.red(state.error?.message));
      console.log(chalk.white('\nYou can resume this migration with:'));
      console.log(chalk.cyan(`  sls-to-cdk migrate --resume ${state.id}`));
    }

  } catch (error) {
    if (spinner.isSpinning) {
      spinner.fail('Migration failed');
    }
    throw error;
  }
}

function validateConfig(config: MigrationConfig): void {
  const errors: string[] = [];

  if (!config.sourceDir) {
    errors.push('Source directory is required');
  }

  // targetDir validation removed - now handled by DirectoryValidator

  if (!config.stage) {
    errors.push('Stage is required');
  }

  if (!config.region) {
    errors.push('AWS region is required');
  }

  if (errors.length > 0) {
    throw new Error('Invalid configuration:\n' + errors.map(e => `  - ${e}`).join('\n'));
  }
}

function displayMigrationSummary(config: MigrationConfig): void {
  console.log(chalk.blue.bold('\n📊 Migration Configuration\n'));
  console.log(chalk.white('Source:'), chalk.cyan(config.sourceDir));
  console.log(chalk.white('Target:'), chalk.cyan(config.targetDir));
  console.log(chalk.white('Stage:'), chalk.cyan(config.stage));
  console.log(chalk.white('Region:'), chalk.cyan(config.region));
  console.log(chalk.white('CDK Language:'), chalk.cyan(config.cdkLanguage));
  console.log(chalk.white('Dry Run:'), config.dryRun ? chalk.yellow('Yes') : chalk.green('No'));
  console.log(chalk.white('Backups:'), config.backupEnabled ? chalk.green('Enabled') : chalk.yellow('Disabled'));
  console.log('');
}

async function loadConfigFromFile(configPath: string): Promise<MigrationConfig> {
  // TODO: Implement config file loading
  throw new Error('Config file loading not yet implemented');
}
