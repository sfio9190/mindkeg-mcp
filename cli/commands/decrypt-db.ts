/**
 * CLI command: decrypt-db
 * Migrates an encrypted database back to plaintext.
 * Creates a backup before migration. Operates safely — if any step fails,
 * the backup can be used for recovery.
 * Traces to ESH-AC-4.
 *
 * Usage: mindkeg decrypt-db --key <base64-key>
 */
import { copyFileSync } from 'node:fs';
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { SqliteAdapter } from '../../src/storage/sqlite-adapter.js';
import { parseEncryptionKey } from '../../src/crypto/encryption.js';

export function registerDecryptDbCommand(program: Command): void {
  program
    .command('decrypt-db')
    .description(
      'Decrypt an encrypted database back to plaintext. ' +
      'Creates a .backup copy first. Traces to ESH-AC-4.'
    )
    .requiredOption(
      '--key <base64-key>',
      'Base64-encoded 256-bit (32-byte) encryption key used to encrypt the database.'
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

      // 2. Open the encrypted database (with key) and read all learnings (decrypted)
      const encAdapter = new SqliteAdapter(dbPath, encKey);
      await encAdapter.initialize();

      let encLearnings;
      try {
        encLearnings = await encAdapter.listAll({ include_deprecated: true, limit: undefined });
        log.info({ count: encLearnings.length }, 'Learnings read from encrypted database');
      } catch (err) {
        await encAdapter.close();
        console.error(`Failed to read encrypted database: ${err instanceof Error ? err.message : String(err)}`);
        console.error('Ensure the key is correct. Backup is at: ' + backupPath);
        process.exit(1);
      } finally {
        await encAdapter.close();
      }

      // 3. Re-open without encryption key and write all learnings as plaintext
      const plainAdapter = new SqliteAdapter(dbPath); // No encryption key
      await plainAdapter.initialize();

      try {
        let decrypted = 0;
        for (const learning of encLearnings) {
          // Update content and embedding — since adapter has no key, values stored as plaintext
          await plainAdapter.updateLearning(learning.id, {
            content: learning.content,
            ...(learning.embedding !== null ? { embedding: learning.embedding } : {}),
          });
          decrypted++;
          if (decrypted % 100 === 0) {
            log.info({ decrypted, total: encLearnings.length }, 'Decrypting...');
          }
        }
        log.info({ count: decrypted }, 'Decryption complete');
        console.log(`Decrypted ${decrypted} learnings. Backup is at: ${backupPath}`);
        console.log('Unset or remove MINDKEG_ENCRYPTION_KEY to use the plaintext database.');
      } catch (err) {
        console.error(`Decryption failed: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`Restore from backup: ${backupPath}`);
        process.exit(1);
      } finally {
        await plainAdapter.close();
      }
    });
}
