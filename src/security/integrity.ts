/**
 * Integrity hash computation and verification for tamper detection (ESH-AC-26, ESH-AC-27).
 *
 * SHA-256 hash covers: content + "|" + category + "|" + JSON.stringify(tags.sort()) +
 *   "|" + (repository ?? "") + "|" + (workspace ?? "")
 *
 * Design decision (from spec): This provides tamper detection against accidental corruption
 * and casual modification. It does NOT protect against a malicious actor with direct filesystem
 * access who can recompute the hash. HMAC-based signing (requiring a secret key) is deferred to v2.
 */
import { createHash } from 'node:crypto';

/**
 * Minimum shape of a learning required to compute its integrity hash.
 * Using a minimal interface rather than the full Learning type to avoid circular imports
 * and to make the function usable with partial data.
 */
export interface IntegrityHashInput {
  content: string;
  category: string;
  tags: string[];
  repository: string | null;
  workspace: string | null;
}

/**
 * Compute the SHA-256 integrity hash for a learning's canonical fields.
 *
 * The canonical string is:
 *   `<content>|<category>|<sorted_tags_json>|<repository_or_empty>|<workspace_or_empty>`
 *
 * Tags are sorted before hashing so that tag order does not affect the hash.
 *
 * @returns Hex-encoded SHA-256 hash string (64 characters)
 */
export function computeIntegrityHash(learning: IntegrityHashInput): string {
  const sortedTagsJson = JSON.stringify([...learning.tags].sort());
  const canonical = [
    learning.content,
    learning.category,
    sortedTagsJson,
    learning.repository ?? '',
    learning.workspace ?? '',
  ].join('|');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verify that the stored integrity_hash matches the computed hash for the given learning.
 *
 * @param learning - The learning with all canonical fields plus stored `integrity_hash`
 * @returns `true` if the hash is valid, `false` if tampered or mismatched.
 *          Returns `null` if `integrity_hash` is null (legacy learning with no hash stored).
 */
export function verifyIntegrityHash(
  learning: IntegrityHashInput & { integrity_hash: string | null }
): boolean | null {
  if (learning.integrity_hash === null) {
    // Legacy learning — no hash stored. Cannot verify.
    return null;
  }
  const computed = computeIntegrityHash(learning);
  return computed === learning.integrity_hash;
}
