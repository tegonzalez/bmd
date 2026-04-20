/**
 * Glyph Map Coverage Tests
 *
 * Verifies that every UnicodeCategory has non-empty glyph coverage
 * in both 'utf8' and 'ascii' modes, using representative codepoints
 * from each category.
 */

import { test, expect, describe } from 'bun:test';
import { getGlyph, getAsciiGlyph, getTooltip } from '../../../src/unicode/glyph-map';
import type { UnicodeCategory, GlyphMode } from '../../../src/unicode/types';

/**
 * Representative codepoints for each of the 15 scanner categories.
 * Each entry maps a UnicodeCategory to one or more representative codepoints.
 */
const CATEGORY_REPRESENTATIVES: Record<UnicodeCategory, number[]> = {
  'zero-width':      [0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF],
  'bidi':            [0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069],
  'tag':             [0xE0001, 0xE0020, 0xE007F],
  'c0-control':      [0x0000, 0x0001, 0x0007, 0x001F, 0x007F],
  'c1-control':      [0x0080, 0x0085, 0x009F],
  'ansi-escape':     [], // ANSI escapes are multi-byte; scanner handles glyph creation. Test separately.
  'whitespace':      [0x00A0, 0x2000, 0x2003, 0x3000, 0x202F],
  'pua':             [0xE000, 0xE100, 0xF000],
  'ai-watermark':    [0xE200, 0xE201, 0xE202],
  'variation-sel':   [0xFE00, 0xFE0F],
  'annotation':      [0xFFF9, 0xFFFA, 0xFFFB],
  'deprecated':      [0x206A, 0x206F],
  'noncharacter':    [0xFFFC, 0xFFFE, 0xFFFF, 0xFDD0],
  'separator':       [0x2028, 0x2029],
  'combining-flood': [], // combining-flood glyphs are created by the scanner with count suffix
  'unclassified':    [0x2014, 0x00E9, 0x4E16], // catch-all: em dash, accented e, CJK
};

const ALL_CATEGORIES: UnicodeCategory[] = [
  'zero-width', 'bidi', 'tag', 'c0-control', 'c1-control',
  'ansi-escape', 'whitespace', 'pua', 'ai-watermark', 'variation-sel',
  'annotation', 'deprecated', 'noncharacter', 'separator', 'combining-flood',
  'unclassified',
];

describe('Glyph Map: all 16 categories have non-empty glyphs', () => {
  for (const category of ALL_CATEGORIES) {
    const codepoints = CATEGORY_REPRESENTATIVES[category]!;

    if (codepoints.length === 0) {
      // ansi-escape and combining-flood have dynamic glyphs built by scanner
      test(`${category}: fallback glyph (utf8) is non-empty`, () => {
        const glyph = getGlyph(category, undefined, 'utf8');
        expect(glyph).toBeTruthy();
        expect(glyph.length).toBeGreaterThan(0);
      });

      test(`${category}: fallback glyph (ascii) is non-empty`, () => {
        const glyph = getGlyph(category, undefined, 'ascii');
        expect(glyph).toBeTruthy();
        expect(glyph.length).toBeGreaterThan(0);
      });
      continue;
    }

    for (const cp of codepoints) {
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');

      test(`${category}: U+${hex} utf8 glyph is non-empty`, () => {
        const glyph = getGlyph(category, cp, 'utf8');
        expect(glyph).toBeTruthy();
        expect(glyph.length).toBeGreaterThan(0);
      });

      test(`${category}: U+${hex} ascii glyph is non-empty`, () => {
        const glyph = getGlyph(category, cp, 'ascii');
        expect(glyph).toBeTruthy();
        expect(glyph.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('Glyph Map: getTooltip returns non-empty for all representative codepoints', () => {
  for (const category of ALL_CATEGORIES) {
    const codepoints = CATEGORY_REPRESENTATIVES[category]!;
    for (const cp of codepoints) {
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');
      test(`${category}: U+${hex} tooltip is non-empty`, () => {
        const tooltip = getTooltip(cp);
        expect(tooltip).toBeTruthy();
        expect(tooltip.length).toBeGreaterThan(0);
        // Should start with U+ prefix
        expect(tooltip).toMatch(/^U\+/);
      });
    }
  }
});

describe('Glyph Map: category fallback glyphs (no specific codepoint)', () => {
  for (const category of ALL_CATEGORIES) {
    test(`${category}: fallback utf8 glyph is non-empty`, () => {
      const glyph = getGlyph(category, undefined, 'utf8');
      expect(glyph).toBeTruthy();
      expect(glyph.length).toBeGreaterThan(0);
    });

    test(`${category}: fallback ascii glyph is non-empty`, () => {
      const glyph = getGlyph(category, undefined, 'ascii');
      expect(glyph).toBeTruthy();
      expect(glyph.length).toBeGreaterThan(0);
    });
  }
});

describe('Glyph Map: ascii glyphs are pure ASCII', () => {
  for (const category of ALL_CATEGORIES) {
    const codepoints = CATEGORY_REPRESENTATIVES[category]!;
    const testCps = codepoints.length > 0 ? codepoints : [undefined];

    for (const cp of testCps) {
      const label = cp !== undefined ? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : 'fallback';
      test(`${category}: ${label} ascii glyph contains only ASCII chars`, () => {
        const glyph = getGlyph(category, cp, 'ascii');
        for (let i = 0; i < glyph.length; i++) {
          const code = glyph.charCodeAt(i);
          expect(code).toBeGreaterThanOrEqual(0x20);
          expect(code).toBeLessThanOrEqual(0x7E);
        }
      });
    }
  }
});
