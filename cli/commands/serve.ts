/**
 * CLI command: serve
 * Start the MCP server in stdio or HTTP mode.
 * Traces to AC-17 (stdio), AC-18 (HTTP).
 */
import type { Command } from 'commander';
import { loadConfig } from '../../src/config.js';
import { initLogger, getLogger } from '../../src/utils/logger.js';
import { createStorageAdapter } from '../../src/storage/storage-factory.js';
import { createEmbeddingService } from '../../src/services/embedding-service.js';
import { startStdio, startHttp } from '../../src/index.js';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the Mind Keg MCP server')
    .option('--stdio', 'Use stdio transport (for local agent connections)', false)
    .option('--http', 'Use HTTP+SSE transport (for remote connections)', false)
    .action(async (opts: { stdio: boolean; http: boolean }) => {
      const config = loadConfig();
      initLogger(config.server.logLevel, process.stderr.isTTY);
      const log = getLogger();

      const storage = createStorageAdapter(config);
      await storage.initialize();

      const embedding = createEmbeddingService(config);

      const mode = opts.stdio ? 'stdio' : 'http';
      log.info({ mode, storage: config.storage.backend }, 'Starting Mind Keg MCP server');

      if (mode === 'stdio') {
        await startStdio(config, storage, embedding);
      } else {
        await startHttp(config, storage, embedding);
      }
    });
}
