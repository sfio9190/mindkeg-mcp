/**
 * Unit tests for integrity hash computation and verification (ESH-AC-26, ESH-AC-27).
 */
import { describe, it, expect } from 'vitest';
import { computeIntegrityHash, verifyIntegrityHash } from '../../src/security/integrity.js';
import type { IntegrityHashInput } from '../../src/security/integrity.js';

function makeLearningInput(overrides: Partial<IntegrityHashInput> = {}): IntegrityHashInput {
  return {
    content: 'Use async/await for all I/O.',
    category: 'conventions',
    tags: ['async', 'node'],
    repository: '/home/user/project',
    workspace: null,
    ...overrides,
  };
}

describe('computeIntegrityHash (ESH-AC-26)', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = computeIntegrityHash(makeLearningInput());
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same hash for the same input (deterministic)', () => {
    const input = makeLearningInput();
    expect(computeIntegrityHash(input)).toBe(computeIntegrityHash(input));
  });

  it('returns different hashes for different content', () => {
    const a = computeIntegrityHash(makeLearningInput({ content: 'Content A' }));
    const b = computeIntegrityHash(makeLearningInput({ content: 'Content B' }));
    expect(a).not.toBe(b);
  });

  it('returns different hashes for different categories', () => {
    const a = computeIntegrityHash(makeLearningInput({ category: 'conventions' }));
    const b = computeIntegrityHash(makeLearningInput({ category: 'architecture' }));
    expect(a).not.toBe(b);
  });

  it('returns different hashes for different tags', () => {
    const a = computeIntegrityHash(makeLearningInput({ tags: ['alpha'] }));
    const b = computeIntegrityHash(makeLearningInput({ tags: ['beta'] }));
    expect(a).not.toBe(b);
  });

  it('tag order does not affect hash (tags are sorted before hashing)', () => {
    const a = computeIntegrityHash(makeLearningInput({ tags: ['alpha', 'beta', 'gamma'] }));
    const b = computeIntegrityHash(makeLearningInput({ tags: ['gamma', 'alpha', 'beta'] }));
    expect(a).toBe(b);
  });

  it('returns different hashes for different repositories', () => {
    const a = computeIntegrityHash(makeLearningInput({ repository: '/repo/a' }));
    const b = computeIntegrityHash(makeLearningInput({ repository: '/repo/b' }));
    expect(a).not.toBe(b);
  });

  it('null repository and null workspace produce a valid hash', () => {
    const hash = computeIntegrityHash(makeLearningInput({ repository: null, workspace: null }));
    expect(hash).toHaveLength(64);
  });

  it('null repository differs from a set repository', () => {
    const a = computeIntegrityHash(makeLearningInput({ repository: null }));
    const b = computeIntegrityHash(makeLearningInput({ repository: '/repo/test' }));
    expect(a).not.toBe(b);
  });

  it('empty tags array produces a valid hash', () => {
    const hash = computeIntegrityHash(makeLearningInput({ tags: [] }));
    expect(hash).toHaveLength(64);
  });
});

describe('verifyIntegrityHash (ESH-AC-27)', () => {
  it('returns true when hash matches', () => {
    const input = makeLearningInput();
    const hash = computeIntegrityHash(input);
    const result = verifyIntegrityHash({ ...input, integrity_hash: hash });
    expect(result).toBe(true);
  });

  it('returns false when content is tampered', () => {
    const input = makeLearningInput();
    const hash = computeIntegrityHash(input);
    const tampered = { ...input, content: 'TAMPERED content', integrity_hash: hash };
    expect(verifyIntegrityHash(tampered)).toBe(false);
  });

  it('returns false when category is tampered', () => {
    const input = makeLearningInput();
    const hash = computeIntegrityHash(input);
    const tampered = { ...input, category: 'architecture', integrity_hash: hash };
    expect(verifyIntegrityHash(tampered)).toBe(false);
  });

  it('returns false when tags are tampered', () => {
    const input = makeLearningInput();
    const hash = computeIntegrityHash(input);
    const tampered = { ...input, tags: ['hacked'], integrity_hash: hash };
    expect(verifyIntegrityHash(tampered)).toBe(false);
  });

  it('returns null when integrity_hash is null (legacy learning)', () => {
    const input = makeLearningInput();
    const result = verifyIntegrityHash({ ...input, integrity_hash: null });
    expect(result).toBeNull();
  });

  it('returns false for a wrong hash string', () => {
    const input = makeLearningInput();
    const wrongHash = 'a'.repeat(64);
    const result = verifyIntegrityHash({ ...input, integrity_hash: wrongHash });
    // Very unlikely to collide with actual SHA-256
    expect(result).toBe(false);
  });
});
