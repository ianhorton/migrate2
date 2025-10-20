/**
 * Rollback Command
 * Rollback a migration to a previous step
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { MigrationOrchestrator } from '../../modules/orchestrator';
import { MigrationStep } from '../../types';

export function createRollbackCommand(): Command {
  const command = new Command('rollback');

  command
    .description('Rollback a migration to a previous step')
    .argument('<migration-id>', 'Migration ID to rollback')
    .option('--to <step>', 'Target step to rollback to')
    .option('--force', 'Skip confirmation prompt')
    .action(async (migrationId, options) => {
      try {
        await executeRollback(migrationId, options);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

async function executeRollback(migrationId: string, options: any): Promise<void> {
  const spinner = ora();
  const orchestrator = new MigrationOrchestrator();

  try {
    // Load migration state
    spinner.start('Loading migration state...');
    const { state, progress } = await orchestrator.getProgress(migrationId);
    spinner.succeed('Migration state loaded');

    // Display current state
    console.log(chalk.blue.bold('\n📊 Current State\n'));
    console.log(chalk.white('Migration ID:'), chalk.cyan(state.id));
    console.log(chalk.white('Current Step:'), chalk.cyan(state.currentStep));
    console.log(chalk.white('Status:'), getStatusColor(state.status)(state.status));
    console.log(chalk.white('Progress:'), chalk.cyan(`${progress.percentage}%`));

    // Determine target step
    let targetStep: MigrationStep;
    if (options.to) {
      targetStep = options.to as MigrationStep;
    } else {
      // Interactive selection
      const { selectedStep } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedStep',
          message: 'Select step to rollback to:',
          choices: Object.values(MigrationStep).map(step => ({
            name: step,
            value: step
          }))
        }
      ]);
      targetStep = selectedStep;
    }

    // Confirm rollback
    if (!options.force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: chalk.yellow(
            `⚠️  Are you sure you want to rollback to ${targetStep}? This will undo all changes after this step.`
          ),
          default: false
        }
      ]);

      if (!confirmed) {
        console.log(chalk.gray('\nRollback cancelled'));
        return;
      }
    }

    // Execute rollback
    spinner.start(`Rolling back to ${targetStep}...`);
    await orchestrator.rollback(migrationId, targetStep);
    spinner.succeed('Rollback completed');

    console.log(chalk.green.bold('\n✅ Rollback successful\n'));
    console.log(chalk.white('You can now resume the migration from:'), chalk.cyan(targetStep));
    console.log(chalk.white('Command:'), chalk.cyan(`sls-to-cdk migrate --resume ${migrationId}`));

  } catch (error) {
    spinner.fail('Rollback failed');
    throw error;
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'COMPLETED':
      return chalk.green;
    case 'FAILED':
      return chalk.red;
    case 'IN_PROGRESS':
      return chalk.yellow;
    case 'ROLLED_BACK':
      return chalk.magenta;
    default:
      return chalk.gray;
  }
}
