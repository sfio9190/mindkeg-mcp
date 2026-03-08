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

export function registerListRepositories(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined
): void {
  server.tool(
    'list_repositories',
    'List all repositories that have learnings stored, along with the number of learnings per repository. Global learnings (not tied to any repo) appear with path=null.',
    {},
    async (_args) => {
      try {
        // Intentionally unrestricted: list_repositories is read-only metadata and does not expose
        // learning content. Any valid API key may call it regardless of repo restrictions (F-02).
        await authenticate(getApiKey(), storage);

        const repositories = await learningService.listRepositories();

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
