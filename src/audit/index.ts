/**
 * Barrel export for the audit subsystem.
 * Traces to ESH-AC-5.
 */
export { AuditLogger, createNoopAuditLogger } from './audit-logger.js';
export type { AuditEntry } from './audit-logger.js';
