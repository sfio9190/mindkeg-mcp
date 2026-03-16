/**
 * CLI command: backfill-integrity
 * Computes and stores SHA-256 integrity hashes for all existing learnings
 * that currently have integrity_hash = NULL.
 * Traces to ESH-AC-26.
 *
 * Usage: mindkeg backfill-integrity [--dry-run]
 */
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';
import { computeIntegrityHash } from '../../src/security/integrity.js';

export function registerBackfillIntegrityCommand(program: Command): void {
  program
    .command('backfill-integrity')
    .description(
      'Compute and store SHA-256 integrity hashes for all learnings with integrity_hash = NULL. ' +
      'Traces to ESH-AC-26.'
    )
    .option('--dry-run', 'Show how many learnings would be updated without modifying any data')
    .action(async (options: { dryRun?: boolean }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();

      const storage = createStorageAdapter(config);
      await storage.initialize();

      try {
        // Fetch all learnings including deprecated (integrity applies to all)
        const all = await storage.listAll({ include_deprecated: true, limit: undefined });
        const needsHash = all.filter((l) => l.integrity_hash === null || l.integrity_hash === undefined);

        if (options.dryRun) {
          console.log(
            `Dry run: ${needsHash.length} of ${all.length} learnings would receive an integrity hash.`
          );
          return;
        }

        let updated = 0;
        for (const learning of needsHash) {
          const hash = computeIntegrityHash({
            content: learning.content,
            category: learning.category,
            tags: learning.tags,
            repository: learning.repository,
            workspace: learning.workspace,
          });

          await storage.updateLearning(learning.id, { integrity_hash: hash });
          updated++;

          if (updated % 100 === 0) {
            log.info({ updated, total: needsHash.length }, 'Backfilling integrity hashes...');
          }
        }

        const msg = `Backfill complete: ${updated} of ${all.length} learnings updated with integrity hashes.`;
        log.info({ updated, total: all.length }, 'backfill-integrity complete (ESH-AC-26)');
        console.log(msg);
      } finally {
        await storage.close();
      }
    });
}
