/**
 * Human Intervention Manager
 *
 * Central system for prompting users during migration at critical decision points.
 * Provides interactive CLI with colored output, progress indicators, and audit trail.
 *
 * Features:
 * - Interactive menus with inquirer
 * - Colored terminal output with chalk
 * - Progress indicators with ora
 * - Intervention audit trail (JSON log)
 * - Dry-run mode support
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import {
  InterventionPrompt,
  InterventionResponse,
  InterventionAuditEntry,
  PhysicalResourceCandidate,
  Difference,
  DriftInfo,
} from '../../types/intervention';

export interface HumanInterventionManagerOptions {
  dryRun?: boolean;
  auditLogPath?: string;
  migrationId?: string;
  autoApprove?: boolean;
}

export class HumanInterventionManager {
  private readonly dryRun: boolean;
  private readonly auditLogPath: string;
  private readonly migrationId: string;
  private readonly autoApprove: boolean;
  private readonly interventions: InterventionAuditEntry[] = [];
  private fileHandles: Set<number> = new Set();
  private activeSpinners: Set<Ora> = new Set();
  private signalHandlersRegistered: boolean = false;

  constructor(options: HumanInterventionManagerOptions = {}) {
    this.dryRun = options.dryRun || false;
    this.migrationId = options.migrationId || `migration-${Date.now()}`;
    this.auditLogPath = options.auditLogPath || path.join(
      process.cwd(),
      '.migration-state',
      'interventions',
      `${this.migrationId}.json`
    );
    this.autoApprove = options.autoApprove || false;
    this.registerSignalHandlers();
  }

  /**
   * Prompt user for decision with interactive CLI
   */
  async prompt(prompt: InterventionPrompt): Promise<InterventionResponse> {
    // Display severity indicator
    const severityIcon = this.getSeverityIcon(prompt.severity);
    console.log(`\n${severityIcon} ${chalk.bold(prompt.question)}\n`);

    if (prompt.context) {
      console.log(chalk.gray(prompt.context));
      console.log();
    }

    // In auto-approve mode, use default or first option
    if (this.autoApprove) {
      const defaultValue = prompt.defaultValue || prompt.options?.[0]?.value || 'proceed';
      console.log(chalk.yellow(`[AUTO-APPROVE] Using default: ${defaultValue}`));
      return this.createResponse(prompt.id, defaultValue);
    }

    // In dry-run mode, simulate user input
    if (this.dryRun) {
      const simulatedValue = prompt.defaultValue || prompt.options?.[0]?.value || 'proceed';
      console.log(chalk.yellow(`[DRY-RUN] Simulating selection: ${simulatedValue}`));
      return this.createResponse(prompt.id, simulatedValue);
    }

    // Interactive prompt based on type
    let answer: any;

    switch (prompt.type) {
      case 'confirm':
        answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'value',
            message: prompt.question,
            default: prompt.defaultValue === 'true',
          },
        ]);
        return this.createResponse(
          prompt.id,
          answer.value ? 'proceed' : 'skip'
        );

      case 'input':
        answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: prompt.question,
            default: prompt.defaultValue,
          },
        ]);
        return this.createResponse(prompt.id, answer.value);

      case 'choice':
      case 'select':
        const choices = (prompt.options || []).map((opt) => ({
          name: opt.recommended
            ? `${chalk.green('✨')} ${opt.label} ${chalk.yellow('[RECOMMENDED]')}`
            : opt.label,
          value: opt.value,
          short: opt.label,
        }));

        if (prompt.allowSkip) {
          choices.push({
            name: chalk.gray('⏭️  Skip this resource'),
            value: 'skip',
            short: 'Skip',
          });
        }

        answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'value',
            message: prompt.question,
            choices,
            default: prompt.defaultValue,
          },
        ]);
        return this.createResponse(prompt.id, answer.value);

      default:
        throw new Error(`Unknown prompt type: ${prompt.type}`);
    }
  }

  /**
   * Prompt for physical resource ID selection
   */
  async promptForPhysicalId(
    logicalId: string,
    resourceType: string,
    candidates: PhysicalResourceCandidate[]
  ): Promise<string> {
    console.log(chalk.yellow('\n⚠️  Cannot automatically determine physical ID\n'));
    console.log(`${chalk.bold('Logical ID:')} ${logicalId}`);
    console.log(`${chalk.bold('Resource Type:')} ${resourceType}\n`);

    if (candidates.length === 0) {
      console.log(chalk.red('No candidates found in AWS account.'));
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'physicalId',
          message: 'Enter physical resource ID manually:',
          validate: (input) => input.length > 0 || 'Physical ID is required',
        },
      ]);
      return answer.physicalId;
    }

    console.log(`Found ${chalk.bold(candidates.length.toString())} candidate(s) in AWS account:\n`);

    // Sort by confidence descending
    const sortedCandidates = [...candidates].sort((a, b) => b.confidence - a.confidence);

    const choices = sortedCandidates.map((candidate) => {
      const confidencePercent = Math.round(candidate.confidence * 100);
      const icon = candidate.confidence >= 0.9 ? '✨' : candidate.confidence >= 0.7 ? '📍' : '❓';
      const label = candidate.confidence >= 0.9
        ? `${icon} ${candidate.physicalId} (${confidencePercent}% confidence) ${chalk.yellow('[RECOMMENDED]')}`
        : `${icon} ${candidate.physicalId} (${confidencePercent}% confidence)`;

      return {
        name: label,
        value: candidate.physicalId,
        short: candidate.physicalId,
      };
    });

    // Add manual entry option
    choices.push(
      {
        name: chalk.gray('✏️  Enter manually'),
        value: '__manual__',
        short: 'Manual entry',
      },
      {
        name: chalk.gray('⏭️  Skip this resource'),
        value: '__skip__',
        short: 'Skip',
      }
    );

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: 'Choose resource:',
        choices,
        pageSize: 10,
      },
    ]);

    if (answer.selection === '__manual__') {
      const manualAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'physicalId',
          message: 'Enter physical resource ID:',
          validate: (input) => input.length > 0 || 'Physical ID is required',
        },
      ]);
      return manualAnswer.physicalId;
    }

    if (answer.selection === '__skip__') {
      throw new Error(`User skipped physical ID selection for ${logicalId}`);
    }

    return answer.selection;
  }

  /**
   * Prompt for critical difference approval
   */
  async confirmCriticalDifference(
    resourceId: string,
    differences: Difference[]
  ): Promise<'proceed' | 'abort' | 'manual'> {
    console.log(chalk.red(`\n🔴 Critical differences found for ${resourceId}\n`));

    differences.forEach((diff) => {
      console.log(chalk.yellow(`  Path: ${diff.path}`));
      console.log(`  ${chalk.gray('Serverless:')} ${JSON.stringify(diff.serverlessValue)}`);
      console.log(`  ${chalk.gray('CDK:')} ${JSON.stringify(diff.cdkValue)}`);
      if (diff.description) {
        console.log(`  ${chalk.gray('→')} ${diff.description}`);
      }
      console.log();
    });

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'How would you like to proceed?',
        choices: [
          {
            name: 'Continue anyway (risky)',
            value: 'proceed',
          },
          {
            name: 'Abort migration',
            value: 'abort',
          },
          {
            name: 'Pause for manual fix',
            value: 'manual',
          },
        ],
      },
    ]);

    return answer.action;
  }

  /**
   * Show drift and ask for resolution strategy
   */
  async resolveDrift(
    resourceId: string,
    drift: DriftInfo
  ): Promise<'use-aws' | 'use-template' | 'manual'> {
    console.log(chalk.yellow(`\n⚠️  Drift detected for ${resourceId}\n`));
    console.log(`${chalk.bold('Status:')} ${drift.driftStatus}`);

    if (drift.propertyDifferences && drift.propertyDifferences.length > 0) {
      console.log(`\n${chalk.bold('Property Differences:')}`);
      drift.propertyDifferences.forEach((diff) => {
        console.log(`  ${chalk.cyan(diff.propertyPath)} (${diff.differenceType})`);
        console.log(`    ${chalk.gray('Expected:')} ${JSON.stringify(diff.expectedValue)}`);
        console.log(`    ${chalk.gray('Actual:')} ${JSON.stringify(diff.actualValue)}`);
      });
    }

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'strategy',
        message: 'How should this drift be resolved?',
        choices: [
          {
            name: 'Use AWS state (preserve manual changes)',
            value: 'use-aws',
          },
          {
            name: 'Use template definition (overwrite manual changes)',
            value: 'use-template',
          },
          {
            name: 'Pause for manual resolution',
            value: 'manual',
          },
        ],
      },
    ]);

    return answer.strategy;
  }

  /**
   * Record intervention for audit trail
   */
  recordIntervention(response: InterventionResponse, context?: any): void {
    const entry: InterventionAuditEntry = {
      migrationId: this.migrationId,
      response,
      context: context || { step: 'unknown' },
    };

    this.interventions.push(entry);

    // Write to disk
    this.saveAuditLog();
  }

  /**
   * Get intervention history for migration
   */
  getInterventionHistory(migrationId?: string): InterventionResponse[] {
    const targetId = migrationId || this.migrationId;
    return this.interventions
      .filter((entry) => entry.migrationId === targetId)
      .map((entry) => entry.response);
  }

  /**
   * Display a spinner with a message
   */
  spinner(message: string): Ora {
    const spinner = ora(message).start();
    this.activeSpinners.add(spinner);

    // Remove from set when spinner completes
    const originalStop = spinner.stop.bind(spinner);
    const originalSucceed = spinner.succeed.bind(spinner);
    const originalFail = spinner.fail.bind(spinner);

    spinner.stop = () => {
      this.activeSpinners.delete(spinner);
      return originalStop();
    };

    spinner.succeed = (text?: string) => {
      this.activeSpinners.delete(spinner);
      return originalSucceed(text);
    };

    spinner.fail = (text?: string) => {
      this.activeSpinners.delete(spinner);
      return originalFail(text);
    };

    return spinner;
  }

  /**
   * Create intervention response
   */
  private createResponse(promptId: string, value: string): InterventionResponse {
    const response: InterventionResponse = {
      promptId,
      action: value,
      value,
      timestamp: new Date(),
    };

    this.recordIntervention(response);
    return response;
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical':
        return chalk.red('🔴');
      case 'warning':
        return chalk.yellow('⚠️');
      case 'info':
        return chalk.blue('ℹ️');
      default:
        return '❓';
    }
  }

  /**
   * Save audit log to disk
   */
  private saveAuditLog(): void {
    let fd: number | undefined;

    try {
      const dir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Use synchronous file operations with explicit file descriptor tracking
      fd = fs.openSync(this.auditLogPath, 'w');
      this.fileHandles.add(fd);

      const data = JSON.stringify(this.interventions, null, 2);
      fs.writeSync(fd, data, 0, 'utf-8');

      fs.closeSync(fd);
      this.fileHandles.delete(fd);
      fd = undefined;
    } catch (error) {
      console.error(chalk.red('Failed to save audit log:'), error);
    } finally {
      // Ensure file handle is closed even on error
      if (fd !== undefined && this.fileHandles.has(fd)) {
        try {
          fs.closeSync(fd);
          this.fileHandles.delete(fd);
        } catch (closeError) {
          console.error('Failed to close file handle:', closeError);
        }
      }
    }
  }

  /**
   * Clean up active resources
   */
  private cleanup(): void {
    // Stop all active spinners
    for (const spinner of this.activeSpinners) {
      try {
        spinner.stop();
      } catch (error) {
        // Ignore spinner cleanup errors
      }
    }
    this.activeSpinners.clear();

    // Close any open file handles
    for (const fd of this.fileHandles) {
      try {
        fs.closeSync(fd);
      } catch (error) {
        console.error(`Failed to close file handle ${fd}:`, error);
      }
    }
    this.fileHandles.clear();

    // Close inquirer prompts (if possible)
    // Note: inquirer doesn't expose a direct cleanup method,
    // but stdin/stdout cleanup is handled by Node.js
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;

    const handleShutdown = () => {
      console.log('\nReceived shutdown signal, cleaning up...');
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
  public dispose(): void {
    // Clean up active resources
    this.cleanup();

    // Clear interventions array to free memory
    this.interventions.length = 0;
  }
}
