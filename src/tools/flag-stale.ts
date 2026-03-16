/**
 * MCP tool: flag_stale
 * Flag a learning as potentially stale so it can be reviewed and updated.
 * Traces to AC-30, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError, NotFoundError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { getActorFromApiKey, recordToolMetrics } from './tool-utils.js';

export function registerFlagStale(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined,
  auditLogger: AuditLogger
): void {
  server.tool(
    'flag_stale',
    'Flag a learning as potentially stale. Use this when you encounter evidence that a learning may be outdated. Stale learnings remain searchable but are marked for review.',
    {
      id: z.string().uuid().describe('UUID of the learning to flag as stale.'),
      reason: z
        .string()
        .optional()
        .describe('Why this learning is believed to be stale (optional, for documentation).'),
    },
    async (args) => {
      const actor = getActorFromApiKey(getApiKey());
      const startTime = Date.now();
      try {
        // Fetch the existing learning first so we can enforce repo-level access control (F-02).
        const existing = await storage.getLearning(args.id);
        if (!existing) {
          throw new NotFoundError(`Learning not found: ${args.id}`);
        }
        await authenticate(getApiKey(), storage, existing.repository);

        const learning = await learningService.flagStale({ id: args.id });

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'flag_stale',
          actor,
          resource_id: args.id,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
          metadata: { has_reason: args.reason !== undefined },
        });

        recordToolMetrics('flag_stale', 'success', Date.now() - startTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Learning ${args.id} flagged as stale.`,
                reason: args.reason,
                learning,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        if (isMindKegError(err)) {
          auditLogger.logEntry({
            timestamp: new Date().toISOString(),
            action: 'flag_stale',
            actor,
            resource_id: args.id,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('flag_stale', 'error', Date.now() - startTime, err.code);
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(err.toJSON()) }],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Unexpected error: ${String(err)}` }],
        };
      }
    }
  );
}
