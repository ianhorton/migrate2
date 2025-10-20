/**
 * Stack Template
 *
 * This is a template for generating CDK stack files.
 * Variables that should be replaced:
 * - {{IMPORTS}} - Import statements
 * - {{STACK_NAME}} - Name of the stack class
 * - {{CONSTRUCTS}} - Generated construct code
 */

export const stackTemplate = `{{IMPORTS}}

/**
 * {{STACK_NAME}} - Migrated from Serverless Framework
 *
 * This stack contains resources that were imported from an existing
 * Serverless Framework application. All resources have RemovalPolicy.RETAIN
 * to prevent accidental deletion.
 */
export class {{STACK_NAME}} extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

{{CONSTRUCTS}}
  }
}
`;
