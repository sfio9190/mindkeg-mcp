/**
 * Repository model.
 * Repositories are not explicitly registered — they emerge from the `repository` field on learnings.
 * The `list_repositories` tool aggregates distinct repository values from the learnings table (AC-7).
 */

/** A repository with its associated learning count. */
export interface Repository {
  /** Absolute path of the repository. Null represents global learnings. */
  path: string | null;
  /** Total number of learnings associated with this repository. */
  learning_count: number;
}
