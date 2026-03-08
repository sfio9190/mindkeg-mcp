/**
 * CLI command: export
 * Export all learnings as a JSON file for backup or migration.
 */
import type { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export all learnings to a JSON file')
    .option('--output <path>', 'Output file path', 'mindkeg-export.json')
    .option('--include-deprecated', 'Include deprecated learnings in the export', false)
    .action(async (opts: { output: string; includeDeprecated: boolean }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();

      const storage = createStorageAdapter(config);
      await storage.initialize();

      // Use listAll() instead of searchByText('') — an empty FTS5 MATCH is
      // invalid and would silently return zero results (F-03).
      const results = await storage.listAll({
        include_deprecated: opts.includeDeprecated,
      });

      await storage.close();

      const exportData = {
        exported_at: new Date().toISOString(),
        version: '0.1.0',
        count: results.length,
        learnings: results.map((r) => ({
          id: r.id,
          content: r.content,
          category: r.category,
          tags: r.tags,
          repository: r.repository,
          group_id: r.group_id,
          source: r.source,
          status: r.status,
          stale_flag: r.stale_flag,
          created_at: r.created_at,
          updated_at: r.updated_at,
          // Exclude embedding — embeddings can be regenerated on import
        })),
      };

      writeFileSync(opts.output, JSON.stringify(exportData, null, 2), 'utf-8');

      log.info({ path: opts.output, count: results.length }, 'Export complete');
      console.log(`Exported ${results.length} learning(s) to ${opts.output}`);
    });
}
