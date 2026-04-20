/**
 * Unicode Codepoint Classification
 *
 * Classifies individual codepoints into detection categories.
 * Uses hard-coded ranges for bmd-specific sub-categorization
 * and Unicode property escapes for general category checks.
 */

import type { UnicodeCategory } from './types';

// Regex testers using Unicode property escapes
const IS_FORMAT_CHAR = /^\p{gc=Cf}$/u;
const IS_CONTROL_CHAR = /^\p{gc=Cc}$/u;
const IS_PRIVATE_USE = /^\p{gc=Co}$/u;
const IS_NONSPACING_MARK = /^\p{gc=Mn}$/u;

/**
 * Classify a single codepoint into a UnicodeCategory.
 * Returns null if the codepoint should not be flagged (standard visible chars, TAB/LF/CR).
 *
 * Note: Context-aware pass-through (emoji ZWJ, CJK space, BOM at 0) is handled
 * separately by isPassThrough() in context.ts -- this function only does raw classification.
 */
export function classifyCodepoint(cp: number): UnicodeCategory | null {
  // TAB, LF, CR are always pass-through (handled here for speed)
  if (cp === 0x0009 || cp === 0x000A || cp === 0x000D) return null;

  // Standard ASCII printable range: pass-through
  if (cp >= 0x0020 && cp <= 0x007E) return null;

  // --- C0 controls (U+0000-001F except TAB/LF/CR, plus U+007F DEL) ---
  if (cp <= 0x001F || cp === 0x007F) return 'c0-control';

  // --- C1 controls (U+0080-009F) ---
  if (cp >= 0x0080 && cp <= 0x009F) return 'c1-control';

  // --- Zero-width characters ---
  if (cp === 0x200B) return 'zero-width'; // ZWSP
  if (cp === 0x200C) return 'zero-width'; // ZWNJ
  if (cp === 0x200D) return 'zero-width'; // ZWJ
  if (cp === 0x2060) return 'zero-width'; // Word Joiner
  if (cp === 0xFEFF) return 'zero-width'; // BOM / ZWNBSP

  // --- Bidi marks ---
  if (cp === 0x200E || cp === 0x200F) return 'bidi'; // LRM, RLM

  // --- Bidi overrides and embeddings (U+202A-202E) ---
  if (cp >= 0x202A && cp <= 0x202E) return 'bidi';

  // --- Bidi isolates (U+2066-2069) ---
  if (cp >= 0x2066 && cp <= 0x2069) return 'bidi';

  // --- Deprecated format chars (U+206A-206F) ---
  if (cp >= 0x206A && cp <= 0x206F) return 'deprecated';

  // --- Whitespace lookalikes ---
  if (cp === 0x00A0) return 'whitespace'; // NBSP
  if (cp === 0x1680) return 'whitespace'; // Ogham Space Mark
  if (cp >= 0x2000 && cp <= 0x200A) return 'whitespace'; // En Quad through Hair Space
  if (cp === 0x202F) return 'whitespace'; // Narrow No-Break Space
  if (cp === 0x205F) return 'whitespace'; // Medium Mathematical Space
  if (cp === 0x3000) return 'whitespace'; // Ideographic Space

  // --- Line/Paragraph separators ---
  if (cp === 0x2028 || cp === 0x2029) return 'separator';

  // --- Interlinear annotations ---
  if (cp >= 0xFFF9 && cp <= 0xFFFB) return 'annotation';

  // --- Noncharacters ---
  if (cp === 0xFFFE || cp === 0xFFFF) return 'noncharacter';
  if (cp >= 0xFDD0 && cp <= 0xFDEF) return 'noncharacter';

  // --- Object Replacement and Replacement Character ---
  // U+FFFC and U+FFFD are visible special chars; FFFC gets noncharacter treatment
  if (cp === 0xFFFC) return 'noncharacter';

  // --- Variation selectors (BMP: U+FE00-FE0F) ---
  if (cp >= 0xFE00 && cp <= 0xFE0F) return 'variation-sel';

  // --- AI Watermark (PUA sub-range U+E200-E2FF) ---
  if (cp >= 0xE200 && cp <= 0xE2FF) return 'ai-watermark';

  // --- BMP PUA (U+E000-E1FF, U+E300-F8FF) ---
  if (cp >= 0xE000 && cp <= 0xE1FF) return 'pua';
  if (cp >= 0xE300 && cp <= 0xF8FF) return 'pua';

  // --- Supplementary plane checks ---

  // Tag characters (U+E0000-E007F)
  if (cp >= 0xE0000 && cp <= 0xE007F) return 'tag';

  // Supplementary variation selectors (U+E0100-E01EF)
  if (cp >= 0xE0100 && cp <= 0xE01EF) return 'variation-sel';

  // Supplementary PUA-A (U+F0000-FFFFD)
  if (cp >= 0xF0000 && cp <= 0xFFFFD) return 'pua';

  // Supplementary PUA-B (U+100000-10FFFD)
  if (cp >= 0x100000 && cp <= 0x10FFFD) return 'pua';

  // For remaining codepoints, use Unicode property escapes as fallback
  const ch = String.fromCodePoint(cp);

  // General category checks for anything we might have missed
  if (IS_CONTROL_CHAR.test(ch)) return 'c0-control';
  if (IS_PRIVATE_USE.test(ch)) return 'pua';

  // Not flagged
  return null;
}

/**
 * Check if a codepoint is a combining mark (for flood detection).
 * Used by the aggregator to detect combining mark floods.
 *
 * Excludes variation selectors (U+FE00-FE0F, U+E0100-E01EF) which
 * have gc=Mn but are handled as their own category.
 */
export function isCombiningMark(cp: number): boolean {
  // Exclude variation selectors - they are gc=Mn but have their own category
  if (cp >= 0xFE00 && cp <= 0xFE0F) return false;
  if (cp >= 0xE0100 && cp <= 0xE01EF) return false;
  return IS_NONSPACING_MARK.test(String.fromCodePoint(cp));
}
