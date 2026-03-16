/**
 * MCP tool: deprecate_learning
 * Mark a learning as deprecated so it is excluded from future searches by default.
 * Traces to AC-4, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError, NotFoundError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { getActorFromApiKey, recordToolMetrics } from './tool-utils.js';

export function registerDeprecateLearning(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined,
  auditLogger: AuditLogger
): void {
  server.tool(
    'deprecate_learning',
    'Mark a learning as deprecated. Deprecated learnings are excluded from search results by default (pass include_deprecated=true to include them).',
    {
      id: z.string().uuid().describe('UUID of the learning to deprecate.'),
      reason: z
        .string()
        .optional()
        .describe('Why this learning is being deprecated (optional, for documentation).'),
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

        const learning = await learningService.deprecateLearning({
          id: args.id,
          reason: args.reason,
        });

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'deprecate_learning',
          actor,
          resource_id: args.id,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
          metadata: { has_reason: args.reason !== undefined },
        });

        recordToolMetrics('deprecate_learning', 'success', Date.now() - startTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Learning ${args.id} marked as deprecated.`,
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
            action: 'deprecate_learning',
            actor,
            resource_id: args.id,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('deprecate_learning', 'error', Date.now() - startTime, err.code);
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
