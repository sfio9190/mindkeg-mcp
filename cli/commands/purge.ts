/**
 * CLI command: purge
 * Manually purge learnings by age, repository, workspace, or all data.
 * Traces to ESH-AC-18, ESH-AC-19.
 */
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';
import { PurgeService } from '../../src/services/purge-service.js';

export function registerPurgeCommand(program: Command): void {
  program
    .command('purge')
    .description('Purge learnings by age, repository, workspace, or all data (ESH-AC-18)')
    .option(
      '--older-than <days>',
      'Purge learnings not updated in more than this many days (e.g., 90)'
    )
    .option(
      '--repository <path>',
      'Purge all learnings for the specified repository path'
    )
    .option(
      '--workspace <path>',
      'Purge all learnings for the specified workspace path'
    )
    .option(
      '--all',
      'Purge ALL learnings from the database. Requires --confirm flag.'
    )
    .option(
      '--confirm',
      'Required when using --all to confirm destructive operation'
    )
    .option(
      '--dry-run',
      'Show what would be purged without actually deleting'
    )
    .action(async (options: {
      olderThan?: string;
      repository?: string;
      workspace?: string;
      all?: boolean;
      confirm?: boolean;
      dryRun?: boolean;
    }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();

      // Validate: at least one filter must be set
      const hasFilter = options.olderThan || options.repository || options.workspace || options.all;
      if (!hasFilter) {
        console.error('Error: At least one filter is required. Use --older-than, --repository, --workspace, or --all.');
        process.exit(1);
      }

      // Validate --all requires --confirm
      if (options.all && !options.confirm) {
        console.error('Error: --all requires --confirm to prevent accidental data loss. Re-run with --all --confirm.');
        process.exit(1);
      }

      const storage = createStorageAdapter(config);
      await storage.initialize();

      const purgeService = new PurgeService(storage);

      try {
        if (options.dryRun) {
          console.log('Dry run mode: no data will be deleted.');
          // In dry-run mode, just describe what would happen
          const parts: string[] = [];
          if (options.all) parts.push('ALL learnings');
          if (options.olderThan) parts.push(`learnings not updated in > ${options.olderThan} days`);
          if (options.repository) parts.push(`learnings in repository: ${options.repository}`);
          if (options.workspace) parts.push(`learnings in workspace: ${options.workspace}`);
          console.log(`Would purge: ${parts.join('; ')}`);
          await storage.close();
          return;
        }

        const purgeOptions = {
          ...(options.all ? { all: true } : {}),
          ...(options.olderThan ? { olderThanDays: parseInt(options.olderThan, 10) } : {}),
          ...(options.repository ? { repository: options.repository } : {}),
          ...(options.workspace ? { workspace: options.workspace } : {}),
        };

        const result = purgeService.purgeByFilter(purgeOptions);

        log.info({ count: result.count, options: purgeOptions }, 'Purge completed (ESH-AC-19)');
        console.log(result.summary);
      } finally {
        await storage.close();
      }
    });
}
