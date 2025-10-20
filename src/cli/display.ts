/**
 * Display utilities for CLI output
 * Progress indicators, colored output, and formatting
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { MigrationStep, StepResult, MigrationStatus } from '../types';

/**
 * Display progress for a migration step
 */
export function displayProgress(step: MigrationStep, progress: number): void {
  const progressBar = createProgressBar(progress, 30);
  console.log(chalk.cyan(`[${progressBar}] ${progress}%`), chalk.white(getStepLabel(step)));
}

/**
 * Display step result with appropriate colors
 */
export function displayStepResult(result: StepResult): void {
  const icon = getStatusIcon(result.status);
  const color = getStatusColor(result.status);
  const duration = result.completedAt && result.startedAt
    ? `(${((result.completedAt.getTime() - result.startedAt.getTime()) / 1000).toFixed(2)}s)`
    : '';

  console.log(
    color(`${icon} ${getStepLabel(result.step)}`),
    chalk.gray(duration)
  );

  if (result.error) {
    console.log(chalk.red(`   Error: ${result.error.message}`));
  }
}

/**
 * Display error with formatting
 */
export function displayError(error: Error): void {
  console.log('\n');
  console.log(chalk.red.bold('❌ Error:'), chalk.red(error.message));

  if (error.stack) {
    console.log(chalk.gray('\nStack trace:'));
    console.log(chalk.gray(error.stack));
  }

  console.log('\n');
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠️  Warning:'), chalk.yellow(message));
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue('ℹ️  Info:'), chalk.white(message));
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green('✅'), chalk.green(message));
}

/**
 * Create a spinner with custom text
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots'
  });
}

/**
 * Create a progress bar
 */
function createProgressBar(percentage: number, width: number = 30): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Get step label with emoji
 */
function getStepLabel(step: MigrationStep): string {
  const labels: Record<MigrationStep, string> = {
    [MigrationStep.INITIAL_SCAN]: '📡 Initial Scan',
    [MigrationStep.DISCOVERY]: '🔍 Resource Discovery',
    [MigrationStep.CLASSIFICATION]: '📊 Resource Classification',
    [MigrationStep.COMPARISON]: '🔀 Template Comparison',
    [MigrationStep.TEMPLATE_MODIFICATION]: '✏️  Template Modification',
    [MigrationStep.CDK_GENERATION]: '⚡ CDK Generation',
    [MigrationStep.IMPORT_PREPARATION]: '📥 Import Preparation',
    [MigrationStep.VERIFICATION]: '✅ Verification',
    [MigrationStep.COMPLETE]: '🎉 Complete'
  };

  return labels[step] || step;
}

/**
 * Get status icon
 */
function getStatusIcon(status: MigrationStatus): string {
  const icons: Record<MigrationStatus, string> = {
    [MigrationStatus.PENDING]: '⏳',
    [MigrationStatus.IN_PROGRESS]: '🔄',
    [MigrationStatus.COMPLETED]: '✅',
    [MigrationStatus.FAILED]: '❌',
    [MigrationStatus.ROLLED_BACK]: '⏪'
  };

  return icons[status] || '?';
}

/**
 * Get status color function
 */
function getStatusColor(status: MigrationStatus): (text: string) => string {
  const colors: Record<MigrationStatus, (text: string) => string> = {
    [MigrationStatus.PENDING]: chalk.gray,
    [MigrationStatus.IN_PROGRESS]: chalk.yellow,
    [MigrationStatus.COMPLETED]: chalk.green,
    [MigrationStatus.FAILED]: chalk.red,
    [MigrationStatus.ROLLED_BACK]: chalk.magenta
  };

  return colors[status] || chalk.white;
}

/**
 * Display a table
 */
export function displayTable(headers: string[], rows: string[][]): void {
  const columnWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
    return Math.max(header.length, maxRowWidth);
  });

  // Header
  const headerRow = headers
    .map((header, i) => header.padEnd(columnWidths[i]))
    .join(' │ ');

  console.log(chalk.bold(headerRow));
  console.log('─'.repeat(headerRow.length));

  // Rows
  rows.forEach(row => {
    const rowStr = row
      .map((cell, i) => (cell || '').padEnd(columnWidths[i]))
      .join(' │ ');
    console.log(rowStr);
  });
}

/**
 * Display a summary box
 */
export function displaySummaryBox(title: string, items: Array<{ label: string; value: string; color?: (text: string) => string }>): void {
  const maxLabelWidth = Math.max(...items.map(item => item.label.length));

  console.log(chalk.blue.bold(`\n${title}\n`));
  items.forEach(({ label, value, color = chalk.white }) => {
    console.log(
      chalk.gray(label.padEnd(maxLabelWidth + 2)),
      color(value)
    );
  });
  console.log('');
}
