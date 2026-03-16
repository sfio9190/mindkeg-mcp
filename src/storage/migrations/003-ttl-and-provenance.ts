/**
 * Migration 003: TTL, provenance, and integrity columns.
 * Adds three nullable columns to the learnings table:
 *   - ttl_days: per-learning retention period (ESH-AC-15)
 *   - source_agent: provenance tracking — who created/updated this learning (ESH-AC-25)
 *   - integrity_hash: SHA-256 of canonical learning fields for tamper detection (ESH-AC-26)
 *
 * All columns are nullable with NULL defaults so existing data is unaffected
 * (non-destructive migration — safe for 0.3.0 → 0.4.0 upgrade).
 */

export const version = 3;
export const description = 'Add ttl_days, source_agent, integrity_hash columns to learnings';

/** Array of individual SQL statements to run in order. */
export const upStatements: string[] = [
  `ALTER TABLE learnings ADD COLUMN ttl_days INTEGER DEFAULT NULL`,
  `ALTER TABLE learnings ADD COLUMN source_agent TEXT DEFAULT NULL`,
  `ALTER TABLE learnings ADD COLUMN integrity_hash TEXT DEFAULT NULL`,
];

/** Downgrade is not supported for ALTER TABLE ADD COLUMN in SQLite (no DROP COLUMN in older SQLite versions). */
export const downStatements: string[] = [];
