/**
 * Configuration loading for Mind Keg MCP.
 * Priority order: environment variables > ~/.mindkeg/config.toml > defaults
 * TOML config file parsing is deferred to avoid adding a TOML dependency; env vars cover all config needs.
 */
import { z } from 'zod';
import { homedir } from 'os';
import { join } from 'path';

const ConfigSchema = z.object({
  storage: z.object({
    backend: z.literal('sqlite').default('sqlite'),
    sqlitePath: z.string().default(join(homedir(), '.mindkeg', 'brain.db')),
  }),
  embedding: z.object({
    provider: z.enum(['fastembed', 'openai', 'none']).default('fastembed'),
    openaiKey: z.string().optional(),
  }),
  server: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(52100),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  auth: z.object({
    /** API key passed via env var for stdio transport */
    apiKey: z.string().optional(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Load configuration from environment variables with defaults. */
export function loadConfig(): Config {
  const raw = {
    storage: {
      backend: process.env['MINDKEG_STORAGE'] ?? 'sqlite',
      sqlitePath:
        process.env['MINDKEG_SQLITE_PATH'] ??
        join(homedir(), '.mindkeg', 'brain.db'),
    },
    embedding: {
      provider: process.env['MINDKEG_EMBEDDING_PROVIDER'] ?? 'fastembed',
      openaiKey: process.env['OPENAI_API_KEY'],
    },
    server: {
      host: process.env['MINDKEG_HOST'] ?? '127.0.0.1',
      port: process.env['MINDKEG_PORT']
        ? parseInt(process.env['MINDKEG_PORT'], 10)
        : 52100,
      logLevel: process.env['MINDKEG_LOG_LEVEL'] ?? 'info',
    },
    auth: {
      apiKey: process.env['MINDKEG_API_KEY'],
    },
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
    );
  }
  return result.data;
}
