/**
 * MCP tool: list_workspaces
 * Lists all distinct workspaces with their learning counts.
 * Traces to WS-AC-16.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import { isMindKegError } from '../utils/errors.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { recordToolMetrics } from './tool-utils.js';

/**
 * Register the list_workspaces tool on the MCP server.
 */
export function registerListWorkspaces(
  server: McpServer,
  learningService: LearningService,
  auditLogger: AuditLogger
): void {
  server.tool(
    'list_workspaces',
    'List all workspace directories that have workspace-scoped learnings, along with the count of learnings in each workspace.',
    {},
    async () => {
      const startTime = Date.now();
      try {
        const workspaces = await learningService.listWorkspaces();

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'list_workspaces',
          actor: 'stdio',
          resource_id: null,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
          metadata: { count: workspaces.length },
        });

        recordToolMetrics('list_workspaces', 'success', Date.now() - startTime);
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
          auditLogger.logEntry({
            timestamp: new Date().toISOString(),
            action: 'list_workspaces',
            actor: 'stdio',
            resource_id: null,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('list_workspaces', 'error', Date.now() - startTime, err.code);
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
