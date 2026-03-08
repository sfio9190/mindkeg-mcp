/**
 * MCP tool: search_learnings
 * Searches for relevant learnings using semantic similarity (or FTS5 fallback).
 * Traces to AC-9, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LEARNING_CATEGORIES } from '../models/learning.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';

/**
 * Register the search_learnings tool on the MCP server.
 */
export function registerSearchLearnings(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined
): void {
  server.tool(
    'search_learnings',
    'Search for relevant learnings using semantic similarity. Results are ranked by relevance. Call this at the start of a session with a description of what you\'re working on.',
    {
      query: z
        .string()
        .min(1)
        .describe('Natural-language description of what you need to know or what you\'re working on.'),
      repository: z
        .string()
        .optional()
        .nullable()
        .describe('Filter to this repository path (also includes global learnings). Omit to search all.'),
      workspace: z
        .string()
        .optional()
        .nullable()
        .describe('Filter to this workspace path (also includes global learnings). Use when you want workspace-scoped results without specifying a repository.'),
      category: z
        .enum(LEARNING_CATEGORIES)
        .optional()
        .describe('Filter by category: architecture, conventions, debugging, gotchas, dependencies, or decisions.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by any matching tag.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of results to return (default 10, max 50).'),
      include_deprecated: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include deprecated learnings in results (default false).'),
    },
    async (args) => {
      try {
        // Authenticate — repository access check uses the filter repo if provided (AC-21)
        await authenticate(getApiKey(), storage, args.repository ?? null);

        const results = await learningService.searchLearnings({
          query: args.query,
          repository: args.repository ?? undefined,
          workspace: args.workspace ?? undefined,
          category: args.category,
          tags: args.tags,
          limit: args.limit,
          include_deprecated: args.include_deprecated,
        });

        // Return results with relevance scores (AC-12) and scope (WS-AC-14)
        const output = results.map((r) => ({
          id: r.id,
          content: r.content,
          category: r.category,
          tags: r.tags,
          repository: r.repository,
          workspace: r.workspace,
          scope: r.scope,
          group_id: r.group_id,
          source: r.source,
          status: r.status,
          stale_flag: r.stale_flag,
          score: r.score,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query: args.query,
                count: output.length,
                results: output,
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
