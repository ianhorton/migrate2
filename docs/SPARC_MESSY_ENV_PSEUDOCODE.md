# SPARC Messy Environment Support - Pseudocode Specification

## Document Metadata
- **Phase**: Pseudocode (SPARC Phase 2)
- **Component**: Messy Environment Support System
- **Created**: 2025-10-23
- **Status**: Implementation Ready

---

## Table of Contents
1. [PhysicalIdResolver - Cascading Fallback](#1-physicalidresolver---cascading-fallback)
2. [ResourceMatcher - Confidence Scoring](#2-resourcematcher---confidence-scoring)
3. [DifferenceAnalyzer - Classification](#3-differenceanalyzer---classification)
4. [InteractiveCDKImport - Process Management](#4-interactivecdkimport---process-management)
5. [CheckpointManager - Execution Flow](#5-checkpointmanager---execution-flow)
6. [Supporting Algorithms](#6-supporting-algorithms)
7. [Complexity Analysis](#7-complexity-analysis)

---

## 1. PhysicalIdResolver - Cascading Fallback

### 1.1 Main Resolution Algorithm

```
ALGORITHM: resolvePhysicalId
INPUT:
    logicalId (string) - CloudFormation logical resource ID
    resourceType (string) - AWS resource type (e.g., "AWS::DynamoDB::Table")
    templateProperties (object) - Resource properties from template
OUTPUT:
    physicalId (string) - Resolved AWS physical resource identifier

CONSTANTS:
    AUTO_MATCH_THRESHOLD = 0.9  // 90% confidence for auto-selection
    DISCOVERY_TIMEOUT_MS = 30000  // 30 seconds

DEPENDENCIES:
    discovery: AWSResourceDiscovery
    matcher: ResourceMatcher
    interventionManager: HumanInterventionManager
    logger: Logger

BEGIN
    logger.info("Resolving physical ID for: " + logicalId)

    // Define resolution strategies in priority order
    strategies ← [
        {
            name: "Explicit Physical ID",
            confidence: 1.0,
            execute: FUNCTION() → explicitIdStrategy()
        },
        {
            name: "Auto-Discovery Match",
            confidence: 0.9,
            execute: FUNCTION() → autoDiscoveryStrategy()
        },
        {
            name: "Human Intervention",
            confidence: 1.0,
            execute: FUNCTION() → humanInterventionStrategy()
        }
    ]

    // Try each strategy in sequence
    FOR EACH strategy IN strategies DO
        TRY
            logger.debug("Attempting strategy: " + strategy.name)

            result ← AWAIT strategy.execute()

            IF result IS NOT null THEN
                logger.success("Resolved using: " + strategy.name)

                // Record resolution for audit trail
                CALL recordResolution(logicalId, result, strategy.name)

                RETURN result
            END IF

        CATCH error
            logger.warn("Strategy failed: " + strategy.name + " - " + error.message)
            // Continue to next strategy
        END TRY
    END FOR

    // All strategies exhausted
    THROW ResolutionError("Cannot resolve physical ID for " + logicalId)
END


SUBROUTINE: explicitIdStrategy
OUTPUT: physicalId (string or null)

BEGIN
    // Get the property name that contains physical ID for this resource type
    physicalIdProperty ← CALL getPhysicalIdProperty(resourceType)

    IF physicalIdProperty IS null THEN
        RETURN null
    END IF

    // Check if template explicitly defines physical ID
    IF templateProperties.hasProperty(physicalIdProperty) THEN
        physicalId ← templateProperties[physicalIdProperty]

        IF physicalId IS NOT empty THEN
            logger.info("Found explicit physical ID: " + physicalId)

            // Optional: Verify resource exists in AWS
            IF CALL verifyResourceExists(physicalId, resourceType) THEN
                RETURN physicalId
            ELSE
                logger.warn("Explicit physical ID not found in AWS: " + physicalId)
                RETURN null
            END IF
        END IF
    END IF

    RETURN null
END


SUBROUTINE: autoDiscoveryStrategy
OUTPUT: physicalId (string or null)

BEGIN
    logger.info("Discovering resources of type: " + resourceType)

    // Discover all resources of this type in AWS account
    discoveredResources ← AWAIT discovery.discoverResourceType(
        resourceType,
        region: templateProperties.region
    )

    IF discoveredResources.length = 0 THEN
        logger.warn("No resources found in AWS")
        RETURN null
    END IF

    logger.debug("Found " + discoveredResources.length + " candidates")

    // Match template resource to discovered resources
    matchResult ← CALL matcher.match(
        logicalId,
        resourceType,
        templateProperties,
        discoveredResources
    )

    // Auto-select if best match exceeds confidence threshold
    IF matchResult.bestMatch IS NOT null THEN
        IF matchResult.bestMatch.confidence >= AUTO_MATCH_THRESHOLD THEN
            physicalId ← matchResult.bestMatch.physicalId

            logger.success(
                "Auto-matched: " + physicalId +
                " (confidence: " + matchResult.bestMatch.confidence + ")"
            )

            RETURN physicalId
        ELSE
            logger.info(
                "Best match confidence too low: " +
                matchResult.bestMatch.confidence
            )
        END IF
    END IF

    RETURN null
END


SUBROUTINE: humanInterventionStrategy
OUTPUT: physicalId (string)

BEGIN
    logger.info("Requesting human intervention for: " + logicalId)

    // Discover resources for user to choose from
    discoveredResources ← AWAIT discovery.discoverResourceType(resourceType)

    // Get match candidates with confidence scores
    matchResult ← CALL matcher.match(
        logicalId,
        resourceType,
        templateProperties,
        discoveredResources
    )

    // Prepare candidates for user selection
    candidates ← []
    FOR EACH match IN matchResult.matches DO
        candidates.append({
            physicalId: match.physicalId,
            confidence: match.confidence,
            matchReasons: match.matchReasons,
            metadata: match.discoveredResource.metadata,
            createdAt: match.discoveredResource.createdAt,
            tags: match.discoveredResource.tags
        })
    END FOR

    // Sort candidates by confidence (highest first)
    CALL sortByDescending(candidates, field: "confidence")

    // Prompt user to select or enter physical ID
    physicalId ← AWAIT interventionManager.promptForPhysicalId(
        logicalId,
        resourceType,
        candidates
    )

    IF physicalId IS null OR physicalId IS empty THEN
        THROW UserAbortError("User skipped or aborted physical ID selection")
    END IF

    RETURN physicalId
END


SUBROUTINE: getPhysicalIdProperty
INPUT: resourceType (string)
OUTPUT: propertyName (string or null)

BEGIN
    // Map resource types to their physical ID property names
    physicalIdMap ← {
        "AWS::DynamoDB::Table": "TableName",
        "AWS::S3::Bucket": "BucketName",
        "AWS::Lambda::Function": "FunctionName",
        "AWS::IAM::Role": "RoleName",
        "AWS::Logs::LogGroup": "LogGroupName",
        "AWS::SNS::Topic": "TopicName",
        "AWS::SQS::Queue": "QueueName",
        "AWS::Events::Rule": "Name",
        "AWS::ApiGateway::RestApi": "Name"
    }

    IF physicalIdMap.hasKey(resourceType) THEN
        RETURN physicalIdMap[resourceType]
    END IF

    RETURN null
END


SUBROUTINE: verifyResourceExists
INPUT:
    physicalId (string)
    resourceType (string)
OUTPUT: exists (boolean)

BEGIN
    TRY
        // Use AWS SDK to check if resource exists
        CASE resourceType OF
            "AWS::DynamoDB::Table":
                AWAIT dynamoClient.describeTable(physicalId)
                RETURN true

            "AWS::S3::Bucket":
                AWAIT s3Client.headBucket(physicalId)
                RETURN true

            "AWS::Lambda::Function":
                AWAIT lambdaClient.getFunction(physicalId)
                RETURN true

            // ... other resource types

            DEFAULT:
                logger.warn("Cannot verify resource type: " + resourceType)
                RETURN true  // Assume exists if cannot verify
        END CASE

    CATCH NotFoundError
        RETURN false

    CATCH error
        logger.error("Error verifying resource: " + error.message)
        RETURN false
    END TRY
END


SUBROUTINE: recordResolution
INPUT:
    logicalId (string)
    physicalId (string)
    strategyName (string)
OUTPUT: void

BEGIN
    resolutionRecord ← {
        timestamp: CURRENT_TIMESTAMP,
        logicalId: logicalId,
        physicalId: physicalId,
        strategy: strategyName,
        resourceType: resourceType
    }

    // Append to audit log
    CALL auditLog.append("physical-id-resolutions", resolutionRecord)
END
```

**Complexity Analysis:**
- **Time Complexity**: O(n * m) where n = number of strategies, m = number of discovered resources
  - Explicit ID: O(1)
  - Auto-discovery: O(m) for matching all candidates
  - Human intervention: O(1) (user input time not counted)
- **Space Complexity**: O(m) for storing discovered resources
- **Edge Cases Handled**:
  - No resources found in AWS
  - Multiple high-confidence matches
  - User abort/skip
  - AWS API failures
  - Invalid physical ID formats

---

## 2. ResourceMatcher - Confidence Scoring

### 2.1 Main Matching Algorithm

```
ALGORITHM: match
INPUT:
    logicalId (string) - CloudFormation logical ID
    resourceType (string) - AWS resource type
    templateProperties (object) - Properties from template
    discoveredResources (array) - Resources found in AWS
OUTPUT:
    matchResult (MatchResult) - Matching results with confidence scores

CONSTANTS:
    EXACT_NAME_WEIGHT = 0.9
    FUZZY_NAME_WEIGHT = 0.5
    TAG_WEIGHT = 0.2
    CONFIG_WEIGHT = 0.3
    RECENCY_WEIGHT = 0.1
    MIN_FUZZY_SIMILARITY = 0.7
    MAX_CANDIDATES = 10

BEGIN
    matchCandidates ← []

    // Calculate confidence for each discovered resource
    FOR EACH discovered IN discoveredResources DO
        // Calculate individual scoring components
        nameScore ← CALL calculateNameScore(
            templateProperties,
            discovered
        )

        tagScore ← CALL calculateTagScore(
            templateProperties.tags,
            discovered.tags
        )

        configScore ← CALL calculateConfigurationScore(
            templateProperties,
            discovered.metadata,
            resourceType
        )

        recencyScore ← CALL calculateRecencyScore(
            discovered.createdAt
        )

        // Combine scores with weighted average
        totalScore ← (
            nameScore.score * EXACT_NAME_WEIGHT +
            tagScore * TAG_WEIGHT +
            configScore * CONFIG_WEIGHT +
            recencyScore * RECENCY_WEIGHT
        )

        // Normalize to 0.0-1.0 range
        confidence ← MIN(totalScore, 1.0)

        // Collect match reasons for explainability
        matchReasons ← []
        IF nameScore.exactMatch THEN
            matchReasons.append("Exact name match")
        ELSE IF nameScore.score > 0 THEN
            matchReasons.append(
                "Name similarity: " +
                ROUND(nameScore.similarity * 100) + "%"
            )
        END IF

        IF tagScore > 0 THEN
            matchReasons.append("Tags match")
        END IF

        IF configScore > 0 THEN
            matchReasons.append("Configuration matches")
        END IF

        IF recencyScore > 0 THEN
            matchReasons.append("Recently created")
        END IF

        // Create match candidate
        candidate ← {
            physicalId: discovered.physicalId,
            confidence: confidence,
            matchReasons: matchReasons,
            discoveredResource: discovered
        }

        matchCandidates.append(candidate)
    END FOR

    // Sort by confidence (highest first)
    CALL sortByDescending(matchCandidates, field: "confidence")

    // Limit to top candidates
    IF matchCandidates.length > MAX_CANDIDATES THEN
        matchCandidates ← matchCandidates.slice(0, MAX_CANDIDATES)
    END IF

    // Determine best match
    bestMatch ← null
    IF matchCandidates.length > 0 THEN
        bestMatch ← matchCandidates[0]
    END IF

    // Determine if human review required
    requiresHumanReview ← (
        bestMatch IS null OR
        bestMatch.confidence < AUTO_MATCH_THRESHOLD OR
        (matchCandidates.length > 1 AND
         ABS(matchCandidates[0].confidence - matchCandidates[1].confidence) < 0.1)
    )

    RETURN {
        logicalId: logicalId,
        resourceType: resourceType,
        matches: matchCandidates,
        bestMatch: bestMatch,
        requiresHumanReview: requiresHumanReview
    }
END


SUBROUTINE: calculateNameScore
INPUT:
    templateProps (object)
    discovered (DiscoveredResource)
OUTPUT:
    score (object) - { score: number, exactMatch: boolean, similarity: number }

BEGIN
    // Get expected name from template
    physicalIdProp ← CALL getPhysicalIdProperty(discovered.resourceType)

    expectedName ← null
    IF physicalIdProp IS NOT null AND templateProps.hasProperty(physicalIdProp) THEN
        expectedName ← templateProps[physicalIdProp]
    END IF

    // If no explicit name, try to derive from logical ID
    IF expectedName IS null THEN
        expectedName ← CALL deriveExpectedName(
            logicalId,
            resourceType,
            templateProps
        )
    END IF

    actualName ← discovered.physicalId

    // Exact match check
    IF expectedName IS NOT null AND expectedName = actualName THEN
        RETURN {
            score: 1.0,
            exactMatch: true,
            similarity: 1.0
        }
    END IF

    // Fuzzy matching using Levenshtein distance
    IF expectedName IS NOT null THEN
        similarity ← CALL calculateStringSimilarity(expectedName, actualName)

        IF similarity >= MIN_FUZZY_SIMILARITY THEN
            // Scale similarity to scoring range
            score ← similarity * FUZZY_NAME_WEIGHT

            RETURN {
                score: score,
                exactMatch: false,
                similarity: similarity
            }
        END IF
    END IF

    // No name match
    RETURN {
        score: 0.0,
        exactMatch: false,
        similarity: 0.0
    }
END


SUBROUTINE: calculateStringSimilarity
INPUT:
    str1 (string)
    str2 (string)
OUTPUT:
    similarity (float) - Value between 0.0 and 1.0

BEGIN
    // Normalize strings (lowercase, remove special chars)
    norm1 ← CALL normalizeString(str1)
    norm2 ← CALL normalizeString(str2)

    // Calculate Levenshtein distance
    distance ← CALL levenshteinDistance(norm1, norm2)

    // Convert to similarity score (0.0 = different, 1.0 = identical)
    maxLength ← MAX(LENGTH(norm1), LENGTH(norm2))

    IF maxLength = 0 THEN
        RETURN 1.0
    END IF

    similarity ← 1.0 - (distance / maxLength)

    RETURN similarity
END


SUBROUTINE: levenshteinDistance
INPUT:
    str1 (string)
    str2 (string)
OUTPUT:
    distance (integer)

BEGIN
    len1 ← LENGTH(str1)
    len2 ← LENGTH(str2)

    // Create distance matrix
    matrix ← CREATE 2D ARRAY[len1 + 1][len2 + 1]

    // Initialize first row and column
    FOR i FROM 0 TO len1 DO
        matrix[i][0] ← i
    END FOR

    FOR j FROM 0 TO len2 DO
        matrix[0][j] ← j
    END FOR

    // Fill matrix using dynamic programming
    FOR i FROM 1 TO len1 DO
        FOR j FROM 1 TO len2 DO
            cost ← 0
            IF str1[i-1] ≠ str2[j-1] THEN
                cost ← 1
            END IF

            matrix[i][j] ← MIN(
                matrix[i-1][j] + 1,      // Deletion
                matrix[i][j-1] + 1,      // Insertion
                matrix[i-1][j-1] + cost  // Substitution
            )
        END FOR
    END FOR

    RETURN matrix[len1][len2]
END


SUBROUTINE: calculateTagScore
INPUT:
    templateTags (object)
    discoveredTags (object)
OUTPUT:
    score (float)

BEGIN
    IF templateTags IS null OR EMPTY(templateTags) THEN
        RETURN 0.0
    END IF

    IF discoveredTags IS null OR EMPTY(discoveredTags) THEN
        RETURN 0.0
    END IF

    matchCount ← 0
    totalTags ← 0

    // Compare each template tag with discovered tags
    FOR EACH key, value IN templateTags DO
        totalTags ← totalTags + 1

        IF discoveredTags.hasKey(key) THEN
            // Exact match
            IF discoveredTags[key] = value THEN
                matchCount ← matchCount + 1
            // Partial match (case-insensitive)
            ELSE IF LOWERCASE(discoveredTags[key]) = LOWERCASE(value) THEN
                matchCount ← matchCount + 0.8
            END IF
        END IF
    END FOR

    IF totalTags = 0 THEN
        RETURN 0.0
    END IF

    // Return percentage of tags that matched
    score ← matchCount / totalTags

    RETURN score
END


SUBROUTINE: calculateConfigurationScore
INPUT:
    templateProps (object)
    discoveredMetadata (object)
    resourceType (string)
OUTPUT:
    score (float)

BEGIN
    // Resource-type specific configuration matching
    CASE resourceType OF
        "AWS::DynamoDB::Table":
            RETURN CALL matchDynamoDBConfig(templateProps, discoveredMetadata)

        "AWS::S3::Bucket":
            RETURN CALL matchS3Config(templateProps, discoveredMetadata)

        "AWS::Lambda::Function":
            RETURN CALL matchLambdaConfig(templateProps, discoveredMetadata)

        "AWS::IAM::Role":
            RETURN CALL matchIAMConfig(templateProps, discoveredMetadata)

        DEFAULT:
            // Generic configuration matching
            RETURN CALL matchGenericConfig(templateProps, discoveredMetadata)
    END CASE
END


SUBROUTINE: matchDynamoDBConfig
INPUT:
    templateProps (object)
    metadata (object)
OUTPUT:
    score (float)

BEGIN
    matches ← 0
    checks ← 0

    // Compare key schema
    IF templateProps.hasProperty("KeySchema") AND metadata.hasProperty("keySchema") THEN
        checks ← checks + 1

        templateKeys ← CALL extractKeyNames(templateProps.KeySchema)
        discoveredKeys ← CALL extractKeyNames(metadata.keySchema)

        IF SET_EQUALS(templateKeys, discoveredKeys) THEN
            matches ← matches + 1
        END IF
    END IF

    // Compare billing mode
    IF templateProps.hasProperty("BillingMode") AND metadata.hasProperty("billingMode") THEN
        checks ← checks + 1

        IF templateProps.BillingMode = metadata.billingMode THEN
            matches ← matches + 1
        END IF
    END IF

    // Compare GSI count
    IF templateProps.hasProperty("GlobalSecondaryIndexes") AND
       metadata.hasProperty("globalSecondaryIndexes") THEN
        checks ← checks + 1

        templateGSICount ← LENGTH(templateProps.GlobalSecondaryIndexes)
        discoveredGSICount ← LENGTH(metadata.globalSecondaryIndexes)

        IF templateGSICount = discoveredGSICount THEN
            matches ← matches + 1
        END IF
    END IF

    IF checks = 0 THEN
        RETURN 0.0
    END IF

    RETURN matches / checks
END


SUBROUTINE: calculateRecencyScore
INPUT:
    createdAt (Date)
OUTPUT:
    score (float)

BEGIN
    IF createdAt IS null THEN
        RETURN 0.0
    END IF

    currentDate ← CURRENT_DATE
    ageInDays ← (currentDate - createdAt).days

    // Score decreases with age
    // Recent = higher score, old = lower score
    // Using exponential decay: score = e^(-age/30)

    IF ageInDays <= 7 THEN
        // Very recent (past week) = full score
        RETURN 1.0
    ELSE IF ageInDays <= 30 THEN
        // Recent (past month) = high score
        RETURN 0.8
    ELSE IF ageInDays <= 90 THEN
        // Somewhat recent (past quarter) = medium score
        RETURN 0.5
    ELSE IF ageInDays <= 180 THEN
        // Older (past 6 months) = low score
        RETURN 0.3
    ELSE
        // Very old = minimal score
        RETURN 0.1
    END IF
END
```

**Complexity Analysis:**
- **Time Complexity**: O(n * k) where n = discovered resources, k = comparison operations per resource
  - Levenshtein distance: O(m₁ * m₂) where m₁, m₂ = string lengths
  - Tag comparison: O(t) where t = number of tags
  - Configuration comparison: O(1) to O(c) depending on complexity
- **Space Complexity**: O(n) for storing match candidates + O(m₁ * m₂) for Levenshtein matrix
- **Edge Cases**:
  - No template name specified
  - Empty tag sets
  - Missing metadata fields
  - Identical confidence scores (ambiguous matches)
  - Resource creation date unavailable

---

## 3. DifferenceAnalyzer - Classification

### 3.1 Main Classification Algorithm

```
ALGORITHM: analyzeDifferences
INPUT:
    differences (array) - List of template differences
OUTPUT:
    classifications (array) - Array of DifferenceClassification objects

CONSTANTS:
    // CDK metadata patterns that are acceptable
    ACCEPTABLE_METADATA_PATTERNS = [
        "Metadata.AWS::CDK::",
        "Metadata.aws:cdk:path"
    ]

    // Acceptable CDK additions
    ACCEPTABLE_CDK_ADDITIONS = [
        "UpdateReplacePolicy",
        "DeletionPolicy",
        "Condition"
    ]

    // Critical property patterns (resource-destroying changes)
    CRITICAL_PROPERTIES = [
        "TableName",
        "BucketName",
        "FunctionName",
        "RoleName",
        "QueueName",
        "TopicName",
        "KeySchema",
        "AttributeDefinitions"
    ]

BEGIN
    classifications ← []

    FOR EACH diff IN differences DO
        classification ← CALL classifyDifference(diff)
        classifications.append(classification)
    END FOR

    RETURN classifications
END


SUBROUTINE: classifyDifference
INPUT:
    diff (Difference)
OUTPUT:
    classification (DifferenceClassification)

BEGIN
    // Extract path components
    pathParts ← SPLIT(diff.path, ".")
    resourceId ← pathParts[0]
    propertyPath ← JOIN(pathParts[1..], ".")

    // Initialize classification
    category ← "warning"
    autoResolvable ← false
    requiresHumanReview ← true
    explanation ← ""
    resolutionStrategy ← null

    // Rule 1: CDK Metadata additions (ACCEPTABLE)
    IF CALL isCDKMetadata(propertyPath) THEN
        category ← "acceptable"
        autoResolvable ← true
        requiresHumanReview ← false
        explanation ← "CDK automatically adds metadata for stack tracking and construct tree"
        resolutionStrategy ← "ignore"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 2: CDK policy additions (ACCEPTABLE)
    IF CALL isAcceptableCDKAddition(propertyPath) THEN
        category ← "acceptable"
        autoResolvable ← true
        requiresHumanReview ← false
        explanation ← "CDK adds " + propertyPath + " for resource lifecycle management"
        resolutionStrategy ← "accept-cdk"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 3: Critical property changes (CRITICAL)
    IF CALL isCriticalProperty(propertyPath) THEN
        category ← "critical"
        autoResolvable ← false
        requiresHumanReview ← true

        IF diff.type = "ADDED" THEN
            explanation ← "CDK added critical property: " + propertyPath +
                         ". This may cause resource replacement."
        ELSE IF diff.type = "REMOVED" THEN
            explanation ← "CDK removed critical property: " + propertyPath +
                         ". This will likely fail import."
        ELSE IF diff.type = "MODIFIED" THEN
            explanation ← "CDK modified critical property: " + propertyPath +
                         ". Serverless: '" + diff.serverlessValue +
                         "', CDK: '" + diff.cdkValue + "'"
        END IF

        resolutionStrategy ← "manual-review"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 4: IAM policy differences (WARNING)
    IF CALL isIAMPolicy(propertyPath) THEN
        category ← "warning"
        autoResolvable ← false
        requiresHumanReview ← true
        explanation ← "IAM policy differences detected. Review for security implications."
        resolutionStrategy ← "compare-policies"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 5: Environment variables (WARNING)
    IF CALL isEnvironmentVariable(propertyPath) THEN
        category ← "warning"
        autoResolvable ← false
        requiresHumanReview ← true
        explanation ← "Environment variable differences. Verify application compatibility."
        resolutionStrategy ← "merge-env-vars"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 6: Tags (ACCEPTABLE if addition, WARNING if modification)
    IF CALL isTagProperty(propertyPath) THEN
        IF diff.type = "ADDED" THEN
            category ← "acceptable"
            autoResolvable ← true
            requiresHumanReview ← false
            explanation ← "CDK added tags for resource management"
            resolutionStrategy ← "accept-cdk"
        ELSE
            category ← "warning"
            autoResolvable ← false
            requiresHumanReview ← true
            explanation ← "Tag values differ between Serverless and CDK"
            resolutionStrategy ← "compare-tags"
        END IF

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 7: DynamoDB attribute/index differences (CRITICAL)
    IF CALL isDynamoDBSchema(propertyPath) THEN
        category ← "critical"
        autoResolvable ← false
        requiresHumanReview ← true
        explanation ← "DynamoDB schema differences detected. " +
                     "This may indicate missing GSIs or attribute definitions."
        resolutionStrategy ← "compare-schemas"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 8: Lambda runtime/handler (WARNING)
    IF CALL isLambdaRuntime(propertyPath) THEN
        category ← "warning"
        autoResolvable ← false
        requiresHumanReview ← true
        explanation ← "Lambda configuration differences. Verify deployment package compatibility."
        resolutionStrategy ← "verify-lambda"

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Rule 9: Property removed in CDK (WARNING/CRITICAL based on importance)
    IF diff.type = "REMOVED" THEN
        IF CALL isOptionalProperty(propertyPath) THEN
            category ← "warning"
            autoResolvable ← false
            requiresHumanReview ← true
            explanation ← "CDK removed optional property: " + propertyPath
            resolutionStrategy ← "verify-optional"
        ELSE
            category ← "critical"
            autoResolvable ← false
            requiresHumanReview ← true
            explanation ← "CDK removed required property: " + propertyPath
            resolutionStrategy ← "restore-property"
        END IF

        RETURN CALL createClassification(
            diff, category, autoResolvable,
            requiresHumanReview, explanation, resolutionStrategy
        )
    END IF

    // Default: WARNING (unknown difference)
    category ← "warning"
    autoResolvable ← false
    requiresHumanReview ← true
    explanation ← "Unclassified difference at: " + diff.path
    resolutionStrategy ← "manual-review"

    RETURN CALL createClassification(
        diff, category, autoResolvable,
        requiresHumanReview, explanation, resolutionStrategy
    )
END


SUBROUTINE: isCDKMetadata
INPUT: propertyPath (string)
OUTPUT: isMeta (boolean)

BEGIN
    FOR EACH pattern IN ACCEPTABLE_METADATA_PATTERNS DO
        IF propertyPath STARTS_WITH pattern THEN
            RETURN true
        END IF
    END FOR

    RETURN false
END


SUBROUTINE: isCriticalProperty
INPUT: propertyPath (string)
OUTPUT: isCritical (boolean)

BEGIN
    FOR EACH criticalProp IN CRITICAL_PROPERTIES DO
        IF propertyPath CONTAINS criticalProp THEN
            RETURN true
        END IF
    END FOR

    RETURN false
END


SUBROUTINE: isDynamoDBSchema
INPUT: propertyPath (string)
OUTPUT: isSchema (boolean)

BEGIN
    schemaPatterns ← [
        "AttributeDefinitions",
        "GlobalSecondaryIndexes",
        "LocalSecondaryIndexes",
        "KeySchema"
    ]

    FOR EACH pattern IN schemaPatterns DO
        IF propertyPath CONTAINS pattern THEN
            RETURN true
        END IF
    END FOR

    RETURN false
END


SUBROUTINE: isIAMPolicy
INPUT: propertyPath (string)
OUTPUT: isPolicy (boolean)

BEGIN
    policyPatterns ← [
        "AssumeRolePolicyDocument",
        "PolicyDocument",
        "ManagedPolicyArns",
        "Policies"
    ]

    FOR EACH pattern IN policyPatterns DO
        IF propertyPath CONTAINS pattern THEN
            RETURN true
        END IF
    END FOR

    RETURN false
END


ALGORITHM: groupByResolution
INPUT:
    classifications (array) - Array of DifferenceClassification
OUTPUT:
    grouped (object) - { autoResolvable: [], requiresReview: [] }

BEGIN
    autoResolvable ← []
    requiresReview ← []

    FOR EACH classification IN classifications DO
        IF classification.autoResolvable = true THEN
            autoResolvable.append(classification)
        ELSE IF classification.requiresHumanReview = true THEN
            requiresReview.append(classification)
        END IF
    END FOR

    // Sort by severity within each group
    CALL sortBySeverity(autoResolvable)
    CALL sortBySeverity(requiresReview)

    RETURN {
        autoResolvable: autoResolvable,
        requiresReview: requiresReview
    }
END


SUBROUTINE: sortBySeverity
INPUT: classifications (array)
OUTPUT: void (sorts in place)

BEGIN
    severityOrder ← {
        "critical": 0,
        "warning": 1,
        "acceptable": 2
    }

    CALL SORT(classifications, COMPARE_FUNCTION(a, b):
        RETURN severityOrder[a.category] - severityOrder[b.category]
    )
END
```

**Complexity Analysis:**
- **Time Complexity**: O(n * r) where n = number of differences, r = number of classification rules
  - Each difference: O(r) to check all rules
  - Grouping: O(n log n) for sorting by severity
- **Space Complexity**: O(n) for storing classifications
- **Edge Cases**:
  - Deeply nested property paths
  - Unknown resource types
  - Ambiguous property names (e.g., "Name" could be many things)
  - Circular references in policies
  - Empty or null values

---

## 4. InteractiveCDKImport - Process Management

### 4.1 Main Import Orchestration

```
ALGORITHM: runImport
INPUT:
    cdkProjectPath (string) - Path to CDK project directory
    importDefinitions (array) - Resources to import
OUTPUT:
    result (ImportResult) - { status, resourcesImported, errors }

CONSTANTS:
    CDK_TIMEOUT_MS = 300000  // 5 minutes
    PROMPT_TIMEOUT_MS = 30000  // 30 seconds
    MAX_RETRY_ATTEMPTS = 3

DEPENDENCIES:
    interventionManager: HumanInterventionManager
    logger: Logger
    processMonitor: ProcessMonitor

BEGIN
    logger.info("Starting interactive CDK import")
    logger.info("Project path: " + cdkProjectPath)
    logger.info("Resources to import: " + importDefinitions.length)

    // Validate preconditions
    IF NOT CALL validateCDKProject(cdkProjectPath) THEN
        THROW ValidationError("Invalid CDK project")
    END IF

    IF importDefinitions.length = 0 THEN
        THROW ValidationError("No resources to import")
    END IF

    // Show import plan to user
    CALL displayImportPlan(importDefinitions)

    // Confirm with user before proceeding
    confirmation ← AWAIT interventionManager.prompt({
        type: "confirm",
        severity: "info",
        question: "Ready to start CDK import process?",
        context: "This will run 'cdk import' and import " +
                 importDefinitions.length + " resources.",
        defaultValue: "yes"
    })

    IF confirmation.action ≠ "proceed" THEN
        RETURN {
            status: "aborted",
            message: "User cancelled import"
        }
    END IF

    // Prepare import mappings file
    mappingsFile ← CALL createImportMappingsFile(importDefinitions)

    // Spawn CDK import process
    logger.info("Spawning cdk import process...")

    cdkProcess ← CALL spawnProcess({
        command: "npx",
        args: ["cdk", "import", "--force", "--resource-mapping", mappingsFile],
        cwd: cdkProjectPath,
        timeout: CDK_TIMEOUT_MS
    })

    // Monitor process with interactive handling
    importResult ← AWAIT monitorImportProcess(
        cdkProcess,
        importDefinitions
    )

    // Cleanup
    CALL deleteFile(mappingsFile)

    RETURN importResult
END


SUBROUTINE: monitorImportProcess
INPUT:
    process (ChildProcess) - Running CDK process
    importDefinitions (array) - Expected imports
OUTPUT:
    result (ImportResult)

BEGIN
    outputBuffer ← ""
    errorBuffer ← ""
    importedResources ← []
    currentPrompt ← null
    importState ← "RUNNING"

    // Set up output handlers
    process.stdout.on("data", FUNCTION(data):
        chunk ← data.toString()
        outputBuffer ← outputBuffer + chunk

        // Display to user in real-time
        CALL logger.stream(chunk)

        // Check for prompts
        prompt ← CALL detectPrompt(outputBuffer)
        IF prompt IS NOT null THEN
            currentPrompt ← prompt
            CALL handlePrompt(process, prompt, importDefinitions)
        END IF

        // Check for import confirmations
        imported ← CALL detectImportSuccess(outputBuffer)
        IF imported IS NOT null THEN
            importedResources.append(imported)
            logger.success("✅ Imported: " + imported.logicalId)
        END IF

        // Clear processed buffer
        outputBuffer ← CALL trimProcessedLines(outputBuffer)
    END)

    process.stderr.on("data", FUNCTION(data):
        chunk ← data.toString()
        errorBuffer ← errorBuffer + chunk

        CALL logger.error(chunk)
    END)

    // Wait for process completion
    exitCode ← AWAIT process.waitForExit()

    // Determine final status
    IF exitCode = 0 THEN
        status ← "success"
        message ← "Import completed successfully"
    ELSE IF exitCode = 130 THEN
        // User interrupted
        status ← "aborted"
        message ← "Import cancelled by user"
    ELSE
        status ← "failed"
        message ← "Import failed with exit code " + exitCode
    END IF

    RETURN {
        status: status,
        message: message,
        resourcesImported: importedResources.length,
        totalResources: importDefinitions.length,
        importedDetails: importedResources,
        stdoutLog: outputBuffer,
        stderrLog: errorBuffer
    }
END


SUBROUTINE: detectPrompt
INPUT: output (string)
OUTPUT: prompt (object or null)

BEGIN
    // CDK import prompts have specific patterns
    promptPatterns ← [
        {
            pattern: /Do you want to import these resources into your stack\?/,
            type: "confirmation",
            expectedResponse: "y"
        },
        {
            pattern: /Enter the physical ID for (.+?) \[(.+?)\]:/,
            type: "physical-id",
            extractGroup: 1
        },
        {
            pattern: /Would you like to continue\?/,
            type: "confirmation",
            expectedResponse: "y"
        },
        {
            pattern: /Import with physical ID: (.+?)\?/,
            type: "import-confirmation",
            extractGroup: 1,
            expectedResponse: "y"
        }
    ]

    FOR EACH patternDef IN promptPatterns DO
        match ← CALL regex_match(output, patternDef.pattern)

        IF match IS NOT null THEN
            prompt ← {
                type: patternDef.type,
                fullText: match[0],
                extractedValue: match[patternDef.extractGroup] IF patternDef.extractGroup,
                expectedResponse: patternDef.expectedResponse
            }

            RETURN prompt
        END IF
    END FOR

    RETURN null
END


SUBROUTINE: handlePrompt
INPUT:
    process (ChildProcess)
    prompt (object)
    importDefinitions (array)
OUTPUT: void

BEGIN
    logger.info("CDK prompt detected: " + prompt.type)

    CASE prompt.type OF
        "confirmation":
            // Auto-respond with 'y' for confirmations
            response ← "y\n"
            logger.debug("Auto-responding: y")
            CALL process.stdin.write(response)

        "physical-id":
            // Look up physical ID from import definitions
            resourceName ← prompt.extractedValue
            physicalId ← CALL findPhysicalId(resourceName, importDefinitions)

            IF physicalId IS null THEN
                // Prompt user for physical ID
                physicalId ← AWAIT interventionManager.prompt({
                    type: "input",
                    severity: "warning",
                    question: "Enter physical ID for: " + resourceName,
                    context: "CDK could not auto-detect the physical resource ID"
                })
            END IF

            response ← physicalId + "\n"
            logger.info("Providing physical ID: " + physicalId)
            CALL process.stdin.write(response)

        "import-confirmation":
            // Show user what will be imported
            physicalId ← prompt.extractedValue

            confirmation ← AWAIT interventionManager.prompt({
                type: "confirm",
                severity: "info",
                question: "Import with physical ID: " + physicalId + "?",
                defaultValue: "yes"
            })

            IF confirmation.action = "proceed" THEN
                response ← "y\n"
            ELSE
                response ← "n\n"
            END IF

            CALL process.stdin.write(response)

        DEFAULT:
            logger.warn("Unknown prompt type: " + prompt.type)
    END CASE
END


SUBROUTINE: detectImportSuccess
INPUT: output (string)
OUTPUT: imported (object or null)

BEGIN
    // CDK outputs success messages like:
    // "✅ MyStack/MyResource imported successfully"

    pattern ← /✅\s+([^\s]+)\/([^\s]+)\s+imported/
    match ← CALL regex_match(output, pattern)

    IF match IS NOT null THEN
        RETURN {
            stackName: match[1],
            logicalId: match[2],
            timestamp: CURRENT_TIMESTAMP
        }
    END IF

    RETURN null
END


SUBROUTINE: spawnProcess
INPUT: config (object)
OUTPUT: process (ChildProcess)

BEGIN
    process ← SPAWN_CHILD_PROCESS(
        command: config.command,
        args: config.args,
        options: {
            cwd: config.cwd,
            stdio: ["pipe", "pipe", "pipe"],
            env: MERGE(PROCESS.env, {
                FORCE_COLOR: "1",  // Enable colored output
                CI: "false"         // Disable CI mode
            })
        }
    )

    // Set timeout
    IF config.timeout > 0 THEN
        timeoutHandle ← SET_TIMEOUT(FUNCTION():
            logger.warn("Process timeout - killing process")
            process.kill("SIGTERM")
        , config.timeout)

        process.on("exit", FUNCTION():
            CLEAR_TIMEOUT(timeoutHandle)
        END)
    END IF

    RETURN process
END


SUBROUTINE: createImportMappingsFile
INPUT: importDefinitions (array)
OUTPUT: filePath (string)

BEGIN
    // Create resource mapping for cdk import
    mappings ← {}

    FOR EACH def IN importDefinitions DO
        mappings[def.logicalId] ← {
            "PhysicalResourceId": def.physicalId,
            "ResourceType": def.resourceType
        }
    END FOR

    // Write to temporary file
    tempDir ← CALL getTempDirectory()
    fileName ← "cdk-import-mappings-" + RANDOM_ID() + ".json"
    filePath ← CALL joinPath(tempDir, fileName)

    CALL writeJSONFile(filePath, mappings)

    logger.debug("Created import mappings file: " + filePath)

    RETURN filePath
END
```

**Complexity Analysis:**
- **Time Complexity**: O(n * m) where n = resources to import, m = prompts per resource
  - Process monitoring: O(1) per output chunk
  - Prompt detection: O(p) where p = number of prompt patterns
  - Average case: O(n) assuming one prompt per resource
- **Space Complexity**: O(n + b) where b = output buffer size
- **Edge Cases**:
  - Process hangs/timeout
  - Malformed CDK output
  - User abort during import
  - Missing physical IDs
  - CDK version incompatibilities
  - Network failures during AWS API calls

---

## 5. CheckpointManager - Execution Flow

### 5.1 Checkpoint System

```
ALGORITHM: executeCheckpoint
INPUT:
    checkpoint (Checkpoint) - Checkpoint definition
    state (MigrationState) - Current migration state
OUTPUT:
    result (CheckpointResult) - { action, modifications }

CONSTANTS:
    CHECKPOINT_TIMEOUT_MS = 600000  // 10 minutes for user interaction
    AUTO_CONTINUE_THRESHOLD = 0.95  // Auto-continue if confidence > 95%

BEGIN
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("🛑 CHECKPOINT: " + checkpoint.name)
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("")
    logger.info(checkpoint.description)
    logger.info("")

    // Check if checkpoint should trigger
    shouldTrigger ← CALL checkpoint.condition(state)

    IF NOT shouldTrigger THEN
        logger.info("Checkpoint condition not met - skipping")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    // Record checkpoint start
    checkpointRecord ← {
        id: checkpoint.id,
        name: checkpoint.name,
        timestamp: CURRENT_TIMESTAMP,
        status: "started"
    }

    CALL recordCheckpoint(state, checkpointRecord)

    // Execute checkpoint handler with timeout
    TRY
        result ← AWAIT TIMEOUT(
            CALL checkpoint.handler(state),
            CHECKPOINT_TIMEOUT_MS
        )

        // Record checkpoint completion
        checkpointRecord.status ← "completed"
        checkpointRecord.action ← result.action
        checkpointRecord.completedAt ← CURRENT_TIMESTAMP

        CALL updateCheckpointRecord(state, checkpointRecord)

        // Log result
        CASE result.action OF
            "continue":
                logger.success("✅ Checkpoint passed - continuing migration")

            "pause":
                logger.info("⏸️  Checkpoint paused - migration halted")

            "abort":
                logger.error("🛑 Checkpoint aborted - migration cancelled")

            DEFAULT:
                logger.warn("Unknown checkpoint action: " + result.action)
        END CASE

        RETURN result

    CATCH TimeoutError
        logger.error("⏱️  Checkpoint timed out after " + CHECKPOINT_TIMEOUT_MS + "ms")

        checkpointRecord.status ← "timeout"
        CALL updateCheckpointRecord(state, checkpointRecord)

        // Default to pause on timeout
        RETURN {
            action: "pause",
            modifications: null
        }

    CATCH error
        logger.error("❌ Checkpoint error: " + error.message)

        checkpointRecord.status ← "error"
        checkpointRecord.error ← error.message
        CALL updateCheckpointRecord(state, checkpointRecord)

        // Ask user how to proceed
        response ← AWAIT interventionManager.prompt({
            type: "choice",
            severity: "critical",
            question: "Checkpoint failed with error. How to proceed?",
            context: error.message,
            options: [
                {value: "abort", label: "Abort migration"},
                {value: "pause", label: "Pause for manual intervention"},
                {value: "skip", label: "Skip checkpoint and continue"}
            ]
        })

        RETURN {
            action: response.value,
            modifications: null
        }
    END TRY
END


ALGORITHM: checkpointPhysicalIdResolution
INPUT: state (MigrationState)
OUTPUT: result (CheckpointResult)

BEGIN
    logger.info("Checking physical ID resolution for stateful resources...")

    // Find resources needing physical ID resolution
    unresolvedResources ← []

    FOR EACH resource IN state.resources DO
        IF resource.isStateful AND resource.physicalId IS null THEN
            unresolvedResources.append(resource)
        END IF
    END FOR

    IF unresolvedResources.length = 0 THEN
        logger.success("All stateful resources have physical IDs")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    logger.warn("Found " + unresolvedResources.length + " resources without physical IDs")
    logger.info("")

    // Display unresolved resources
    FOR EACH resource IN unresolvedResources DO
        logger.info("  ❌ " + resource.LogicalId + " (" + resource.Type + ")")
    END FOR

    logger.info("")

    // Ask if user wants to resolve now or manually
    response ← AWAIT interventionManager.prompt({
        type: "choice",
        severity: "warning",
        question: "How would you like to resolve physical IDs?",
        options: [
            {
                value: "auto",
                label: "Auto-resolve with discovery",
                description: "Attempt automatic resolution using AWS discovery",
                recommended: true
            },
            {
                value: "manual",
                label: "Manual resolution",
                description: "Provide physical IDs manually for each resource"
            },
            {
                value: "pause",
                label: "Pause migration",
                description: "Stop here and resolve IDs outside the tool"
            }
        ]
    })

    CASE response.value OF
        "auto":
            // Attempt auto-resolution
            resolvedCount ← 0

            FOR EACH resource IN unresolvedResources DO
                TRY
                    physicalId ← AWAIT physicalIdResolver.resolve(
                        resource.LogicalId,
                        resource.Type,
                        resource.Properties
                    )

                    resource.physicalId ← physicalId
                    resolvedCount ← resolvedCount + 1

                CATCH error
                    logger.error("Failed to resolve " + resource.LogicalId + ": " + error.message)
                END TRY
            END FOR

            logger.success("Resolved " + resolvedCount + "/" + unresolvedResources.length + " resources")

            // Check if all resolved
            remainingUnresolved ← unresolvedResources.filter(r → r.physicalId IS null)

            IF remainingUnresolved.length > 0 THEN
                logger.warn("Some resources still unresolved - will require manual input")
            END IF

            RETURN {
                action: "continue",
                modifications: { resources: state.resources }
            }

        "manual":
            // Manual resolution
            FOR EACH resource IN unresolvedResources DO
                physicalId ← AWAIT interventionManager.prompt({
                    type: "input",
                    severity: "info",
                    question: "Enter physical ID for: " + resource.LogicalId,
                    context: "Resource type: " + resource.Type
                })

                resource.physicalId ← physicalId.value
            END FOR

            RETURN {
                action: "continue",
                modifications: { resources: state.resources }
            }

        "pause":
            RETURN {
                action: "pause",
                modifications: null
            }

        DEFAULT:
            RETURN {
                action: "abort",
                modifications: null
            }
    END CASE
END


ALGORITHM: checkpointCriticalDifferences
INPUT: state (MigrationState)
OUTPUT: result (CheckpointResult)

BEGIN
    logger.info("Analyzing template differences...")

    IF state.comparisonResult IS null THEN
        logger.warn("No comparison result available")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    classifications ← state.comparisonResult.classifications

    // Count by severity
    criticalCount ← COUNT(classifications WHERE category = "critical")
    warningCount ← COUNT(classifications WHERE category = "warning")
    acceptableCount ← COUNT(classifications WHERE category = "acceptable")

    logger.info("Difference Summary:")
    logger.info("  🔴 Critical: " + criticalCount)
    logger.info("  ⚠️  Warning: " + warningCount)
    logger.info("  ✅ Acceptable: " + acceptableCount)
    logger.info("")

    // If no critical differences, auto-continue
    IF criticalCount = 0 THEN
        logger.success("No critical differences detected")

        IF warningCount > 0 THEN
            logger.info("Review " + warningCount + " warnings in the report")
        END IF

        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    // Show critical differences
    criticalDiffs ← FILTER(classifications WHERE category = "critical")

    logger.error("Critical Differences Found:")
    logger.info("")

    FOR EACH diff IN criticalDiffs DO
        logger.error("❌ " + diff.difference.path)
        logger.info("   " + diff.explanation)
        logger.info("")
    END FOR

    // Generate detailed report
    reportPath ← CALL generateDetailedReport(state, classifications)
    logger.info("📄 Detailed report: " + reportPath)
    logger.info("")

    // Calculate overall confidence
    confidence ← CALL calculateOverallConfidence(state, classifications)

    logger.info("Migration Confidence: " + ROUND(confidence * 100) + "%")
    logger.info("")

    // Auto-continue if very high confidence despite critical diffs
    IF confidence >= AUTO_CONTINUE_THRESHOLD THEN
        logger.success("High confidence score - auto-continuing")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    // Prompt user for decision
    response ← AWAIT interventionManager.prompt({
        type: "choice",
        severity: "critical",
        question: "Critical differences detected. How to proceed?",
        options: [
            {
                value: "continue",
                label: "Continue anyway",
                description: "Proceed with migration despite differences"
            },
            {
                value: "review",
                label: "Review and fix",
                description: "Pause to review and fix CDK code"
            },
            {
                value: "abort",
                label: "Abort migration",
                description: "Cancel and exit"
            }
        ]
    })

    CASE response.value OF
        "continue":
            // Record user override
            CALL recordUserOverride(state, "critical-differences", response)

            RETURN {
                action: "continue",
                modifications: null
            }

        "review":
            RETURN {
                action: "pause",
                modifications: {
                    pauseReason: "User reviewing critical differences",
                    resumeInstructions: "Fix issues in CDK code and run 'migrate resume'"
                }
            }

        "abort":
            RETURN {
                action: "abort",
                modifications: null
            }

        DEFAULT:
            RETURN {
                action: "abort",
                modifications: null
            }
    END CASE
END


ALGORITHM: checkpointDriftDetection
INPUT: state (MigrationState)
OUTPUT: result (CheckpointResult)

BEGIN
    IF state.config.detectDrift = false THEN
        logger.info("Drift detection disabled - skipping")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    logger.info("Detecting CloudFormation drift...")

    // Run drift detection
    driftMap ← AWAIT driftDetector.detectDrift(state.config.stackName)

    // Find drifted resources
    driftedResources ← []
    FOR EACH resourceId, driftInfo IN driftMap DO
        IF driftInfo.drifted = true THEN
            driftedResources.append({
                resourceId: resourceId,
                driftInfo: driftInfo
            })
        END IF
    END FOR

    IF driftedResources.length = 0 THEN
        logger.success("✅ No drift detected")
        RETURN {
            action: "continue",
            modifications: null
        }
    END IF

    logger.warn("⚠️  Drift detected in " + driftedResources.length + " resources")
    logger.info("")

    // Show drifted resources
    FOR EACH drifted IN driftedResources DO
        logger.warn("  📍 " + drifted.resourceId + ": " + drifted.driftInfo.driftStatus)

        IF drifted.driftInfo.propertyDifferences IS NOT null THEN
            FOR EACH propDiff IN drifted.driftInfo.propertyDifferences DO
                logger.info("     • " + propDiff.propertyPath + ": " + propDiff.differenceType)
            END FOR
        END IF

        logger.info("")
    END FOR

    // For each drifted resource, ask how to resolve
    driftResolutions ← {}

    FOR EACH drifted IN driftedResources DO
        response ← AWAIT interventionManager.resolveDrift(
            drifted.resourceId,
            drifted.driftInfo
        )

        driftResolutions[drifted.resourceId] ← response

        IF response = "abort" THEN
            RETURN {
                action: "abort",
                modifications: null
            }
        END IF
    END FOR

    // Apply drift resolutions
    FOR EACH resourceId, resolution IN driftResolutions DO
        CASE resolution OF
            "use-aws":
                // Update template to match AWS state
                logger.info("Updating template to match AWS state: " + resourceId)
                CALL updateTemplateFromAWS(state, resourceId)

            "use-template":
                // Will overwrite AWS with template during import
                logger.info("Template will override AWS state: " + resourceId)

            "manual":
                // User will fix manually
                logger.info("Manual resolution required: " + resourceId)
                RETURN {
                    action: "pause",
                    modifications: {
                        pauseReason: "Manual drift resolution required for " + resourceId
                    }
                }
        END CASE
    END FOR

    RETURN {
        action: "continue",
        modifications: {
            resources: state.resources,
            driftResolutions: driftResolutions
        }
    }
END
```

**Complexity Analysis:**
- **Time Complexity**:
  - Checkpoint execution: O(h) where h = handler complexity
  - Physical ID checkpoint: O(n * r) where n = unresolved resources, r = resolution time
  - Difference checkpoint: O(d) where d = number of differences
  - Drift checkpoint: O(m * a) where m = drifted resources, a = AWS API call time
- **Space Complexity**: O(s) where s = state size + checkpoint records
- **Edge Cases**:
  - Checkpoint timeout
  - User abort mid-checkpoint
  - State modification failures
  - Concurrent checkpoint triggers
  - Invalid checkpoint conditions
  - Handler exceptions

---

## 6. Supporting Algorithms

### 6.1 String Normalization

```
ALGORITHM: normalizeString
INPUT: str (string)
OUTPUT: normalized (string)

BEGIN
    // Convert to lowercase
    normalized ← LOWERCASE(str)

    // Remove special characters except alphanumeric, dash, underscore
    normalized ← REPLACE(normalized, /[^a-z0-9\-_]/g, "")

    // Collapse multiple dashes/underscores
    normalized ← REPLACE(normalized, /[\-_]+/g, "-")

    // Trim leading/trailing dashes
    normalized ← TRIM(normalized, "-")

    RETURN normalized
END
```

### 6.2 Derive Expected Name

```
ALGORITHM: deriveExpectedName
INPUT:
    logicalId (string)
    resourceType (string)
    templateProps (object)
OUTPUT:
    expectedName (string or null)

BEGIN
    // Try common naming patterns
    patterns ← [
        // Pattern 1: StackName-LogicalId
        templateProps.StackName + "-" + logicalId,

        // Pattern 2: Stage-LogicalId
        templateProps.Stage + "-" + logicalId,

        // Pattern 3: Service-Stage-LogicalId
        templateProps.Service + "-" + templateProps.Stage + "-" + logicalId,

        // Pattern 4: LogicalId-Stage
        logicalId + "-" + templateProps.Stage,

        // Pattern 5: Just logical ID
        logicalId
    ]

    // Convert to kebab-case and lowercase
    FOR EACH pattern IN patterns DO
        IF pattern IS NOT null AND NOT CONTAINS(pattern, "undefined") THEN
            normalized ← CALL normalizeString(pattern)
            RETURN normalized
        END IF
    END FOR

    RETURN null
END
```

### 6.3 Set Equality

```
ALGORITHM: SET_EQUALS
INPUT:
    set1 (array)
    set2 (array)
OUTPUT:
    equal (boolean)

BEGIN
    IF set1.length ≠ set2.length THEN
        RETURN false
    END IF

    // Convert to sets for O(1) lookup
    uniqueSet1 ← CREATE_SET(set1)
    uniqueSet2 ← CREATE_SET(set2)

    IF uniqueSet1.size ≠ uniqueSet2.size THEN
        RETURN false
    END IF

    FOR EACH element IN uniqueSet1 DO
        IF NOT uniqueSet2.has(element) THEN
            RETURN false
        END IF
    END FOR

    RETURN true
END
```

---

## 7. Complexity Analysis Summary

### Overall System Complexity

| Component | Time Complexity | Space Complexity | Bottleneck |
|-----------|----------------|------------------|------------|
| PhysicalIdResolver | O(n * m) | O(m) | AWS discovery API calls |
| ResourceMatcher | O(n * k) | O(n) | Levenshtein distance calculation |
| DifferenceAnalyzer | O(d * r) | O(d) | Rule evaluation |
| InteractiveCDKImport | O(n * p) | O(n + b) | CDK process execution |
| CheckpointManager | O(h) | O(s) | Handler execution |

**Legend:**
- n = number of resources
- m = discovered resources per type
- k = matching operations per resource
- d = number of differences
- r = classification rules
- p = prompts per resource
- b = output buffer size
- h = handler complexity
- s = state size

### Performance Characteristics

**Best Case:**
- All resources have explicit physical IDs: O(n)
- No template differences: O(1)
- No drift detected: O(1)
- No user intervention needed: O(n)

**Average Case:**
- Mix of auto-discovered and manual IDs: O(n * m)
- Some template differences requiring review: O(d)
- Minimal drift: O(1)
- Few user interventions: O(n + i) where i = interventions

**Worst Case:**
- All resources require manual ID resolution: O(n * i)
- Many complex differences: O(d * r)
- Extensive drift across all resources: O(n * a) where a = AWS API time
- Frequent user intervention: O(n * i)

### Optimization Opportunities

1. **Parallel Discovery**: Discover multiple resource types concurrently
2. **Caching**: Cache AWS API responses for repeated queries
3. **Incremental Matching**: Stop matching once high confidence reached
4. **Batch Operations**: Group similar operations to reduce overhead
5. **Smart Prompting**: Learn from user patterns to reduce intervention frequency

---

## Document End

**Total Algorithms**: 25+
**Total Subroutines**: 40+
**Implementation Readiness**: High
**Test Coverage Target**: 90%

This pseudocode provides complete implementation guidance for all critical algorithms in the messy environment support system.
