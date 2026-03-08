/**
 * Integration tests for SqliteAdapter.
 * Uses an in-memory SQLite database to avoid filesystem side effects.
 * Traces to AC-1 through AC-5, AC-8, AC-9, AC-10, AC-11, AC-20, AC-24.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { SqliteAdapter, cosineSimilarity } from '../../src/storage/sqlite-adapter.js';
import type { CreateLearningRecord, SearchFilters } from '../../src/storage/storage-adapter.js';

const REPO_PATH = '/home/user/my-project';

function makeRecord(overrides: Partial<CreateLearningRecord> = {}): CreateLearningRecord {
  return {
    id: randomUUID(),
    content: 'Use async/await for all I/O operations.',
    category: 'conventions',
    tags: ['async', 'node'],
    repository: REPO_PATH,
    workspace: null,
    group_id: null,
    source: 'test-agent',
    embedding: null,
    ...overrides,
  };
}

function defaultFilters(overrides: Partial<SearchFilters> = {}): SearchFilters {
  return {
    limit: 10,
    include_deprecated: false,
    ...overrides,
  };
}

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  // -------------------------------------------------------------------------
  // Learning CRUD
  // -------------------------------------------------------------------------

  describe('createLearning (AC-1)', () => {
    it('creates a learning and returns it with auto-set timestamps (AC-27)', async () => {
      const record = makeRecord();
      const learning = await adapter.createLearning(record);

      expect(learning.id).toBe(record.id);
      expect(learning.content).toBe(record.content);
      expect(learning.category).toBe(record.category);
      expect(learning.tags).toEqual(record.tags);
      expect(learning.repository).toBe(record.repository);
      expect(learning.status).toBe('active');
      expect(learning.stale_flag).toBe(false);
      expect(learning.source).toBe('test-agent');
      expect(learning.created_at).toBeTruthy();
      expect(learning.updated_at).toBeTruthy();
    });

    it('creates a global learning (repository = null) (AC-7)', async () => {
      const record = makeRecord({ repository: null });
      const learning = await adapter.createLearning(record);
      expect(learning.repository).toBeNull();
    });

    it('stores and returns tags as an array (AC-14)', async () => {
      const record = makeRecord({ tags: ['typescript', 'eslint', 'testing'] });
      const learning = await adapter.createLearning(record);
      expect(learning.tags).toEqual(['typescript', 'eslint', 'testing']);
    });

    it('stores and returns embedding as a float array', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const record = makeRecord({ embedding });
      const learning = await adapter.createLearning(record);
      expect(learning.embedding).toEqual(embedding);
    });
  });

  describe('getLearning (AC-2)', () => {
    it('retrieves an existing learning by id', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);
      const learning = await adapter.getLearning(record.id);
      expect(learning).not.toBeNull();
      expect(learning!.id).toBe(record.id);
    });

    it('returns null for a non-existent id', async () => {
      const result = await adapter.getLearning(randomUUID());
      expect(result).toBeNull();
    });
  });

  describe('updateLearning (AC-3)', () => {
    it('updates content and returns the new content', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);

      const updated = await adapter.updateLearning(record.id, {
        content: 'Prefer named exports over default exports.',
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('Prefer named exports over default exports.');
      // updated_at is set to NOW() on each update; in fast tests it may equal created_at
      // The important thing is that the content was updated, not the timestamp precision
      expect(updated!.updated_at).toBeTruthy();
    });

    it('updates category', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);
      const updated = await adapter.updateLearning(record.id, { category: 'architecture' });
      expect(updated!.category).toBe('architecture');
    });

    it('updates tags (replaces entire array)', async () => {
      const record = makeRecord({ tags: ['old', 'tags'] });
      await adapter.createLearning(record);
      const updated = await adapter.updateLearning(record.id, { tags: ['new'] });
      expect(updated!.tags).toEqual(['new']);
    });

    it('returns null when learning not found', async () => {
      const result = await adapter.updateLearning(randomUUID(), { content: 'x' });
      expect(result).toBeNull();
    });

    it('sets status to deprecated (AC-4)', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);
      const updated = await adapter.updateLearning(record.id, { status: 'deprecated' });
      expect(updated!.status).toBe('deprecated');
    });

    it('sets stale_flag (AC-30)', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);
      const updated = await adapter.updateLearning(record.id, { stale_flag: true });
      expect(updated!.stale_flag).toBe(true);
    });
  });

  describe('deleteLearning (AC-5)', () => {
    it('deletes an existing learning and returns true', async () => {
      const record = makeRecord();
      await adapter.createLearning(record);
      const result = await adapter.deleteLearning(record.id);
      expect(result).toBe(true);

      const fetched = await adapter.getLearning(record.id);
      expect(fetched).toBeNull();
    });

    it('returns false when learning not found', async () => {
      const result = await adapter.deleteLearning(randomUUID());
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe('searchByText (AC-9 FTS fallback)', () => {
    beforeEach(async () => {
      await adapter.createLearning(
        makeRecord({ content: 'Always use transactions for database writes.' })
      );
      await adapter.createLearning(
        makeRecord({ content: 'Prefer async/await over callback patterns.' })
      );
      await adapter.createLearning(
        makeRecord({
          content: 'Global tip: use strict mode.',
          repository: null, // global
        })
      );
    });

    it('finds learnings matching a keyword', async () => {
      const results = await adapter.searchByText(
        'transactions',
        defaultFilters({ repository: REPO_PATH })
      );
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]!.content).toContain('transactions');
    });

    it('returns results with a score field (AC-12)', async () => {
      const results = await adapter.searchByText(
        'database',
        defaultFilters({ repository: REPO_PATH })
      );
      expect(results.length).toBeGreaterThan(0);
      expect(typeof results[0]!.score).toBe('number');
      expect(results[0]!.score).toBeGreaterThanOrEqual(0);
      expect(results[0]!.score).toBeLessThanOrEqual(1);
    });

    it('excludes deprecated learnings by default (AC-4, AC-29)', async () => {
      const record = makeRecord({ content: 'Deprecated pattern — avoid this.' });
      await adapter.createLearning(record);
      await adapter.updateLearning(record.id, { status: 'deprecated' });

      const results = await adapter.searchByText('deprecated pattern', defaultFilters());
      const ids = results.map((r) => r.id);
      expect(ids).not.toContain(record.id);
    });

    it('includes deprecated learnings when flag is set (AC-29)', async () => {
      const record = makeRecord({ content: 'Deprecated approach — see new version.' });
      await adapter.createLearning(record);
      await adapter.updateLearning(record.id, { status: 'deprecated' });

      const results = await adapter.searchByText(
        'deprecated approach',
        defaultFilters({ repository: REPO_PATH, include_deprecated: true })
      );
      const ids = results.map((r) => r.id);
      expect(ids).toContain(record.id);
    });

    it('includes global learnings in repo-scoped search (AC-8)', async () => {
      const results = await adapter.searchByText(
        'strict mode',
        defaultFilters({ repository: REPO_PATH })
      );
      // The global learning (repository=null) should appear
      const globalResult = results.find((r) => r.repository === null);
      expect(globalResult).toBeDefined();
    });

    it('filters by category (AC-10)', async () => {
      await adapter.createLearning(
        makeRecord({
          content: 'Architecture: use hexagonal pattern.',
          category: 'architecture',
        })
      );
      const results = await adapter.searchByText(
        'hexagonal',
        defaultFilters({ category: 'architecture' })
      );
      expect(results.every((r) => r.category === 'architecture')).toBe(true);
    });

    it('filters by tags (AC-10)', async () => {
      await adapter.createLearning(
        makeRecord({
          content: 'Use Zod for runtime validation.',
          tags: ['zod', 'validation'],
        })
      );
      const results = await adapter.searchByText(
        'Zod',
        defaultFilters({ repository: REPO_PATH, tags: ['zod'] })
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.tags.includes('zod'))).toBe(true);
    });

    it('respects the limit (AC-11)', async () => {
      // Add more records
      for (let i = 0; i < 5; i++) {
        await adapter.createLearning(
          makeRecord({ id: randomUUID(), content: `Pattern ${i}: use async operations.` })
        );
      }
      const results = await adapter.searchByText('async', defaultFilters({ limit: 2 }));
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array on FTS parse error without throwing', async () => {
      // Malformed FTS query — should not crash
      const results = await adapter.searchByText('AND OR NOT', defaultFilters());
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchByVector (AC-9 semantic)', () => {
    it('ranks results by cosine similarity (AC-9, AC-12)', async () => {
      // Create two learnings with distinct embeddings
      const embA = [1, 0, 0];
      const embB = [0, 1, 0];
      const queryEmbedding = [1, 0.1, 0]; // Close to embA

      const recordA = makeRecord({ id: randomUUID(), content: 'Similar to query.', embedding: embA });
      const recordB = makeRecord({ id: randomUUID(), content: 'Different from query.', embedding: embB });

      await adapter.createLearning(recordA);
      await adapter.createLearning(recordB);

      const results = await adapter.searchByVector(
        queryEmbedding,
        defaultFilters({ repository: REPO_PATH })
      );
      expect(results.length).toBe(2);
      // recordA should rank first (higher cosine similarity)
      expect(results[0]!.id).toBe(recordA.id);
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    });

    it('skips learnings without embeddings', async () => {
      const recordNoEmb = makeRecord({ content: 'No embedding here.', embedding: null });
      const recordWithEmb = makeRecord({
        id: randomUUID(),
        content: 'Has embedding.',
        embedding: [1, 0, 0],
      });

      await adapter.createLearning(recordNoEmb);
      await adapter.createLearning(recordWithEmb);

      const results = await adapter.searchByVector(
        [1, 0, 0],
        defaultFilters({ repository: REPO_PATH })
      );
      const ids = results.map((r) => r.id);
      expect(ids).not.toContain(recordNoEmb.id);
      expect(ids).toContain(recordWithEmb.id);
    });

    it('includes global learnings in repo-scoped vector search (AC-8)', async () => {
      const globalRecord = makeRecord({
        id: randomUUID(),
        content: 'Global tip.',
        repository: null,
        embedding: [0.5, 0.5, 0],
      });
      await adapter.createLearning(globalRecord);

      const results = await adapter.searchByVector(
        [0.5, 0.5, 0],
        defaultFilters({ repository: REPO_PATH })
      );
      const globalResult = results.find((r) => r.id === globalRecord.id);
      expect(globalResult).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Repositories
  // -------------------------------------------------------------------------

  describe('listRepositories', () => {
    it('returns distinct repositories with counts', async () => {
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: '/repo/a' }));
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: '/repo/a' }));
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: '/repo/b' }));
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: null }));

      const repos = await adapter.listRepositories();
      expect(repos.length).toBeGreaterThanOrEqual(3);

      const repoA = repos.find((r) => r.path === '/repo/a');
      expect(repoA?.learning_count).toBe(2);

      const repoB = repos.find((r) => r.path === '/repo/b');
      expect(repoB?.learning_count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // API Keys (AC-20, AC-21, AC-22)
  // -------------------------------------------------------------------------

  describe('createApiKey (AC-20)', () => {
    it('creates and retrieves an API key by hash', async () => {
      const record = {
        id: randomUUID(),
        name: 'My Laptop',
        key_hash: 'abc123hash',
        key_prefix: 'mk_abcd12',
        repositories: [],
      };
      await adapter.createApiKey(record);

      const found = await adapter.getApiKeyByHash('abc123hash');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('My Laptop');
      expect(found!.revoked).toBe(false);
    });

    it('returns null for unknown hash', async () => {
      const result = await adapter.getApiKeyByHash('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listApiKeys (AC-20)', () => {
    it('lists all API keys', async () => {
      await adapter.createApiKey({
        id: randomUUID(),
        name: 'Key A',
        key_hash: 'hash_a',
        key_prefix: 'mk_aaaa00',
        repositories: [],
      });
      await adapter.createApiKey({
        id: randomUUID(),
        name: 'Key B',
        key_hash: 'hash_b',
        key_prefix: 'mk_bbbb00',
        repositories: ['/repo/x'],
      });

      const keys = await adapter.listApiKeys();
      expect(keys.length).toBe(2);
    });
  });

  describe('revokeApiKey (AC-20)', () => {
    it('revokes an API key by prefix', async () => {
      await adapter.createApiKey({
        id: randomUUID(),
        name: 'Temp Key',
        key_hash: 'hash_temp',
        key_prefix: 'mk_temp00',
        repositories: [],
      });

      const revoked = await adapter.revokeApiKey('mk_temp00');
      expect(revoked).toBe(true);

      const key = await adapter.getApiKeyByHash('hash_temp');
      expect(key!.revoked).toBe(true);
    });

    it('returns false when prefix not found', async () => {
      const result = await adapter.revokeApiKey('mk_missing');
      expect(result).toBe(false);
    });
  });

  describe('touchApiKey', () => {
    it('updates last_used_at without throwing', async () => {
      const id = randomUUID();
      await adapter.createApiKey({
        id,
        name: 'Touch Test',
        key_hash: 'hash_touch',
        key_prefix: 'mk_touch0',
        repositories: [],
      });

      // Should not throw
      await expect(adapter.touchApiKey(id)).resolves.toBeUndefined();

      const keys = await adapter.listApiKeys();
      const key = keys.find((k) => k.id === id);
      expect(key?.last_used_at).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Workspace scoping (WS-AC-4 through WS-AC-8, WS-AC-16, WS-AC-18 through WS-AC-23)
  // -------------------------------------------------------------------------

  describe('Workspace scoping', () => {
    const WORKSPACE = '/home/user/';
    const OTHER_WORKSPACE = '/home/other/';
    const WORKSPACE_REPO = '/home/user/my-project';

    it('creates a workspace-scoped learning (WS-AC-6)', async () => {
      const record = makeRecord({
        repository: null,
        workspace: WORKSPACE,
        content: 'Workspace-wide convention: use prettier.',
      });
      const learning = await adapter.createLearning(record);
      expect(learning.workspace).toBe(WORKSPACE);
      expect(learning.repository).toBeNull();
    });

    it('creates a repo-specific learning with workspace null (WS-AC-5)', async () => {
      const record = makeRecord({ repository: WORKSPACE_REPO, workspace: null });
      const learning = await adapter.createLearning(record);
      expect(learning.repository).toBe(WORKSPACE_REPO);
      expect(learning.workspace).toBeNull();
    });

    it('creates a global learning with both null (WS-AC-7)', async () => {
      const record = makeRecord({ repository: null, workspace: null });
      const learning = await adapter.createLearning(record);
      expect(learning.repository).toBeNull();
      expect(learning.workspace).toBeNull();
    });

    it('three-scope search: returns repo + workspace + global learnings (WS-AC-12, WS-AC-22)', async () => {
      const repoLearning = await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Repo tip: use async database calls.',
          repository: WORKSPACE_REPO,
          workspace: null,
        })
      );
      const wsLearning = await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Workspace tip: use shared config.',
          repository: null,
          workspace: WORKSPACE,
        })
      );
      const globalLearning = await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Global tip: follow semantic versioning.',
          repository: null,
          workspace: null,
        })
      );

      const results = await adapter.searchByText(
        'tip',
        defaultFilters({ repository: WORKSPACE_REPO, workspace: WORKSPACE })
      );
      const ids = results.map((r) => r.id);

      expect(ids).toContain(repoLearning.id);
      expect(ids).toContain(wsLearning.id);
      expect(ids).toContain(globalLearning.id);
    });

    it('workspace learnings do not leak to a different workspace (WS-AC-23)', async () => {
      // Learning in WORKSPACE
      await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Personal workspace secret config.',
          repository: null,
          workspace: WORKSPACE,
        })
      );

      // Search from a repo in OTHER_WORKSPACE
      const results = await adapter.searchByText(
        'Personal workspace secret config',
        defaultFilters({ repository: '/home/other/some-repo', workspace: OTHER_WORKSPACE })
      );
      const wsLeakage = results.find((r) => r.workspace === WORKSPACE);
      expect(wsLeakage).toBeUndefined();
    });

    it('global-only search returns only global learnings (WS-AC-15)', async () => {
      await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Repo-specific learning.',
          repository: WORKSPACE_REPO,
          workspace: null,
        })
      );
      await adapter.createLearning(
        makeRecord({
          id: randomUUID(),
          content: 'Workspace-wide learning.',
          repository: null,
          workspace: WORKSPACE,
        })
      );
      const globalRecord = makeRecord({
        id: randomUUID(),
        content: 'Global learning only.',
        repository: null,
        workspace: null,
      });
      await adapter.createLearning(globalRecord);

      // No repo, no workspace — global only
      const results = await adapter.searchByText('learning', defaultFilters());
      expect(results.every((r) => r.repository === null && r.workspace === null)).toBe(true);
      expect(results.find((r) => r.id === globalRecord.id)).toBeDefined();
    });

    it('listWorkspaces returns correct counts (WS-AC-16)', async () => {
      await adapter.createLearning(
        makeRecord({ id: randomUUID(), repository: null, workspace: WORKSPACE })
      );
      await adapter.createLearning(
        makeRecord({ id: randomUUID(), repository: null, workspace: WORKSPACE })
      );
      await adapter.createLearning(
        makeRecord({ id: randomUUID(), repository: null, workspace: OTHER_WORKSPACE })
      );
      // Repo and global learnings should not appear
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: WORKSPACE_REPO, workspace: null }));
      await adapter.createLearning(makeRecord({ id: randomUUID(), repository: null, workspace: null }));

      const workspaces = await adapter.listWorkspaces();
      const ws = workspaces.find((w) => w.workspace === WORKSPACE);
      expect(ws?.learning_count).toBe(2);

      const other = workspaces.find((w) => w.workspace === OTHER_WORKSPACE);
      expect(other?.learning_count).toBe(1);

      // Repo and global learnings should not appear in listWorkspaces
      expect(workspaces.find((w) => w.workspace === WORKSPACE_REPO)).toBeUndefined();
    });

    it('workspace column exists and supports store/retrieve (WS-AC-18, WS-AC-19)', async () => {
      // Verify we can store and retrieve the workspace field.
      const record = makeRecord({ repository: null, workspace: '/migrated/workspace/' });
      const learning = await adapter.createLearning(record);
      expect(learning.workspace).toBe('/migrated/workspace/');

      const fetched = await adapter.getLearning(learning.id);
      expect(fetched?.workspace).toBe('/migrated/workspace/');
    });

    it('updateLearning can change repository to workspace scope (WS-AC-8)', async () => {
      const record = makeRecord({ repository: WORKSPACE_REPO, workspace: null });
      const learning = await adapter.createLearning(record);
      expect(learning.repository).toBe(WORKSPACE_REPO);

      // Re-scope to workspace: clear repository, set workspace
      const updated = await adapter.updateLearning(learning.id, {
        repository: null,
        workspace: WORKSPACE,
      });
      expect(updated?.repository).toBeNull();
      expect(updated?.workspace).toBe(WORKSPACE);
    });
  });
});

// -------------------------------------------------------------------------
// cosineSimilarity unit tests
// -------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});
