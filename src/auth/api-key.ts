/**
 * API key management: generation, hashing, and prefix extraction.
 * Traces to AC-20.
 *
 * Security design:
 * - Keys are 32 random bytes encoded as hex → 64-char lowercase string
 * - Keys are prefixed with "mk_" for easy identification
 * - Only the SHA-256 hash is stored; the plaintext key is shown ONCE at creation
 * - The first 8 chars after "mk_" are stored as `key_prefix` for identification
 */
import { randomBytes, createHash } from 'node:crypto';

export const KEY_PREFIX = 'mk_';
export const KEY_PREFIX_LENGTH = 8; // number of chars from the key stored as prefix (after "mk_")

/**
 * Generate a new random API key.
 * Format: "mk_" + 64 hex chars (32 random bytes).
 * The full key is shown ONCE — it is never retrievable after this point.
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `${KEY_PREFIX}${randomPart}`;
}

/**
 * Compute the SHA-256 hash of an API key.
 * This hash is what gets stored in the database.
 *
 * Security note (F-04): Plain SHA-256 without a salt is used here intentionally.
 * This is acceptable ONLY because the keys are 256-bit random values (32 bytes from
 * randomBytes), giving them extremely high entropy. Rainbow-table and preimage attacks
 * are computationally infeasible against 256-bit random inputs regardless of salting.
 *
 * WARNING: If the key format ever changes to one with lower entropy (e.g., a shorter
 * code, a user-chosen password, or a derived value), this function MUST be replaced
 * with a proper KDF such as PBKDF2, bcrypt, or Argon2 with a unique per-key salt.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract the key prefix (first KEY_PREFIX_LENGTH chars after "mk_").
 * Used for human-readable identification of keys without exposing the full key.
 */
export function extractKeyPrefix(key: string): string {
  if (!key.startsWith(KEY_PREFIX)) {
    throw new Error(`API key must start with "${KEY_PREFIX}"`);
  }
  return key.slice(KEY_PREFIX.length, KEY_PREFIX.length + KEY_PREFIX_LENGTH);
}

/**
 * Validate that a string looks like a valid API key format.
 * Does NOT verify against the database — just structural validation.
 */
export function isValidKeyFormat(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) return false;
  const rest = key.slice(KEY_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(rest);
}
