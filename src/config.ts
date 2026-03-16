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
  audit: z.object({
    /**
     * Audit log destination. (ESH-AC-7)
     * - File path (e.g., "/home/user/.mindkeg/audit.jsonl"): append-only JSON lines
     * - "stderr": writes audit entries to stderr alongside app logs
     * - "none": disables audit logging (default for backward compat)
     */
    destination: z.string().default(join(homedir(), '.mindkeg', 'audit.jsonl')),
  }),
  security: z.object({
    /**
     * Base64-encoded 256-bit encryption key. When set, content and embedding
     * fields are encrypted with AES-256-GCM before writing to SQLite. (ESH-AC-1)
     */
    encryptionKey: z.string().optional(),
    /**
     * Write bucket rate limit (req/min per API key) for HTTP transport. (ESH-AC-28)
     * Applies to: store_learning, update_learning, delete_learning, deprecate_learning, flag_stale
     */
    rateLimitWriteRpm: z.number().int().positive().default(100),
    /**
     * Read bucket rate limit (req/min per API key) for HTTP transport. (ESH-AC-28)
     * Applies to: search_learnings, get_context, list_repositories, list_workspaces
     */
    rateLimitReadRpm: z.number().int().positive().default(300),
    /**
     * Whether to require API key auth on /health and /metrics endpoints. (ESH-AC-23)
     * Default false: health/metrics are publicly accessible.
     */
    metricsAuth: z.boolean().default(false),
  }),
  retention: z.object({
    /**
     * Global default TTL in days. Null = no expiration.
     * Per-learning ttl_days overrides this value. (ESH-AC-16)
     */
    defaultTtlDays: z.number().int().positive().nullable().default(null),
    /**
     * How often (in hours) to run the periodic purge of expired learnings. (ESH-AC-17)
     * Default: 24 hours.
     */
    purgeIntervalHours: z.number().int().positive().default(24),
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
    audit: {
      destination: process.env['MINDKEG_AUDIT_LOG'] ?? join(homedir(), '.mindkeg', 'audit.jsonl'),
    },
    security: {
      encryptionKey: process.env['MINDKEG_ENCRYPTION_KEY'],
      rateLimitWriteRpm: process.env['MINDKEG_RATE_LIMIT_WRITE_RPM']
        ? parseInt(process.env['MINDKEG_RATE_LIMIT_WRITE_RPM'], 10)
        : 100,
      rateLimitReadRpm: process.env['MINDKEG_RATE_LIMIT_READ_RPM']
        ? parseInt(process.env['MINDKEG_RATE_LIMIT_READ_RPM'], 10)
        : 300,
      metricsAuth: process.env['MINDKEG_METRICS_AUTH'] === 'true',
    },
    retention: {
      defaultTtlDays: process.env['MINDKEG_DEFAULT_TTL_DAYS']
        ? parseInt(process.env['MINDKEG_DEFAULT_TTL_DAYS'], 10)
        : null,
      purgeIntervalHours: process.env['MINDKEG_PURGE_INTERVAL_HOURS']
        ? parseInt(process.env['MINDKEG_PURGE_INTERVAL_HOURS'], 10)
        : 24,
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
