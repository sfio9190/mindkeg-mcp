/**
 * Integration tests for the backfill-integrity CLI command logic.
 * Tests the backfill flow against an in-memory SQLite database.
 * Traces to ESH-AC-26.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
import { computeIntegrityHash } from '../../src/security/integrity.js';
import type { CreateLearningRecord } from '../../src/storage/storage-adapter.js';

function makeRecord(overrides: Partial<CreateLearningRecord> = {}): CreateLearningRecord {
  return {
    id: randomUUID(),
    content: 'Use async/await for all I/O operations.',
    category: 'conventions',
    tags: ['async'],
    repository: '/home/user/project',
    workspace: null,
    group_id: null,
    source: 'test-agent',
    embedding: null,
    ...overrides,
  };
}

/**
 * Simulate the backfill-integrity command logic against a storage adapter.
 * Returns the number of learnings updated.
 */
async function runBackfill(adapter: SqliteAdapter): Promise<number> {
  const all = await adapter.listAll({ include_deprecated: true, limit: undefined });
  const needsHash = all.filter((l) => l.integrity_hash === null || l.integrity_hash === undefined);

  for (const learning of needsHash) {
    const hash = computeIntegrityHash({
      content: learning.content,
      category: learning.category,
      tags: learning.tags,
      repository: learning.repository,
      workspace: learning.workspace,
    });
    await adapter.updateLearning(learning.id, { integrity_hash: hash });
  }

  return needsHash.length;
}

describe('backfill-integrity command logic (ESH-AC-26)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('updates learnings that have null integrity_hash', async () => {
    const id = randomUUID();
    await adapter.createLearning(makeRecord({ id }));

    // Verify the learning starts with null integrity_hash
    const before = await adapter.getLearning(id);
    expect(before?.integrity_hash).toBeNull();

    const count = await runBackfill(adapter);
    expect(count).toBe(1);

    // Verify integrity_hash was set
    const after = await adapter.getLearning(id);
    expect(after?.integrity_hash).toBeTruthy();
    expect(after?.integrity_hash).toHaveLength(64); // SHA-256 hex
  });

  it('skips learnings that already have an integrity_hash', async () => {
    const id = randomUUID();
    await adapter.createLearning(makeRecord({ id }));

    // Manually set a hash
    const learning = await adapter.getLearning(id);
    const hash = computeIntegrityHash({
      content: learning!.content,
      category: learning!.category,
      tags: learning!.tags,
      repository: learning!.repository,
      workspace: learning!.workspace,
    });
    await adapter.updateLearning(id, { integrity_hash: hash });

    // Backfill should skip this one
    const count = await runBackfill(adapter);
    expect(count).toBe(0);
  });

  it('backfills all learnings in a mixed dataset', async () => {
    // Create 3 learnings: 2 without hash, 1 with hash
    const id1 = randomUUID();
    const id2 = randomUUID();
    const id3 = randomUUID();

    await adapter.createLearning(makeRecord({ id: id1, content: 'Learning one.' }));
    await adapter.createLearning(makeRecord({ id: id2, content: 'Learning two.' }));
    await adapter.createLearning(makeRecord({ id: id3, content: 'Learning three.' }));

    // Pre-set hash for id3
    const l3 = await adapter.getLearning(id3);
    const preHash = computeIntegrityHash({
      content: l3!.content,
      category: l3!.category,
      tags: l3!.tags,
      repository: l3!.repository,
      workspace: l3!.workspace,
    });
    await adapter.updateLearning(id3, { integrity_hash: preHash });

    // Backfill: only id1 and id2 should be updated
    const count = await runBackfill(adapter);
    expect(count).toBe(2);

    // Verify id1 and id2 have hashes, id3 still has the pre-set hash
    const after1 = await adapter.getLearning(id1);
    const after2 = await adapter.getLearning(id2);
    const after3 = await adapter.getLearning(id3);

    expect(after1?.integrity_hash).toHaveLength(64);
    expect(after2?.integrity_hash).toHaveLength(64);
    expect(after3?.integrity_hash).toBe(preHash); // unchanged
  });

  it('stored hash passes integrity verification', async () => {
    const id = randomUUID();
    const record = makeRecord({ id, repository: '/my/repo', tags: ['node', 'ts'] });
    await adapter.createLearning(record);

    await runBackfill(adapter);

    const learning = await adapter.getLearning(id);
    expect(learning?.integrity_hash).toBeTruthy();

    // Verify the stored hash matches
    const { verifyIntegrityHash } = await import('../../src/security/integrity.js');
    const valid = verifyIntegrityHash({
      content: learning!.content,
      category: learning!.category,
      tags: learning!.tags,
      repository: learning!.repository,
      workspace: learning!.workspace,
      integrity_hash: learning!.integrity_hash,
    });
    expect(valid).toBe(true);
  });

  it('handles empty database gracefully (0 updated)', async () => {
    const count = await runBackfill(adapter);
    expect(count).toBe(0);
  });
});
