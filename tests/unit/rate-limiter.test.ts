/**
 * Unit tests for the token bucket rate limiter.
 * Traces to ESH-AC-28.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RateLimiter,
  classifyTool,
  WRITE_TOOLS,
  READ_TOOLS,
} from '../../src/security/rate-limiter.js';

describe('classifyTool (ESH-AC-28)', () => {
  it('classifies write tools as write', () => {
    for (const tool of WRITE_TOOLS) {
      expect(classifyTool(tool)).toBe('write');
    }
  });

  it('classifies read tools as read', () => {
    for (const tool of READ_TOOLS) {
      expect(classifyTool(tool)).toBe('read');
    }
  });

  it('classifies unknown tools as read (safe default)', () => {
    expect(classifyTool('unknown_tool')).toBe('read');
    expect(classifyTool('')).toBe('read');
  });

  it('WRITE_TOOLS contains the expected tools', () => {
    expect(WRITE_TOOLS.has('store_learning')).toBe(true);
    expect(WRITE_TOOLS.has('update_learning')).toBe(true);
    expect(WRITE_TOOLS.has('delete_learning')).toBe(true);
    expect(WRITE_TOOLS.has('deprecate_learning')).toBe(true);
    expect(WRITE_TOOLS.has('flag_stale')).toBe(true);
  });

  it('READ_TOOLS contains the expected tools', () => {
    expect(READ_TOOLS.has('search_learnings')).toBe(true);
    expect(READ_TOOLS.has('get_context')).toBe(true);
    expect(READ_TOOLS.has('list_repositories')).toBe(true);
    expect(READ_TOOLS.has('list_workspaces')).toBe(true);
  });
});

describe('RateLimiter.consume (ESH-AC-28)', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    // Small limits for fast testing
    rateLimiter = new RateLimiter(5, 10);
  });

  afterEach(() => {
    vi.useRealTimers();
    rateLimiter.reset();
  });

  it('allows requests within the write limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = rateLimiter.consume('key12345', 'write');
      expect(result.allowed).toBe(true);
    }
  });

  it('allows requests within the read limit', () => {
    for (let i = 0; i < 10; i++) {
      const result = rateLimiter.consume('key12345', 'read');
      expect(result.allowed).toBe(true);
    }
  });

  it('rejects when write limit is exceeded', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('key12345', 'write');
    }
    const result = rateLimiter.consume('key12345', 'write');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('rejects when read limit is exceeded', () => {
    for (let i = 0; i < 10; i++) {
      rateLimiter.consume('key12345', 'read');
    }
    const result = rateLimiter.consume('key12345', 'read');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('isolates buckets between different API key prefixes', () => {
    // Exhaust key A
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('keyAAAA', 'write');
    }
    // key A is now rate-limited
    expect(rateLimiter.consume('keyAAAA', 'write').allowed).toBe(false);
    // key B is unaffected
    expect(rateLimiter.consume('keyBBBB', 'write').allowed).toBe(true);
  });

  it('isolates write and read buckets independently', () => {
    // Exhaust write bucket
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('key12345', 'write');
    }
    // Write is rate-limited
    expect(rateLimiter.consume('key12345', 'write').allowed).toBe(false);
    // Read bucket is unaffected
    expect(rateLimiter.consume('key12345', 'read').allowed).toBe(true);
  });

  it('refills tokens after elapsed time', () => {
    // Exhaust write bucket (5 rpm = 1 token per 12000ms)
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('key12345', 'write');
    }
    expect(rateLimiter.consume('key12345', 'write').allowed).toBe(false);

    // Advance time by 60 seconds — enough for full refill
    vi.advanceTimersByTime(60_000);

    // Should be allowed again
    expect(rateLimiter.consume('key12345', 'write').allowed).toBe(true);
  });

  it('returns retryAfterSeconds as a positive integer', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('key12345', 'write');
    }
    const result = rateLimiter.consume('key12345', 'write');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(Number.isInteger(result.retryAfterSeconds)).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles anonymous key prefix correctly', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('anonymous', 'write');
    }
    const result = rateLimiter.consume('anonymous', 'write');
    expect(result.allowed).toBe(false);
  });

  it('reset() clears all state so requests are allowed again', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.consume('key12345', 'write');
    }
    expect(rateLimiter.consume('key12345', 'write').allowed).toBe(false);

    rateLimiter.reset();

    expect(rateLimiter.consume('key12345', 'write').allowed).toBe(true);
  });
});
