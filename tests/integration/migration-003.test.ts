/**
 * Integration tests for migration 003: TTL, provenance, and integrity columns.
 * Tests:
 * - Round-trip persistence of new fields (ttl_days, source_agent, integrity_hash)
 * - Existing learnings default new columns to NULL after migration (upgrade simulation)
 * Traces to ESH-AC-15, ESH-AC-25, ESH-AC-26.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
import type { CreateLearningRecord, UpdateLearningRecord } from '../../src/storage/storage-adapter.js';

function makeRecord(overrides: Partial<CreateLearningRecord> = {}): CreateLearningRecord {
  return {
    id: randomUUID(),
    content: 'Use async/await for all I/O operations.',
    category: 'conventions',
    tags: ['async', 'node'],
    repository: '/home/user/project',
    workspace: null,
    group_id: null,
    source: 'test-agent',
    embedding: null,
    ...overrides,
  };
}

describe('Migration 003: new column round-trip persistence', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('stores and retrieves ttl_days (ESH-AC-15)', async () => {
    const record = makeRecord({ ttl_days: 30 });
    const learning = await adapter.createLearning(record);
    expect(learning.ttl_days).toBe(30);

    const fetched = await adapter.getLearning(learning.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.ttl_days).toBe(30);
  });

  it('stores null ttl_days when not provided (ESH-AC-15)', async () => {
    const record = makeRecord();
    const learning = await adapter.createLearning(record);
    expect(learning.ttl_days).toBeNull();

    const fetched = await adapter.getLearning(learning.id);
    expect(fetched!.ttl_days).toBeNull();
  });

  it('stores and retrieves source_agent (ESH-AC-25)', async () => {
    const record = makeRecord({ source_agent: 'claude-code-v3' });
    const learning = await adapter.createLearning(record);
    expect(learning.source_agent).toBe('claude-code-v3');

    const fetched = await adapter.getLearning(learning.id);
    expect(fetched!.source_agent).toBe('claude-code-v3');
  });

  it('stores null source_agent when not provided (ESH-AC-25)', async () => {
    const record = makeRecord();
    const learning = await adapter.createLearning(record);
    expect(learning.source_agent).toBeNull();
  });

  it('stores and retrieves integrity_hash (ESH-AC-26)', async () => {
    const hash = 'a'.repeat(64); // fake SHA-256 hex string
    const record = makeRecord({ integrity_hash: hash });
    const learning = await adapter.createLearning(record);
    expect(learning.integrity_hash).toBe(hash);

    const fetched = await adapter.getLearning(learning.id);
    expect(fetched!.integrity_hash).toBe(hash);
  });

  it('stores null integrity_hash when not provided (ESH-AC-26)', async () => {
    const record = makeRecord();
    const learning = await adapter.createLearning(record);
    expect(learning.integrity_hash).toBeNull();
  });

  it('updates ttl_days via updateLearning (ESH-AC-15)', async () => {
    const record = makeRecord();
    const created = await adapter.createLearning(record);
    expect(created.ttl_days).toBeNull();

    const updates: UpdateLearningRecord = { ttl_days: 90 };
    const updated = await adapter.updateLearning(created.id, updates);
    expect(updated).not.toBeNull();
    expect(updated!.ttl_days).toBe(90);

    // Clear TTL by setting to null
    const cleared = await adapter.updateLearning(created.id, { ttl_days: null });
    expect(cleared!.ttl_days).toBeNull();
  });

  it('updates source_agent via updateLearning (ESH-AC-25)', async () => {
    const record = makeRecord({ source_agent: 'initial-agent' });
    const created = await adapter.createLearning(record);

    const updated = await adapter.updateLearning(created.id, { source_agent: 'updated-agent' });
    expect(updated!.source_agent).toBe('updated-agent');
  });

  it('updates integrity_hash via updateLearning (ESH-AC-26)', async () => {
    const record = makeRecord();
    const created = await adapter.createLearning(record);
    expect(created.integrity_hash).toBeNull();

    const newHash = 'b'.repeat(64);
    const updated = await adapter.updateLearning(created.id, { integrity_hash: newHash });
    expect(updated!.integrity_hash).toBe(newHash);
  });

  it('existing learnings have NULL new columns (upgrade simulation: ESH-AC-15, ESH-AC-25, ESH-AC-26)', async () => {
    // Simulate pre-migration data by inserting a bare record without new columns.
    // Since we use in-memory DB with migration already applied, we insert a record
    // that omits ttl_days/source_agent/integrity_hash — they should come back as NULL.
    const record = makeRecord(); // no new fields
    const learning = await adapter.createLearning(record);

    // Verify defaults are NULL (backward compatibility)
    expect(learning.ttl_days).toBeNull();
    expect(learning.source_agent).toBeNull();
    expect(learning.integrity_hash).toBeNull();

    // Verify the DB actually persisted NULLs
    const fetched = await adapter.getLearning(learning.id);
    expect(fetched!.ttl_days).toBeNull();
    expect(fetched!.source_agent).toBeNull();
    expect(fetched!.integrity_hash).toBeNull();
  });

  it('new columns appear in search results (ESH-AC-15, ESH-AC-25)', async () => {
    const record = makeRecord({
      content: 'searchable content with ttl and provenance',
      ttl_days: 60,
      source_agent: 'test-searcher',
      embedding: Array.from({ length: 4 }, (_, i) => i / 4),
    });
    await adapter.createLearning(record);

    const results = await adapter.searchByVector(
      Array.from({ length: 4 }, (_, i) => i / 4),
      { limit: 10, include_deprecated: false, repository: '/home/user/project' }
    );
    expect(results.length).toBeGreaterThan(0);
    const result = results[0]!;
    expect(result.ttl_days).toBe(60);
    expect(result.source_agent).toBe('test-searcher');
  });
});
