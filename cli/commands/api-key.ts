/**
 * CLI command: api-key
 * Manage API keys: create, list, revoke.
 * Traces to AC-20.
 */
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
} from '../../src/auth/api-key.js';
import { randomUUID } from 'node:crypto';

export function registerApiKeyCommand(program: Command): void {
  const apiKeyCmd = program
    .command('api-key')
    .description('Manage API keys for Mind Keg');

  // --- create ---
  apiKeyCmd
    .command('create')
    .description('Generate a new API key')
    .requiredOption('--name <name>', 'Human-readable name for this key (e.g., "My Laptop")')
    .option(
      '--repositories <repos...>',
      'Restrict this key to specific repo paths (space-separated). Omit to allow all repos.'
    )
    .action(async (opts: { name: string; repositories?: string[] }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);

      const storage = createStorageAdapter(config);
      await storage.initialize();

      const key = generateApiKey();
      const keyHash = hashApiKey(key);
      const keyPrefix = extractKeyPrefix(key);
      const id = randomUUID();

      await storage.createApiKey({
        id,
        name: opts.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        repositories: opts.repositories ?? [],
      });

      await storage.close();

      // Display the full key ONCE — it is never retrievable again (AC-20)
      console.log('');
      console.log('API key created successfully!');
      console.log('');
      console.log(`  Key:    ${key}`);
      console.log(`  Prefix: ${keyPrefix}`);
      console.log(`  Name:   ${opts.name}`);
      if (opts.repositories && opts.repositories.length > 0) {
        console.log(`  Access: ${opts.repositories.join(', ')}`);
      } else {
        console.log('  Access: All repositories');
      }
      console.log('');
      console.log('IMPORTANT: This key will not be shown again. Store it securely.');
      console.log('');
      console.log('To use with Claude Code (stdio mode), add to your MCP config:');
      console.log('  "env": { "MINDKEG_API_KEY": "' + key + '" }');
      console.log('');
    });

  // --- list ---
  apiKeyCmd
    .command('list')
    .description('List all API keys (without revealing the keys themselves)')
    .action(async () => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);

      const storage = createStorageAdapter(config);
      await storage.initialize();

      const keys = await storage.listApiKeys();
      await storage.close();

      if (keys.length === 0) {
        console.log('No API keys found. Create one with: mindkeg api-key create --name "My Key"');
        return;
      }

      console.log('');
      console.log(`Found ${keys.length} API key(s):\n`);
      console.log(
        ['PREFIX'.padEnd(10), 'NAME'.padEnd(20), 'CREATED'.padEnd(25), 'LAST USED'.padEnd(25), 'STATUS'].join(' | ')
      );
      console.log('-'.repeat(100));

      for (const key of keys) {
        const status = key.revoked ? 'REVOKED' : 'active';
        const lastUsed = key.last_used_at ?? 'never';
        console.log(
          [
            key.key_prefix.padEnd(10),
            key.name.slice(0, 19).padEnd(20),
            key.created_at.slice(0, 19).padEnd(25),
            String(lastUsed).slice(0, 19).padEnd(25),
            status,
          ].join(' | ')
        );
      }
      console.log('');
    });

  // --- revoke ---
  apiKeyCmd
    .command('revoke')
    .description('Revoke an API key by its prefix')
    .argument('<prefix>', 'Key prefix (from api-key list)')
    .action(async (prefix: string) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);

      const log = getLogger();
      const storage = createStorageAdapter(config);
      await storage.initialize();

      const revoked = await storage.revokeApiKey(prefix);
      await storage.close();

      if (revoked) {
        console.log(`API key with prefix "${prefix}" has been revoked.`);
      } else {
        console.log(`No active API key found with prefix "${prefix}".`);
        log.warn({ prefix }, 'Revoke attempt: key not found or already revoked');
        process.exit(1);
      }
    });
}
