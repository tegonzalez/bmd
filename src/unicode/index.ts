/**
 * Unicode Scanner Module
 *
 * Detects invisible, non-rendering, and ambiguous Unicode characters
 * in source text and produces findings with replacement glyphs.
 */

export { scanUnicode } from './scanner';
export { classifyCodepoint, isCombiningMark } from './categories';
export { getGlyph, getAsciiGlyph, getTooltip } from './glyph-map';
export { isPassThrough } from './context';

export { aggregateFindings } from './aggregator';
export type { UnicodeCategory, Finding, GlyphMode } from './types';
