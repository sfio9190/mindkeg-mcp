/**
 * Unit tests for migration 003: TTL, provenance, and integrity columns.
 * Tests model schema validation for the new fields.
 * Traces to ESH-AC-15, ESH-AC-25, ESH-AC-26.
 */
import { describe, it, expect } from 'vitest';
import {
  CreateLearningInputSchema,
  UpdateLearningInputSchema,
} from '../../src/models/learning.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('Migration 003: CreateLearningInputSchema new fields', () => {
  it('accepts ttl_days as a positive integer (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning with TTL.',
      category: 'conventions',
      ttl_days: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl_days).toBe(30);
    }
  });

  it('defaults ttl_days to null when omitted (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning without TTL.',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl_days).toBeNull();
    }
  });

  it('accepts ttl_days of null explicitly (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning with explicit null TTL.',
      category: 'conventions',
      ttl_days: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl_days).toBeNull();
    }
  });

  it('rejects ttl_days of zero (must be positive) (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning.',
      category: 'conventions',
      ttl_days: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative ttl_days (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning.',
      category: 'conventions',
      ttl_days: -5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects fractional ttl_days (must be integer) (ESH-AC-15)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning.',
      category: 'conventions',
      ttl_days: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts source_agent as a string (ESH-AC-25)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning with provenance.',
      category: 'conventions',
      source_agent: 'claude-code-v3',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_agent).toBe('claude-code-v3');
    }
  });

  it('defaults source_agent to null when omitted (ESH-AC-25)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning.',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_agent).toBeNull();
    }
  });

  it('accepts source_agent of null explicitly (ESH-AC-25)', () => {
    const result = CreateLearningInputSchema.safeParse({
      content: 'Learning.',
      category: 'conventions',
      source_agent: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_agent).toBeNull();
    }
  });
});

describe('Migration 003: UpdateLearningInputSchema new fields', () => {
  it('accepts ttl_days update (ESH-AC-15)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      ttl_days: 90,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl_days).toBe(90);
    }
  });

  it('accepts ttl_days null to clear TTL (ESH-AC-15)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      ttl_days: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl_days).toBeNull();
    }
  });

  it('rejects negative ttl_days on update (ESH-AC-15)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      ttl_days: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts source_agent update (ESH-AC-25)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      source_agent: 'cursor-agent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_agent).toBe('cursor-agent');
    }
  });

  it('accepts source_agent null to clear provenance (ESH-AC-25)', () => {
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      source_agent: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_agent).toBeNull();
    }
  });
});
