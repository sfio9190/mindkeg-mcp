/**
 * Integration tests for provenance tracking (ESH-AC-25).
 * Tests that source_agent is stored, returned from createLearning, and appears in search results.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
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

describe('Provenance tracking (ESH-AC-25)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('stores source_agent on create and returns it', async () => {
    const record = makeRecord({ source_agent: 'claude-code-v3.7' });
    const learning = await adapter.createLearning(record);
    expect(learning.source_agent).toBe('claude-code-v3.7');
  });

  it('source_agent persists after getLearning', async () => {
    const record = makeRecord({ source_agent: 'cursor-0.45' });
    await adapter.createLearning(record);

    const fetched = await adapter.getLearning(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.source_agent).toBe('cursor-0.45');
  });

  it('source_agent can be updated via updateLearning', async () => {
    const record = makeRecord({ source_agent: 'initial-agent' });
    await adapter.createLearning(record);

    const updated = await adapter.updateLearning(record.id, { source_agent: 'updated-agent' });
    expect(updated!.source_agent).toBe('updated-agent');

    const fetched = await adapter.getLearning(record.id);
    expect(fetched!.source_agent).toBe('updated-agent');
  });

  it('source_agent appears in searchByVector results', async () => {
    const embedding = Array.from({ length: 4 }, (_, i) => i / 4);
    const record = makeRecord({
      source_agent: 'windsurf-agent',
      embedding,
      content: 'provenance in vector search',
    });
    await adapter.createLearning(record);

    const results = await adapter.searchByVector(embedding, {
      limit: 10,
      include_deprecated: false,
      repository: '/home/user/project',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.source_agent).toBe('windsurf-agent');
  });

  it('source_agent appears in searchByText results', async () => {
    const record = makeRecord({
      source_agent: 'fts-test-agent',
      content: 'provenance fts text search result',
    });
    await adapter.createLearning(record);

    const results = await adapter.searchByText('provenance fts', {
      limit: 10,
      include_deprecated: false,
      repository: '/home/user/project',
    });

    expect(results.length).toBeGreaterThan(0);
    const found = results.find((r) => r.id === record.id);
    expect(found).toBeDefined();
    expect(found!.source_agent).toBe('fts-test-agent');
  });

  it('source_agent is null when not provided (default)', async () => {
    const record = makeRecord();
    const learning = await adapter.createLearning(record);
    expect(learning.source_agent).toBeNull();
  });
});
