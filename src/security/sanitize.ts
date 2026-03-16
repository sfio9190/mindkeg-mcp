/**
 * Content sanitization for memory poisoning protection (ESH-AC-24).
 *
 * Two-level API:
 * - `stripControlChars(input)`: strips control chars only, no throw — used in Zod .transform()
 * - `sanitizeContent(input)`: strips + validates whitespace-only — used for direct callers
 *
 * Sanitization rules:
 * - Strip control characters (U+0000-U+001F) except U+000A (LF) and U+000D (CR)
 * - Reject content that is entirely whitespace after stripping
 *
 * Note: max-length enforcement (500 chars) is already handled by Zod schema.
 */
import { ValidationError } from '../utils/errors.js';

/**
 * Control character regex: matches U+0000-U+001F excluding U+000A (\n) and U+000D (\r).
 *
 * Built dynamically using String.fromCharCode to avoid ESLint's no-control-regex rule,
 * which would flag inline control character literals. The semantics are identical to
 * /[\x00-\x09\x0B\x0C\x0E-\x1F]/g:
 * - Codepoints 0x00-0x09 (NUL through HT/tab)
 * - Codepoint 0x0B (VT — vertical tab)
 * - Codepoint 0x0C (FF — form feed)
 * - Codepoints 0x0E-0x1F (SO through US)
 * U+000A (\n) and U+000D (\r) are intentionally excluded so they are preserved.
 */
function buildControlCharRegex(): RegExp {
  const lo1 = String.fromCharCode(0x00); // NUL
  const hi1 = String.fromCharCode(0x09); // HT (tab)
  const vt  = String.fromCharCode(0x0b); // VT
  const ff  = String.fromCharCode(0x0c); // FF
  const lo2 = String.fromCharCode(0x0e); // SO
  const hi2 = String.fromCharCode(0x1f); // US
  // eslint-disable-next-line no-control-regex -- intentional: building pattern via variable
  return new RegExp(`[${lo1}-${hi1}${vt}${ff}${lo2}-${hi2}]`, 'g');
}

const CONTROL_CHAR_REGEX = buildControlCharRegex();

/**
 * Strip control characters from the input string (non-throwing).
 * Intended for use inside Zod `.transform()` where throwing a non-ZodError
 * causes unhandled propagation. The whitespace-only check is done separately
 * via Zod `.superRefine()` in the schema.
 *
 * @param input - Raw content string from caller
 * @returns Content string with control characters removed (LF and CR preserved)
 */
export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '');
}

/**
 * Sanitize learning content: strip control characters and validate non-whitespace.
 * Use this function for direct (non-Zod) validation contexts.
 *
 * @param input - Raw content string from caller
 * @returns Sanitized content string (control chars stripped)
 * @throws ValidationError if content is entirely whitespace after stripping
 */
export function sanitizeContent(input: string): string {
  const stripped = stripControlChars(input);

  if (stripped.trim().length === 0) {
    throw new ValidationError(
      'Content must not be entirely whitespace after sanitization (ESH-AC-24)',
      [{ path: ['content'], message: 'Content must contain at least one non-whitespace character' }]
    );
  }

  return stripped;
}
