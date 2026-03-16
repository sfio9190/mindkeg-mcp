/**
 * Unit tests for PurgeService.
 * Uses a mock storage adapter to test purge logic in isolation.
 * Traces to ESH-AC-15, ESH-AC-17, ESH-AC-18, ESH-AC-19.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurgeService } from '../../src/services/purge-service.js';
import type { StorageAdapter, PurgeByFilterOptions } from '../../src/storage/storage-adapter.js';

// Minimal mock for StorageAdapter that only implements purge methods
function makeMockStorage(
  purgeExpiredImpl: (defaultTtlDays: number | null) => number = () => 0,
  purgeByFilterImpl: (_options: PurgeByFilterOptions) => number = () => 0
): Partial<StorageAdapter> & Pick<StorageAdapter, 'purgeExpired' | 'purgeByFilter'> {
  return {
    purgeExpired: vi.fn(purgeExpiredImpl),
    purgeByFilter: vi.fn(purgeByFilterImpl),
  };
}

describe('PurgeService.purgeExpired (ESH-AC-17)', () => {
  it('calls storage.purgeExpired with the provided defaultTtlDays', () => {
    const storage = makeMockStorage(() => 5);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeExpired(30);

    expect(storage.purgeExpired).toHaveBeenCalledWith(30);
    expect(result.count).toBe(5);
  });

  it('passes null defaultTtlDays when no global TTL configured', () => {
    const storage = makeMockStorage(() => 0);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    service.purgeExpired(null);

    expect(storage.purgeExpired).toHaveBeenCalledWith(null);
  });

  it('returns zero count when no learnings are expired', () => {
    const storage = makeMockStorage(() => 0);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeExpired(null);

    expect(result.count).toBe(0);
    expect(result.summary).toContain('No expired');
  });

  it('returns non-zero count and informative summary when learnings are purged', () => {
    const storage = makeMockStorage(() => 3);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeExpired(90);

    expect(result.count).toBe(3);
    expect(result.summary).toContain('3');
  });
});

describe('PurgeService.purgeByFilter (ESH-AC-18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to storage.purgeByFilter with olderThanDays', () => {
    const storage = makeMockStorage(undefined, () => 10);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeByFilter({ olderThanDays: 90 });

    expect(storage.purgeByFilter).toHaveBeenCalledWith({ olderThanDays: 90 });
    expect(result.count).toBe(10);
  });

  it('delegates to storage.purgeByFilter with repository filter', () => {
    const storage = makeMockStorage(undefined, () => 2);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    service.purgeByFilter({ repository: '/home/user/repo' });

    expect(storage.purgeByFilter).toHaveBeenCalledWith({ repository: '/home/user/repo' });
  });

  it('delegates to storage.purgeByFilter with workspace filter', () => {
    const storage = makeMockStorage(undefined, () => 4);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    service.purgeByFilter({ workspace: '/home/user/repos/' });

    expect(storage.purgeByFilter).toHaveBeenCalledWith({ workspace: '/home/user/repos/' });
  });

  it('delegates to storage.purgeByFilter with all: true', () => {
    const storage = makeMockStorage(undefined, () => 100);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeByFilter({ all: true });

    expect(storage.purgeByFilter).toHaveBeenCalledWith({ all: true });
    expect(result.count).toBe(100);
  });

  it('returns zero count and informative summary when nothing matched', () => {
    const storage = makeMockStorage(undefined, () => 0);
    const service = new PurgeService(storage as unknown as StorageAdapter);

    const result = service.purgeByFilter({ repository: '/nonexistent' });

    expect(result.count).toBe(0);
    expect(result.summary).toContain('No learnings matched');
  });
});
