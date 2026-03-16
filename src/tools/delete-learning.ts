/**
 * MCP tool: delete_learning
 * Permanently delete a learning from the brain.
 * Traces to AC-5, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError, NotFoundError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { getActorFromApiKey, recordToolMetrics } from './tool-utils.js';

export function registerDeleteLearning(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined,
  auditLogger: AuditLogger
): void {
  server.tool(
    'delete_learning',
    'Permanently delete a learning from the brain. This is irreversible. Consider using deprecate_learning instead if you want to keep a record.',
    {
      id: z.string().uuid().describe('UUID of the learning to permanently delete.'),
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

        const result = await learningService.deleteLearning({ id: args.id });

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'delete_learning',
          actor,
          resource_id: args.id,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
        });

        recordToolMetrics('delete_learning', 'success', Date.now() - startTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: result.success,
                message: `Learning ${result.id} permanently deleted.`,
                id: result.id,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        if (isMindKegError(err)) {
          auditLogger.logEntry({
            timestamp: new Date().toISOString(),
            action: 'delete_learning',
            actor,
            resource_id: args.id,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('delete_learning', 'error', Date.now() - startTime, err.code);
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
