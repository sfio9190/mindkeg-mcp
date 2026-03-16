/**
 * Unit tests for content sanitization (ESH-AC-24).
 * Tests control char stripping, whitespace rejection, and normal content passthrough.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeContent } from '../../src/security/sanitize.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('sanitizeContent (ESH-AC-24)', () => {
  // Normal content passthrough
  it('passes through normal content unchanged', () => {
    const input = 'Use async/await for all I/O operations.';
    expect(sanitizeContent(input)).toBe(input);
  });

  it('passes through content with newlines (LF preserved)', () => {
    const input = 'Line one.\nLine two.';
    expect(sanitizeContent(input)).toBe(input);
  });

  it('passes through content with carriage return (CR preserved)', () => {
    const input = 'Line one.\r\nLine two.';
    expect(sanitizeContent(input)).toBe(input);
  });

  it('passes through content with mixed whitespace (tabs are U+0009, stripped)', () => {
    // Tab is U+0009 which is in the control char range — gets stripped
    const input = 'Before\tAfter';
    expect(sanitizeContent(input)).toBe('BeforeAfter');
  });

  // Control character stripping
  it('strips NUL byte (U+0000)', () => {
    const input = 'Hello\x00World';
    expect(sanitizeContent(input)).toBe('HelloWorld');
  });

  it('strips BEL (U+0007)', () => {
    const input = 'Hello\x07World';
    expect(sanitizeContent(input)).toBe('HelloWorld');
  });

  it('strips ESC (U+001B)', () => {
    const input = 'Hello\x1BWorld';
    expect(sanitizeContent(input)).toBe('HelloWorld');
  });

  it('strips multiple control characters', () => {
    const input = '\x01\x02Hello\x03\x04World\x1F';
    expect(sanitizeContent(input)).toBe('HelloWorld');
  });

  it('strips control chars but preserves surrounding normal text and newlines', () => {
    const input = 'First\x00line.\nSecond\x1Fline.';
    expect(sanitizeContent(input)).toBe('Firstline.\nSecondline.');
  });

  // Whitespace-only rejection
  it('throws ValidationError for all-whitespace content', () => {
    expect(() => sanitizeContent('   ')).toThrow(ValidationError);
  });

  it('throws ValidationError for newline-only content', () => {
    expect(() => sanitizeContent('\n\n\n')).toThrow(ValidationError);
  });

  it('throws ValidationError for content that becomes all-whitespace after stripping', () => {
    // Content is NUL + spaces — after stripping NUL, only spaces remain
    expect(() => sanitizeContent('\x00   \x01')).toThrow(ValidationError);
  });

  it('does NOT throw for content with meaningful text surrounded by whitespace', () => {
    const result = sanitizeContent('  hello  ');
    expect(result).toBe('  hello  ');
  });

  // Edge cases
  it('handles empty string by throwing from min length (Zod handles this, sanitize would also fail)', () => {
    // sanitizeContent('') — after stripping, empty string → trim → length 0 → throws
    expect(() => sanitizeContent('')).toThrow(ValidationError);
  });

  it('handles content with only vertical tab and form feed (both stripped)', () => {
    const input = '\x0B\x0C'; // VT + FF
    expect(() => sanitizeContent(input)).toThrow(ValidationError);
  });
});

describe('CreateLearningInputSchema sanitization integration (ESH-AC-24)', () => {
  // Import here to test end-to-end Zod integration
  it('sanitizes control chars in CreateLearningInputSchema', async () => {
    const { CreateLearningInputSchema } = await import('../../src/models/learning.js');
    const result = CreateLearningInputSchema.safeParse({
      content: 'Hello\x00World',
      category: 'conventions',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('HelloWorld');
    }
  });

  it('rejects all-whitespace content in CreateLearningInputSchema', async () => {
    const { CreateLearningInputSchema } = await import('../../src/models/learning.js');
    const result = CreateLearningInputSchema.safeParse({
      content: '   ',
      category: 'conventions',
    });
    expect(result.success).toBe(false);
  });

  it('sanitizes control chars in UpdateLearningInputSchema', async () => {
    const { UpdateLearningInputSchema } = await import('../../src/models/learning.js');
    const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
    const result = UpdateLearningInputSchema.safeParse({
      id: VALID_UUID,
      content: 'Updated\x1Bcontent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Updatedcontent');
    }
  });
});
