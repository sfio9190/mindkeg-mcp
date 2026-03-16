/**
 * MCP tool: list_repositories
 * List all repositories that have learnings stored, with learning counts.
 * Traces to AC-16.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { getActorFromApiKey, recordToolMetrics } from './tool-utils.js';

export function registerListRepositories(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined,
  auditLogger: AuditLogger
): void {
  server.tool(
    'list_repositories',
    'List all repositories that have learnings stored, along with the number of learnings per repository. Global learnings (not tied to any repo) appear with path=null.',
    {},
    async (_args) => {
      const actor = getActorFromApiKey(getApiKey());
      const startTime = Date.now();
      try {
        // Intentionally unrestricted: list_repositories is read-only metadata and does not expose
        // learning content. Any valid API key may call it regardless of repo restrictions (F-02).
        await authenticate(getApiKey(), storage);

        const repositories = await learningService.listRepositories();

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'list_repositories',
          actor,
          resource_id: null,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
          metadata: { count: repositories.length },
        });

        recordToolMetrics('list_repositories', 'success', Date.now() - startTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: repositories.length,
                repositories: repositories.map((r) => ({
                  path: r.path,
                  label: r.path === null ? '(global)' : r.path,
                  learning_count: r.learning_count,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        if (isMindKegError(err)) {
          auditLogger.logEntry({
            timestamp: new Date().toISOString(),
            action: 'list_repositories',
            actor,
            resource_id: null,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('list_repositories', 'error', Date.now() - startTime, err.code);
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
