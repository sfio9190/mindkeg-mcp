/**
 * Health check handler for the /health endpoint.
 * Returns JSON with status, version, uptime, and database connectivity.
 * Traces to ESH-AC-20.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StorageAdapter } from '../storage/storage-adapter.js';

/** The server version — kept in sync with server.ts and package.json. */
const SERVER_VERSION = '0.3.0';

/** Timestamp when the server process started. */
const serverStartTime = Date.now();

/** Health check response structure (ESH-AC-20). */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  /** Server uptime in seconds. */
  uptime: number;
  /** Database connectivity status. */
  database: 'connected' | 'error';
}

/**
 * Handle a GET /health request.
 * Checks database connectivity and returns a JSON health response.
 * Does not require API key authentication by default (ESH-AC-23).
 */
export async function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse,
  storage: StorageAdapter
): Promise<void> {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  let database: HealthResponse['database'] = 'connected';

  // Lightweight DB connectivity check — try to get stats
  try {
    await storage.getStats();
  } catch {
    database = 'error';
  }

  const status: HealthResponse['status'] = database === 'error' ? 'degraded' : 'ok';

  const response: HealthResponse = {
    status,
    version: SERVER_VERSION,
    uptime,
    database,
  };

  const statusCode = status === 'ok' ? 200 : 503;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}
