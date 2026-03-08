/**
 * Structured logger using pino.
 * In stdio transport mode, log output goes to stderr to avoid polluting the MCP protocol stream on stdout.
 */
import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let _logger: pino.Logger | null = null;

export function createLogger(level: LogLevel = 'info', pretty = false): pino.Logger {
  const transport = pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {};

  return pino({
    level,
    // Always write to stderr so stdout is free for MCP stdio protocol
    ...transport,
  }, pino.destination({ dest: 2 })); // fd 2 = stderr
}

/** Initialize the module-level logger. Call once at startup. */
export function initLogger(level: LogLevel = 'info', pretty = false): void {
  _logger = createLogger(level, pretty);
}

/** Get the module-level logger. Throws if not initialized. */
export function getLogger(): pino.Logger {
  if (!_logger) {
    // Fallback: create a default logger so the server doesn't crash if initLogger was skipped.
    _logger = createLogger('info', false);
  }
  return _logger;
}

export type Logger = pino.Logger;
