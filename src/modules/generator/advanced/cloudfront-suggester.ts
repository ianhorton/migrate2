/**
 * CloudFrontSuggester - Sprint 4 Phase 4 (GREEN)
 * Suggests CloudFront distribution (commented code)
 */

import { ClassifiedResource } from '../../../types';
import { AdvancedConstructsOptions } from './alias-generator';
import { DetectionUtils } from './utils/detection-utils';

export interface CloudFrontSuggestion {
  shouldSuggest: boolean;
  reason: string;
}

export class CloudFrontSuggester {
  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions
  ) {}

  /**
   * Determines if CloudFront should be suggested
   */
  public shouldSuggestCloudFront(
    lambdaResource: ClassifiedResource,
    hasFunctionUrl: boolean
  ): CloudFrontSuggestion {
    // CloudFront requires Function URL
    if (!hasFunctionUrl) {
      return {
        shouldSuggest: false,
        reason: 'No Function URL - CloudFront requires HTTP endpoint'
      };
    }

    // Priority 1: Production environment with Function URL
    if (DetectionUtils.isProductionFunction(lambdaResource, this.options.stage)) {
      return {
        shouldSuggest: true,
        reason: 'Production deployment with Function URL - CloudFront recommended for custom domain'
      };
    }

    // Priority 2: Custom domain configured
    if (DetectionUtils.hasCustomDomain(this.options.serverlessConfig)) {
      return {
        shouldSuggest: true,
        reason: 'Custom domain configured - CloudFront enables domain for Function URLs'
      };
    }

    // Priority 3: High-traffic function
    if (this.expectsHighTraffic(lambdaResource)) {
      return {
        shouldSuggest: true,
        reason: 'High-memory function with URL - CloudFront caching can reduce costs'
      };
    }

    // Priority 4: User override
    if (this.options.suggestCloudFront === true) {
      return {
        shouldSuggest: true,
        reason: 'User configuration explicitly requests CloudFront suggestions'
      };
    }

    // Default: Don't suggest
    return {
      shouldSuggest: false,
      reason: 'Development or internal function - CloudFront not needed'
    };
  }

  /**
   * Generates commented CloudFront distribution code
   */
  public generateSuggestion(
    functionUrlOutputName: string,
    lambdaFunctionName: string
  ): string {
    let code = '\n// ========================================\n';
    code += '// CloudFront Distribution (SUGGESTED)\n';
    code += '// ========================================\n';
    code += '// TODO: Uncomment and configure for production deployment\n';
    code += '//\n';
    code += '// This adds:\n';
    code += '// - Custom domain support (api.example.com)\n';
    code += '// - Global CDN caching (410+ edge locations)\n';
    code += '// - DDoS protection (AWS Shield Standard)\n';
    code += '// - WAF integration option\n';
    code += '//\n';
    code += '// Prerequisites:\n';
    code += '// 1. Request ACM certificate in us-east-1 for your domain\n';
    code += '//    aws acm request-certificate --domain-name api.example.com --region us-east-1\n';
    code += '//\n';
    code += '// 2. Validate certificate (DNS or email validation)\n';
    code += '//\n';
    code += '// 3. Update domainNames and certificate ARN below\n';
    code += '//\n';
    code += `// const ${this.toCamelCase(lambdaFunctionName)}Distribution = new Distribution(this, '${this.toPascalCase(lambdaFunctionName)}Distribution', {\n`;
    code += '//   defaultBehavior: {\n';
    code += `//     origin: FunctionUrlOrigin.withOriginAccessControl(${functionUrlOutputName}),\n`;
    code += '//     allowedMethods: AllowedMethods.ALLOW_ALL,\n';
    code += '//     cachePolicy: CachePolicy.CACHING_DISABLED,  // Change for cacheable content\n';
    code += '//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER\n';
    code += '//   },\n';
    code += "//   domainNames: ['api.example.com'],  // UPDATE THIS\n";
    code += '//   certificate: Certificate.fromCertificateArn(\n';
    code += '//     this,\n';
    code += `//     '${this.toPascalCase(lambdaFunctionName)}Certificate',\n`;
    code += "//     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS\n";
    code += '//   ),\n';
    code += '//   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe\n';
    code += '// });\n';
    code += '//\n';
    code += '// // Grant CloudFront permission to invoke Function URL\n';
    code += `// ${this.toCamelCase(lambdaFunctionName)}Alias.grantInvokeUrl(\n`;
    code += "//   new ServicePrincipal('cloudfront.amazonaws.com', {\n";
    code += '//     conditions: {\n';
    code += '//       StringEquals: {\n';
    code += `//         'AWS:SourceArn': \`arn:aws:cloudfront::\${this.account}:distribution/\${${this.toCamelCase(lambdaFunctionName)}Distribution.distributionId}\`\n`;
    code += '//       }\n';
    code += '//     }\n';
    code += '//   })\n';
    code += '// );\n';
    code += '//\n';
    code += `// new CfnOutput(this, '${this.toPascalCase(lambdaFunctionName)}CloudFrontUrl', {\n`;
    code += `//   value: \`https://\${${this.toCamelCase(lambdaFunctionName)}Distribution.domainName}\`,\n`;
    code += "//   description: 'CloudFront distribution URL (replace with custom domain)'\n";
    code += '// });\n';
    code += '//\n';
    code += '// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront\n\n';

    return code;
  }

  /**
   * Generates console suggestion message
   */
  public generateConsoleSuggestion(lambdaFunctionName: string): string {
    return `
⚠️  Production Recommendation: ${lambdaFunctionName}

For production deployments, consider adding CloudFront:

1. Custom Domain
   - Use api.example.com instead of Lambda URL
   - Professional appearance
   - SSL certificate via ACM

2. Performance
   - Global CDN (410+ edge locations)
   - Reduced latency for global users
   - Caching for repeated requests

3. Security
   - DDoS protection (AWS Shield Standard)
   - WAF integration for advanced filtering
   - Origin Access Control (OAC) for Lambda

Setup Steps:
  1. Request ACM certificate in us-east-1
  2. Uncomment CloudFront code in generated stack
  3. Update certificate ARN and domain name
  4. Deploy and update DNS

See commented code in generated stack for CloudFront setup.
Documentation: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
`.trim();
  }

  /**
   * Checks if function expects high traffic
   */
  private expectsHighTraffic(lambdaResource: ClassifiedResource): boolean {
    // High memory (>= 512MB) or long timeout (>= 30s) indicates important function
    const memorySize = lambdaResource.Properties?.MemorySize || 0;
    const timeout = lambdaResource.Properties?.Timeout || 0;
    return memorySize >= 512 || timeout >= 30;
  }

  /**
   * Converts function name to camelCase
   */
  private toCamelCase(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1).replace(/[-_]/g, '');
  }

  /**
   * Converts function name to PascalCase
   */
  private toPascalCase(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, '');
  }
}
