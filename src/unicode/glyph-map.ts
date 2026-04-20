/**
 * Unicode Glyph Map
 *
 * Maps detection categories and specific codepoints to their replacement glyphs
 * and tooltip text. All mappings derived from docs/unicode-mappings.md.
 */

import type { UnicodeCategory, GlyphMode } from './types';

// --- C0 Control Picture Glyphs (U+2400-U+2421) ---
// Each C0 control has a dedicated Unicode Control Picture glyph
const C0_GLYPHS: Record<number, string> = {
  0x0000: '\u2400', // ␀ NUL
  0x0001: '\u2401', // ␁ SOH
  0x0002: '\u2402', // ␂ STX
  0x0003: '\u2403', // ␃ ETX
  0x0004: '\u2404', // ␄ EOT
  0x0005: '\u2405', // ␅ ENQ
  0x0006: '\u2406', // ␆ ACK
  0x0007: '\u2407', // ␇ BEL
  0x0008: '\u2408', // ␈ BS
  // 0x0009 TAB - pass-through
  // 0x000A LF  - pass-through
  0x000B: '\u240B', // ␋ VT
  0x000C: '\u240C', // ␌ FF
  // 0x000D CR  - pass-through
  0x000E: '\u240E', // ␎ SO
  0x000F: '\u240F', // ␏ SI
  0x0010: '\u2410', // ␐ DLE
  0x0011: '\u2411', // ␑ DC1
  0x0012: '\u2412', // ␒ DC2
  0x0013: '\u2413', // ␓ DC3
  0x0014: '\u2414', // ␔ DC4
  0x0015: '\u2415', // ␕ NAK
  0x0016: '\u2416', // ␖ SYN
  0x0017: '\u2417', // ␗ ETB
  0x0018: '\u2418', // ␘ CAN
  0x0019: '\u2419', // ␙ EM
  0x001A: '\u241A', // ␚ SUB
  0x001B: '\u241B', // ␛ ESC
  0x001C: '\u241C', // ␜ FS
  0x001D: '\u241D', // ␝ GS
  0x001E: '\u241E', // ␞ RS
  0x001F: '\u241F', // ␟ US
  0x007F: '\u2421', // ␡ DEL
};

// --- C0 Control Names ---
const C0_NAMES: Record<number, string> = {
  0x0000: 'NUL',  0x0001: 'SOH',  0x0002: 'STX',  0x0003: 'ETX',
  0x0004: 'EOT',  0x0005: 'ENQ',  0x0006: 'ACK',  0x0007: 'BEL',
  0x0008: 'BS',   0x000B: 'VT',   0x000C: 'FF',   0x000E: 'SO',
  0x000F: 'SI',   0x0010: 'DLE',  0x0011: 'DC1',  0x0012: 'DC2',
  0x0013: 'DC3',  0x0014: 'DC4',  0x0015: 'NAK',  0x0016: 'SYN',
  0x0017: 'ETB',  0x0018: 'CAN',  0x0019: 'EM',   0x001A: 'SUB',
  0x001B: 'ESC',  0x001C: 'FS',   0x001D: 'GS',   0x001E: 'RS',
  0x001F: 'US',   0x007F: 'DEL',
};

// --- Zero-Width Glyphs ---
const ZERO_WIDTH_GLYPHS: Record<number, string> = {
  0x200B: '\u2423', // ␣ ZWSP
  0x200C: '\u2039\u2044\u203A', // ‹⁄› ZWNJ
  0x200D: '\u2295', // ⊕ ZWJ
  0x2060: '\u22B9', // ⊹ WJ
  0xFEFF: '\u234A', // ⍊ BOM/ZWNBSP
};

const ZERO_WIDTH_NAMES: Record<number, string> = {
  0x200B: 'Zero Width Space',
  0x200C: 'Zero Width Non-Joiner',
  0x200D: 'Zero Width Joiner',
  0x2060: 'Word Joiner',
  0xFEFF: 'Byte Order Mark',
};

// --- Bidi Glyphs ---
const BIDI_GLYPHS: Record<number, string> = {
  0x200E: '\u22B3',     // ⊳ LRM
  0x200F: '\u22B2',     // ⊲ RLM
  0x202A: '\u22B3\u22B3', // ⊳⊳ LRE
  0x202B: '\u22B2\u22B2', // ⊲⊲ RLE
  0x202C: '\u2298',     // ⊘ PDF
  0x202D: '\u22B3!',    // ⊳! LRO
  0x202E: '\u22B2!',    // ⊲! RLO
  0x2066: '\u22B3\u20DD', // ⊳⃝ LRI
  0x2067: '\u22B2\u20DD', // ⊲⃝ RLI
  0x2068: '\u2299',     // ⊙ FSI
  0x2069: '\u229D',     // ⊝ PDI
};

const BIDI_NAMES: Record<number, string> = {
  0x200E: 'Left-to-Right Mark',
  0x200F: 'Right-to-Left Mark',
  0x202A: 'Left-to-Right Embedding',
  0x202B: 'Right-to-Left Embedding',
  0x202C: 'Pop Directional Formatting',
  0x202D: 'Left-to-Right Override',
  0x202E: 'Right-to-Left Override',
  0x2066: 'Left-to-Right Isolate',
  0x2067: 'Right-to-Left Isolate',
  0x2068: 'First Strong Isolate',
  0x2069: 'Pop Directional Isolate',
};

// --- Annotation Glyphs ---
const ANNOTATION_GLYPHS: Record<number, string> = {
  0xFFF9: '\u27E6\u2090\u27E7', // ⟦ₐ⟧
  0xFFFA: '\u27E6\u209B\u27E7', // ⟦ₛ⟧
  0xFFFB: '\u27E6\u209C\u27E7', // ⟦ₜ⟧
};

const ANNOTATION_NAMES: Record<number, string> = {
  0xFFF9: 'Interlinear Annotation Anchor',
  0xFFFA: 'Interlinear Annotation Separator',
  0xFFFB: 'Interlinear Annotation Terminator',
};

// --- Whitespace Names ---
const WHITESPACE_NAMES: Record<number, string> = {
  0x00A0: 'No-Break Space',
  0x1680: 'Ogham Space Mark',
  0x2000: 'En Quad',
  0x2001: 'Em Quad',
  0x2002: 'En Space',
  0x2003: 'Em Space',
  0x2004: 'Three-Per-Em Space',
  0x2005: 'Four-Per-Em Space',
  0x2006: 'Six-Per-Em Space',
  0x2007: 'Figure Space',
  0x2008: 'Punctuation Space',
  0x2009: 'Thin Space',
  0x200A: 'Hair Space',
  0x202F: 'Narrow No-Break Space',
  0x205F: 'Medium Mathematical Space',
  0x3000: 'Ideographic Space',
};

// --- Separator Names ---
const SEPARATOR_NAMES: Record<number, string> = {
  0x2028: 'Line Separator',
  0x2029: 'Paragraph Separator',
};

const SEPARATOR_GLYPHS: Record<number, string> = {
  0x2028: '\u2424', // ␤
  0x2029: '\u00B6', // ¶
};

// --- Special Noncharacter Names ---
const NONCHARACTER_NAMES: Record<number, string> = {
  0xFFFC: 'Object Replacement Character',
  0xFFFE: 'Noncharacter (BOM reversed)',
  0xFFFF: 'Noncharacter',
};

// --- AI Watermark Glyphs ---
const AI_WATERMARK_GLYPHS: Record<number, string> = {
  0xE200: '\u231C', // ⌜ opener
  0xE201: '\u231F', // ⌟ closer
  0xE202: '\u2219', // ∙ bullet operator (NOT U+00B7 per user decision)
};

// --- ASCII Glyph Maps (per docs/unicode-mappings.md ASCII column) ---
const C0_ASCII: Record<number, string> = {
  0x0000: '[NUL]', 0x0001: '[SOH]', 0x0002: '[STX]', 0x0003: '[ETX]',
  0x0004: '[EOT]', 0x0005: '[ENQ]', 0x0006: '[ACK]', 0x0007: '[BEL]',
  0x0008: '[BS]',  0x000B: '[VT]',  0x000C: '[FF]',  0x000E: '[SO]',
  0x000F: '[SI]',  0x0010: '[DLE]', 0x0011: '[DC1]', 0x0012: '[DC2]',
  0x0013: '[DC3]', 0x0014: '[DC4]', 0x0015: '[NAK]', 0x0016: '[SYN]',
  0x0017: '[ETB]', 0x0018: '[CAN]', 0x0019: '[EM]',  0x001A: '[SUB]',
  0x001B: '[ESC]', 0x001C: '[FS]',  0x001D: '[GS]',  0x001E: '[RS]',
  0x001F: '[US]',  0x007F: '[DEL]',
};

const ZERO_WIDTH_ASCII: Record<number, string> = {
  0x200B: '[ZWSP]',
  0x200C: '[ZWNJ]',
  0x200D: '[ZWJ]',
  0x2060: '[WJ]',
  0xFEFF: '[BOM]',
};

const BIDI_ASCII: Record<number, string> = {
  0x200E: '[LRM]',
  0x200F: '[RLM]',
  0x202A: '[LRE]',
  0x202B: '[RLE]',
  0x202C: '[PDF]',
  0x202D: '[LRO]',
  0x202E: '[RLO]',
  0x2066: '[LRI]',
  0x2067: '[RLI]',
  0x2068: '[FSI]',
  0x2069: '[PDI]',
};

const ANNOTATION_ASCII: Record<number, string> = {
  0xFFF9: '[ANN<]',
  0xFFFA: '[ANN|]',
  0xFFFB: '[ANN>]',
};

const SEPARATOR_ASCII: Record<number, string> = {
  0x2028: '[LS]',
  0x2029: '[PS]',
};

const AI_WATERMARK_ASCII: Record<number, string> = {
  0xE200: '[AI<]',
  0xE201: '[AI>]',
  0xE202: '[AI.]',
};

/**
 * Get the ASCII-safe replacement glyph for a detected codepoint.
 * All output bytes are in the ASCII range (U+0020-U+007E).
 */
export function getAsciiGlyph(category: UnicodeCategory, codepoint?: number): string {
  switch (category) {
    case 'c0-control':
      return (codepoint !== undefined && C0_ASCII[codepoint]!) || '[C0]';
    case 'c1-control':
      return '[C1]';
    case 'zero-width':
      return (codepoint !== undefined && ZERO_WIDTH_ASCII[codepoint]!) || '[ZW]';
    case 'bidi':
      return (codepoint !== undefined && BIDI_ASCII[codepoint]!) || '[BIDI]';
    case 'whitespace':
      if (codepoint === 0x00A0 || codepoint === 0x202F) return '[NBSP]';
      return '[WSP]';
    case 'tag':
      if (codepoint === 0xE007F) return '[/TAG]';
      return '[TAG]';
    case 'ai-watermark':
      if (codepoint !== undefined && AI_WATERMARK_ASCII[codepoint]!) {
        return AI_WATERMARK_ASCII[codepoint]!;
      }
      return '[AI?]';
    case 'pua':
      return '[PUA]';
    case 'variation-sel':
      return '[VS]';
    case 'annotation':
      return (codepoint !== undefined && ANNOTATION_ASCII[codepoint]!) || '[ANN]';
    case 'deprecated':
      return '[DEP]';
    case 'noncharacter':
      if (codepoint === 0xFFFC) return '[OBJ]';
      return '[NUL]';
    case 'separator':
      return (codepoint !== undefined && SEPARATOR_ASCII[codepoint]!) || '[SEP]';
    case 'ansi-escape':
      return '[ESC]';
    case 'combining-flood':
      return '[Mn]';
    case 'unclassified': {
      if (codepoint !== undefined) {
        const hex = codepoint.toString(16).toUpperCase().padStart(4, '0');
        return `[U+${hex}]`;
      }
      return '[?]';
    }
    default:
      return '[?]';
  }
}

/**
 * Get the replacement glyph for a detected codepoint.
 */
export function getGlyph(category: UnicodeCategory, codepoint?: number, mode: GlyphMode = 'utf8'): string {
  if (mode === 'ascii') return getAsciiGlyph(category, codepoint);
  switch (category) {
    case 'c0-control':
      return (codepoint !== undefined && C0_GLYPHS[codepoint]!) || '\u2400';

    case 'c1-control':
      return '\u2327'; // ⌧ shared glyph for all C1 controls

    case 'zero-width':
      return (codepoint !== undefined && ZERO_WIDTH_GLYPHS[codepoint]!) || '\u2423';

    case 'bidi':
      return (codepoint !== undefined && BIDI_GLYPHS[codepoint]!) || '\u2298';

    case 'whitespace':
      // NBSP and Narrow NBSP use ⍽; all others use ␣
      if (codepoint === 0x00A0 || codepoint === 0x202F) return '\u237D'; // ⍽
      return '\u2423'; // ␣

    case 'tag':
      // Cancel Tag gets special glyph
      if (codepoint === 0xE007F) return '\uD83C\uDFF7\u2298'; // 🏷⊘
      return '\uD83C\uDFF7'; // 🏷

    case 'ai-watermark':
      if (codepoint !== undefined && AI_WATERMARK_GLYPHS[codepoint]!) {
        return AI_WATERMARK_GLYPHS[codepoint]!;
      }
      return '\u25C7'; // ◇ diamond for unobserved watermark codepoints

    case 'pua':
      return '\u27D0'; // ⟐

    case 'variation-sel':
      return '\u2B21'; // ⬡

    case 'annotation':
      return (codepoint !== undefined && ANNOTATION_GLYPHS[codepoint]!) || '\u27E6\u27E7';

    case 'deprecated':
      return '\u2298'; // ⊘

    case 'noncharacter':
      if (codepoint === 0xFFFC) return '\u2395'; // ⎕ Object Replacement Character
      return '\u2298'; // ⊘

    case 'separator':
      return (codepoint !== undefined && SEPARATOR_GLYPHS[codepoint]!) || '\u2424';

    case 'ansi-escape':
      return '\u241B'; // ␛ (base glyph; scanner appends params)

    case 'combining-flood':
      return '\u25CC'; // ◌ (base glyph; aggregator appends count)

    case 'unclassified':
      // Pass-through: return the original character in UTF-8 mode
      if (codepoint !== undefined) return String.fromCodePoint(codepoint);
      return '\u2298'; // ⊘ fallback

    default:
      return '\u2298'; // ⊘ fallback
  }
}

/**
 * Get tooltip text for a codepoint: "U+XXXX Name"
 */
export function getTooltip(codepoint: number): string {
  const hex = codepoint.toString(16).toUpperCase().padStart(4, '0');
  const prefix = codepoint > 0xFFFF ? `U+${hex}` : `U+${hex}`;

  // Check specific name maps
  const name =
    C0_NAMES[codepoint]! ||
    ZERO_WIDTH_NAMES[codepoint]! ||
    BIDI_NAMES[codepoint]! ||
    ANNOTATION_NAMES[codepoint]! ||
    WHITESPACE_NAMES[codepoint]! ||
    SEPARATOR_NAMES[codepoint]! ||
    NONCHARACTER_NAMES[codepoint]! ||
    getCategoryName(codepoint);

  return `${prefix} ${name}`;
}

/**
 * Derive a generic name for codepoints not in our specific name maps.
 */
function getCategoryName(cp: number): string {
  // AI watermarks
  if (cp === 0xE200) return 'AI Watermark Opener';
  if (cp === 0xE201) return 'AI Watermark Closer';
  if (cp === 0xE202) return 'AI Watermark Separator';
  if (cp >= 0xE203 && cp <= 0xE2FF) return 'AI Watermark';

  // C1 controls
  if (cp >= 0x0080 && cp <= 0x009F) return 'C1 Control';

  // Deprecated
  if (cp >= 0x206A && cp <= 0x206F) return 'Deprecated Format Character';

  // Tags
  if (cp >= 0xE0000 && cp <= 0xE007F) return 'Tag Character';

  // Variation selectors
  if (cp >= 0xFE00 && cp <= 0xFE0F) return `Variation Selector ${cp - 0xFE00 + 1}`;
  if (cp >= 0xE0100 && cp <= 0xE01EF) return `Variation Selector ${cp - 0xE0100 + 17}`;

  // Noncharacters
  if (cp >= 0xFDD0 && cp <= 0xFDEF) return 'Noncharacter';
  if (cp === 0xFFFE || cp === 0xFFFF) return 'Noncharacter';

  // PUA ranges
  if (cp >= 0xE000 && cp <= 0xF8FF) return 'Private Use Character';
  if (cp >= 0xF0000 && cp <= 0xFFFFD) return 'Supplementary Private Use A';
  if (cp >= 0x100000 && cp <= 0x10FFFD) return 'Supplementary Private Use B';

  return 'Unicode Character';
}
