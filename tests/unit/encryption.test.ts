/**
 * Unit tests for the encryption module.
 * Traces to ESH-AC-1, ESH-AC-2.
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, isEncrypted, parseEncryptionKey } from '../../src/crypto/encryption.js';

function makeKey(): Buffer {
  return randomBytes(32);
}

describe('encrypt / decrypt round-trip (ESH-AC-1)', () => {
  it('encrypts and decrypts a short string', () => {
    const key = makeKey();
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts a long string (500 chars)', () => {
    const key = makeKey();
    const plaintext = 'A'.repeat(500);
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts JSON embedding array', () => {
    const key = makeKey();
    const embedding = Array.from({ length: 384 }, () => Math.random());
    const plaintext = JSON.stringify(embedding);
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(JSON.parse(decrypted)).toEqual(embedding);
  });

  it('produces different ciphertext on each encrypt call (unique IVs)', () => {
    const key = makeKey();
    const plaintext = 'same content';
    const enc1 = encrypt(plaintext, key);
    const enc2 = encrypt(plaintext, key);
    // Same key, same plaintext — but different IVs must produce different ciphertexts
    expect(enc1).not.toBe(enc2);
  });

  it('encrypted value has three base64 parts separated by colons', () => {
    const key = makeKey();
    const encrypted = encrypt('test', key);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });
});

describe('decrypt — error cases', () => {
  it('throws on wrong key (auth tag mismatch)', () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('throws on tampered ciphertext', () => {
    const key = makeKey();
    const encrypted = encrypt('secret data', key);
    const parts = encrypted.split(':');
    // Corrupt the ciphertext part
    parts[1] = Buffer.alloc(parts[1]!.length, 0).toString('base64');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('throws on malformed input (wrong number of parts)', () => {
    const key = makeKey();
    expect(() => decrypt('not:valid', key)).toThrow(/Invalid encrypted value format/);
  });

  it('throws when key length is not 32 bytes', () => {
    const shortKey = randomBytes(16);
    expect(() => encrypt('test', shortKey)).toThrow(/32 bytes/);
    expect(() => decrypt('a:b:c', shortKey)).toThrow(/32 bytes/);
  });
});

describe('isEncrypted', () => {
  it('returns true for encrypted values', () => {
    const key = makeKey();
    const encrypted = encrypt('test content', key);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('returns false for plain text strings', () => {
    expect(isEncrypted('Hello, World!')).toBe(false);
    expect(isEncrypted('just a plain string')).toBe(false);
  });

  it('returns false for strings with wrong number of colons', () => {
    expect(isEncrypted('onlyone')).toBe(false);
    expect(isEncrypted('one:two')).toBe(false);
    expect(isEncrypted('one:two:three:four')).toBe(false);
  });
});

describe('parseEncryptionKey', () => {
  it('parses a valid 32-byte base64 key', () => {
    const rawKey = randomBytes(32);
    const b64Key = rawKey.toString('base64');
    const parsed = parseEncryptionKey(b64Key);
    expect(parsed).toBeInstanceOf(Buffer);
    expect(parsed.length).toBe(32);
    expect(parsed.equals(rawKey)).toBe(true);
  });

  it('throws when decoded key is not 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64');
    expect(() => parseEncryptionKey(shortKey)).toThrow(/32 bytes/);
  });
});
