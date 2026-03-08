/**
 * Migration 001: Initial schema.
 * Creates learnings, api_keys, learnings_fts (FTS5 virtual table), and schema_version tables.
 *
 * Note: Statements are exported as an array to avoid ambiguity when splitting on ';',
 * which would break multi-statement trigger bodies (BEGIN...END).
 */

export const version = 1;
export const description = 'Initial schema: learnings, api_keys, FTS5, schema_version';

/** Array of individual SQL statements to run in order. */
export const upStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS learnings (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL CHECK (length(content) <= 500),
    category TEXT NOT NULL CHECK (category IN ('architecture','conventions','debugging','gotchas','dependencies','decisions')),
    tags TEXT NOT NULL DEFAULT '[]',
    repository TEXT,
    workspace TEXT,
    group_id TEXT,
    source TEXT NOT NULL DEFAULT 'unknown',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
    stale_flag INTEGER NOT NULL DEFAULT 0,
    embedding TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_learnings_repository ON learnings(repository)`,
  `CREATE INDEX IF NOT EXISTS idx_learnings_category ON learnings(category)`,
  `CREATE INDEX IF NOT EXISTS idx_learnings_status ON learnings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_learnings_group_id ON learnings(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_learnings_workspace ON learnings(workspace)`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(
    content,
    tags,
    content=learnings,
    content_rowid=rowid
  )`,

  // Triggers maintain the FTS5 index in sync with the learnings table
  `CREATE TRIGGER IF NOT EXISTS learnings_fts_insert
    AFTER INSERT ON learnings
    BEGIN
      INSERT INTO learnings_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
    END`,

  `CREATE TRIGGER IF NOT EXISTS learnings_fts_update
    AFTER UPDATE ON learnings
    BEGIN
      INSERT INTO learnings_fts(learnings_fts, rowid, content, tags)
        VALUES ('delete', old.rowid, old.content, old.tags);
      INSERT INTO learnings_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
    END`,

  `CREATE TRIGGER IF NOT EXISTS learnings_fts_delete
    AFTER DELETE ON learnings
    BEGIN
      INSERT INTO learnings_fts(learnings_fts, rowid, content, tags)
        VALUES ('delete', old.rowid, old.content, old.tags);
    END`,

  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    repositories TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0
  )`,
];

/** Array of statements to undo the migration (drop order reversed). */
export const downStatements: string[] = [
  `DROP TRIGGER IF EXISTS learnings_fts_delete`,
  `DROP TRIGGER IF EXISTS learnings_fts_update`,
  `DROP TRIGGER IF EXISTS learnings_fts_insert`,
  `DROP TABLE IF EXISTS learnings_fts`,
  `DROP INDEX IF EXISTS idx_learnings_workspace`,
  `DROP INDEX IF EXISTS idx_learnings_group_id`,
  `DROP INDEX IF EXISTS idx_learnings_status`,
  `DROP INDEX IF EXISTS idx_learnings_category`,
  `DROP INDEX IF EXISTS idx_learnings_repository`,
  `DROP TABLE IF EXISTS learnings`,
  `DROP TABLE IF EXISTS api_keys`,
  `DROP TABLE IF EXISTS schema_version`,
];
