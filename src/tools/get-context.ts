/**
 * MCP tool: get_context
 * Returns all relevant learnings for an agent's current repository, workspace,
 * and (optionally) topic focus — structured, ranked, and budget-controlled.
 * Read-only: no side effects. Traces to GC-AC-1 through GC-AC-30.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';
import type { AuditLogger } from '../audit/audit-logger.js';
import { getActorFromApiKey, recordToolMetrics } from './tool-utils.js';

/**
 * Register the get_context tool on the MCP server.
 * Follows the same pattern as all other tools in src/tools/.
 * Traces to GC-AC-1, GC-AC-29.
 */
export function registerGetContext(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined,
  auditLogger: AuditLogger
): void {
  server.tool(
    'get_context',
    'Prime an agent session with all relevant learnings for the current repository, workspace, and optional topic. Returns learnings ranked by actionability (gotchas first), partitioned by scope (repo/workspace/global), and trimmed to a character budget. Read-only — always safe to call.',
    {
      repository: z
        .string()
        .min(1)
        .describe('Absolute path to the current repository. Required.'),
      workspace: z
        .string()
        .optional()
        .describe(
          'Absolute path to the workspace directory. When omitted, auto-derived from the repository parent directory.'
        ),
      path_hint: z
        .string()
        .optional()
        .describe(
          'Subdirectory hint within the repo (e.g., "packages/api"). Boosts learnings relevant to this subdirectory.'
        ),
      query: z
        .string()
        .optional()
        .describe(
          'Optional topic focus (e.g., "authentication"). When provided, semantically boosts learnings related to this topic.'
        ),
      budget: z
        .enum(['compact', 'standard', 'full'])
        .optional()
        .describe(
          'Character budget preset. compact ~2000 chars, standard ~5000 chars (default), full ~12000 chars.'
        ),
      include_stale: z
        .boolean()
        .optional()
        .describe(
          'When true (default), stale-flagged learnings are included in stale_review for agent inspection.'
        ),
      verify_integrity: z
        .boolean()
        .optional()
        .default(false)
        .describe('When true, each returned learning includes integrity_valid: boolean indicating whether the stored hash matches the computed hash (ESH-AC-27).'),
    },
    async (args) => {
      const actor = getActorFromApiKey(getApiKey());
      const startTime = Date.now();
      try {
        // Authenticate via existing middleware (GC-AC-29, GC-AC-30)
        await authenticate(getApiKey(), storage, args.repository ?? null);

        const result = await learningService.getContext({
          repository: args.repository,
          workspace: args.workspace,
          path_hint: args.path_hint,
          query: args.query,
          budget: args.budget,
          include_stale: args.include_stale,
          verify_integrity: args.verify_integrity,
        });

        auditLogger.logEntry({
          timestamp: new Date().toISOString(),
          action: 'get_context',
          actor,
          resource_id: null,
          result: 'success',
          client: { transport: 'stdio', pid: process.pid },
          metadata: {
            repository: args.repository,
            budget: args.budget ?? 'standard',
            verify_integrity: args.verify_integrity,
          },
        });

        recordToolMetrics('get_context', 'success', Date.now() - startTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        if (isMindKegError(err)) {
          auditLogger.logEntry({
            timestamp: new Date().toISOString(),
            action: 'get_context',
            actor,
            resource_id: null,
            result: 'error',
            error_code: err.code,
            client: { transport: 'stdio', pid: process.pid },
          });
          recordToolMetrics('get_context', 'error', Date.now() - startTime, err.code);
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(err.toJSON()) }],
          };
        }
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Unexpected error: ${String(err)}` },
          ],
        };
      }
    }
  );
}
