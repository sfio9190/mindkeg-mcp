/**
 * Entry point for the Mind Keg MCP server.
 * This module is imported by the CLI `serve` command and connects the MCP server
 * to the appropriate transport (stdio or HTTP+SSE).
 * Traces to AC-17 (stdio), AC-18 (HTTP+SSE).
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { StorageAdapter } from './storage/storage-adapter.js';
import type { EmbeddingService } from './services/embedding-service.js';
import { createMcpServer } from './server.js';
import { getLogger } from './utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed request body size (1 MB). Mitigates memory-exhaustion via F-06. */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Session entry stored in the sessions map. Includes key hash for F-01 re-validation. */
interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  /** SHA-256 hash of the API key that created this session (hex). */
  keyHash: string;
}

/** Compute a stable SHA-256 hex digest for an API key (or empty string when absent). */
function hashApiKey(key: string | undefined): string {
  return createHash('sha256').update(key ?? '').digest('hex');
}

/** Constant-time comparison of two hex-encoded SHA-256 digests. */
function keyHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  // Both buffers are always 32 bytes (SHA-256), so lengths always match.
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Stdio transport (AC-17)
// ---------------------------------------------------------------------------

/**
 * Start the MCP server in stdio mode.
 * Used by local agents (Claude Code, Cursor) that spawn the server as a child process.
 * API key comes from the MINDKEG_API_KEY env variable (set in the MCP config).
 */
export async function startStdio(
  config: Config,
  storage: StorageAdapter,
  embedding: EmbeddingService
): Promise<void> {
  const log = getLogger();
  const apiKey = config.auth.apiKey;

  if (!apiKey) {
    log.warn(
      'MINDKEG_API_KEY is not set. All tool calls will be rejected with AuthError. ' +
      'Set the key via: mindkeg api-key create, then set MINDKEG_API_KEY in your MCP config.'
    );
  }

  const server = createMcpServer({
    storage,
    embedding,
    getApiKey: () => apiKey,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info('Mind Keg MCP server running in stdio mode');
}

// ---------------------------------------------------------------------------
// HTTP + SSE transport (AC-18)
// ---------------------------------------------------------------------------

/**
 * Start the MCP server in HTTP+SSE mode.
 * Handles per-request auth via the Authorization: Bearer header.
 * Supports multiple concurrent clients.
 * CORS is disabled by default (per security requirements).
 */
export async function startHttp(
  config: Config,
  storage: StorageAdapter,
  embedding: EmbeddingService
): Promise<void> {
  const log = getLogger();
  const { host, port } = config.server;

  // Map of session ID → session entry (transport + key hash for re-validation, F-01)
  const transports = new Map<string, SessionEntry>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only handle /mcp endpoint
    const url = req.url ?? '/';
    const basePath = '/mcp';

    if (!url.startsWith(basePath)) {
      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'mindkeg-mcp' }));
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Extract API key from Authorization header (AC-21 for HTTP transport)
    const authHeader = req.headers['authorization'] ?? '';
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    // Handle session management for stateful mode
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Read body for POST requests (throws when body exceeds MAX_BODY_BYTES, F-06)
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Request body too large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large' }));
        return;
      }
      throw err;
    }

    if (req.method === 'POST') {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Existing session — re-validate the current request's key against the
        // stored hash to prevent session fixation (F-01).
        const entry = transports.get(sessionId)!;
        const requestKeyHash = hashApiKey(apiKey);
        if (!keyHashesMatch(requestKeyHash, entry.keyHash)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        transport = entry.transport;
      } else if (!sessionId) {
        // New session — create transport and server
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sid) => {
            // Store transport alongside key hash so subsequent requests can be
            // re-validated without trusting the session ID alone (F-01).
            transports.set(sid, { transport, keyHash: hashApiKey(apiKey) });
          },
        });

        // Wire up cleanup on close
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        // Create a new MCP server for this session with request-scoped API key
        const sessionApiKey = apiKey; // capture for closure
        const server = createMcpServer({
          storage,
          embedding,
          getApiKey: () => sessionApiKey,
        });

        await server.connect(transport);
      } else {
        // Session ID provided but not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      await transport.handleRequest(req, res, body);
    } else if (req.method === 'GET') {
      // SSE endpoint for server-sent events
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session ID required for GET endpoint' }));
        return;
      }
      const { transport: sseTransport } = transports.get(sessionId)!;
      await sseTransport.handleRequest(req, res);
    } else if (req.method === 'DELETE') {
      // Session cleanup
      if (sessionId && transports.has(sessionId)) {
        const { transport } = transports.get(sessionId)!;
        await transport.close();
        transports.delete(sessionId);
      }
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => {
      log.info(
        { host, port, endpoint: `http://${host}:${port}/mcp` },
        'Mind Keg MCP server running in HTTP mode'
      );
      resolve();
    });
    httpServer.on('error', reject);
  });
}

/**
 * Read the request body as a parsed JSON object.
 * Rejects with an error whose message is 'Request body too large' when the
 * accumulated bytes exceed MAX_BODY_BYTES, and destroys the socket (F-06).
 */
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    let byteCount = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      byteCount += chunk.length;
      if (byteCount > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      data += chunk.toString();
    });
    req.on('end', () => {
      if (rejected) return;
      if (!data) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', (err) => {
      // req.destroy() fires an 'error' event; suppress it when we already
      // rejected due to the size limit so we do not double-reject.
      if (!rejected) reject(err);
    });
  });
}
