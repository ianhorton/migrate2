/**
 * CodeTemplateBuilder - Sprint 4 Phase 5
 * Utility for building CDK code templates
 * No separate tests - tested indirectly via FunctionUrlGenerator and CloudFrontSuggester
 */

import { FunctionUrlConfig } from '../function-url-generator';

export class CodeTemplateBuilder {
  /**
   * Builds Function URL template
   */
  public static buildFunctionUrlTemplate(
    targetName: string,
    config: FunctionUrlConfig
  ): string {
    const urlVar = `${targetName}Url`;

    let code = `const ${urlVar} = ${targetName}.addFunctionUrl({\n`;
    code += `  authType: FunctionUrlAuthType.${config.authType}`;

    if (config.cors) {
      code += ',\n  cors: {\n';
      code += `    allowedOrigins: ${JSON.stringify(config.cors.allowedOrigins)},\n`;
      code += `    allowedMethods: [${config.cors.allowedMethods.map(m => `HttpMethod.${m}`).join(', ')}]`;

      if (config.cors.allowedHeaders?.length) {
        code += `,\n    allowedHeaders: ${JSON.stringify(config.cors.allowedHeaders)}`;
      }

      if (config.cors.allowCredentials !== undefined) {
        code += `,\n    allowCredentials: ${config.cors.allowCredentials}`;
      }

      if (config.cors.maxAge) {
        code += `,\n    maxAge: Duration.seconds(${config.cors.maxAge})`;
      }

      code += '\n  }';
    }

    code += '\n});\n';

    return code;
  }

  /**
   * Builds CfnOutput for Function URL
   */
  public static buildUrlOutput(
    functionName: string,
    urlVariableName: string
  ): string {
    return `
new CfnOutput(this, '${functionName}Url', {
  value: ${urlVariableName}.url,
  description: 'Function URL for ${functionName}'
});
`;
  }

  /**
   * Builds CloudFront distribution template (commented)
   */
  public static buildCloudFrontTemplate(
    functionUrlOutputName: string,
    functionName: string
  ): string {
    return `
// ========================================
// CloudFront Distribution (SUGGESTED)
// ========================================
// TODO: Uncomment and configure for production deployment
//
// This adds:
// - Custom domain support (api.example.com)
// - Global CDN caching (410+ edge locations)
// - DDoS protection (AWS Shield Standard)
// - WAF integration option
//
// Prerequisites:
// 1. Request ACM certificate in us-east-1 for your domain
//    aws acm request-certificate --domain-name api.example.com --region us-east-1
//
// 2. Validate certificate (DNS or email validation)
//
// 3. Update domainNames and certificate ARN below
//
// const ${functionName}Distribution = new Distribution(this, '${functionName}Distribution', {
//   defaultBehavior: {
//     origin: FunctionUrlOrigin.withOriginAccessControl(${functionUrlOutputName}),
//     allowedMethods: AllowedMethods.ALLOW_ALL,
//     cachePolicy: CachePolicy.CACHING_DISABLED,  // Change for cacheable content
//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
//   },
//   domainNames: ['api.example.com'],  // UPDATE THIS
//   certificate: Certificate.fromCertificateArn(
//     this,
//     '${functionName}Certificate',
//     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS
//   ),
//   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe
// });
//
// // Grant CloudFront permission to invoke Function URL
// ${functionName}Alias.grantInvokeUrl(
//   new ServicePrincipal('cloudfront.amazonaws.com', {
//     conditions: {
//       StringEquals: {
//         'AWS:SourceArn': \`arn:aws:cloudfront::\${this.account}:distribution/\${${functionName}Distribution.distributionId}\`
//       }
//     }
//   })
// );
//
// new CfnOutput(this, '${functionName}CloudFrontUrl', {
//   value: \`https://\${${functionName}Distribution.domainName}\`,
//   description: 'CloudFront distribution URL (replace with custom domain)'
// });
//
// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront

`;
  }

  /**
   * Builds Alias template
   */
  public static buildAliasTemplate(
    lambdaConstructName: string,
    logicalId: string,
    aliasName: string,
    description: string,
    provisionedConcurrency?: number
  ): string {
    const aliasVar = `${lambdaConstructName}Alias`;

    let code = `const ${aliasVar} = new Alias(this, '${logicalId}Alias', {\n`;
    code += `  aliasName: '${aliasName}',\n`;
    code += `  version: ${lambdaConstructName}.currentVersion,\n`;
    code += `  description: '${description}'`;

    if (provisionedConcurrency) {
      code += `,\n  provisionedConcurrentExecutions: ${provisionedConcurrency}`;
    }

    code += '\n});\n';

    return code;
  }
}
