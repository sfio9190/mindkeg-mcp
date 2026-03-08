/**
 * Storage factory: returns the appropriate StorageAdapter based on configuration.
 * Traces to AC-26 (storage backend is selected via configuration).
 */
import type { Config } from '../config.js';
import type { StorageAdapter } from './storage-adapter.js';
import { SqliteAdapter } from './sqlite-adapter.js';

/**
 * Create and return the configured storage adapter.
 * Does NOT call initialize() — the caller must do that.
 */
export function createStorageAdapter(config: Config): StorageAdapter {
  if (config.storage.backend !== 'sqlite') {
    throw new Error(
      `Unknown storage backend: ${config.storage.backend}. Only "sqlite" is currently supported.`
    );
  }
  return new SqliteAdapter(config.storage.sqlitePath);
}
