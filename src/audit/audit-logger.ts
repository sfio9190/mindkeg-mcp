/**
 * Audit logger for Mind Keg MCP.
 * Writes structured JSON lines audit entries to a configurable destination.
 * Traces to ESH-AC-5, ESH-AC-6, ESH-AC-7, ESH-AC-8, ESH-AC-9.
 *
 * Design:
 * - Each entry is a single JSON line with ISO 8601 timestamp (SIEM-compatible)
 * - Sensitive fields (content, embedding) are NEVER included
 * - Destinations: file path (append-only), "stderr", or "none" (disabled)
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A structured audit log entry. Traces to ESH-AC-6, ESH-AC-8.
 * NOTE: Never include content or embedding fields (ESH-AC-9).
 */
export interface AuditEntry {
  /** ISO 8601 timestamp of the operation. */
  timestamp: string;
  /** MCP tool name (e.g., "store_learning"). */
  action: string;
  /** API key prefix (first 8 chars), "stdio", or "anonymous". */
  actor: string;
  /** Learning ID or null for list/search/purge operations. */
  resource_id: string | null;
  /** Whether the operation succeeded or failed. */
  result: 'success' | 'error';
  /** ErrorCode string if result is "error". */
  error_code?: string;
  /** Client transport metadata. */
  client: {
    transport: 'stdio' | 'http';
    /** HTTP client IP address (HTTP transport only). */
    ip?: string;
    /** Server process PID (stdio transport). */
    pid?: number;
  };
  /**
   * Tool-specific metadata (e.g., search query, filter params).
   * MUST NOT include content or embedding values (ESH-AC-9).
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AuditLogger
// ---------------------------------------------------------------------------

/**
 * Writes audit entries to the configured destination.
 * Supported destinations (ESH-AC-7):
 * - File path (e.g., "/home/user/.mindkeg/audit.jsonl"): append-only JSON lines
 * - "stderr": writes to process.stderr with audit:true marker
 * - "none": audit logging disabled
 */
export class AuditLogger {
  private readonly destination: string;

  /**
   * @param destination - File path, "stderr", or "none".
   *                      Defaults to "none" (no audit logging).
   */
  constructor(destination: string) {
    this.destination = destination;

    // Pre-create the directory for file destinations so the first write does
    // not fail on a missing parent directory.
    if (destination !== 'none' && destination !== 'stderr' && destination !== 'syslog') {
      try {
        mkdirSync(dirname(destination), { recursive: true });
      } catch {
        // Ignore — write will fail later with a clearer error
      }
    }
  }

  /**
   * Write an audit entry.
   * Failures are logged as warnings but do not propagate — audit failures
   * must never take down the primary operation (ESH-AC-5).
   */
  log(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + '\n';

    try {
      if (this.destination === 'none') {
        return;
      }

      if (this.destination === 'stderr') {
        // Write to stderr alongside application logs.
        // The audit:true marker distinguishes audit entries from app log lines.
        process.stderr.write(JSON.stringify({ audit: true, ...entry }) + '\n');
        return;
      }

      if (this.destination === 'syslog') {
        // syslog support is deferred to v2 — fall back to stderr with a warning.
        const log = getLogger();
        log.warn('MINDKEG_AUDIT_LOG=syslog is not yet implemented. Audit entry written to stderr.');
        process.stderr.write(JSON.stringify({ audit: true, ...entry }) + '\n');
        return;
      }

      // File destination: synchronous append (audit ordering guarantee)
      appendFileSync(this.destination, line, 'utf8');
    } catch (err) {
      // Non-fatal: log warning but do not throw (ESH-AC-5)
      const log = getLogger();
      log.warn(
        { auditDest: this.destination, error: String(err) },
        'Failed to write audit log entry (non-fatal)'
      );
    }
  }

  /**
   * Write a pre-built AuditEntry.
   * Alias for log() provided for clarity at call sites.
   */
  logEntry(entry: AuditEntry): void {
    this.log(entry);
  }
}

/**
 * Create a no-op audit logger. Used in tests and when audit logging is disabled.
 */
export function createNoopAuditLogger(): AuditLogger {
  return new AuditLogger('none');
}
