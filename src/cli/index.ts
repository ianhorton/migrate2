#!/usr/bin/env node

/**
 * CLI Entry Point
 * Serverless to CDK Migration Tool
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createMigrateCommand } from './commands/migrate';
import { createScanCommand } from './commands/scan';
import { createCompareCommand } from './commands/compare';
import { createGenerateCommand } from './commands/generate';
import { createVerifyCommand } from './commands/verify';
import { createRollbackCommand } from './commands/rollback';

const program = new Command();

program
  .name('sls-to-cdk')
  .description('Automated migration tool from Serverless Framework to AWS CDK')
  .version('1.0.0');

// Add commands
program.addCommand(createMigrateCommand());
program.addCommand(createScanCommand());
program.addCommand(createCompareCommand());
program.addCommand(createGenerateCommand());
program.addCommand(createVerifyCommand());
program.addCommand(createRollbackCommand());

// List command - show all migrations
program
  .command('list')
  .description('List all migration states')
  .action(async () => {
    const { MigrationOrchestrator } = await import('../modules/orchestrator');
    const orchestrator = new MigrationOrchestrator();
    const migrations = await orchestrator.listMigrations();

    if (migrations.length === 0) {
      console.log(chalk.gray('No migrations found'));
      return;
    }

    console.log(chalk.blue.bold('\n📋 Migrations\n'));
    migrations.forEach(({ id, modifiedAt }) => {
      console.log(chalk.cyan(id), chalk.gray(`(${modifiedAt.toLocaleString()})`));
    });
    console.log('');
  });

// Status command - show migration status
program
  .command('status')
  .description('Show status of a migration')
  .argument('<migration-id>', 'Migration ID')
  .action(async (migrationId) => {
    const { MigrationOrchestrator } = await import('../modules/orchestrator');
    const { displaySummaryBox } = await import('./display');

    const orchestrator = new MigrationOrchestrator();
    const { state, progress } = await orchestrator.getProgress(migrationId);

    displaySummaryBox('Migration Status', [
      { label: 'ID', value: state.id, color: chalk.cyan },
      { label: 'Status', value: state.status, color: chalk.yellow },
      { label: 'Current Step', value: state.currentStep, color: chalk.white },
      { label: 'Progress', value: `${progress.percentage}%`, color: chalk.green },
      { label: 'Completed Steps', value: `${progress.completedSteps}/${progress.totalSteps}`, color: chalk.cyan },
      { label: 'Started', value: state.startedAt.toLocaleString(), color: chalk.gray }
    ]);

    if (state.completedAt) {
      console.log(chalk.white('Completed:'), chalk.gray(state.completedAt.toLocaleString()));
    }

    if (state.error) {
      console.log(chalk.red('\nError:'), chalk.red(state.error.message));
    }
  });

// Error handling
program.configureOutput({
  outputError: (str, write) => write(chalk.red(str))
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
