/**
 * Interactive Wizard for Migration Configuration
 */

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { InteractiveAnswers } from '../types';

export async function interactiveWizard(): Promise<InteractiveAnswers> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'sourceDir',
      message: 'Source directory (containing serverless.yml):',
      default: '.',
      validate: (input: string) => {
        const serverlessPath = path.join(input, 'serverless.yml');
        if (!fs.existsSync(serverlessPath)) {
          return 'serverless.yml not found in this directory';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'targetDir',
      message: 'Target directory for CDK output:',
      default: './cdk-output',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Target directory is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'stackName',
      message: 'CDK stack name:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Stack name is required';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(input)) {
          return 'Stack name must start with a letter and contain only alphanumeric characters and hyphens';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'stage',
      message: 'Serverless stage to migrate:',
      default: 'dev',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Stage is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'region',
      message: 'AWS region:',
      default: process.env.AWS_REGION || 'us-east-1',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Region is required';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'cdkLanguage',
      message: 'CDK programming language:',
      choices: [
        { name: 'TypeScript', value: 'typescript' },
        { name: 'Python', value: 'python' },
        { name: 'Java', value: 'java' },
        { name: 'C#', value: 'csharp' }
      ],
      default: 'typescript'
    },
    {
      type: 'confirm',
      name: 'dryRun',
      message: 'Run in dry-run mode? (no changes will be applied)',
      default: true
    },
    {
      type: 'confirm',
      name: 'backupEnabled',
      message: 'Enable automatic backups at each step?',
      default: true
    }
  ]);

  return answers as InteractiveAnswers;
}

export async function confirmAction(message: string, defaultValue: boolean = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);

  return confirmed;
}

export async function selectFromList<T>(
  message: string,
  choices: Array<{ name: string; value: T }>
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices
    }
  ]);

  return selected;
}

export async function multiSelect<T>(
  message: string,
  choices: Array<{ name: string; value: T; checked?: boolean }>
): Promise<T[]> {
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices
    }
  ]);

  return selected;
}
