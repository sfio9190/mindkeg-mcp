/**
 * Utils barrel export.
 * Exposes error classes, logger, and workspace utilities.
 * Used via the "mindkeg-mcp/utils" subpath export.
 */
export {
  MindKegError,
  ValidationError,
  AuthError,
  AccessError,
  NotFoundError,
  EmbeddingError,
  StorageError,
  isMindKegError,
} from './errors.js';
export type { ErrorCode, StructuredError } from './errors.js';

export {
  createLogger,
  initLogger,
  getLogger,
} from './logger.js';
export type { LogLevel, Logger } from './logger.js';

export { normalizePath, deriveWorkspace } from './workspace.js';
