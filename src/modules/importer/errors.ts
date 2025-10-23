/**
 * Custom error classes for CDK import operations
 */

export class CDKImportError extends Error {
  constructor(
    message: string,
    public readonly exitCode?: number,
    public readonly output?: string[],
    public readonly errorOutput?: string[]
  ) {
    super(message);
    this.name = 'CDKImportError';
    Object.setPrototypeOf(this, CDKImportError.prototype);
  }
}

export class ProcessSpawnError extends CDKImportError {
  constructor(
    message: string,
    public readonly command?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ProcessSpawnError';
    Object.setPrototypeOf(this, ProcessSpawnError.prototype);
  }
}

export class ProcessTimeoutError extends CDKImportError {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'ProcessTimeoutError';
    Object.setPrototypeOf(this, ProcessTimeoutError.prototype);
  }
}

export class InvalidCDKProjectError extends CDKImportError {
  constructor(
    message: string,
    public readonly projectPath: string
  ) {
    super(message);
    this.name = 'InvalidCDKProjectError';
    Object.setPrototypeOf(this, InvalidCDKProjectError.prototype);
  }
}
