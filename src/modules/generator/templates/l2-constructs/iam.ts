import { ClassifiedResource } from '../../../../types';
import { ManagedPolicyDetector } from '../../utils/managed-policy-detector';
import { ReferenceResolver } from '../../utils/reference-resolver';
import { PolicyGenerator } from '../../utils/policy-generator';

interface PermissionAnalysis {
  hasManagedPolicies: boolean;
  managedPolicies: string[];
  hasCustomPolicies: boolean;
  customPolicies: any[];
  servicePrincipal: string;
}

export class IAMRoleGenerator {
  private managedPolicyDetector: ManagedPolicyDetector;
  private referenceResolver: ReferenceResolver;
  private policyGenerator: PolicyGenerator;

  constructor(allResources: ClassifiedResource[]) {
    this.managedPolicyDetector = new ManagedPolicyDetector();
    this.referenceResolver = new ReferenceResolver(allResources);
    this.policyGenerator = new PolicyGenerator(allResources, this.referenceResolver);
  }

  public generateRole(resource: ClassifiedResource): string {
    const analysis = this.analyzePermissions(resource);
    let code = this.generateRoleDeclaration(resource, analysis);

    if (analysis.hasCustomPolicies) {
      const roleName = this.toVariableName(resource.LogicalId);
      code += '\n' + this.generateCustomPermissions(roleName, analysis.customPolicies);
    }

    code = this.optimizeIAMRole(code, resource);
    return code;
  }

  private analyzePermissions(resource: ClassifiedResource): PermissionAnalysis {
    const properties = resource.Properties || {};
    const managedPolicyArns = properties.ManagedPolicyArns || [];
    const customPolicies = properties.Policies || [];

    // Extract service principal from AssumeRolePolicyDocument
    let servicePrincipal = 'lambda.amazonaws.com'; // default
    const assumeRolePolicy = properties.AssumeRolePolicyDocument;
    if (assumeRolePolicy && assumeRolePolicy.Statement && assumeRolePolicy.Statement.length > 0) {
      const statement = assumeRolePolicy.Statement[0];
      if (statement.Principal && statement.Principal.Service) {
        servicePrincipal = statement.Principal.Service;
      }
    }

    // Convert managed policy ARNs to policy names
    const managedPolicies = managedPolicyArns.map((arn: string) => {
      // Extract policy name from ARN (e.g., "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" -> "service-role/AWSLambdaBasicExecutionRole")
      const match = arn.match(/arn:aws:iam::aws:policy\/(.+)/);
      return match ? match[1] : arn;
    });

    return {
      hasManagedPolicies: managedPolicies.length > 0,
      managedPolicies,
      hasCustomPolicies: customPolicies.length > 0,
      customPolicies,
      servicePrincipal
    };
  }

  private generateRoleDeclaration(resource: ClassifiedResource, analysis: PermissionAnalysis): string {
    const roleName = this.toVariableName(resource.LogicalId);
    const suppressComments = resource.Metadata?.suppressComments ?? false;

    let code = '';
    if (!suppressComments) {
      code += `// IAM Role for ${resource.LogicalId}\n`;
    }

    code += `const ${roleName} = new iam.Role(this, '${resource.LogicalId}', {\n`;
    code += `  assumedBy: new iam.ServicePrincipal('${analysis.servicePrincipal}')`;

    if (analysis.hasManagedPolicies) {
      code += ',\n  managedPolicies: [\n';
      analysis.managedPolicies.forEach((policy, index) => {
        const isLast = index === analysis.managedPolicies.length - 1;
        code += `    iam.ManagedPolicy.fromAwsManagedPolicyName('${policy}')`;
        if (!isLast) code += ',';
        code += '\n';
      });
      code += '  ]';
    }

    code += '\n});';

    return code;
  }

  private generateCustomPermissions(roleName: string, policies: any[]): string {
    let code = '';

    policies.forEach((policy) => {
      const policyDocument = policy.PolicyDocument;
      if (!policyDocument || !policyDocument.Statement) return;

      policyDocument.Statement.forEach((statement: any) => {
        code += `\n${roleName}.addToPolicy(new iam.PolicyStatement({\n`;
        code += this.generatePolicyStatement(statement);
        code += '}));';
      });
    });

    return code;
  }

  private generatePolicyStatement(statement: any): string {
    let code = '';

    // Actions
    if (statement.Action) {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      code += '  actions: [';
      code += actions.map((a: string) => `'${a}'`).join(', ');
      code += ']';
    }

    // Resources
    if (statement.Resource) {
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
      code += ',\n  resources: [';

      const resourceRefs = resources.map((resource: any) => {
        if (typeof resource === 'string') {
          return `'${resource}'`;
        }

        // Handle Fn::GetAtt
        if (resource['Fn::GetAtt']) {
          const [logicalId, attr] = resource['Fn::GetAtt'];
          const varName = this.toVariableName(logicalId);
          return `${varName}.${this.toPropertyName(logicalId, attr)}`;
        }

        // Handle Fn::Sub for ARN templates with pseudo-parameters
        if (resource['Fn::Sub']) {
          const template = Array.isArray(resource['Fn::Sub'])
            ? resource['Fn::Sub'][0]
            : resource['Fn::Sub'];

          // Replace AWS pseudo-parameters with CDK equivalents
          let result = template
            .replace(/\$\{AWS::Partition\}/g, '${cdk.Aws.PARTITION}')
            .replace(/\$\{AWS::Region\}/g, '${cdk.Aws.REGION}')
            .replace(/\$\{AWS::AccountId\}/g, '${cdk.Aws.ACCOUNT_ID}')
            .replace(/\$\{AWS::StackName\}/g, '${cdk.Aws.STACK_NAME}');

          // Return as template literal
          return '`' + result + '`';
        }

        // Handle Fn::Join for ARN concatenation
        if (resource['Fn::Join']) {
          const [separator, parts] = resource['Fn::Join'];
          const resolvedParts = parts.map((part: any) => {
            if (typeof part === 'string') {
              return part;
            }
            if (part['Fn::GetAtt']) {
              const [logicalId, attr] = part['Fn::GetAtt'];
              const varName = this.toVariableName(logicalId);
              return `\${${varName}.${this.toPropertyName(logicalId, attr)}}`;
            }
            return '';
          });

          // Create template literal
          return '`' + resolvedParts.join('') + '`';
        }

        return `'${JSON.stringify(resource)}'`;
      });

      code += resourceRefs.join(', ');
      code += ']';
    }

    // Effect (if not Allow, which is default)
    if (statement.Effect && statement.Effect !== 'Allow') {
      code += `,\n  effect: iam.Effect.${statement.Effect.toUpperCase()}`;
    }

    code += '\n';
    return code;
  }

  private optimizeIAMRole(code: string, resource: ClassifiedResource): string {
    const suppressLogicalIdOverride = resource.Metadata?.suppressLogicalIdOverride ?? false;
    const suppressRemovalPolicy = resource.Metadata?.suppressRemovalPolicy ?? false;
    const suppressComments = resource.Metadata?.suppressComments ?? false;

    let optimized = code;

    // Remove logical ID overrides if suppressed
    if (suppressLogicalIdOverride) {
      optimized = optimized.replace(/\.overrideLogicalId\([^)]+\);?\n?/g, '');
      optimized = optimized.replace(/Fn::Sub.*\$\{AWS::StackName\}[^;]+;?\n?/g, '');
    }

    // Remove removal policy if suppressed
    if (suppressRemovalPolicy) {
      optimized = optimized.replace(/,?\s*removalPolicy:[^,}]+/g, '');
    }

    // Remove comments if suppressed
    if (suppressComments) {
      optimized = optimized.replace(/\/\/[^\n]*\n/g, '');
      optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    return optimized;
  }

  private toVariableName(logicalId: string): string {
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }

  private toPropertyName(logicalId: string, attribute: string): string {
    // Map CloudFormation attributes to CDK properties
    const resourceType = this.getResourceType(logicalId);

    if (resourceType === 'AWS::DynamoDB::Table' && attribute === 'Arn') {
      return 'tableArn';
    }

    if (resourceType === 'AWS::S3::Bucket' && attribute === 'Arn') {
      return 'bucketArn';
    }

    if (resourceType === 'AWS::Lambda::Function' && attribute === 'Arn') {
      return 'functionArn';
    }

    // Default: convert to camelCase
    return attribute.toLowerCase() + 'Arn';
  }

  private getResourceType(logicalId: string): string {
    const resource = this.referenceResolver['resourceMap'].get(logicalId);
    return resource?.Type || '';
  }
}
