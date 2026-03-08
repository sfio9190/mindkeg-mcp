/**
 * MCP tool: list_workspaces
 * Lists all distinct workspaces with their learning counts.
 * Traces to WS-AC-16.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import { isMindKegError } from '../utils/errors.js';

/**
 * Register the list_workspaces tool on the MCP server.
 */
export function registerListWorkspaces(
  server: McpServer,
  learningService: LearningService
): void {
  server.tool(
    'list_workspaces',
    'List all workspace directories that have workspace-scoped learnings, along with the count of learnings in each workspace.',
    {},
    async () => {
      try {
        const workspaces = await learningService.listWorkspaces();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: workspaces.length,
                workspaces,
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
