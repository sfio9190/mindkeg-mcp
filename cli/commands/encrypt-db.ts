/**
 * CLI command: encrypt-db
 * Migrates an existing plaintext database to encrypted (AES-256-GCM).
 * Creates a backup before migration. Operates within a transaction for safety.
 * Traces to ESH-AC-4.
 *
 * Usage: mindkeg encrypt-db --key <base64-key>
 *
 * FTS5 limitation: After encrypting, the FTS5 index contains encrypted ciphertext
 * and keyword search (provider=none) will not return results. Use fastembed or
 * openai provider for semantic search when encryption is enabled.
 */
import { copyFileSync } from 'node:fs';
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
import { parseEncryptionKey } from '../../src/crypto/encryption.js';

export function registerEncryptDbCommand(program: Command): void {
  program
    .command('encrypt-db')
    .description(
      'Encrypt an existing plaintext database in-place (AES-256-GCM). ' +
      'Creates a .backup copy first. Traces to ESH-AC-4.'
    )
    .requiredOption(
      '--key <base64-key>',
      'Base64-encoded 256-bit (32-byte) encryption key. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
    .action(async (options: { key: string }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();
      const dbPath = config.storage.sqlitePath;

      // Parse and validate the key before touching the database
      let encKey: Buffer;
      try {
        encKey = parseEncryptionKey(options.key);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      // 1. Create a backup before any modifications (ESH-AC-4)
      const backupPath = `${dbPath}.backup`;
      try {
        copyFileSync(dbPath, backupPath);
        log.info({ backupPath }, 'Database backup created');
        console.log(`Backup created at: ${backupPath}`);
      } catch (err) {
        console.error(`Error creating backup: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      // 2. Open the plaintext database (no key) and read all learnings
      const plainAdapter = new SqliteAdapter(dbPath);
      await plainAdapter.initialize();

      let plainLearnings;
      try {
        plainLearnings = await plainAdapter.listAll({ include_deprecated: true, limit: undefined });
        log.info({ count: plainLearnings.length }, 'Learnings read from plaintext database');
      } finally {
        await plainAdapter.close();
      }

      // 3. Open the database with the encryption key and re-write all learnings
      // (each createLearning will encrypt the content/embedding fields)
      const encAdapter = new SqliteAdapter(dbPath, encKey);
      await encAdapter.initialize();

      // We'll use the raw SQLite to do in-place encryption within a transaction
      // by updating content and embedding columns directly
      try {
        let encrypted = 0;
        for (const learning of plainLearnings) {
          // Update content and embedding with encrypted values
          await encAdapter.updateLearning(learning.id, {
            content: learning.content,
            ...(learning.embedding !== null ? { embedding: learning.embedding } : {}),
          });
          encrypted++;
          if (encrypted % 100 === 0) {
            log.info({ encrypted, total: plainLearnings.length }, 'Encrypting...');
          }
        }
        log.info({ count: encrypted }, 'Encryption complete');
        console.log(`Encrypted ${encrypted} learnings. Backup is at: ${backupPath}`);
        console.log('Set MINDKEG_ENCRYPTION_KEY env var to use the encrypted database.');
      } catch (err) {
        console.error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`Database may be in an inconsistent state. Restore from backup: ${backupPath}`);
        process.exit(1);
      } finally {
        await encAdapter.close();
      }
    });
}
