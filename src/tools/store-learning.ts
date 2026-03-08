/**
 * MCP tool: store_learning
 * Stores a new atomic learning in the brain.
 * Traces to AC-1, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LEARNING_CATEGORIES } from '../models/learning.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';

/**
 * Register the store_learning tool on the MCP server.
 */
export function registerStoreLearning(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined
): void {
  server.tool(
    'store_learning',
    'Store a new atomic learning in the brain. Learnings are short, factual insights about a codebase or development pattern (max 500 characters).',
    {
      content: z
        .string()
        .min(1)
        .max(500)
        .describe('The learning text. Must be atomic — one insight per entry, 1-3 sentences, max 500 characters.'),
      category: z
        .enum(LEARNING_CATEGORIES)
        .describe('Category: architecture, conventions, debugging, gotchas, dependencies, or decisions.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Free-form labels for organization (e.g., ["typescript", "async"]).'),
      repository: z
        .string()
        .optional()
        .nullable()
        .describe('Absolute path to the repository this learning belongs to. Mutually exclusive with workspace. Omit or null for global learnings.'),
      workspace: z
        .string()
        .optional()
        .nullable()
        .describe('Absolute path to the workspace directory (parent of the repo). Use this for workspace-wide learnings that apply to all repos in this folder. Mutually exclusive with repository.'),
      group_id: z
        .string()
        .uuid()
        .optional()
        .nullable()
        .describe('UUID to link related learnings into a group.'),
      source: z
        .string()
        .optional()
        .describe('Who or what created this learning (e.g., "claude-code", "human"). Defaults to "agent".'),
    },
    async (args) => {
      try {
        // Authenticate before executing (AC-21)
        await authenticate(getApiKey(), storage, args.repository ?? null);

        const learning = await learningService.storeLearning({
          content: args.content,
          category: args.category,
          tags: args.tags,
          repository: args.repository ?? null,
          workspace: args.workspace ?? null,
          group_id: args.group_id ?? null,
          source: args.source,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                learning: {
                  id: learning.id,
                  content: learning.content,
                  category: learning.category,
                  tags: learning.tags,
                  repository: learning.repository,
                  workspace: learning.workspace,
                  group_id: learning.group_id,
                  source: learning.source,
                  status: learning.status,
                  created_at: learning.created_at,
                  embedding_generated: learning.embedding !== null,
                },
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
