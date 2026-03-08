/**
 * Learning model: type definitions and Zod validation schemas.
 * The Learning is the core entity of Mind Keg — an atomic, categorized piece of developer knowledge.
 */
import { z } from 'zod';

/** The six allowed learning categories (AC-13). */
export const LEARNING_CATEGORIES = [
  'architecture',
  'conventions',
  'debugging',
  'gotchas',
  'dependencies',
  'decisions',
] as const;

export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

/** The two allowed learning statuses. */
export const LEARNING_STATUSES = ['active', 'deprecated'] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

/** Full Learning entity as stored in and returned from the database. */
export interface Learning {
  id: string;
  content: string;
  category: LearningCategory;
  tags: string[];
  repository: string | null;
  workspace: string | null;  // WS-AC-4: nullable workspace column
  group_id: string | null;
  source: string;
  status: LearningStatus;
  stale_flag: boolean;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

/** A Learning augmented with a relevance score, returned from search results (AC-12). */
export interface LearningWithScore extends Learning {
  score: number;
  scope: 'repo' | 'workspace' | 'global';  // WS-AC-14: scope annotation
}

/** Zod schema for creating a new learning (AC-1, AC-6, AC-13, AC-14, AC-15). */
export const CreateLearningInputSchema = z
  .object({
    /** The atomic learning text. Max 500 characters (AC-6). */
    content: z
      .string()
      .min(1, 'Content must not be empty')
      .max(500, 'Content must not exceed 500 characters'),

    /** Exactly one of the six allowed categories (AC-13). */
    category: z.enum(LEARNING_CATEGORIES),

    /** Free-form labels. Defaults to empty array (AC-14). */
    tags: z.array(z.string()).default([]),

    /** Repository path for scoping. Null means global (AC-7). */
    repository: z.string().nullable().default(null),

    /**
     * Workspace path for workspace-wide scoping (WS-AC-9).
     * Mutually exclusive with `repository` (WS-AC-8, WS-AC-10).
     */
    workspace: z.string().nullable().default(null),

    /** Optional UUID linking related learnings (AC-15). */
    group_id: z.string().uuid().nullable().default(null),

    /** Who or what created this learning (AC-28). Defaults to "agent". */
    source: z.string().default('agent'),
  })
  .refine(
    (data) => !(data.repository && data.workspace),
    {
      message:
        'Cannot set both repository and workspace. Use repository for repo-specific, workspace for workspace-wide, or neither for global.',
    }
  );

export type CreateLearningInput = z.infer<typeof CreateLearningInputSchema>;

/** Zod schema for updating an existing learning (AC-3). All fields optional. */
export const UpdateLearningInputSchema = z
  .object({
    /** UUID of the learning to update. Required. */
    id: z.string().uuid(),

    /** New content. If changed, embedding is regenerated. */
    content: z
      .string()
      .min(1, 'Content must not be empty')
      .max(500, 'Content must not exceed 500 characters')
      .optional(),

    /** New category. */
    category: z.enum(LEARNING_CATEGORIES).optional(),

    /** New tags. Replaces existing tags entirely. */
    tags: z.array(z.string()).optional(),

    /** New group_id. */
    group_id: z.string().uuid().nullable().optional(),

    /**
     * New workspace scope. Set to change scope to workspace-wide; null to clear (WS-AC-8).
     * Mutually exclusive with `repository` on the final state.
     */
    workspace: z.string().nullable().optional(),

    /**
     * New repository scope. Set to change scope to repo-specific; null to clear (WS-AC-8).
     * Mutually exclusive with `workspace` on the final state.
     */
    repository: z.string().nullable().optional(),
  })
  .refine(
    (data) => !(data.repository && data.workspace),
    {
      message:
        'Cannot set both repository and workspace. Use repository for repo-specific, workspace for workspace-wide, or neither for global.',
    }
  );

export type UpdateLearningInput = z.infer<typeof UpdateLearningInputSchema>;

/** Zod schema for deprecating a learning (AC-4). */
export const DeprecateLearningInputSchema = z.object({
  /** UUID of the learning to deprecate. */
  id: z.string().uuid(),

  /** Optional human-readable reason for deprecation. */
  reason: z.string().optional(),
});

export type DeprecateLearningInput = z.infer<typeof DeprecateLearningInputSchema>;

/** Zod schema for deleting a learning (AC-5). */
export const DeleteLearningInputSchema = z.object({
  /** UUID of the learning to permanently delete. */
  id: z.string().uuid(),
});

export type DeleteLearningInput = z.infer<typeof DeleteLearningInputSchema>;

/** Zod schema for search parameters (AC-9, AC-10, AC-11). */
export const SearchLearningsInputSchema = z.object({
  /** Natural-language query for semantic/keyword search. */
  query: z.string().min(1, 'Query must not be empty'),

  /** Filter to this repository (also includes global learnings — AC-8). */
  repository: z.string().nullable().optional(),

  /**
   * Filter to this workspace (also includes global learnings — WS-AC-12).
   * When provided without a repository, returns workspace-scoped + global learnings.
   */
  workspace: z.string().nullable().optional(),

  /** Filter by category (AC-10). */
  category: z.enum(LEARNING_CATEGORIES).optional(),

  /** Filter by any matching tag (AC-10). */
  tags: z.array(z.string()).optional(),

  /** Max results returned. Default 10, max 50 (AC-11). */
  limit: z.number().int().min(1).max(50).default(10),

  /** Include deprecated learnings in results. Default false (AC-29). */
  include_deprecated: z.boolean().default(false),
});

export type SearchLearningsInput = z.infer<typeof SearchLearningsInputSchema>;

/** Zod schema for flagging a learning as stale (AC-30). */
export const FlagStaleLearningInputSchema = z.object({
  /** UUID of the learning to flag as stale. */
  id: z.string().uuid(),
});

export type FlagStaleLearningInput = z.infer<typeof FlagStaleLearningInputSchema>;
