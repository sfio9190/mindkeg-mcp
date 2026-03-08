/**
 * MCP tool: update_learning
 * Update an existing learning's content, category, or tags.
 * Traces to AC-3, AC-16.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LEARNING_CATEGORIES } from '../models/learning.js';
import type { LearningService } from '../services/learning-service.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { isMindKegError, NotFoundError } from '../utils/errors.js';
import { authenticate } from '../auth/middleware.js';

export function registerUpdateLearning(
  server: McpServer,
  learningService: LearningService,
  storage: StorageAdapter,
  getApiKey: () => string | undefined
): void {
  server.tool(
    'update_learning',
    'Update an existing learning\'s content, category, tags, or group_id. If content changes, the embedding is regenerated.',
    {
      id: z.string().uuid().describe('UUID of the learning to update.'),
      content: z
        .string()
        .min(1)
        .max(500)
        .optional()
        .describe('New content (max 500 chars). Triggers re-embedding.'),
      category: z
        .enum(LEARNING_CATEGORIES)
        .optional()
        .describe('New category.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('New tags (replaces all existing tags).'),
      group_id: z
        .string()
        .uuid()
        .optional()
        .nullable()
        .describe('New group_id (or null to remove).'),
      workspace: z
        .string()
        .optional()
        .nullable()
        .describe('New workspace path to re-scope this learning to workspace-wide. Set to null to clear. Mutually exclusive with repository.'),
      repository: z
        .string()
        .optional()
        .nullable()
        .describe('New repository path to re-scope this learning to repo-specific. Set to null to clear. Mutually exclusive with workspace.'),
    },
    async (args) => {
      try {
        // Fetch the existing learning first so we can enforce repo-level access control (F-02).
        const existing = await storage.getLearning(args.id);
        if (!existing) {
          throw new NotFoundError(`Learning not found: ${args.id}`);
        }
        await authenticate(getApiKey(), storage, existing.repository);

        const learning = await learningService.updateLearning({
          id: args.id,
          content: args.content,
          category: args.category,
          tags: args.tags,
          group_id: args.group_id,
          workspace: args.workspace,
          repository: args.repository,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, learning }, null, 2),
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
