/**
 * Tests for unicode-decoration.ts DOM element creation and plugin behavior.
 *
 * Tests createAtomicElement and createGlyphElement via exported wrappers,
 * and verifies decoration construction options.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';

afterAll(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).HTMLElement;
});
import { Window } from 'happy-dom';
import type { Finding } from '../../src/unicode/types';

// Set up DOM globals before importing the module under test
const window = new Window();
globalThis.document = window.document as any;
globalThis.HTMLElement = window.HTMLElement as any;

// Import after DOM globals are available
const { createAtomicElement, createGlyphElement } = await import(
  '../../src/web/unicode-decoration'
);

/** Helper to create a Finding with defaults. */
function makeFinding(
  opts: Partial<Finding> & Pick<Finding, 'offset' | 'length' | 'category'>,
): Finding {
  return {
    codepoint: 0x200b,
    glyph: '\u2423',
    tooltip: `U+200B Zero Width Space`,
    isAtomic: false,
    ...opts,
  };
}

describe('createGlyphElement', () => {
  test('produces span with correct class and tooltip', () => {
    const finding = makeFinding({
      offset: 0,
      length: 1,
      category: 'zero-width',
      glyph: '\u2423',
      tooltip: 'U+200B Zero Width Space',
    });

    const el = createGlyphElement(finding);

    expect(el.tagName).toBe('SPAN');
    expect(el.className).toBe('bmd-unic bmd-unic-zero-width');
    expect(el.title).toBe('U+200B Zero Width Space');
    expect(el.textContent).toBe('\u2423');
  });

  test('uses finding category for CSS class', () => {
    const finding = makeFinding({
      offset: 0,
      length: 1,
      category: 'bidi',
      glyph: '\u2067',
      tooltip: 'U+202A LRE',
    });

    const el = createGlyphElement(finding);
    expect(el.className).toBe('bmd-unic bmd-unic-bidi');
  });
});

describe('createAtomicElement', () => {
  test('produces span with correct class, title, and data attributes', () => {
    const findings = [
      makeFinding({
        offset: 5,
        length: 1,
        category: 'ansi-escape',
        glyph: 'ESC',
        tooltip: 'U+001B Escape',
        isAtomic: true,
        atomicGroupId: 0,
      }),
      makeFinding({
        offset: 6,
        length: 3,
        category: 'ansi-escape',
        glyph: '[31m',
        tooltip: 'ANSI SGR Red',
        isAtomic: true,
        atomicGroupId: 0,
      }),
    ];

    const el = createAtomicElement(findings, 6, 10);

    expect(el.tagName).toBe('SPAN');
    expect(el.className).toBe('bmd-unic bmd-unic-ansi-escape bmd-unic-atomic');
    expect(el.title).toBe('U+001B Escape, ANSI SGR Red');
    expect(el.textContent).toBe('ESC[31m');
    expect(el.dataset.from).toBe('6');
    expect(el.dataset.to).toBe('10');
  });

  test('uses first finding category for the class', () => {
    const findings = [
      makeFinding({
        offset: 0,
        length: 1,
        category: 'c0-control',
        isAtomic: true,
        atomicGroupId: 1,
      }),
    ];

    const el = createAtomicElement(findings, 1, 2);
    expect(el.className).toContain('bmd-unic-c0-control');
    expect(el.className).toContain('bmd-unic-atomic');
  });

  test('atomic group decorations span the full from..to range via data attributes', () => {
    const findings = [
      makeFinding({
        offset: 10,
        length: 1,
        category: 'ansi-escape',
        isAtomic: true,
        atomicGroupId: 2,
      }),
      makeFinding({
        offset: 11,
        length: 5,
        category: 'ansi-escape',
        isAtomic: true,
        atomicGroupId: 2,
      }),
    ];

    const el = createAtomicElement(findings, 11, 17);

    // data-from and data-to should span the full range
    expect(el.dataset.from).toBe('11');
    expect(el.dataset.to).toBe('17');
  });

  test('joins multiple glyphs and tooltips', () => {
    const findings = [
      makeFinding({
        offset: 0,
        length: 1,
        category: 'tag',
        glyph: 'A',
        tooltip: 'Tag A',
        isAtomic: true,
      }),
      makeFinding({
        offset: 1,
        length: 1,
        category: 'tag',
        glyph: 'B',
        tooltip: 'Tag B',
        isAtomic: true,
      }),
      makeFinding({
        offset: 2,
        length: 1,
        category: 'tag',
        glyph: 'C',
        tooltip: 'Tag C',
        isAtomic: true,
      }),
    ];

    const el = createAtomicElement(findings, 1, 4);
    expect(el.textContent).toBe('ABC');
    expect(el.title).toBe('Tag A, Tag B, Tag C');
  });
});
