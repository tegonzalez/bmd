/**
 * Context-Aware Pass-Through Logic
 *
 * Determines whether a detected codepoint should be passed through
 * (not flagged) based on surrounding context. Implements UTS #39
 * Section 4 joiner context rules.
 */

// Emoji detection using Unicode property escapes
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const EMOJI_MODIFIER = /\p{Emoji_Modifier}/u;

// CJK script detection
const CJK_SCRIPT = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u;

/**
 * Check if a codepoint at the given offset should be passed through
 * (not flagged) based on surrounding context.
 *
 * @param source  The full source string
 * @param offset  UTF-16 offset of the codepoint in question
 * @param codepoint  The codepoint value
 * @returns true if the codepoint should NOT be flagged
 */
export function isPassThrough(source: string, offset: number, codepoint: number): boolean {
  // TAB, LF, CR always pass through
  if (codepoint === 0x0009 || codepoint === 0x000A || codepoint === 0x000D) return true;

  // Standard ASCII printable (U+0020-U+007E) always pass through
  if (codepoint >= 0x0020 && codepoint <= 0x007E) return true;

  // BOM at offset 0 passes through
  if (codepoint === 0xFEFF && offset === 0) return true;

  // ZWJ (U+200D) in emoji context passes through
  if (codepoint === 0x200D) {
    return isEmojiZWJ(source, offset);
  }

  // ZWNJ (U+200C) in joining script context passes through
  if (codepoint === 0x200C) {
    return isJoiningZWNJ(source, offset);
  }

  // Variation selectors on emoji base pass through
  if (codepoint >= 0xFE00 && codepoint <= 0xFE0F) {
    return isVSOnEmojiBase(source, offset);
  }

  // Ideographic Space (U+3000) in CJK context passes through
  if (codepoint === 0x3000) {
    return isIdeoSpaceInCJKContext(source, offset);
  }

  return false;
}

/**
 * Check if ZWJ at offset is between emoji characters (emoji ZWJ sequence).
 */
function isEmojiZWJ(source: string, zwjOffset: number): boolean {
  const before = getCodepointBefore(source, zwjOffset);
  if (!before) return false;

  const beforeChar = String.fromCodePoint(before.codepoint);
  // Check if preceding char is emoji presentation, extended pictographic, or emoji modifier
  const isBeforeEmoji =
    EMOJI_PRESENTATION.test(beforeChar) ||
    EXTENDED_PICTOGRAPHIC.test(beforeChar) ||
    EMOJI_MODIFIER.test(beforeChar);

  if (!isBeforeEmoji) return false;

  // ZWJ is 1 UTF-16 code unit
  const after = getCodepointAfter(source, zwjOffset + 1);
  if (!after) return false;

  const afterChar = String.fromCodePoint(after.codepoint);
  return EMOJI_PRESENTATION.test(afterChar) || EXTENDED_PICTOGRAPHIC.test(afterChar);
}

/**
 * Check if ZWNJ is between joining-script characters.
 * Simplified UTS #39 check: ZWNJ between chars from joining scripts (Arabic, Devanagari, etc.)
 */
function isJoiningZWNJ(source: string, zwnjOffset: number): boolean {
  const before = getCodepointBefore(source, zwnjOffset);
  if (!before) return false;

  const after = getCodepointAfter(source, zwnjOffset + 1);
  if (!after) return false;

  const beforeChar = String.fromCodePoint(before.codepoint);
  const afterChar = String.fromCodePoint(after.codepoint);

  // Check if both neighbors are from joining scripts
  const JOINING_SCRIPT = /\p{Script=Arabic}|\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Gujarati}|\p{Script=Gurmukhi}|\p{Script=Kannada}|\p{Script=Malayalam}|\p{Script=Oriya}|\p{Script=Tamil}|\p{Script=Telugu}|\p{Script=Sinhala}/u;

  return JOINING_SCRIPT.test(beforeChar) && JOINING_SCRIPT.test(afterChar);
}

/**
 * Check if a variation selector is modifying an emoji base character.
 */
function isVSOnEmojiBase(source: string, vsOffset: number): boolean {
  const before = getCodepointBefore(source, vsOffset);
  if (!before) return false;

  const beforeChar = String.fromCodePoint(before.codepoint);
  return EMOJI_PRESENTATION.test(beforeChar) || EXTENDED_PICTOGRAPHIC.test(beforeChar);
}

/**
 * Check if Ideographic Space (U+3000) is in CJK context.
 */
function isIdeoSpaceInCJKContext(source: string, offset: number): boolean {
  const before = getCodepointBefore(source, offset);
  const after = getCodepointAfter(source, offset + 1); // U+3000 is 1 UTF-16 unit

  const hasCJKBefore = before && CJK_SCRIPT.test(String.fromCodePoint(before.codepoint));
  const hasCJKAfter = after && CJK_SCRIPT.test(String.fromCodePoint(after.codepoint));

  return !!(hasCJKBefore || hasCJKAfter);
}

/**
 * Get the codepoint immediately before the given UTF-16 offset.
 */
function getCodepointBefore(source: string, offset: number): { codepoint: number; charLen: number } | null {
  if (offset <= 0) return null;

  // Check for surrogate pair (supplementary plane)
  const lo = source.charCodeAt(offset - 1);
  if (lo >= 0xDC00 && lo <= 0xDFFF && offset >= 2) {
    const hi = source.charCodeAt(offset - 2);
    if (hi >= 0xD800 && hi <= 0xDBFF) {
      const cp = (hi - 0xD800) * 0x400 + (lo - 0xDC00) + 0x10000;
      return { codepoint: cp, charLen: 2 };
    }
  }

  const cp = source.charCodeAt(offset - 1);
  return { codepoint: cp, charLen: 1 };
}

/**
 * Get the codepoint at the given UTF-16 offset.
 */
function getCodepointAfter(source: string, offset: number): { codepoint: number; charLen: number } | null {
  if (offset >= source.length) return null;

  const cp = source.codePointAt(offset);
  if (cp === undefined) return null;

  return { codepoint: cp, charLen: cp > 0xFFFF ? 2 : 1 };
}
