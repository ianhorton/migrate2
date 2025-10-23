/**
 * Custom error classes for discovery operations
 */

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly region?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DiscoveryError';
    Object.setPrototypeOf(this, DiscoveryError.prototype);
  }
}

export class AWSThrottlingError extends DiscoveryError {
  constructor(
    message: string,
    resourceType?: string,
    region?: string,
    cause?: Error
  ) {
    super(message, resourceType, region, cause);
    this.name = 'AWSThrottlingError';
    Object.setPrototypeOf(this, AWSThrottlingError.prototype);
  }
}

export class AWSAccessDeniedError extends DiscoveryError {
  constructor(
    message: string,
    resourceType?: string,
    region?: string,
    cause?: Error
  ) {
    super(message, resourceType, region, cause);
    this.name = 'AWSAccessDeniedError';
    Object.setPrototypeOf(this, AWSAccessDeniedError.prototype);
  }
}

export class ResourceNotFoundError extends DiscoveryError {
  constructor(
    message: string,
    public readonly resourceId?: string,
    resourceType?: string,
    cause?: Error
  ) {
    super(message, resourceType, undefined, cause);
    this.name = 'ResourceNotFoundError';
    Object.setPrototypeOf(this, ResourceNotFoundError.prototype);
  }
}
