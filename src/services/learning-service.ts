/**
 * LearningService: core business logic for learning CRUD and search.
 * Orchestrates storage and embedding generation.
 * Traces to AC-1 through AC-15, AC-27, AC-28, AC-29, AC-30.
 */
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import type { EmbeddingService } from './embedding-service.js';
import type { Learning, LearningWithScore } from '../models/learning.js';
import type { Repository } from '../models/repository.js';
import {
  CreateLearningInputSchema,
  UpdateLearningInputSchema,
  DeprecateLearningInputSchema,
  DeleteLearningInputSchema,
  SearchLearningsInputSchema,
  FlagStaleLearningInputSchema,
} from '../models/learning.js';
import { ValidationError, NotFoundError, EmbeddingError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { deriveWorkspace, normalizePath } from '../utils/workspace.js';
import type { z } from 'zod';

/** Raw input type for storeLearning (pre-validation). */
export type StoreLearningInput = z.input<typeof CreateLearningInputSchema>;

/** Raw input type for searchLearnings (pre-validation). */
export type SearchLearningsInput = z.input<typeof SearchLearningsInputSchema>;

/** Raw input type for updateLearning (pre-validation). */
export type UpdateLearningInput = z.input<typeof UpdateLearningInputSchema>;

/** Raw input type for deprecateLearning (pre-validation). */
export type DeprecateLearningInput = z.input<typeof DeprecateLearningInputSchema>;

/** Raw input type for deleteLearning (pre-validation). */
export type DeleteLearningInput = z.input<typeof DeleteLearningInputSchema>;

/** Raw input type for flagStale (pre-validation). */
export type FlagStaleLearningInput = z.input<typeof FlagStaleLearningInputSchema>;

export interface DeleteResult {
  success: boolean;
  id: string;
}

export class LearningService {
  private readonly storage: StorageAdapter;
  private readonly embedding: EmbeddingService;

  constructor(storage: StorageAdapter, embedding: EmbeddingService) {
    this.storage = storage;
    this.embedding = embedding;
  }

  // ---------------------------------------------------------------------------
  // storeLearning (AC-1, AC-6, AC-13, AC-14, AC-15, AC-27, AC-28)
  // ---------------------------------------------------------------------------

  /**
   * Validate, embed, and persist a new learning.
   * @param rawInput - Raw (unvalidated) input from the MCP tool call
   */
  async storeLearning(rawInput: StoreLearningInput): Promise<Learning> {
    const log = getLogger();

    // 1. Validate input (Zod schema enforces AC-6, AC-13, AC-14, AC-15)
    const parseResult = CreateLearningInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid learning input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        parseResult.error.issues
      );
    }
    const input = parseResult.data;

    // 2. Generate embedding for semantic search (AC-9).
    // On EmbeddingError, fall back to null so the learning is still stored and
    // remains searchable via FTS5 keyword fallback until embeddings are backfilled.
    let embeddingVector: number[] | null = null;
    try {
      embeddingVector = await this.embedding.generateEmbedding(input.content);
    } catch (embErr) {
      if (embErr instanceof EmbeddingError) {
        log.warn(
          { error: embErr.message },
          'Embedding generation failed; storing learning without embedding (FTS5 fallback active)'
        );
      } else {
        throw embErr;
      }
    }

    // 3. Persist to storage (AC-27 timestamps set by adapter, AC-28 source field)
    // Normalize path separators to forward slashes so stored values always match
    // the normalized form produced by deriveWorkspace() during search (Bug A fix).
    //
    // - workspace: use normalizePath (backslashes → forward slashes + trailing slash)
    //   because deriveWorkspace() always returns paths with trailing slashes.
    // - repository: only replace backslashes — no trailing slash, because repository
    //   is stored and queried as an exact match key, not compared to derived paths.
    const normalizedRepository =
      input.repository != null ? input.repository.replace(/\\/g, '/') : null;
    const normalizedWorkspace = input.workspace != null ? normalizePath(input.workspace) : null;

    const id = randomUUID();
    const learning = await this.storage.createLearning({
      id,
      content: input.content,
      category: input.category,
      tags: input.tags,
      repository: normalizedRepository,
      workspace: normalizedWorkspace,
      group_id: input.group_id,
      source: input.source,
      embedding: embeddingVector,
    });

    log.info(
      { id: learning.id, category: input.category, repository: normalizedRepository, workspace: normalizedWorkspace },
      'Learning stored'
    );

    return learning;
  }

  // ---------------------------------------------------------------------------
  // searchLearnings (AC-8, AC-9, AC-10, AC-11, AC-12, AC-29)
  // ---------------------------------------------------------------------------

  /**
   * Search for relevant learnings using semantic similarity (or FTS5 fallback).
   * When repository is provided, auto-derives workspace and searches all three
   * scopes: repo-specific, workspace-wide, and global (WS-AC-12, WS-AC-13).
   * Each result is annotated with a `scope` field (WS-AC-14).
   */
  async searchLearnings(rawInput: SearchLearningsInput): Promise<LearningWithScore[]> {
    const parseResult = SearchLearningsInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid search input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }
    const input = parseResult.data;

    // Normalize the repository filter: replace backslashes with forward slashes
    // so the filter matches the normalized form stored by storeLearning (Bug A fix).
    const normalizedRepoFilter =
      input.repository != null ? input.repository.replace(/\\/g, '/') : undefined;

    // Auto-derive workspace from repository's parent directory (WS-AC-13).
    // deriveWorkspace already normalizes backslashes and adds a trailing slash,
    // so it is safe to call on a backslash-containing Windows path.
    // If the caller also passes an explicit workspace, prefer the derived one
    // (it is always consistent with the stored, normalized repository path).
    // If no repository is provided but an explicit workspace is, use that so
    // agents can scope a search to a workspace without knowing a specific repo
    // (Bug B fix).
    const derivedWorkspace =
      input.repository != null ? deriveWorkspace(input.repository) : undefined;
    const resolvedWorkspace =
      derivedWorkspace ?? (input.workspace != null ? normalizePath(input.workspace) : undefined);

    const filters = {
      repository: normalizedRepoFilter,
      workspace: resolvedWorkspace,
      category: input.category,
      tags: input.tags,
      limit: input.limit,
      include_deprecated: input.include_deprecated,
    };

    // 1. Try semantic search if embedding provider is configured (AC-9)
    const queryEmbedding = await this.embedding.generateEmbedding(input.query);

    let results: LearningWithScore[];
    if (queryEmbedding !== null) {
      // Semantic search path (AC-9)
      results = await this.storage.searchByVector(queryEmbedding, filters);
      // Fall back to FTS5 if semantic search found nothing (e.g., learnings
      // exist but have no embeddings yet — common after a DB migration or
      // when switching embedding providers).
      if (results.length === 0) {
        results = await this.storage.searchByText(input.query, filters);
      }
    } else {
      // 2. FTS5 fallback when no embedding provider is configured
      results = await this.storage.searchByText(input.query, filters);
    }

    // Annotate each result with its scope (WS-AC-14)
    return results.map((r) => ({
      ...r,
      scope: annotateScope(r),
    }));
  }

  // ---------------------------------------------------------------------------
  // updateLearning (AC-3)
  // ---------------------------------------------------------------------------

  /**
   * Update an existing learning. Re-embeds if content changed.
   */
  async updateLearning(rawInput: UpdateLearningInput): Promise<Learning> {
    const parseResult = UpdateLearningInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid update input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }
    const input = parseResult.data;

    // Verify learning exists
    const existing = await this.storage.getLearning(input.id);
    if (!existing) {
      throw new NotFoundError(`Learning not found: ${input.id}`);
    }

    // Re-embed if content changed (AC-9 — keep embeddings fresh)
    let newEmbedding: number[] | null | undefined = undefined;
    if (input.content !== undefined && input.content !== existing.content) {
      newEmbedding = await this.embedding.generateEmbedding(input.content);
    }

    const updates: Parameters<StorageAdapter['updateLearning']>[1] = {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.group_id !== undefined ? { group_id: input.group_id } : {}),
      ...(newEmbedding !== undefined ? { embedding: newEmbedding } : {}),
      ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
      ...(input.repository !== undefined ? { repository: input.repository } : {}),
    };

    const updated = await this.storage.updateLearning(input.id, updates);
    if (!updated) {
      throw new NotFoundError(`Learning disappeared during update: ${input.id}`);
    }

    getLogger().info({ id: updated.id }, 'Learning updated');
    return updated;
  }

  // ---------------------------------------------------------------------------
  // deprecateLearning (AC-4)
  // ---------------------------------------------------------------------------

  /**
   * Mark a learning as deprecated. Deprecated learnings are excluded from search by default (AC-4, AC-29).
   */
  async deprecateLearning(rawInput: DeprecateLearningInput): Promise<Learning> {
    const parseResult = DeprecateLearningInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid deprecate input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }
    const input = parseResult.data;

    const existing = await this.storage.getLearning(input.id);
    if (!existing) {
      throw new NotFoundError(`Learning not found: ${input.id}`);
    }

    const updated = await this.storage.updateLearning(input.id, { status: 'deprecated' });
    if (!updated) {
      throw new NotFoundError(`Learning disappeared during deprecation: ${input.id}`);
    }

    getLogger().info({ id: updated.id, reason: input.reason }, 'Learning deprecated');
    return updated;
  }

  // ---------------------------------------------------------------------------
  // deleteLearning (AC-5)
  // ---------------------------------------------------------------------------

  /**
   * Permanently delete a learning.
   */
  async deleteLearning(rawInput: DeleteLearningInput): Promise<DeleteResult> {
    const parseResult = DeleteLearningInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid delete input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }
    const input = parseResult.data;

    const deleted = await this.storage.deleteLearning(input.id);
    if (!deleted) {
      throw new NotFoundError(`Learning not found: ${input.id}`);
    }

    getLogger().info({ id: input.id }, 'Learning deleted');
    return { success: true, id: input.id };
  }

  // ---------------------------------------------------------------------------
  // flagStale (AC-30)
  // ---------------------------------------------------------------------------

  /**
   * Flag a learning as potentially stale. The stale_flag signals that an agent
   * has found evidence the learning may be outdated and should be reviewed.
   */
  async flagStale(rawInput: FlagStaleLearningInput): Promise<Learning> {
    const parseResult = FlagStaleLearningInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new ValidationError(
        `Invalid flag-stale input: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      );
    }
    const input = parseResult.data;

    const existing = await this.storage.getLearning(input.id);
    if (!existing) {
      throw new NotFoundError(`Learning not found: ${input.id}`);
    }

    const updated = await this.storage.updateLearning(input.id, { stale_flag: true });
    if (!updated) {
      throw new NotFoundError(`Learning disappeared during stale flag: ${input.id}`);
    }

    getLogger().info({ id: updated.id }, 'Learning flagged as stale');
    return updated;
  }

  // ---------------------------------------------------------------------------
  // listRepositories (AC-16)
  // ---------------------------------------------------------------------------

  /**
   * List all distinct repositories with their learning counts.
   */
  async listRepositories(): Promise<Repository[]> {
    return await this.storage.listRepositories();
  }

  // ---------------------------------------------------------------------------
  // listWorkspaces (WS-AC-16)
  // ---------------------------------------------------------------------------

  /**
   * List all distinct workspaces with their learning counts.
   */
  async listWorkspaces(): Promise<Array<{ workspace: string; learning_count: number }>> {
    return await this.storage.listWorkspaces();
  }
}

// ---------------------------------------------------------------------------
// Scope annotation helper (WS-AC-14)
// ---------------------------------------------------------------------------

/**
 * Determine the scope of a learning based on its repository and workspace fields.
 * - repo: learning has a repository set
 * - workspace: learning has a workspace set (but no repository)
 * - global: both are null
 */
function annotateScope(learning: Learning): 'repo' | 'workspace' | 'global' {
  if (learning.repository !== null) return 'repo';
  if (learning.workspace !== null) return 'workspace';
  return 'global';
}
