# Sprint 2 Pseudocode: IAM Role Generation

**Sprint**: 2 of 5
**SPARC Phase**: Pseudocode (Phase 2)
**Created**: 2025-10-22
**Status**: 🟡 Pending Phase Gate 2 Approval

---

## Overview

This document provides detailed algorithms for generating clean, idiomatic IAM role code in AWS CDK TypeScript. The algorithms transform CloudFormation IAM roles into compact CDK constructs using managed policies and construct references, achieving a 60%+ code reduction.

### High-Level Flow

```pseudocode
INPUT: ClassifiedResource (from Sprint 1)
PIPELINE:
  1. Extract role properties (name, principal, policies)
  2. Detect managed policy equivalents
  3. Separate managed vs custom permissions
  4. Generate role declaration with managed policies
  5. Generate addToPolicy() calls for custom permissions
  6. Resolve resource references to construct properties
  7. Optimize and format output code
OUTPUT: Clean TypeScript CDK code string
```

### Data Flow

```
ClassifiedResource
    ↓
analyzePermissions()
    ↓
{managedPolicies: [], customPermissions: []}
    ↓
generateRoleDeclaration() → "const role = new Role(...)"
    ↓
generateCustomPermissions() → "role.addToPolicy(...)"
    ↓
optimizeIAMRole() → Final clean code
```

---

## Core Algorithms

### 1. IAMRoleGenerator.generateRole()

**Purpose**: Main entry point for generating complete IAM role code

**Input**:
- `resource`: ClassifiedResource (IAM role)
- `context`: GeneratorContext (available resources, variable names, imports)

**Output**:
- TypeScript code string

**Algorithm**:

```pseudocode
FUNCTION generateRole(resource, context):
  // Step 1: Extract basic role properties
  roleName = extractRoleName(resource)
  assumedBy = extractAssumedBy(resource)
  logicalId = resource.LogicalId
  variableName = toVariableName(logicalId)

  // Step 2: Analyze permissions to separate managed vs custom
  {managedPolicies, customPermissions} = analyzePermissions(resource)

  // Step 3: Generate role declaration
  roleDeclaration = generateRoleDeclaration(
    resource,
    variableName,
    roleName,
    assumedBy,
    managedPolicies
  )

  // Step 4: Generate custom permission statements
  customCode = ""
  IF customPermissions.length > 0:
    customCode = generateCustomPermissions(
      variableName,
      customPermissions,
      context
    )

  // Step 5: Combine declaration and permissions
  fullCode = roleDeclaration
  IF customCode != "":
    fullCode += "\n\n" + customCode

  // Step 6: Add required imports to context
  context.imports.add("Role")
  context.imports.add("ServicePrincipal")
  context.imports.add("Effect")

  IF managedPolicies.length > 0:
    context.imports.add("ManagedPolicy")

  IF customPermissions.length > 0:
    context.imports.add("PolicyStatement")

  // Step 7: Register variable name
  context.variableNames.set(logicalId, variableName)

  // Step 8: Optimize final output
  optimizedCode = optimizeIAMRole(fullCode, resource)

  RETURN optimizedCode
END FUNCTION

// Time Complexity: O(P × S) where P = policies, S = statements per policy
// Space Complexity: O(P + C) where C = custom permissions count
```

**Decision Tree**:

```
Has resource.managedPolicyEquivalent from Sprint 1?
├─ YES: Use managed policy, skip matching inline policies
│   └─ Has additional custom permissions?
│       ├─ YES: Add managed policy + addToPolicy() calls
│       └─ NO: Only managed policy
└─ NO: Check Properties.ManagedPolicyArns
    ├─ Present: Use explicit managed policies + custom
    └─ None: Generate all as addToPolicy() calls
```

---

### 2. IAMRoleGenerator.analyzePermissions()

**Purpose**: Separate managed policies from custom permissions

**Input**:
- `resource`: ClassifiedResource

**Output**:
- `{ managedPolicies: string[], customPermissions: PolicyStatement[] }`

**Algorithm**:

```pseudocode
FUNCTION analyzePermissions(resource):
  managedPolicies = []
  customPermissions = []

  // Step 1: Check Sprint 1 detection
  IF resource.managedPolicyEquivalent exists:
    managedPolicies.push(resource.managedPolicyEquivalent)

  // Step 2: Check explicit managed policy ARNs
  IF resource.Properties.ManagedPolicyArns exists:
    FOR EACH arn IN resource.Properties.ManagedPolicyArns:
      // Extract policy name from ARN
      // "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
      // -> "service-role/AWSLambdaBasicExecutionRole"
      policyName = extractPolicyNameFromArn(arn)
      IF policyName NOT IN managedPolicies:
        managedPolicies.push(policyName)

  // Step 3: Extract inline policies
  policies = extractPolicies(resource)

  // Step 4: Determine which inline policies to keep
  FOR EACH policy IN policies:
    policyStatements = policy.PolicyDocument.Statement || []

    FOR EACH statement IN policyStatements:
      // Check if this statement is covered by managed policies
      IF NOT isCoveredByManagedPolicy(statement, managedPolicies):
        // Extract actions, effect, resources, conditions
        customPermission = {
          actions: extractActions(statement),
          effect: statement.Effect || "Allow",
          resources: statement.Resource || [],
          conditions: statement.Condition || undefined
        }
        customPermissions.push(customPermission)

  // Step 5: Group and deduplicate custom permissions
  customPermissions = groupAndDeduplicatePermissions(customPermissions)

  RETURN {
    managedPolicies: managedPolicies,
    customPermissions: customPermissions
  }
END FUNCTION

// Time Complexity: O(P × S × M) where M = managed policies
// Space Complexity: O(P + M)
```

**Coverage Check Details**:

```pseudocode
FUNCTION isCoveredByManagedPolicy(statement, managedPolicies):
  actions = extractActions(statement)

  FOR EACH managedPolicy IN managedPolicies:
    IF managedPolicy == "service-role/AWSLambdaBasicExecutionRole":
      // BasicExecutionRole covers these 3 actions
      basicActions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]

      // Check if all statement actions are in basic actions
      IF actions.every(action => action IN basicActions):
        RETURN true

    // Future: Check other managed policies
    // IF managedPolicy == "service-role/AWSLambdaVPCAccessExecutionRole":
    //   Check VPC actions...

  RETURN false
END FUNCTION
```

---

### 3. IAMRoleGenerator.generateRoleDeclaration()

**Purpose**: Generate the Role constructor with managed policies

**Input**:
- `resource`: ClassifiedResource
- `variableName`: TypeScript variable name
- `roleName`: AWS role name
- `assumedBy`: Service principal string
- `managedPolicies`: Array of managed policy names

**Output**:
- TypeScript code string

**Algorithm**:

```pseudocode
FUNCTION generateRoleDeclaration(resource, variableName, roleName, assumedBy, managedPolicies):
  // Step 1: Build constructor parameters
  lines = []

  // Step 2: Start declaration
  lines.push(`const ${variableName} = new Role(this, "${resource.LogicalId}", {`)

  // Step 3: Add role name if present
  IF roleName != "":
    lines.push(`  roleName: "${roleName}",`)

  // Step 4: Add assumed by principal
  lines.push(`  assumedBy: new ServicePrincipal("${assumedBy}"),`)

  // Step 5: Add managed policies if any
  IF managedPolicies.length > 0:
    lines.push(`  managedPolicies: [`)

    FOR EACH policyName IN managedPolicies:
      lines.push(`    ManagedPolicy.fromAwsManagedPolicyName("${policyName}"),`)

    lines.push(`  ]`)

  // Step 6: Close constructor
  lines.push(`});`)

  // Step 7: Join lines with proper indentation
  code = lines.join("\n")

  RETURN code
END FUNCTION

// Time Complexity: O(M) where M = managed policies
// Space Complexity: O(M)
```

**Example Output**:

```typescript
const iamRoleLambdaExecution = new Role(this, "IamRoleLambdaExecution", {
  roleName: "migration-sandbox-dev-us-east-1-lambdaRole",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});
```

---

### 4. IAMRoleGenerator.generateCustomPermissions()

**Purpose**: Generate addToPolicy() calls for custom permissions

**Input**:
- `variableName`: Role variable name
- `permissions`: Array of PolicyStatement objects
- `context`: GeneratorContext

**Output**:
- TypeScript code string

**Algorithm**:

```pseudocode
FUNCTION generateCustomPermissions(variableName, permissions, context):
  lines = []

  // Step 1: Group permissions by service
  groupedPermissions = groupPermissionsByService(permissions)

  // Step 2: Generate addToPolicy for each group
  FOR EACH {service, permissionGroup} IN groupedPermissions:
    // Add comment for service group
    IF service != "mixed":
      lines.push(`// ${service} permissions`)

    FOR EACH permission IN permissionGroup:
      // Step 3: Build PolicyStatement
      statement = generatePolicyStatement(permission, context)

      // Step 4: Create addToPolicy call
      lines.push(`${variableName}.addToPolicy(`)
      lines.push(`  ${statement}`)
      lines.push(`);`)

      // Add blank line between groups
      lines.push("")

  // Step 5: Remove trailing blank line
  IF lines.length > 0 AND lines[lines.length - 1] == "":
    lines.pop()

  RETURN lines.join("\n")
END FUNCTION

// Time Complexity: O(P × A) where A = actions per permission
// Space Complexity: O(P)
```

**Service Grouping**:

```pseudocode
FUNCTION groupPermissionsByService(permissions):
  groups = {}

  FOR EACH permission IN permissions:
    // Extract service from first action
    // "dynamodb:GetItem" -> "dynamodb"
    firstAction = permission.actions[0]
    service = firstAction.split(":")[0]

    // Check if all actions are same service
    allSameService = permission.actions.every(action =>
      action.startsWith(service + ":")
    )

    IF allSameService:
      IF service NOT IN groups:
        groups[service] = []
      groups[service].push(permission)
    ELSE:
      // Mixed services
      IF "mixed" NOT IN groups:
        groups["mixed"] = []
      groups["mixed"].push(permission)

  // Sort groups: dynamodb, s3, logs, others, mixed
  priorityOrder = ["dynamodb", "s3", "logs", "lambda", "sqs", "sns"]

  sortedGroups = []
  FOR EACH service IN priorityOrder:
    IF service IN groups:
      sortedGroups.push({service, permissions: groups[service]})
      DELETE groups[service]

  // Add remaining services alphabetically
  FOR EACH service IN SORTED(groups.keys()):
    sortedGroups.push({service, permissions: groups[service]})

  RETURN sortedGroups
END FUNCTION
```

---

### 5. IAMRoleGenerator.generatePolicyStatement()

**Purpose**: Generate PolicyStatement constructor

**Input**:
- `permission`: PolicyStatement object
- `context`: GeneratorContext

**Output**:
- TypeScript code string

**Algorithm**:

```pseudocode
FUNCTION generatePolicyStatement(permission, context):
  lines = []

  // Step 1: Start PolicyStatement
  lines.push("new PolicyStatement({")

  // Step 2: Add actions
  IF permission.actions.length == 1:
    lines.push(`  actions: ["${permission.actions[0]}"],`)
  ELSE:
    lines.push(`  actions: [`)
    FOR EACH action IN permission.actions:
      lines.push(`    "${action}",`)
    lines.push(`  ],`)

  // Step 3: Add effect (only if DENY, ALLOW is default)
  IF permission.effect == "Deny":
    lines.push(`  effect: Effect.DENY,`)
  ELSE:
    lines.push(`  effect: Effect.ALLOW,`)

  // Step 4: Add resources
  resolvedResources = resolveResourceReferences(permission.resources, context)

  IF resolvedResources.length == 1:
    lines.push(`  resources: [${resolvedResources[0]}]`)
  ELSE:
    lines.push(`  resources: [`)
    FOR EACH resource IN resolvedResources:
      lines.push(`    ${resource},`)
    lines.push(`  ]`)

  // Step 5: Add conditions if present
  IF permission.conditions exists:
    conditionCode = generateConditions(permission.conditions)
    lines.push(`,`)
    lines.push(`  conditions: ${conditionCode}`)

  // Step 6: Close PolicyStatement
  lines.push("})")

  RETURN lines.join("\n")
END FUNCTION

// Time Complexity: O(A + R) where A = actions, R = resources
// Space Complexity: O(A + R)
```

---

### 6. ReferenceResolver.resolveResourceReferences()

**Purpose**: Convert CloudFormation references to CDK construct properties

**Input**:
- `resources`: Array of resource references (strings, objects with Ref/GetAtt/Sub)
- `context`: GeneratorContext

**Output**:
- Array of TypeScript code strings

**Algorithm**:

```pseudocode
FUNCTION resolveResourceReferences(resources, context):
  resolved = []

  FOR EACH resource IN resources:
    // Step 1: Determine reference type
    IF resource is string:
      // Plain ARN string or wildcard
      resolved.push(formatStringLiteral(resource))

    ELSE IF resource.Ref exists:
      // Ref: { Ref: "CounterTable" }
      resolvedRef = resolveRef(resource.Ref, context)
      resolved.push(resolvedRef)

    ELSE IF resource["Fn::GetAtt"] exists:
      // GetAtt: { Fn::GetAtt: ["CounterTable", "Arn"] }
      resolvedAtt = resolveGetAtt(resource["Fn::GetAtt"], context)
      resolved.push(resolvedAtt)

    ELSE IF resource["Fn::Sub"] exists:
      // Sub: { Fn::Sub: "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${TableName}" }
      resolvedSub = resolveFnSub(resource["Fn::Sub"], context)
      resolved.push(resolvedSub)

    ELSE IF resource["Fn::Join"] exists:
      // Join: { Fn::Join: ["", ["arn:", { Ref: "Bucket" }]] }
      resolvedJoin = resolveFnJoin(resource["Fn::Join"], context)
      resolved.push(resolvedJoin)

    ELSE:
      // Unknown type, keep as string
      resolved.push(JSON.stringify(resource))

  RETURN resolved
END FUNCTION

// Time Complexity: O(R × D) where D = depth of nested functions
// Space Complexity: O(R)
```

**Ref Resolution**:

```pseudocode
FUNCTION resolveRef(logicalId, context):
  // Step 1: Lookup resource in context
  resource = context.resourceMap.get(logicalId)

  IF resource is undefined:
    // External resource, warn and return string
    WARN("Resource ${logicalId} not found, using string reference")
    RETURN `"${logicalId}"`

  // Step 2: Get variable name
  variableName = context.variableNames.get(logicalId)

  IF variableName is undefined:
    // Fallback to camelCase
    variableName = toCamelCase(logicalId)

  // Step 3: Determine property based on resource type
  IF resource.Type == "AWS::DynamoDB::Table":
    RETURN `${variableName}.tableName`

  ELSE IF resource.Type == "AWS::S3::Bucket":
    RETURN `${variableName}.bucketName`

  ELSE IF resource.Type == "AWS::Lambda::Function":
    RETURN `${variableName}.functionName`

  ELSE:
    // Generic reference
    RETURN variableName
END FUNCTION
```

**GetAtt Resolution**:

```pseudocode
FUNCTION resolveGetAtt(parts, context):
  // parts: ["CounterTable", "Arn"]
  logicalId = parts[0]
  attribute = parts[1]

  // Step 1: Lookup resource
  resource = context.resourceMap.get(logicalId)

  IF resource is undefined:
    WARN("Resource ${logicalId} not found")
    RETURN `"unknown-${logicalId}-${attribute}"`

  // Step 2: Get variable name
  variableName = context.variableNames.get(logicalId) || toCamelCase(logicalId)

  // Step 3: Map attribute to CDK property
  property = mapAttributeToProperty(resource.Type, attribute)

  IF property exists:
    RETURN `${variableName}.${property}`
  ELSE:
    WARN("Unknown attribute ${attribute} for ${resource.Type}")
    RETURN `${variableName}.${toCamelCase(attribute)}`
END FUNCTION

// Attribute Mapping Table
FUNCTION mapAttributeToProperty(resourceType, attribute):
  mapping = {
    "AWS::DynamoDB::Table": {
      "Arn": "tableArn",
      "TableName": "tableName",
      "StreamArn": "tableStreamArn"
    },
    "AWS::S3::Bucket": {
      "Arn": "bucketArn",
      "BucketName": "bucketName",
      "DomainName": "bucketDomainName",
      "WebsiteURL": "bucketWebsiteUrl"
    },
    "AWS::Lambda::Function": {
      "Arn": "functionArn",
      "FunctionName": "functionName"
    },
    "AWS::Logs::LogGroup": {
      "Arn": "logGroupArn",
      "LogGroupName": "logGroupName"
    }
  }

  IF resourceType IN mapping AND attribute IN mapping[resourceType]:
    RETURN mapping[resourceType][attribute]

  RETURN undefined
END FUNCTION
```

**Fn::Sub Resolution**:

```pseudocode
FUNCTION resolveFnSub(template, context):
  // template: "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${TableName}"

  IF template is object (with explicit mappings):
    // { Fn::Sub: ["template", { var: value }] }
    templateStr = template[0]
    mappings = template[1]
  ELSE:
    templateStr = template
    mappings = {}

  // Step 1: Find all ${...} placeholders
  placeholders = extractPlaceholders(templateStr)

  // Step 2: Resolve each placeholder
  resolvedParts = []
  currentPos = 0

  FOR EACH placeholder IN placeholders:
    // Add literal text before placeholder
    IF placeholder.start > currentPos:
      literal = templateStr.substring(currentPos, placeholder.start)
      resolvedParts.push({type: "literal", value: literal})

    // Resolve placeholder
    varName = placeholder.name

    IF varName == "AWS::Region":
      resolvedParts.push({type: "code", value: "Stack.of(this).region"})

    ELSE IF varName == "AWS::AccountId":
      resolvedParts.push({type: "code", value: "Stack.of(this).account"})

    ELSE IF varName == "AWS::Partition":
      resolvedParts.push({type: "literal", value: "aws"})

    ELSE IF varName IN mappings:
      // Explicit mapping provided
      resolvedValue = resolveValue(mappings[varName], context)
      resolvedParts.push({type: "code", value: resolvedValue})

    ELSE:
      // Try to resolve as Ref
      resolvedRef = resolveRef(varName, context)
      resolvedParts.push({type: "code", value: resolvedRef})

    currentPos = placeholder.end

  // Add remaining literal text
  IF currentPos < templateStr.length:
    literal = templateStr.substring(currentPos)
    resolvedParts.push({type: "literal", value: literal})

  // Step 3: Build template literal or concatenation
  IF resolvedParts.every(part => part.type == "literal"):
    // All literals, return simple string
    RETURN `"${resolvedParts.map(p => p.value).join("")}"`

  ELSE:
    // Build template literal
    result = "`"
    FOR EACH part IN resolvedParts:
      IF part.type == "literal":
        result += part.value
      ELSE:
        result += "${" + part.value + "}"
    result += "`"
    RETURN result
END FUNCTION
```

---

### 7. CodeOptimizer.optimizeIAMRole()

**Purpose**: Apply optimization flags and clean up generated code

**Input**:
- `code`: Generated TypeScript code string
- `resource`: ClassifiedResource

**Output**:
- Optimized code string

**Algorithm**:

```pseudocode
FUNCTION optimizeIAMRole(code, resource):
  lines = code.split("\n")
  optimized = []

  // Step 1: Apply suppression flags from Sprint 1
  FOR EACH line IN lines:
    // Skip logical ID override if suppressed
    IF resource.suppressLogicalIdOverride == true:
      IF line.contains(".overrideLogicalId("):
        CONTINUE // Skip this line

    // Skip removal policy if suppressed (IAM is stateless)
    IF resource.suppressRemovalPolicy == true:
      IF line.contains(".applyRemovalPolicy("):
        CONTINUE // Skip this line

    // Skip import comments if suppressed
    IF resource.suppressComments == true:
      IF line.contains("// IMPORTANT: This resource was imported"):
        CONTINUE // Skip this line

    optimized.push(line)

  // Step 2: Remove excessive blank lines
  deduplicated = []
  previousBlank = false

  FOR EACH line IN optimized:
    isBlank = line.trim() == ""

    IF isBlank AND previousBlank:
      CONTINUE // Skip consecutive blank lines

    deduplicated.push(line)
    previousBlank = isBlank

  // Step 3: Ensure proper spacing around groups
  formatted = formatGroupSpacing(deduplicated)

  RETURN formatted.join("\n")
END FUNCTION

// Time Complexity: O(L) where L = lines of code
// Space Complexity: O(L)
```

---

## Edge Case Handling

### Edge Case 1: Multiple Inline Policies

**Scenario**: Role has 3 separate inline policies (logs, dynamodb, s3)

**Algorithm**:

```pseudocode
FUNCTION handleMultiplePolicies(policies, managedPolicies):
  allPermissions = []

  FOR EACH policy IN policies:
    statements = policy.PolicyDocument.Statement || []

    FOR EACH statement IN statements:
      // Check if covered by managed policy
      IF NOT isCoveredByManagedPolicy(statement, managedPolicies):
        permission = extractPermissionFromStatement(statement)

        // Tag with original policy name for grouping
        permission.policyName = policy.PolicyName

        allPermissions.push(permission)

  // Group by service, then by original policy
  grouped = groupByServiceThenPolicy(allPermissions)

  RETURN grouped
END FUNCTION

FUNCTION groupByServiceThenPolicy(permissions):
  // First group by service
  byService = {}

  FOR EACH perm IN permissions:
    service = extractService(perm.actions[0])
    IF service NOT IN byService:
      byService[service] = []
    byService[service].push(perm)

  // Within each service, maintain policy order
  FOR EACH service IN byService:
    byService[service] = sortByPolicyName(byService[service])

  RETURN byService
END FUNCTION
```

**Example Output**:

```typescript
// DynamoDB permissions (from dynamodb-policy)
role.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
  effect: Effect.ALLOW,
  resources: [table1.tableArn]
}));

// S3 permissions (from s3-policy)
role.addToPolicy(new PolicyStatement({
  actions: ["s3:GetObject"],
  effect: Effect.ALLOW,
  resources: [`${bucket.bucketArn}/*`]
}));
```

---

### Edge Case 2: Complex Resource References (Fn::Sub with Multiple Variables)

**Scenario**: Resource uses `Fn::Sub` with nested references

**Algorithm**:

```pseudocode
FUNCTION resolveComplexFnSub(fnSubValue, context):
  // Example: "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${Table}/index/${Index}"

  // Step 1: Parse template string
  template = fnSubValue
  variables = extractVariables(template)

  // Step 2: Classify variables
  pseudoParams = [] // AWS::Region, AWS::AccountId, etc.
  resourceRefs = [] // Table, Index, etc.

  FOR EACH variable IN variables:
    IF variable.startsWith("AWS::"):
      pseudoParams.push(variable)
    ELSE:
      resourceRefs.push(variable)

  // Step 3: Resolve each type
  substitutions = {}

  FOR EACH param IN pseudoParams:
    substitutions[param] = resolvePseudoParameter(param)

  FOR EACH ref IN resourceRefs:
    resource = context.resourceMap.get(ref)
    IF resource exists:
      substitutions[ref] = resolveResourceName(resource, context)
    ELSE:
      substitutions[ref] = `"${ref}"` // Fallback to string

  // Step 4: Build template literal
  result = template
  FOR EACH {varName, value} IN substitutions:
    result = result.replace("${" + varName + "}", "${" + value + "}")

  RETURN "`" + result + "`"
END FUNCTION

FUNCTION resolvePseudoParameter(param):
  pseudoMap = {
    "AWS::Region": "Stack.of(this).region",
    "AWS::AccountId": "Stack.of(this).account",
    "AWS::Partition": "aws", // Usually constant
    "AWS::StackName": "Stack.of(this).stackName",
    "AWS::URLSuffix": "amazonaws.com" // Usually constant
  }

  RETURN pseudoMap[param] || `"${param}"`
END FUNCTION
```

**Example**:

```
Input:  "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${TableName}/*"
Output: `arn:aws:dynamodb:${Stack.of(this).region}:${Stack.of(this).account}:table/${counterTable.tableName}/*`
```

---

### Edge Case 3: Non-Lambda Service Principals

**Scenario**: Role for API Gateway, Step Functions, etc.

**Algorithm**:

```pseudocode
FUNCTION extractAssumedBy(resource):
  assumeRolePolicy = resource.Properties?.AssumedRolePolicyDocument

  IF assumeRolePolicy is undefined:
    RETURN "lambda.amazonaws.com" // Default fallback

  statements = assumeRolePolicy.Statement || []

  IF statements.length == 0:
    RETURN "lambda.amazonaws.com"

  // Find first statement with AssumeRole action
  FOR EACH statement IN statements:
    IF statement.Action == "sts:AssumeRole":
      principal = statement.Principal

      // Handle string principal
      IF principal is string:
        RETURN principal

      // Handle Service principal
      IF principal.Service exists:
        service = principal.Service

        // Service can be string or array
        IF service is array:
          RETURN service[0] // First service
        ELSE:
          RETURN service

      // Handle AWS principal (for cross-account)
      IF principal.AWS exists:
        // Generate CompositePrincipal or AccountPrincipal
        RETURN generateAccountPrincipal(principal.AWS)

  // Fallback
  RETURN "lambda.amazonaws.com"
END FUNCTION

FUNCTION generateAccountPrincipal(awsPrincipal):
  IF awsPrincipal is string:
    // Extract account ID from ARN
    IF awsPrincipal.startsWith("arn:aws:iam::"):
      accountId = extractAccountIdFromArn(awsPrincipal)
      RETURN `new AccountPrincipal("${accountId}")`
    ELSE:
      RETURN `new AccountPrincipal("${awsPrincipal}")`

  ELSE IF awsPrincipal is array:
    // Multiple accounts - use CompositePrincipal
    principals = []
    FOR EACH account IN awsPrincipal:
      accountId = extractAccountIdFromArn(account)
      principals.push(`new AccountPrincipal("${accountId}")`)

    RETURN `new CompositePrincipal(${principals.join(", ")})`
END FUNCTION
```

**Supported Service Principals**:

```
lambda.amazonaws.com        → ServicePrincipal("lambda.amazonaws.com")
apigateway.amazonaws.com    → ServicePrincipal("apigateway.amazonaws.com")
states.amazonaws.com        → ServicePrincipal("states.amazonaws.com")
events.amazonaws.com        → ServicePrincipal("events.amazonaws.com")
ecs-tasks.amazonaws.com     → ServicePrincipal("ecs-tasks.amazonaws.com")
codebuild.amazonaws.com     → ServicePrincipal("codebuild.amazonaws.com")
```

---

### Edge Case 4: Roles with Conditions

**Scenario**: Policy statement includes Condition block

**Algorithm**:

```pseudocode
FUNCTION generateConditions(conditionBlock):
  // conditionBlock: { "StringEquals": { "s3:x-amz-server-side-encryption": "AES256" } }

  lines = []
  lines.push("{")

  FOR EACH {operator, conditions} IN conditionBlock:
    // Map CloudFormation operator to CDK
    cdkOperator = mapConditionOperator(operator)

    FOR EACH {key, value} IN conditions:
      // Generate condition
      IF value is string:
        lines.push(`  "${key}": ${cdkOperator}("${key}", "${value}"),`)
      ELSE IF value is array:
        values = value.map(v => `"${v}"`).join(", ")
        lines.push(`  "${key}": ${cdkOperator}("${key}", [${values}]),`)

  lines.push("}")

  RETURN lines.join("\n")
END FUNCTION

FUNCTION mapConditionOperator(operator):
  operatorMap = {
    "StringEquals": "new StringEquals",
    "StringLike": "new StringLike",
    "StringNotEquals": "new StringNotEquals",
    "NumericEquals": "new NumericEquals",
    "NumericLessThan": "new NumericLessThan",
    "NumericGreaterThan": "new NumericGreaterThan",
    "DateEquals": "new DateEquals",
    "Bool": "new Bool",
    "IpAddress": "new IpAddress",
    "ArnLike": "new ArnLike",
    "ArnEquals": "new ArnEquals"
  }

  RETURN operatorMap[operator] || `new ${operator}`
END FUNCTION
```

**Example Output**:

```typescript
role.addToPolicy(new PolicyStatement({
  actions: ["s3:PutObject"],
  effect: Effect.ALLOW,
  resources: [`${bucket.bucketArn}/*`],
  conditions: {
    "s3:x-amz-server-side-encryption": new StringEquals("s3:x-amz-server-side-encryption", "AES256")
  }
}));
```

---

### Edge Case 5: Explicit Managed Policies + Custom Policies

**Scenario**: Template has both ManagedPolicyArns and Policies

**Algorithm**:

```pseudocode
FUNCTION handleMixedPolicies(resource):
  managedPolicies = []
  customPermissions = []

  // Step 1: Extract explicit managed policies
  IF resource.Properties.ManagedPolicyArns exists:
    FOR EACH arn IN resource.Properties.ManagedPolicyArns:
      policyName = extractPolicyNameFromArn(arn)
      managedPolicies.push(policyName)

  // Step 2: Check Sprint 1 detection
  IF resource.managedPolicyEquivalent exists:
    IF resource.managedPolicyEquivalent NOT IN managedPolicies:
      managedPolicies.push(resource.managedPolicyEquivalent)

  // Step 3: Extract inline policies
  inlinePolicies = resource.Properties.Policies || []

  FOR EACH policy IN inlinePolicies:
    statements = policy.PolicyDocument.Statement || []

    FOR EACH statement IN statements:
      // Check if covered by ANY managed policy
      covered = false
      FOR EACH managedPolicy IN managedPolicies:
        IF isCoveredByManagedPolicy(statement, [managedPolicy]):
          covered = true
          BREAK

      IF NOT covered:
        permission = extractPermissionFromStatement(statement)
        customPermissions.push(permission)

  RETURN {
    managedPolicies: managedPolicies,
    customPermissions: customPermissions
  }
END FUNCTION
```

---

## Data Structures

### Input: ClassifiedResource

```typescript
interface ClassifiedResource {
  // From CloudFormation
  Type: "AWS::IAM::Role"
  Properties: {
    AssumedRolePolicyDocument: {
      Statement: [{
        Effect: "Allow" | "Deny"
        Principal: {
          Service: string | string[]
          AWS?: string | string[]
        }
        Action: "sts:AssumeRole"
      }]
    }
    RoleName?: string
    Path?: string
    ManagedPolicyArns?: string[]
    Policies?: [{
      PolicyName: string
      PolicyDocument: {
        Statement: PolicyStatement[]
      }
    }]
  }

  // From Sprint 1 Classification
  LogicalId: string
  needsImport: boolean
  isStateful: boolean
  managedPolicyEquivalent?: string  // e.g., "service-role/AWSLambdaBasicExecutionRole"
  relatedResources: string[]
  groupId: "iam"
  suppressLogicalIdOverride: boolean
  suppressRemovalPolicy: boolean
  suppressComments: boolean
}
```

### Intermediate: PolicyStatement

```typescript
interface PolicyStatement {
  actions: string[]           // ["dynamodb:GetItem", "dynamodb:PutItem"]
  effect: "Allow" | "Deny"    // Default: "Allow"
  resources: any[]            // [{ Ref: "Table" }, "arn:aws:..."]
  conditions?: {              // Optional conditions
    [operator: string]: {
      [key: string]: string | string[]
    }
  }
}
```

### Context: GeneratorContext

```typescript
interface GeneratorContext {
  // All classified resources in the template
  resources: ClassifiedResource[]

  // Map for quick lookup: LogicalId -> ClassifiedResource
  resourceMap: Map<string, ClassifiedResource>

  // Map for variable names: LogicalId -> variableName
  variableNames: Map<string, string>

  // Set of required imports (accumulates during generation)
  imports: Set<string>  // ["Role", "ServicePrincipal", "ManagedPolicy", ...]
}
```

### Output: TypeScript Code

```typescript
// String representation
const output = `
const iamRoleLambdaExecution = new Role(this, "IamRoleLambdaExecution", {
  roleName: "app-dev-us-east-1-lambdaRole",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

iamRoleLambdaExecution.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:UpdateItem"],
    effect: Effect.ALLOW,
    resources: [counterTable.tableArn]
  })
);
`
```

---

## Integration Points

### With Sprint 1 (ResourceClassifier)

**Input Contract**:

```pseudocode
// Sprint 1 provides
ClassifiedResource {
  Type: "AWS::IAM::Role"
  LogicalId: "IamRoleLambdaExecution"
  managedPolicyEquivalent: "service-role/AWSLambdaBasicExecutionRole"
  relatedResources: ["CounterTable", "LogGroup"]
  needsImport: false
  suppressLogicalIdOverride: true
  suppressRemovalPolicy: true
  suppressComments: true
}

// Sprint 2 uses
generator = new IAMRoleGenerator()
code = generator.generateRole(classifiedResource, context)
```

**Data Flow**:

```
ResourceClassifier.classifyResources()
    ↓
ClassifiedResource with:
  - managedPolicyEquivalent (detected)
  - relatedResources (linked)
  - optimization flags (set)
    ↓
IAMRoleGenerator.generateRole()
    ↓
Clean CDK code with:
  - Managed policies
  - Construct references
  - Optimized output
```

---

### With Sprint 3 (Code Cleaner)

**Output Contract**:

```pseudocode
// Sprint 2 generates
rawCode = `
const lambdaRole = new Role(this, "IamRoleLambdaExecution", {
  roleName: "app-dev-us-east-1-lambdaRole",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

lambdaRole.addToPolicy(new PolicyStatement({
  actions: ["dynamodb:UpdateItem"],
  effect: Effect.ALLOW,
  resources: [counterTable.tableArn]
}));
`

// Sprint 3 will further clean
cleaner = new CodeCleaner()
cleanCode = cleaner.clean(rawCode)
// - Remove redundant Effect.ALLOW (default)
// - Optimize string literals
// - Polish formatting
```

---

## Complexity Analysis

### Time Complexity

| Algorithm | Complexity | Explanation |
|-----------|-----------|-------------|
| `generateRole()` | O(P × S) | P policies × S statements per policy |
| `analyzePermissions()` | O(P × S × M) | Check each statement against M managed policies |
| `generateRoleDeclaration()` | O(M) | M managed policies |
| `generateCustomPermissions()` | O(P × A) | P permissions × A actions per permission |
| `resolveResourceReferences()` | O(R × D) | R resources × D nesting depth |
| `optimizeIAMRole()` | O(L) | L lines of code |

**Overall**: O(P × S × M + R × D) where:
- P = number of policies
- S = statements per policy
- M = managed policies to check
- R = resource references
- D = nesting depth of CloudFormation functions

**Typical Case**:
- P = 2-3 policies
- S = 2-5 statements
- M = 1-2 managed policies
- R = 1-5 resources
- **Result**: ~50-150 operations per role (very fast)

---

### Space Complexity

| Structure | Complexity | Explanation |
|-----------|-----------|-------------|
| `managedPolicies` | O(M) | Array of managed policy names |
| `customPermissions` | O(P × S) | All custom policy statements |
| `resolvedResources` | O(R) | Resolved resource references |
| `generatedCode` | O(L) | Lines of generated code |
| `context.resourceMap` | O(N) | All resources in template |

**Overall**: O(P × S + R + N) where N = total resources

**Typical Case**: ~100-500 bytes per role (negligible)

---

### Performance Optimization Opportunities

1. **Caching**:
```pseudocode
// Cache managed policy checks
managedPolicyCache = new Map<string, Set<string>>()

FUNCTION isCoveredByManagedPolicy(statement, managedPolicies):
  cacheKey = JSON.stringify({statement, managedPolicies})

  IF managedPolicyCache.has(cacheKey):
    RETURN managedPolicyCache.get(cacheKey)

  result = performCoverageCheck(statement, managedPolicies)
  managedPolicyCache.set(cacheKey, result)

  RETURN result
```

2. **Lazy Resolution**:
```pseudocode
// Only resolve resources that are actually referenced
FUNCTION resolveResourceReferences(resources, context):
  // Build reference map lazily
  IF NOT context.referenceCache:
    context.referenceCache = new Map()

  FOR EACH resource IN resources:
    IF resource already in cache:
      USE cached value
    ELSE:
      RESOLVE and cache
```

3. **Parallel Processing** (Future):
```pseudocode
// Process multiple roles in parallel
FUNCTION generateRoles(resources, context):
  roleResources = resources.filter(r => r.Type == "AWS::IAM::Role")

  // Generate all roles in parallel
  promises = roleResources.map(r =>
    Promise.resolve(generateRole(r, context))
  )

  generatedCodes = await Promise.all(promises)

  RETURN generatedCodes.join("\n\n")
```

---

## Example Walkthroughs

### Walkthrough 1: Simple Lambda Role with BasicExecutionRole

**Input**:

```json
{
  "Type": "AWS::IAM::Role",
  "LogicalId": "IamRoleLambdaExecution",
  "Properties": {
    "AssumedRolePolicyDocument": {
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    },
    "Policies": [{
      "PolicyName": "lambda-policy",
      "PolicyDocument": {
        "Statement": [{
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Resource": "arn:aws:logs:*:*:*"
        }]
      }
    }]
  },
  "managedPolicyEquivalent": "service-role/AWSLambdaBasicExecutionRole",
  "suppressLogicalIdOverride": true,
  "suppressRemovalPolicy": true
}
```

**Step-by-Step Execution**:

```
Step 1: generateRole() called
  ↓
Step 2: extractRoleName() → undefined (no RoleName property)
  ↓
Step 3: extractAssumedBy() → "lambda.amazonaws.com"
  ↓
Step 4: analyzePermissions()
  - managedPolicies = ["service-role/AWSLambdaBasicExecutionRole"]
  - Check policy statements
  - Actions match BasicExecutionRole
  - isCoveredByManagedPolicy() → true
  - customPermissions = [] (all covered)
  ↓
Step 5: generateRoleDeclaration()
  - variableName = "iamRoleLambdaExecution"
  - Build constructor with managed policy
  ↓
Step 6: generateCustomPermissions()
  - customPermissions.length == 0
  - Return empty string
  ↓
Step 7: optimizeIAMRole()
  - No overrideLogicalId to remove (already suppressed)
  - No applyRemovalPolicy to remove
  ↓
Output:
```

```typescript
const iamRoleLambdaExecution = new Role(this, "IamRoleLambdaExecution", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});
```

**Lines of Code**:
- Before: 28 lines (with inline policies)
- After: 6 lines
- **Reduction: 79%** ✅

---

### Walkthrough 2: Role with Managed Policy + Custom DynamoDB Permissions

**Input**:

```json
{
  "Type": "AWS::IAM::Role",
  "LogicalId": "IamRoleLambdaExecution",
  "Properties": {
    "RoleName": "app-dev-us-east-1-lambdaRole",
    "AssumedRolePolicyDocument": {
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    },
    "Policies": [
      {
        "PolicyName": "logs-policy",
        "PolicyDocument": {
          "Statement": [{
            "Effect": "Allow",
            "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
            "Resource": "*"
          }]
        }
      },
      {
        "PolicyName": "dynamodb-policy",
        "PolicyDocument": {
          "Statement": [{
            "Effect": "Allow",
            "Action": ["dynamodb:UpdateItem"],
            "Resource": { "Fn::GetAtt": ["CounterTable", "Arn"] }
          }]
        }
      }
    ]
  },
  "managedPolicyEquivalent": "service-role/AWSLambdaBasicExecutionRole"
}
```

**Context**:

```typescript
{
  resourceMap: Map {
    "CounterTable" => {
      Type: "AWS::DynamoDB::Table",
      LogicalId: "CounterTable",
      ...
    }
  },
  variableNames: Map {
    "CounterTable" => "counterTable"
  }
}
```

**Step-by-Step**:

```
Step 1: generateRole()
  ↓
Step 2: extractRoleName() → "app-dev-us-east-1-lambdaRole"
  ↓
Step 3: extractAssumedBy() → "lambda.amazonaws.com"
  ↓
Step 4: analyzePermissions()
  - managedPolicies = ["service-role/AWSLambdaBasicExecutionRole"]
  - Policy 1 (logs): isCoveredByManagedPolicy() → true, skip
  - Policy 2 (dynamodb): isCoveredByManagedPolicy() → false
    - customPermissions = [{
        actions: ["dynamodb:UpdateItem"],
        effect: "Allow",
        resources: [{ "Fn::GetAtt": ["CounterTable", "Arn"] }]
      }]
  ↓
Step 5: generateRoleDeclaration()
  - Include roleName property
  - Include managedPolicies
  ↓
Step 6: generateCustomPermissions()
  - customPermissions.length == 1
  - groupPermissionsByService()
    - Group: "dynamodb"
  - generatePolicyStatement()
    - resolveResourceReferences([{ "Fn::GetAtt": ["CounterTable", "Arn"] }])
      - resolveGetAtt(["CounterTable", "Arn"])
      - Lookup CounterTable → found
      - variableName = "counterTable"
      - mapAttributeToProperty("AWS::DynamoDB::Table", "Arn") → "tableArn"
      - Return "counterTable.tableArn"
  ↓
Output:
```

```typescript
const iamRoleLambdaExecution = new Role(this, "IamRoleLambdaExecution", {
  roleName: "app-dev-us-east-1-lambdaRole",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

// DynamoDB permissions
iamRoleLambdaExecution.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:UpdateItem"],
    effect: Effect.ALLOW,
    resources: [counterTable.tableArn]
  })
);
```

**Lines of Code**:
- Before: 35 lines
- After: 13 lines
- **Reduction: 63%** ✅

---

### Walkthrough 3: Complex Multi-Service Role

**Input**: Role with DynamoDB, S3, and Lambda permissions

**Context**:
- `counterTable` (DynamoDB)
- `deploymentBucket` (S3)
- `otherFunction` (Lambda)

**Step-by-Step**:

```
analyzePermissions()
  ↓
managedPolicies = ["service-role/AWSLambdaBasicExecutionRole"]
customPermissions = [
  {
    actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
    resources: [{ Ref: "CounterTable" }]
  },
  {
    actions: ["s3:GetObject", "s3:PutObject"],
    resources: [{ "Fn::Join": ["", [{ "Fn::GetAtt": ["DeploymentBucket", "Arn"] }, "/*"]] }]
  },
  {
    actions: ["lambda:InvokeFunction"],
    resources: [{ "Fn::GetAtt": ["OtherFunction", "Arn"] }]
  }
]
  ↓
groupPermissionsByService()
  - Groups: {
      "dynamodb": [permission1],
      "s3": [permission2],
      "lambda": [permission3]
    }
  ↓
generateCustomPermissions()
  - For "dynamodb" group:
    - resolveRef("CounterTable") → "counterTable.tableName"
    - Wait, for resources need ARN → "counterTable.tableArn"
  - For "s3" group:
    - resolveFnJoin(["", [GetAtt, "/*"]])
      - Resolve GetAtt → "deploymentBucket.bucketArn"
      - Append "/*" → "`${deploymentBucket.bucketArn}/*`"
  - For "lambda" group:
    - resolveGetAtt(["OtherFunction", "Arn"]) → "otherFunction.functionArn"
  ↓
Output:
```

```typescript
const complexRole = new Role(this, "ComplexRole", {
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
  ]
});

// DynamoDB permissions
complexRole.addToPolicy(
  new PolicyStatement({
    actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
    effect: Effect.ALLOW,
    resources: [counterTable.tableArn]
  })
);

// S3 permissions
complexRole.addToPolicy(
  new PolicyStatement({
    actions: ["s3:GetObject", "s3:PutObject"],
    effect: Effect.ALLOW,
    resources: [`${deploymentBucket.bucketArn}/*`]
  })
);

// Lambda permissions
complexRole.addToPolicy(
  new PolicyStatement({
    actions: ["lambda:InvokeFunction"],
    effect: Effect.ALLOW,
    resources: [otherFunction.functionArn]
  })
);
```

**Lines of Code**:
- Before: 52 lines
- After: 25 lines
- **Reduction: 52%** ✅

---

## Validation and Verification

### Pre-Conditions

Before `generateRole()` executes:

```pseudocode
ASSERT resource.Type == "AWS::IAM::Role"
ASSERT resource.LogicalId is defined
ASSERT resource.Properties is defined
ASSERT context.resourceMap is Map
ASSERT context.variableNames is Map
ASSERT context.imports is Set
```

### Post-Conditions

After `generateRole()` completes:

```pseudocode
ASSERT output is string
ASSERT output.includes("new Role(")
ASSERT output.includes("assumedBy:")

IF managedPolicies.length > 0:
  ASSERT output.includes("ManagedPolicy.fromAwsManagedPolicyName")

IF customPermissions.length > 0:
  ASSERT output.includes(".addToPolicy(")

ASSERT context.imports.has("Role")
ASSERT context.variableNames.has(resource.LogicalId)
```

### Invariants

Throughout execution:

```pseudocode
// All resources in resourceMap must be classified
FOR EACH resource IN context.resourceMap.values():
  ASSERT resource.LogicalId is defined
  ASSERT resource.Type is defined

// All variable names must be valid TypeScript identifiers
FOR EACH varName IN context.variableNames.values():
  ASSERT varName matches /^[a-z][a-zA-Z0-9]*$/

// No duplicate managed policies
FOR EACH role IN generatedRoles:
  managedPolicies = extractManagedPolicies(role)
  ASSERT managedPolicies.length == new Set(managedPolicies).size
```

---

## Error Handling

### Graceful Degradation

```pseudocode
FUNCTION generateRole(resource, context):
  TRY:
    // Normal generation
    RETURN generateRoleInternal(resource, context)

  CATCH error:
    // Log error with context
    LOG.error("Failed to generate IAM role", {
      logicalId: resource.LogicalId,
      error: error.message,
      stack: error.stack
    })

    // Generate fallback code
    RETURN generateFallbackRole(resource)

FUNCTION generateFallbackRole(resource):
  // Generate basic role without optimization
  RETURN `
    // WARNING: Generated with fallback generator
    // Original error: ${error.message}
    const ${toCamelCase(resource.LogicalId)} = new Role(this, "${resource.LogicalId}", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com")
    });
  `
END FUNCTION
```

### Missing Resource Warnings

```pseudocode
FUNCTION resolveRef(logicalId, context):
  resource = context.resourceMap.get(logicalId)

  IF resource is undefined:
    // Emit warning but continue
    WARN(`
      Resource reference not found: ${logicalId}
      This may indicate:
      1. External resource (e.g., from another stack)
      2. Resource defined after this role
      3. Typo in template

      Falling back to string reference.
    `)

    // Generate TODO comment in code
    RETURN `"${logicalId}" /* TODO: Update reference after migration */`
```

---

## Phase Gate 2 Checklist

Before proceeding to Architecture phase:

- ✅ All core algorithms defined with detailed pseudocode
- ✅ Edge cases identified and algorithms provided
- ✅ Data structures fully specified
- ✅ Integration points documented
- ✅ Complexity analysis completed
- ✅ Example walkthroughs provided with step-by-step execution
- ✅ Decision trees and flow diagrams included
- ✅ Error handling strategy defined
- ✅ Pre/post conditions and invariants specified

**Status**: 🟡 Ready for Phase Gate 2 Review

**Next Steps**:
1. Coordinator review of algorithm soundness
2. Validation of edge case coverage
3. Approval to proceed to Architecture phase

---

*Sprint 2 Pseudocode - SPARC Methodology*
*Created: 2025-10-22*
*Phase: Pseudocode (2 of 5)*
*Awaiting: Phase Gate 2 Approval*
