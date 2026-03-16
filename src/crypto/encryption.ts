/**
 * Application-level AES-256-GCM encryption for SQLite field values.
 * Used to encrypt `content` and `embedding` fields before writing to disk.
 * Traces to ESH-AC-1, ESH-AC-2, ESH-AC-3.
 *
 * Storage format: `<iv_b64>:<ciphertext_b64>:<auth_tag_b64>`
 * Each encrypted value gets a unique 12-byte IV (randomly generated per write).
 * Base64 encoding is chosen over hex to reduce storage overhead (~33% vs ~100%),
 * which matters for embedding columns.
 *
 * IMPORTANT: This does NOT protect against a malicious actor with direct filesystem
 * access who also has the encryption key. It protects against plaintext exposure
 * when the database file is extracted from a running system without the key.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/** AES-256-GCM IV length in bytes. */
const IV_BYTES = 12;

/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_BYTES = 16;

/** Separator character between IV, ciphertext, and auth tag in storage format. */
const FIELD_SEP = ':';

/**
 * Detect whether a stored value is in the encrypted format.
 * Returns true if value matches `<base64>:<base64>:<base64>` pattern.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(FIELD_SEP);
  if (parts.length !== 3) return false;
  const b64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((p) => p.length > 0 && b64Regex.test(p));
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt (e.g., learning content or JSON embedding)
 * @param key - 32-byte Buffer (256-bit key). Must be exactly 32 bytes.
 * @returns Encrypted storage string: `<iv_b64>:<ciphertext_b64>:<auth_tag_b64>`
 */
export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error(
      `Encryption key must be exactly 32 bytes (256 bits). Got ${key.length} bytes.`
    );
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertextBuf = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    ciphertextBuf.toString('base64'),
    authTag.toString('base64'),
  ].join(FIELD_SEP);
}

/**
 * Decrypt an encrypted storage string using AES-256-GCM.
 *
 * @param encrypted - Encrypted string in `<iv_b64>:<ciphertext_b64>:<auth_tag_b64>` format
 * @param key - 32-byte Buffer (256-bit key). Must be the same key used to encrypt.
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key, tampered ciphertext, invalid format)
 */
export function decrypt(encrypted: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error(
      `Encryption key must be exactly 32 bytes (256 bits). Got ${key.length} bytes.`
    );
  }

  const parts = encrypted.split(FIELD_SEP);
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted value format. Expected: <iv_b64>:<ciphertext_b64>:<auth_tag_b64>'
    );
  }

  const [ivB64, ciphertextB64, authTagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_BYTES}, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_BYTES}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // This throws if the auth tag does not match (tampered or wrong key)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

/**
 * Parse and validate a base64-encoded 256-bit encryption key from a string.
 * Used to parse `MINDKEG_ENCRYPTION_KEY` env var.
 *
 * @param keyB64 - Base64-encoded key string (should decode to exactly 32 bytes)
 * @returns 32-byte Buffer ready for use with encrypt/decrypt
 * @throws Error if the key is invalid base64 or not exactly 32 bytes
 */
export function parseEncryptionKey(keyB64: string): Buffer {
  let buf: Buffer;
  try {
    buf = Buffer.from(keyB64, 'base64');
  } catch {
    throw new Error(
      'MINDKEG_ENCRYPTION_KEY is not valid base64. ' +
      'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  if (buf.length !== 32) {
    throw new Error(
      `MINDKEG_ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits). ` +
      `Got ${buf.length} bytes. ` +
      'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return buf;
}
