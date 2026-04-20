/**
 * Unicode Scanner Types
 *
 * Core types for the invisible Unicode detection engine.
 * The scanner produces Finding[] which downstream renderers consume
 * to splice glyph substitutions into their output.
 */

/** Glyph rendering mode */
export type GlyphMode = 'utf8' | 'ascii';

/** All detectable Unicode categories */
export type UnicodeCategory =
  | 'zero-width'      // ZWSP, WJ, BOM (not at offset 0)
  | 'bidi'            // LRO, RLO, LRE, RLE, PDF, LRM, RLM, isolates
  | 'tag'             // U+E0001-E007F
  | 'c0-control'      // U+0000-001F (except TAB/LF/CR), U+007F
  | 'c1-control'      // U+0080-009F
  | 'ansi-escape'     // ESC + sequence (atomic)
  | 'whitespace'      // NBSP, en/em space, ideographic space, etc.
  | 'pua'             // Private Use Area (general, not AI watermark)
  | 'ai-watermark'    // U+E200-E2FF (PUA sub-range)
  | 'variation-sel'   // VS1-VS256
  | 'annotation'      // Interlinear annotation U+FFF9-FFFB
  | 'deprecated'      // U+206A-206F
  | 'noncharacter'    // U+FFFE, FFFF, FDD0-FDEF
  | 'separator'       // U+2028, U+2029
  | 'combining-flood'  // 3+ combining marks on one base
  | 'unclassified';    // catch-all: any non-ASCII codepoint not in a specific category

/** A single detection finding from the scanner */
export interface Finding {
  /** UTF-16 code unit offset in source string */
  offset: number;
  /** Length in UTF-16 code units */
  length: number;
  /** Detection category */
  category: UnicodeCategory;
  /** The raw codepoint value (first codepoint of the finding) */
  codepoint: number;
  /** Replacement glyph string for rendering */
  glyph: string;
  /** Tooltip text, e.g. "U+200B Zero Width Space" */
  tooltip: string;
  /** Whether this finding is part of an atomic region */
  isAtomic: boolean;
  /** Groups findings into atomic regions (shared ID) */
  atomicGroupId?: number;
}
