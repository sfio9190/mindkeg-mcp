/**
 * Custom error classes for structured error handling.
 * Maps to HTTP status equivalents and MCP error codes as defined in the architecture spec.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'ACCESS_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'EMBEDDING_ERROR'
  | 'STORAGE_ERROR';

export interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class MindKegError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'MindKegError';
    this.code = code;
    this.details = details;
    // Maintain proper prototype chain in TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Input validation failed (e.g., content > 500 chars, invalid category). HTTP 400. */
export class ValidationError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/** API key is missing, invalid, or revoked. HTTP 401. */
export class AuthError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('AUTH_ERROR', message, details);
    this.name = 'AuthError';
  }
}

/** Key is valid but lacks access to the requested repository. HTTP 403. */
export class AccessError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('ACCESS_ERROR', message, details);
    this.name = 'AccessError';
  }
}

/** The requested learning or resource does not exist. HTTP 404. */
export class NotFoundError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('NOT_FOUND_ERROR', message, details);
    this.name = 'NotFoundError';
  }
}

/** Embedding provider API call failed. HTTP 502. */
export class EmbeddingError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('EMBEDDING_ERROR', message, details);
    this.name = 'EmbeddingError';
  }
}

/** Database or storage operation failed. HTTP 500. */
export class StorageError extends MindKegError {
  constructor(message: string, details?: unknown) {
    super('STORAGE_ERROR', message, details);
    this.name = 'StorageError';
  }
}

/** Type guard for MindKegError instances. */
export function isMindKegError(err: unknown): err is MindKegError {
  return err instanceof MindKegError;
}
