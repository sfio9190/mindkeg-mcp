/**
 * Unit tests for Learning model validation schemas.
 * Traces to AC-6 (content max 500 chars) and AC-13 (6 categories).
 */
import { describe, it, expect } from 'vitest';
import {
  CreateLearningInputSchema,
  UpdateLearningInputSchema,
  DeprecateLearningInputSchema,
  DeleteLearningInputSchema,
  SearchLearningsInputSchema,
  FlagStaleLearningInputSchema,
  LEARNING_CATEGORIES,
} from '../../src/models/learning.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('CreateLearningInputSchema', () => {
  it('parses a minimal valid input', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Use async/await instead of callbacks.',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.repository).toBeNull();
      expect(result.data.group_id).toBeNull();
      expect(result.data.source).toBe('agent');
    }
  });

  it('parses a full valid input', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Always use transactions for multi-step DB operations.',
      category: 'architecture',
      tags: ['database', 'transactions'],
      repository: '/home/user/my-project',
      group_id: VALID_UUID,
      source: 'claude-code',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content (AC-6)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: '',
      category: 'debugging',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 500 characters (AC-6)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'a'.repeat(501),
      category: 'debugging',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('500');
    }
  });

  it('accepts content of exactly 500 characters (AC-6 boundary)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'a'.repeat(500),
      category: 'gotchas',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid category (AC-13)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Valid content.',
      category: 'invalid-category',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all six valid categories (AC-13)', () => {
    for (const category of LEARNING_CATEGORIES) {
      const result = CreateLearningInputSchema.safeParse({
        content: 'Some learning.',
        category,
      });
      expect(result.success, `Category "${category}" should be valid`).toBe(true);
    }
  });

  it('rejects an invalid group_id (not a UUID)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Some learning.',
      category: 'decisions',
      group_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a null group_id (AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Some learning.',
      category: 'decisions',
      group_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid group_id UUID (AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Some learning.',
      category: 'decisions',
      group_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple tags (AC-14)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Some learning.',
      category: 'dependencies',
      tags: ['node', 'npm', 'package-manager'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toHaveLength(3);
    }
  });

  // -------------------------------------------------------------------------
  // Workspace scoping (WS-AC-8, WS-AC-9, WS-AC-10, WS-AC-24)
  // -------------------------------------------------------------------------

  it('accepts a workspace-only input (WS-AC-6, WS-AC-9)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Workspace-wide convention.',
      category: 'conventions',
      workspace: '/home/dev/repos/personal/',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspace).toBe('/home/dev/repos/personal/');
      expect(result.data.repository).toBeNull();
    }
  });

  it('accepts a repo-only input with workspace null (WS-AC-5)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Repo-specific learning.',
      category: 'conventions',
      repository: '/home/dev/repos/personal/my-app',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository).toBe('/home/dev/repos/personal/my-app');
      expect(result.data.workspace).toBeNull();
    }
  });

  it('accepts global input with both null (WS-AC-7)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Global learning.',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository).toBeNull();
      expect(result.data.workspace).toBeNull();
    }
  });

  it('rejects input with both repository and workspace set (WS-AC-8, WS-AC-10, WS-AC-24)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Invalid: both scopes.',
      category: 'conventions',
      repository: '/home/dev/repos/personal/my-app',
      workspace: '/home/dev/repos/personal/',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Cannot set both repository and workspace');
    }
  });

  it('defaults workspace to null when omitted', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Some learning.',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspace).toBeNull();
    }
  });
});

describe('UpdateLearningInputSchema', () => {
  it('requires a valid UUID id', () => {
    const result = UpdateLearningInputSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('parses with only id (all other fields optional)', () => {
    const result = UpdateLearningInputSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('validates content max length on update', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      content: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('validates category on update', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      category: 'bad-category',
    });
    expect(result.success).toBe(false);
  });

  it('accepts workspace-only update (WS-AC-8)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      workspace: '/home/dev/repos/personal/',
    });
    expect(result.success).toBe(true);
  });

  it('accepts repository-only update (WS-AC-8)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      repository: '/home/dev/repos/personal/my-app',
    });
    expect(result.success).toBe(true);
  });

  it('rejects update with both repository and workspace set (WS-AC-8)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      repository: '/home/dev/repos/personal/my-app',
      workspace: '/home/dev/repos/personal/',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Cannot set both repository and workspace');
    }
  });

  it('accepts null workspace to clear scope (WS-AC-8)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      workspace: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('DeprecateLearningInputSchema', () => {
  it('requires a valid UUID id', () => {
    const result = DeprecateLearningInputSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('parses with id only (reason is optional)', () => {
    const result = DeprecateLearningInputSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('parses with id and reason', () => {
    const result = DeprecateLearningInputSchema.safeParse({
      id: VALID_UUID,
      reason: 'Outdated — use the new approach documented in AC-99.',
    });
    expect(result.success).toBe(true);
  });
});

describe('DeleteLearningInputSchema', () => {
  it('requires a valid UUID id', () => {
    const result = DeleteLearningInputSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('parses with a valid UUID', () => {
    const result = DeleteLearningInputSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });
});

describe('SearchLearningsInputSchema', () => {
  it('parses a minimal valid search', () => {
    const result = SearchLearningsInputSchema.safeParse({ query: 'database transactions' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.include_deprecated).toBe(false);
    }
  });

  it('rejects empty query', () => {
    const result = SearchLearningsInputSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('enforces limit max of 50 (AC-11)', () => {
    const result = SearchLearningsInputSchema.safeParse({ query: 'test', limit: 51 });
    expect(result.success).toBe(false);
  });

  it('accepts limit of exactly 50 (AC-11 boundary)', () => {
    const result = SearchLearningsInputSchema.safeParse({ query: 'test', limit: 50 });
    expect(result.success).toBe(true);
  });

  it('accepts include_deprecated flag (AC-29)', () => {
    const result = SearchLearningsInputSchema.safeParse({
      query: 'test',
      include_deprecated: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_deprecated).toBe(true);
    }
  });

  it('accepts all filter combinations (AC-10)', () => {
    const result = SearchLearningsInputSchema.safeParse({
      query: 'find something',
      repository: '/home/user/repo',
      category: 'debugging',
      tags: ['bug', 'fix'],
      limit: 20,
    });
    expect(result.success).toBe(true);
  });
});

describe('FlagStaleLearningInputSchema', () => {
  it('requires a valid UUID id', () => {
    const result = FlagStaleLearningInputSchema.safeParse({ id: 'not-valid' });
    expect(result.success).toBe(false);
  });

  it('parses with a valid UUID', () => {
    const result = FlagStaleLearningInputSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });
});
