/**
 * App Template
 *
 * This is a template for generating CDK app entry point (bin/app.ts).
 * Variables that should be replaced:
 * - {{STACK_NAME}} - Name of the stack class
 * - {{STACK_FILE}} - Name of the stack file (kebab-case)
 * - {{STACK_ID}} - Stack ID for CloudFormation
 */

export const appTemplate = `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { {{STACK_NAME}} } from '../lib/{{STACK_FILE}}-stack';

const app = new cdk.App();

new {{STACK_NAME}}(app, '{{STACK_ID}}', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },

  // Uncomment to specialize this stack for the AWS Account/Region
  // env: { account: '123456789012', region: 'us-east-1' },

  // For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
});

app.synth();
`;
