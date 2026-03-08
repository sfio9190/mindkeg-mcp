/**
 * CLI command: migrate
 * Run pending database migrations manually.
 * Traces to AC-24, AC-25.
 */
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate')
    .description('Run pending database migrations')
    .action(async () => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();

      const storage = createStorageAdapter(config);

      log.info({ backend: config.storage.backend }, 'Running migrations...');
      await storage.initialize(); // initialize() always runs pending migrations
      await storage.close();

      log.info('Migrations complete.');
      console.log('Migrations applied successfully.');
    });
}
