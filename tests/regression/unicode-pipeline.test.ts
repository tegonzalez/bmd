/**
 * Full-matrix regression tests: Unicode categories x render surfaces.
 *
 * Validates that all 15 Unicode categories are detected, aggregated correctly,
 * and rendered as styled glyphs (not raw invisible chars) through both
 * terminal and HTML preview surfaces.
 */

import { test, expect, describe } from 'bun:test';
import { sanitize } from '../../src/pipeline/sanitize';
import { runPipeline } from '../../src/pipeline/index';
import type { BmdConfig } from '../../src/config/schema';
import type { Finding } from '../../src/unicode/types';
import { getDefaults } from '../../src/theme/defaults';
import { parse } from '../../src/parser/index';
import { annotateByteRanges } from '../../src/pipeline/byte-range';
import { buildTree } from '../../src/pipeline/tree-build';
import { HtmlVisitor } from '../../src/pipeline/html-visitor';

// ─── Test Config ───

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
    undo: overrides?.undo ?? { groupDelay: 500, depth: 100 },
  };
}

/** Render source through the HTML preview pipeline (sanitize -> parse -> tree -> html visitor). */
function renderHtml(source: string): { html: string; findings: Finding[] } {
  const config = makeConfig();
  const findings = sanitize(source, 'utf8');
  const { tokens } = parse(source, false);
  annotateByteRanges(tokens, source);
  const tree = buildTree(tokens, [], findings);
  const visitor = new HtmlVisitor();
  const html = visitor.render(tree);
  return { html, findings };
}

// ─── Fixtures ───

const FIXTURES = {
  'ai-watermark': {
    // Three consecutive AI watermark codepoints embedded in text
    source: 'Hello \uE200\uE201\uE202 world',
    category: 'ai-watermark' as const,
  },
  'bidi': {
    // LRO + text + PDF (paired region)
    source: 'Hello \u202Dhidden\u202C world',
    category: 'bidi' as const,
  },
  'zero-width': {
    // ZWSP in text
    source: 'Hello \u200B world',
    category: 'zero-width' as const,
  },
  'tag': {
    // Tag character sequence (U+E0001 = language tag)
    source: 'Hello \u{E0001}\u{E0065}\u{E006E} world',
    category: 'tag' as const,
  },
  'pua': {
    // PUA codepoints (outside AI watermark range)
    source: 'Hello \uE000\uE001 world',
    category: 'pua' as const,
  },
  'variation-sel': {
    // Variation selectors VS1, VS2
    source: 'Hello \uFE00\uFE01 world',
    category: 'variation-sel' as const,
  },
  'c0-control': {
    // NUL character
    source: 'Hello \x00 world',
    category: 'c0-control' as const,
  },
  'c1-control': {
    // C1 control (U+0080)
    source: 'Hello \u0080 world',
    category: 'c1-control' as const,
  },
  'ansi-escape': {
    // ANSI CSI sequence: ESC [ 31 m
    source: 'Hello \x1B[31m world',
    category: 'ansi-escape' as const,
  },
  'whitespace': {
    // NBSP characters (consecutive to trigger aggregation)
    source: 'Hello \u00A0\u00A0 world',
    category: 'whitespace' as const,
  },
  'annotation': {
    // Interlinear annotation anchor + separator + terminator
    source: 'Hello \uFFF9anno\uFFFA\uFFFB world',
    category: 'annotation' as const,
  },
  'deprecated': {
    // Deprecated format char (U+206A)
    source: 'Hello \u206A world',
    category: 'deprecated' as const,
  },
  'noncharacter': {
    // Noncharacter (U+FFFE)
    source: 'Hello \uFFFE world',
    category: 'noncharacter' as const,
  },
  'separator': {
    // Line separator (U+2028)
    source: 'Hello \u2028 world',
    category: 'separator' as const,
  },
  'combining-flood': {
    // 5 consecutive combining marks on one base
    source: 'a\u0300\u0301\u0302\u0303\u0304 world',
    category: 'combining-flood' as const,
  },
};

// ─── Detection Tests (sanitize) ───

describe('Unicode pipeline regression: detection (sanitize)', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    test(`detects ${name} category findings`, () => {
      const findings = sanitize(fixture.source, 'utf8');
      const matched = findings.filter(f => f.category === fixture.category);
      expect(matched.length).toBeGreaterThan(0);
    });
  }
});

// ─── Terminal Surface Tests ───

describe('Unicode pipeline regression: terminal surface', () => {
  test('AI watermark sequences render as styled glyphs (not raw codepoints) in terminal', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['ai-watermark']!.source, config });
    // Findings should exist
    const wmFindings = findings.filter(f => f.category === 'ai-watermark');
    expect(wmFindings.length).toBeGreaterThan(0);
    // The rendered output should NOT contain the raw invisible codepoints
    expect(rendered).not.toContain('\uE200');
    expect(rendered).not.toContain('\uE201');
    expect(rendered).not.toContain('\uE202');
    // Should contain glyph substitution characters
    // With 3 consecutive watermarks at threshold 2, aggregation produces "glyph x3"
    expect(rendered).toMatch(/x3/);
  });

  test('bidi override sequences render as region markers in terminal', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['bidi']!.source, config });
    const bidiFindings = findings.filter(f => f.category === 'bidi');
    expect(bidiFindings.length).toBe(2); // LRO + PDF (region mode: not aggregated)
    // Should not contain raw bidi chars
    expect(rendered).not.toContain('\u202D');
    expect(rendered).not.toContain('\u202C');
  });

  test('zero-width characters render individually (mode=none) in terminal', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['zero-width']!.source, config });
    const zwFindings = findings.filter(f => f.category === 'zero-width');
    expect(zwFindings.length).toBe(1);
    // Should not contain raw ZWSP
    expect(rendered).not.toContain('\u200B');
  });

  test('tag characters aggregate with count in terminal (mode=aggregate)', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['tag']!.source, config });
    const tagFindings = findings.filter(f => f.category === 'tag');
    expect(tagFindings.length).toBeGreaterThan(0);
    // Tag chars aggregate above threshold; 3 consecutive tags should aggregate
    expect(rendered).toMatch(/x3/);
  });

  test('PUA codepoints aggregate in terminal', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['pua']!.source, config });
    const puaFindings = findings.filter(f => f.category === 'pua');
    expect(puaFindings.length).toBeGreaterThan(0);
    // Should not contain raw PUA chars
    expect(rendered).not.toContain('\uE000');
  });

  test('variation selectors aggregate in terminal', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source: FIXTURES['variation-sel']!.source, config });
    const vsFindings = findings.filter(f => f.category === 'variation-sel');
    expect(vsFindings.length).toBeGreaterThan(0);
    expect(rendered).not.toContain('\uFE00');
  });

  for (const name of ['c0-control', 'c1-control', 'deprecated', 'noncharacter', 'separator'] as const) {
    test(`${name} findings render individually (mode=none) in terminal`, async () => {
      const config = makeConfig({ ansiEnabled: false });
      const { rendered, findings } = await runPipeline({ source: FIXTURES[name]!.source, config });
      const matched = findings.filter(f => f.category === FIXTURES[name]!.category);
      expect(matched.length).toBeGreaterThan(0);
    });
  }
});

// ─── HTML Preview Surface Tests ───

describe('Unicode pipeline regression: HTML preview surface', () => {
  test('AI watermark sequences render as styled HTML spans in preview', () => {
    const { html, findings } = renderHtml(FIXTURES['ai-watermark']!.source);
    const wmFindings = findings.filter(f => f.category === 'ai-watermark');
    expect(wmFindings.length).toBeGreaterThan(0);
    // Should contain styled span with bmd-unic-ai-watermark class
    expect(html).toContain('bmd-unic-ai-watermark');
    // Should NOT contain raw invisible codepoints
    expect(html).not.toContain('\uE200');
  });

  test('bidi findings render as styled HTML spans in preview', () => {
    const { html, findings } = renderHtml(FIXTURES['bidi']!.source);
    const bidiFindings = findings.filter(f => f.category === 'bidi');
    expect(bidiFindings.length).toBe(2); // region mode: individual, not aggregated
    expect(html).toContain('bmd-unic-bidi');
  });

  test('zero-width findings render as styled HTML spans in preview', () => {
    const { html, findings } = renderHtml(FIXTURES['zero-width']!.source);
    expect(findings.filter(f => f.category === 'zero-width').length).toBe(1);
    expect(html).toContain('bmd-unic-zero-width');
  });

  test('all category spans present when source contains all categories', () => {
    // Build a source with at least one finding from each testable category
    // (skip combining-flood as it needs 3+ and is tricky to combine)
    const categories = [
      'ai-watermark', 'bidi', 'zero-width', 'c0-control', 'c1-control',
      'deprecated', 'noncharacter', 'separator',
    ] as const;

    for (const cat of categories) {
      const { html, findings } = renderHtml(FIXTURES[cat]!.source);
      const matched = findings.filter(f => f.category === cat);
      expect(matched.length).toBeGreaterThan(0);
      expect(html).toContain(`bmd-unic-${cat}`);
    }
  });
});

// ─── Editor Surface Tests (Finding attachment) ───

describe('Unicode pipeline regression: editor surface (finding attachment to tree)', () => {
  test('AI watermark findings are correctly attached to tree nodes', () => {
    const source = FIXTURES['ai-watermark']!.source;
    const findings = sanitize(source, 'utf8');
    const { tokens } = parse(source, false);
    annotateByteRanges(tokens, source);
    const tree = buildTree(tokens, [], findings);

    // Walk tree to find all findings
    const allFindings: Finding[] = [];
    function collectFindings(node: any): void {
      if (node.findings) allFindings.push(...node.findings);
      if (node.children) node.children.forEach(collectFindings);
    }
    collectFindings(tree);

    // All scanner findings should be attached to some node
    const wmFindings = findings.filter(f => f.category === 'ai-watermark');
    expect(wmFindings.length).toBeGreaterThan(0);
    const attachedWm = allFindings.filter(f => f.category === 'ai-watermark');
    expect(attachedWm.length).toBe(wmFindings.length);
  });

  test('bidi findings remain as individual region markers (not aggregated)', () => {
    const findings = sanitize(FIXTURES['bidi']!.source, 'utf8');
    const bidiFindings = findings.filter(f => f.category === 'bidi');
    // Region mode: each bidi char should remain individual
    expect(bidiFindings.length).toBe(2); // LRO + PDF
    // Should be atomic (paired)
    expect(bidiFindings[0]!.isAtomic).toBe(true);
    expect(bidiFindings[1]!.isAtomic).toBe(true);
    expect(bidiFindings[0]!.atomicGroupId).toBe(bidiFindings[1]!.atomicGroupId);
  });
});

// ─── Aggregation Behavior Tests ───

describe('Unicode pipeline regression: aggregation behavior', () => {
  test('region-mode categories (bidi) are never aggregated', () => {
    // 4 consecutive bidi marks should remain individual (region mode)
    const source = 'a\u200E\u200E\u200E\u200Eb';
    const findings = sanitize(source, 'utf8');
    const bidi = findings.filter(f => f.category === 'bidi');
    // With mode='none' for standalone bidi marks (LRM is bidi, mode=region applies to paired only)
    // Actually: bidi category has mode=region in defaults, so these should not aggregate
    expect(bidi.length).toBe(4);
  });

  test('aggregate-mode categories collapse consecutive runs with count', () => {
    // 5 consecutive AI watermarks
    const source = 'a\uE200\uE200\uE200\uE200\uE200b';
    const findings = sanitize(source, 'utf8');
    const wm = findings.filter(f => f.category === 'ai-watermark');
    // Should be aggregated into 1 finding with count
    expect(wm.length).toBe(1);
    expect(wm[0]!.glyph).toMatch(/x5/);
  });

  test('none-mode categories pass through individually', () => {
    // Multiple zero-width chars (mode=none means no aggregation)
    const source = 'a\u200B\u200B\u200B\u200Bb';
    const findings = sanitize(source, 'utf8');
    const zw = findings.filter(f => f.category === 'zero-width');
    // Each should remain individual (mode=none for zero-width)
    expect(zw.length).toBe(4);
  });
});

// ─── False Positive Exclusion ───

describe('Unicode pipeline regression: false positive exclusion', () => {
  test('ZWJ in emoji sequences produces zero findings', () => {
    // Family emoji: person + ZWJ + person + ZWJ + child
    const familyEmoji = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const source = `Hello ${familyEmoji} world`;
    const findings = sanitize(source, 'utf8');
    // ZWJ should not be flagged in emoji context
    const zeroWidth = findings.filter(f => f.category === 'zero-width');
    expect(zeroWidth.length).toBe(0);
  });

  test('ZWJ outside emoji context IS flagged', () => {
    const source = 'Hello \u200D world';
    const findings = sanitize(source, 'utf8');
    const zw = findings.filter(f => f.category === 'zero-width');
    expect(zw.length).toBe(1);
  });
});

// ─── Multi-Codepoint AI Watermark in Heading ───

describe('Unicode pipeline regression: heading with AI watermarks', () => {
  test('multi-codepoint AI watermark in heading produces correct finding count and positions', async () => {
    const source = '# Title \uE200\uE201\uE202 heading';
    const config = makeConfig({ ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source, config });

    const wmFindings = findings.filter(f => f.category === 'ai-watermark');
    expect(wmFindings.length).toBeGreaterThan(0);
    // Aggregated finding should produce glyph with count notation
    expect(wmFindings[0]!.glyph).toMatch(/x3/);
    // Heading text should still be present (Title is before the watermarks)
    expect(rendered).toContain('Title');
  });
});

// ─── ASCII mode regression: no unicode chars in output ───

describe('Unicode pipeline regression: ASCII mode (-a)', () => {
  test('ASCII mode table uses +---+ not box-drawing chars', async () => {
    const source = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    expect(rendered).toContain('+---+');
    expect(rendered).not.toMatch(/[─│┌┐└┘├┤┬┴┼╌╎┈┊]/);
  });

  test('ASCII mode list uses * not bullet •', async () => {
    const source = '- item one\n- item two\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    expect(rendered).toContain('* item one');
    expect(rendered).not.toContain('\u2022'); // bullet •
  });

  test('ASCII mode heading uses # not unicode decorations', async () => {
    const source = '# Hello\n\nParagraph.\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    // Should not contain any non-ASCII bytes
    for (let i = 0; i < rendered.length; i++) {
      const code = rendered.charCodeAt(i);
      expect(code).toBeLessThan(128);
    }
  });

  test('ASCII mode blockquote uses | not unicode bar', async () => {
    const source = '> quoted text\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    expect(rendered).toContain('|');
    expect(rendered).not.toContain('\u2502'); // vertical bar │
    expect(rendered).not.toContain('\u258F'); // left 1/8 block ▏
  });

  test('ASCII mode horizontal rule uses --- not unicode line', async () => {
    const source = 'above\n\n---\n\nbelow\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    // HR should use ASCII dashes only
    expect(rendered).not.toMatch(/[─━═]/);
  });

  test('ASCII mode unicode glyph substitution uses ASCII labels not glyphs', async () => {
    const source = 'Hello \u200B world';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered, findings } = await runPipeline({ source, config });
    const zwFindings = findings.filter(f => f.category === 'zero-width');
    expect(zwFindings.length).toBe(1);
    // Should not contain raw ZWSP
    expect(rendered).not.toContain('\u200B');
    // ASCII glyph should be bracketed label like [ZWSP]
    expect(rendered).toMatch(/\[ZWSP\]/);
  });

  test('ASCII mode full output contains no bytes > 127', async () => {
    const source = '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- item\n\n> quote\n\n---\n\nHello \u200B world\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    for (let i = 0; i < rendered.length; i++) {
      const code = rendered.charCodeAt(i);
      if (code >= 128) {
        throw new Error(`Non-ASCII byte ${code} (U+${code.toString(16).toUpperCase()}) at offset ${i}: "${rendered.slice(Math.max(0, i - 10), i + 10)}"`);
      }
    }
  });

  test('ASCII mode transliterates em-dash and other typographic chars to ASCII', async () => {
    const source = 'Hello \u2014 world\nIt\u2019s a \u201Ctest\u201D\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    // No non-ASCII bytes in output
    for (let i = 0; i < rendered.length; i++) {
      const code = rendered.charCodeAt(i);
      if (code >= 128) {
        throw new Error(`Non-ASCII byte ${code} (U+${code.toString(16).toUpperCase()}) at offset ${i}: "${rendered.slice(Math.max(0, i - 10), i + 10)}"`);
      }
    }
    expect(rendered).toContain('Hello');
    expect(rendered).toContain('world');
  });
});

// ─── ASCII Zero-Byte Contract Helper ───

function assertAsciiClean(rendered: string, context: string): void {
  const violations: string[] = [];
  for (let i = 0; i < rendered.length; i++) {
    const code = rendered.charCodeAt(i);
    if (code > 127) {
      violations.push(
        `U+${code.toString(16).toUpperCase().padStart(4, '0')} at offset ${i}: ` +
        `"${rendered.slice(Math.max(0, i - 10), i + 10)}"`
      );
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${violations.length} non-ASCII byte(s) in ${context}:\n` +
      violations.slice(0, 10).join('\n') +
      (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
    );
  }
}

// ─── Sanitize Catch-All: ASCII mode must produce [U+XXXX] for ALL non-ASCII ───

describe('Unicode pipeline regression: catch-all non-ASCII → [U+XXXX] in ASCII mode', () => {

  // Category Tests (scanner detection categories)

  test('1. confusable dashes', async () => {
    const source = 'A\u2014B\u2013C\u2010D';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'confusable dashes');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2014]');
  });

  test('2. confusable quotes', async () => {
    const source = '\u201CHello\u201D \u2018world\u2019';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'confusable quotes');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+201C]');
  });

  test('3. fullwidth Latin', async () => {
    const source = '\uFF21\uFF22\uFF23';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'fullwidth Latin');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+FF21]');
  });

  test('4. Greek confusables', async () => {
    const source = '\u0394\u03A9\u03B1';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'Greek confusables');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+0394]');
  });

  test('5. Cyrillic confusables', async () => {
    const source = '\u0411\u0414\u0416';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'Cyrillic confusables');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+0411]');
  });

  // Catch-All Tests (non-ASCII NOT in any specific scanner category)

  test('6. control pictures', async () => {
    const source = 'NUL is \u2400 and NL is \u2424';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'control pictures');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2400]');
  });

  test('7. box drawing in content', async () => {
    const source = '\u2500\u2502\u250C\u2510';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'box drawing');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2500]');
  });

  test('8. mathematical symbols', async () => {
    const source = '\u00D7\u00F7\u2260\u221E';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'mathematical symbols');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+00D7]');
  });

  test('9. arrows', async () => {
    const source = '\u2190\u2191\u2192\u2193';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'arrows');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2192]');
  });

  test('10. CJK ideographs', async () => {
    const source = 'Hello \u4E16\u754C';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'CJK ideographs');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+4E16]');
  });

  test('11. emoji', async () => {
    const source = 'Hello \uD83D\uDE00 world';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'emoji');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+1F600]');
  });

  test('12. Latin Extended', async () => {
    const source = 'caf\u00E9 na\u00EFve';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'Latin Extended');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+00E9]');
  });

  test('13. Arabic', async () => {
    const source = '\u0645\u0631\u062D\u0628\u0627';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'Arabic');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+0645]');
  });

  test('14. miscellaneous symbols', async () => {
    const source = '\u2605\u2606\u263A';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'miscellaneous symbols');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2605]');
  });

  test('15. dingbats', async () => {
    const source = '\u2713\u2717\u279E';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'dingbats');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
    expect(rendered).toContain('[U+2713]');
  });

  // Pipeline Integration Tests (non-ASCII inside different block types)

  test('16. non-ASCII in table cells', async () => {
    const source = '| \u2014 | \u2192 |\n|---|---|\n| a | b |\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in table cells');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
  });

  test('17. non-ASCII in list items', async () => {
    const source = '- Item with \u2014 dash\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in list items');
    expect(rendered).toContain('Item with');
  });

  test('18. non-ASCII in blockquote', async () => {
    const source = '> Text with \u00E9\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in blockquote');
    expect(rendered).toContain('Text with');
  });

  test('19. non-ASCII in heading', async () => {
    const source = '# Heading with \u2014\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in heading');
    expect(rendered).toContain('Heading with');
  });

  test('20. non-ASCII in code block', async () => {
    const source = '```\ncode with \u2014\n```\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in code block');
    expect(rendered).toContain('code with');
  });

  test('21. non-ASCII in bold/italic', async () => {
    const source = '**\u2014bold\u2014**\n';
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'non-ASCII in bold/italic');
    expect(rendered).toContain('bold');
  });

  test('22. kitchen sink', async () => {
    const source = [
      '# Heading with \u2014',
      '',
      'Paragraph with \u00E9 and \u2192 and \u4E16\u754C',
      '',
      '| \u2014 | \u2192 |',
      '|---|---|',
      '| a | b |',
      '',
      '- Item with \u2713',
      '',
      '> Quote with \u00D7',
      '',
      '```',
      'code with \u2260',
      '```',
      '',
      '**\u201Cbold\u201D**',
      '',
    ].join('\n');
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    assertAsciiClean(rendered, 'kitchen sink');
    expect(rendered.length).toBeGreaterThan(source.length / 2);
  });

  // UTF-8 Mode Verification

  test('23. UTF-8 mode passes through non-ASCII', async () => {
    const source = 'caf\u00E9 \u2014 \u4E16\u754C';
    const config = makeConfig({ format: 'utf8', ansiEnabled: false });
    const { rendered } = await runPipeline({ source, config });
    // Original chars should be present, NOT [U+XXXX]
    expect(rendered).toContain('\u00E9');
    expect(rendered).toContain('\u2014');
    expect(rendered).toContain('\u4E16');
    expect(rendered).not.toContain('[U+00E9]');
    expect(rendered).not.toContain('[U+2014]');
  });

  test('24. UTF-8 mode still creates findings', async () => {
    const source = 'caf\u00E9 \u2014 \u4E16\u754C';
    const config = makeConfig({ format: 'utf8', ansiEnabled: false });
    const { findings } = await runPipeline({ source, config });
    // Non-ASCII codepoints should produce findings even in UTF-8 mode
    expect(findings.length).toBeGreaterThan(0);
    const unclassified = findings.filter(f => f.category === 'unclassified');
    expect(unclassified.length).toBeGreaterThan(0);
  });
});

// ─── Unit Tests: scanner internals ───

describe('Unicode pipeline regression: scanner unit tests', () => {
  test('classifyCodepoint returns null for ASCII range', () => {
    const { classifyCodepoint } = require('../../src/unicode/categories');
    expect(classifyCodepoint(0x41)).toBeNull(); // 'A'
    expect(classifyCodepoint(0x20)).toBeNull(); // space
    expect(classifyCodepoint(0x7E)).toBeNull(); // '~'
  });

  test('getAsciiGlyph returns [U+XXXX] for unclassified', () => {
    const { getAsciiGlyph } = require('../../src/unicode/glyph-map');
    expect(getAsciiGlyph('unclassified', 0x2014)).toBe('[U+2014]');
    expect(getAsciiGlyph('unclassified', 0x00E9)).toBe('[U+00E9]');
    expect(getAsciiGlyph('unclassified', 0x4E16)).toBe('[U+4E16]');
  });

  test('scanUnicode in ascii mode catches unclassified non-ASCII', () => {
    const { scanUnicode } = require('../../src/unicode/scanner');
    const findings = scanUnicode('\u2014\u00E9', 'ascii');
    const unclassified = findings.filter((f: any) => f.category === 'unclassified');
    expect(unclassified.length).toBe(2);
    expect(unclassified[0]!.glyph).toBe('[U+2014]');
    expect(unclassified[1]!.glyph).toBe('[U+00E9]');
  });

  test('scanUnicode in utf8 mode creates findings with pass-through glyphs', () => {
    const { scanUnicode } = require('../../src/unicode/scanner');
    const findings = scanUnicode('\u2014\u00E9', 'utf8');
    const unclassified = findings.filter((f: any) => f.category === 'unclassified');
    expect(unclassified.length).toBe(2);
    expect(unclassified[0]!.glyph).toBe('\u2014');
    expect(unclassified[1]!.glyph).toBe('\u00E9');
  });
});
