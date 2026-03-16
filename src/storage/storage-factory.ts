/**
 * Storage factory: returns the appropriate StorageAdapter based on configuration.
 * Traces to AC-26 (storage backend is selected via configuration).
 */
import { getLogger } from '../utils/logger.js';
import type { Config } from '../config.js';
import type { StorageAdapter } from './storage-adapter.js';
import { SqliteAdapter } from './sqlite-adapter.js';
import { parseEncryptionKey } from '../crypto/encryption.js';

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

  // Parse encryption key if configured (ESH-AC-1)
  let encryptionKey: Buffer | null = null;
  if (config.security.encryptionKey) {
    const log = getLogger();
    try {
      encryptionKey = parseEncryptionKey(config.security.encryptionKey);
      log.info('Encryption at rest enabled (AES-256-GCM). Content and embedding fields will be encrypted.');
    } catch (err) {
      // Key misconfiguration is fatal — refuse to start with a bad key rather
      // than silently storing plaintext when the user expects encryption.
      throw new Error(
        `Invalid MINDKEG_ENCRYPTION_KEY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return new SqliteAdapter(config.storage.sqlitePath, encryptionKey);
}
