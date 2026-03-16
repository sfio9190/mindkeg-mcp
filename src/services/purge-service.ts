/**
 * PurgeService: orchestrates TTL-based and filter-based learning purge operations.
 * Used by both the server startup/periodic purge (ESH-AC-17) and the CLI purge command (ESH-AC-18).
 * Purge operations are logged to the audit log (ESH-AC-19).
 *
 * All underlying storage methods are synchronous (node:sqlite DatabaseSync pattern).
 */
import type { StorageAdapter, PurgeByFilterOptions } from '../storage/storage-adapter.js';
import { getLogger } from '../utils/logger.js';

export interface PurgeResult {
  /** Number of learnings purged. */
  count: number;
  /** Human-readable summary of the operation. */
  summary: string;
}

export class PurgeService {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  /**
   * Purge all learnings that have exceeded their TTL (per-learning or global default).
   * Called at server startup and periodically (ESH-AC-17).
   *
   * @param defaultTtlDays - Global default TTL from config. Null means no global TTL.
   * @returns PurgeResult with count of deleted learnings.
   */
  purgeExpired(defaultTtlDays: number | null): PurgeResult {
    const log = getLogger();
    const count = this.storage.purgeExpired(defaultTtlDays);
    if (count > 0) {
      log.info(
        { count, defaultTtlDays, operation: 'purge_expired' },
        `Purged ${count} expired learning(s)`
      );
    }
    return {
      count,
      summary: count === 0
        ? 'No expired learnings found.'
        : `Purged ${count} expired learning(s).`,
    };
  }

  /**
   * Purge learnings matching filter criteria.
   * Used by the `mindkeg purge` CLI command (ESH-AC-18).
   *
   * @param options - Filter criteria. At least one field must be set (validated by caller).
   * @returns PurgeResult with count of deleted learnings.
   */
  purgeByFilter(options: PurgeByFilterOptions): PurgeResult {
    const log = getLogger();
    const count = this.storage.purgeByFilter(options);
    log.info(
      { count, options, operation: 'purge_by_filter' },
      `Purged ${count} learning(s) by filter`
    );
    return {
      count,
      summary: count === 0
        ? 'No learnings matched the purge filter.'
        : `Purged ${count} learning(s).`,
    };
  }
}
