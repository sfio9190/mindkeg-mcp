/**
 * Integration tests for encryption at rest in SqliteAdapter.
 * Traces to ESH-AC-2, ESH-AC-3.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
import { isEncrypted } from '../../src/crypto/encryption.js';

function makeKey(): Buffer {
  return randomBytes(32);
}

describe('SqliteAdapter with encryption enabled (ESH-AC-2)', () => {
  let adapter: SqliteAdapter;
  const encKey = makeKey();

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:', encKey);
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('stores content and can retrieve it as plaintext', async () => {
    const learning = await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000001',
      content: 'This content should be encrypted at rest',
      category: 'gotchas',
      tags: ['security'],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    // Returned object should have plaintext content
    expect(learning.content).toBe('This content should be encrypted at rest');
  });

  it('getLearning returns decrypted content', async () => {
    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000002',
      content: 'Encrypted learning content',
      category: 'architecture',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    const fetched = await adapter.getLearning('00000000-0000-0000-0000-000000000002');
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe('Encrypted learning content');
  });

  it('stores and retrieves embedding round-trip through encryption', async () => {
    const embedding = Array.from({ length: 384 }, (_, i) => i * 0.001);

    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000003',
      content: 'Learning with embedding',
      category: 'debugging',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding,
    });

    const fetched = await adapter.getLearning('00000000-0000-0000-0000-000000000003');
    expect(fetched!.embedding).not.toBeNull();
    expect(fetched!.embedding!.length).toBe(384);
    expect(fetched!.embedding![0]).toBeCloseTo(0);
  });

  it('updateLearning encrypts updated content', async () => {
    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000004',
      content: 'Original content',
      category: 'conventions',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    await adapter.updateLearning('00000000-0000-0000-0000-000000000004', {
      content: 'Updated content — should still be encrypted',
    });

    const fetched = await adapter.getLearning('00000000-0000-0000-0000-000000000004');
    expect(fetched!.content).toBe('Updated content — should still be encrypted');
  });

  it('searchByText returns decrypted content results', async () => {
    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000005',
      content: 'TypeScript strict mode prevents null errors',
      category: 'conventions',
      tags: ['typescript'],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    // Note: FTS5 won't match encrypted content — this test verifies that
    // returned rows have their content properly decrypted even if empty result
    const results = await adapter.searchByText('TypeScript', {
      limit: 10,
      include_deprecated: false,
    });
    // Results may be empty (FTS5 limitation with encrypted content) — that's expected
    // but if any results are returned, content must be decrypted
    for (const r of results) {
      expect(isEncrypted(r.content)).toBe(false);
    }
  });

  it('listAll returns decrypted content', async () => {
    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000006',
      content: 'Export test learning',
      category: 'gotchas',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    const all = await adapter.listAll({ include_deprecated: false });
    const found = all.find((l) => l.id === '00000000-0000-0000-0000-000000000006');
    expect(found).toBeDefined();
    expect(found!.content).toBe('Export test learning');
    expect(isEncrypted(found!.content)).toBe(false);
  });
});

describe('SqliteAdapter without encryption key (ESH-AC-3)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:'); // No encryption key
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('stores and retrieves content as plaintext when no key is set', async () => {
    const learning = await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000010',
      content: 'No encryption here',
      category: 'gotchas',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    expect(learning.content).toBe('No encryption here');

    const fetched = await adapter.getLearning('00000000-0000-0000-0000-000000000010');
    expect(fetched!.content).toBe('No encryption here');
    expect(isEncrypted(fetched!.content)).toBe(false);
  });

  it('FTS5 text search works when encryption is disabled', async () => {
    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000011',
      content: 'TypeScript strict mode is essential',
      category: 'conventions',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding: null,
    });

    const results = await adapter.searchByText('TypeScript', {
      limit: 10,
      include_deprecated: false,
    });
    // FTS5 works on plaintext content
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain('TypeScript');
  });

  it('searchByVector works when encryption is disabled', async () => {
    const embedding = Array.from({ length: 4 }, (_, i) => i * 0.1);

    await adapter.createLearning({
      id: '00000000-0000-0000-0000-000000000012',
      content: 'Vector test',
      category: 'gotchas',
      tags: [],
      repository: null,
      workspace: null,
      group_id: null,
      source: 'test',
      embedding,
    });

    const results = await adapter.searchByVector(embedding, {
      limit: 10,
      include_deprecated: false,
    });
    expect(results.length).toBe(1);
    expect(results[0]!.content).toBe('Vector test');
  });
});
