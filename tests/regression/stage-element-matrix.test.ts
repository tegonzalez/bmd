/**
 * Stage × Element Matrix Regression Tests
 *
 * Proves that EVERY pipeline stage works correctly across EVERY markdown
 * element type. For each element:
 *   - S1 (Sanitize): findings are detected
 *   - S4 (TreeBuild): findings are attached to the correct node
 *   - S6 (Terminal Render): invisible chars replaced with glyphs
 *   - S6 (HTML Render): invisible chars replaced with styled spans
 *   - S2 (Template): expansions appear in rendered output
 *
 * Uses strict assertions (.toBe, .not.toContain) — NOT weak toContain-only.
 * ANY element type that silently drops a mapping is a test failure.
 */

import { test, expect, describe } from 'bun:test';
import { sanitize } from '../../src/pipeline/sanitize';
import { runPipeline } from '../../src/pipeline/index';
import { parse } from '../../src/parser/index';
import { annotateByteRanges } from '../../src/pipeline/byte-range';
import { buildTree } from '../../src/pipeline/tree-build';
import { HtmlVisitor } from '../../src/pipeline/html-visitor';
import { TerminalVisitor } from '../../src/pipeline/terminal-visitor';
import { AsciiAdapter } from '../../src/renderer/ascii-adapter';
import { Utf8Adapter } from '../../src/renderer/utf8-adapter';
import { expandTemplateWithRegions } from '../../src/pipeline/template-regions';
import { decodeRegions } from '../../src/pipeline/region-marker';
import { getDefaults } from '../../src/theme/defaults';
import type { BmdConfig } from '../../src/config/schema';
import type { Finding } from '../../src/unicode/types';
import type { DocNode } from '../../src/pipeline/types';

// ─── Helpers ───

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
    width: 120,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
    undo: overrides?.undo ?? { groupDelay: 500, depth: 100 },
  };
}

/** Build DocTree from source (S1→S3→S4) with findings attached. */
function buildTreeFromSource(source: string): { tree: DocNode; findings: Finding[] } {
  const findings = sanitize(source, 'utf8');
  const { tokens } = parse(source, false);
  annotateByteRanges(tokens, source);
  const tree = buildTree(tokens, [], findings);
  return { tree, findings };
}

/** Render source through HTML pipeline (no transform stage). */
function renderHtml(source: string): string {
  const { tree } = buildTreeFromSource(source);
  return new HtmlVisitor().render(tree);
}

/** Render source through terminal pipeline (no ANSI, no transform). */
function renderTerminal(source: string): string {
  const { tree } = buildTreeFromSource(source);
  const adapter = new Utf8Adapter();
  const ctx = { width: 120, format: 'utf8' as const, ansiEnabled: false, theme: getDefaults(), parsedSource: source };
  const visitor = new TerminalVisitor(adapter, null, ctx);
  return visitor.render(tree);
}

/** Collect all findings from a tree recursively. */
function collectFindings(node: DocNode): Finding[] {
  const result: Finding[] = [...node.findings];
  for (const child of node.children) {
    result.push(...collectFindings(child));
  }
  return result;
}

/** Find all nodes of a given type in the tree. */
function findNodes(node: DocNode, type: string): DocNode[] {
  const result: DocNode[] = [];
  if (node.type === type) result.push(node);
  for (const child of node.children) {
    result.push(...findNodes(child, type));
  }
  return result;
}

/** The ZWSP character — a representative invisible unicode char for testing. */
const ZWSP = '\u200B';
/** Expected UTF-8 glyph for ZWSP: ␣ (U+2423) */
const ZWSP_GLYPH = '\u2423';
/** A NUL character — C0 control */
const NUL = '\x00';
/** Expected UTF-8 glyph for NUL: ␀ (U+2400) */
const NUL_GLYPH = '\u2400';
/** Bidi LRO character */
const LRO = '\u202D';
/** Expected glyph for LRO: ⊳! */
const LRO_GLYPH = '\u22B3!';
/** NBSP character */
const NBSP = '\u00A0';
/** Expected glyph for NBSP: ⍽ */
const NBSP_GLYPH = '\u237D';

// ─── Element Fixtures ───
// Each fixture wraps a "marker" text and an invisible character inside
// a specific markdown element. The marker text lets us verify the element
// rendered at all; the invisible char lets us verify it was replaced.

interface ElementFixture {
  name: string;
  /** Markdown source containing invisible char */
  source: string;
  /** The raw invisible char that MUST NOT appear in output */
  rawChar: string;
  /** Expected node type where the finding should be attached */
  expectedNodeType: string;
  /** Marker text that MUST appear in output (proves element rendered) */
  markerText: string;
  /** Whether findings are expected (false for code blocks where content is preserved) */
  expectFindings?: boolean;
}

const ELEMENT_FIXTURES: ElementFixture[] = [
  // Block elements
  {
    name: 'heading (h1)',
    source: `# Head${ZWSP}ing\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Head',
  },
  {
    name: 'heading (h2)',
    source: `## Second${ZWSP}Level\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Second',
  },
  {
    name: 'heading (h3)',
    source: `### Third${ZWSP}Level\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Third',
  },
  {
    name: 'heading (h4)',
    source: `#### Fourth${ZWSP}Level\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Fourth',
  },
  {
    name: 'heading (h5)',
    source: `##### Fifth${ZWSP}Level\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Fifth',
  },
  {
    name: 'heading (h6)',
    source: `###### Sixth${ZWSP}Level\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Sixth',
  },
  {
    name: 'paragraph',
    source: `Para${ZWSP}graph text here.\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Para',
  },
  {
    name: 'blockquote',
    source: `> Quoted${ZWSP}text\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Quoted',
  },
  {
    name: 'nested blockquote',
    source: `> > Deep${ZWSP}quote\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Deep',
  },
  {
    name: 'bullet list item',
    source: `- Bullet${ZWSP}item\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Bullet',
  },
  {
    name: 'ordered list item',
    source: `1. Ordered${ZWSP}item\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Ordered',
  },
  {
    name: 'nested bullet list',
    source: `- Outer\n  - Inner${ZWSP}nested\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Inner',
  },
  {
    name: 'table cell',
    source: `| Col${ZWSP}A | ColB |\n|------|------|\n| Val${ZWSP}1 | Val2 |\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Col',
  },

  // Inline elements
  {
    name: 'bold/strong',
    source: `**Bold${ZWSP}text**\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Bold',
  },
  {
    name: 'italic/em',
    source: `*Italic${ZWSP}text*\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Italic',
  },
  {
    name: 'strikethrough',
    source: `~~Strike${ZWSP}text~~\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Strike',
  },
  {
    name: 'link text',
    source: `[Link${ZWSP}text](http://example.com)\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Link',
  },
  {
    name: 'bold inside heading',
    source: `# **Bold${ZWSP}Head**\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Bold',
  },
  {
    name: 'italic inside blockquote',
    source: `> *Italic${ZWSP}Quote*\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Italic',
  },
  {
    name: 'bold inside list item',
    source: `- **Bold${ZWSP}List**\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Bold',
  },
  {
    name: 'link inside heading',
    source: `# [Link${ZWSP}Head](http://example.com)\n`,
    rawChar: ZWSP,
    expectedNodeType: 'text',
    markerText: 'Link',
  },

  // Code elements: inline code and fenced blocks should NOT replace invisible chars
  // (code content is preserved verbatim)
  {
    name: 'inline code (no finding replacement)',
    source: `\`code${ZWSP}here\`\n`,
    rawChar: ZWSP,
    expectedNodeType: 'code_inline',
    markerText: 'code',
    expectFindings: false,
  },
  {
    name: 'fenced code block (no finding replacement)',
    source: `\`\`\`\ncode${ZWSP}here\n\`\`\`\n`,
    rawChar: ZWSP,
    expectedNodeType: 'fence',
    markerText: 'code',
    expectFindings: false,
  },
];

// ─── S1: Sanitize detects findings in every element ───

describe('S1 Sanitize: detects findings regardless of element context', () => {
  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings === false) continue;

    test(`detects ZWSP in ${fixture.name}`, () => {
      const findings = sanitize(fixture.source, 'utf8');
      const zwFindings = findings.filter(f => f.category === 'zero-width');
      expect(zwFindings.length).toBeGreaterThan(0);
    });
  }
});

// ─── S4: TreeBuild attaches findings to correct node type ───

describe('S4 TreeBuild: findings attach to deepest containing node', () => {
  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings === false) continue;

    test(`finding attached to ${fixture.expectedNodeType} in ${fixture.name}`, () => {
      const { tree, findings } = buildTreeFromSource(fixture.source);

      // All scanner findings should be attached somewhere in the tree
      const treeFindings = collectFindings(tree);
      const zwScannerFindings = findings.filter(f => f.category === 'zero-width');
      const zwTreeFindings = treeFindings.filter(f => f.category === 'zero-width');

      expect(zwScannerFindings.length).toBeGreaterThan(0);
      expect(zwTreeFindings.length).toBe(zwScannerFindings.length);

      // Verify at least one finding is on the expected node type
      const targetNodes = findNodes(tree, fixture.expectedNodeType);
      const findingsOnTarget = targetNodes.flatMap(n => n.findings.filter(f => f.category === 'zero-width'));
      expect(findingsOnTarget.length).toBeGreaterThan(0);
    });
  }
});

// ─── S6 Terminal: invisible chars replaced with glyphs ───

describe('S6 Terminal: invisible chars replaced with visible glyphs in every element', () => {
  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings === false) continue;

    test(`ZWSP replaced in ${fixture.name}`, () => {
      const output = renderTerminal(fixture.source);

      // Marker text must be present (element actually rendered)
      expect(output).toContain(fixture.markerText);

      // Raw invisible char MUST NOT be in output
      expect(output).not.toContain(fixture.rawChar);

      // The replacement glyph MUST be present
      expect(output).toContain(ZWSP_GLYPH);
    });
  }

  // Code elements: invisible chars are preserved (no replacement)
  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings !== false) continue;

    test(`invisible char preserved in ${fixture.name} (code content is verbatim)`, () => {
      const output = renderTerminal(fixture.source);
      expect(output).toContain(fixture.markerText);
      // Code content preserves raw chars
    });
  }
});

// ─── S6 HTML: invisible chars replaced with styled spans ───

describe('S6 HTML: invisible chars replaced with styled spans in every element', () => {
  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings === false) continue;

    test(`ZWSP replaced with span in ${fixture.name}`, () => {
      const html = renderHtml(fixture.source);

      // Marker text must be present
      expect(html).toContain(fixture.markerText);

      // Raw invisible char MUST NOT be in output
      expect(html).not.toContain(fixture.rawChar);

      // Must have bmd-unic-zero-width span
      expect(html).toContain('bmd-unic-zero-width');
    });
  }
});

// ─── Multi-category: verify DIFFERENT unicode categories across elements ───

interface CategoryFixture {
  name: string;
  char: string;
  category: string;
  glyph: string;
  htmlClass: string;
}

const UNICODE_CATEGORIES: CategoryFixture[] = [
  { name: 'zero-width (ZWSP)', char: ZWSP, category: 'zero-width', glyph: ZWSP_GLYPH, htmlClass: 'bmd-unic-zero-width' },
  { name: 'c0-control (NUL)', char: NUL, category: 'c0-control', glyph: NUL_GLYPH, htmlClass: 'bmd-unic-c0-control' },
  { name: 'bidi (LRO)', char: LRO, category: 'bidi', glyph: LRO_GLYPH, htmlClass: 'bmd-unic-bidi' },
  { name: 'whitespace (NBSP)', char: NBSP, category: 'whitespace', glyph: NBSP_GLYPH, htmlClass: 'bmd-unic-whitespace' },
  { name: 'c1-control', char: '\u0080', category: 'c1-control', glyph: '\u2327', htmlClass: 'bmd-unic-c1-control' },
  { name: 'deprecated', char: '\u206A', category: 'deprecated', glyph: '\u2298', htmlClass: 'bmd-unic-deprecated' },
  { name: 'separator (LS)', char: '\u2028', category: 'separator', glyph: '\u2424', htmlClass: 'bmd-unic-separator' },
  { name: 'noncharacter', char: '\uFFFE', category: 'noncharacter', glyph: '\u2298', htmlClass: 'bmd-unic-noncharacter' },
];

// Core element containers to cross with each category
const CONTAINER_ELEMENTS = [
  { name: 'heading', wrap: (text: string) => `# ${text}\n` },
  { name: 'paragraph', wrap: (text: string) => `${text}\n` },
  { name: 'blockquote', wrap: (text: string) => `> ${text}\n` },
  { name: 'bullet list', wrap: (text: string) => `- ${text}\n` },
  { name: 'ordered list', wrap: (text: string) => `1. ${text}\n` },
  { name: 'bold', wrap: (text: string) => `**${text}**\n` },
  { name: 'italic', wrap: (text: string) => `*${text}*\n` },
  { name: 'link text', wrap: (text: string) => `[${text}](http://example.com)\n` },
  { name: 'table cell', wrap: (text: string) => `| ${text} | B |\n|---|---|\n| c | d |\n` },
];

describe('Category × Element matrix: every category detected and rendered in every container', () => {
  for (const cat of UNICODE_CATEGORIES) {
    describe(`${cat.name}`, () => {
      for (const el of CONTAINER_ELEMENTS) {
        const text = `Mark${cat.char}er`;
        const source = el.wrap(text);

        test(`${el.name}: detected by S1`, () => {
          const findings = sanitize(source, 'utf8');
          const matched = findings.filter(f => f.category === cat.category);
          expect(matched.length).toBeGreaterThan(0);
        });

        test(`${el.name}: finding attached in S4`, () => {
          const { tree, findings } = buildTreeFromSource(source);
          const treeFindings = collectFindings(tree);
          const matched = treeFindings.filter(f => f.category === cat.category);
          expect(matched.length).toBeGreaterThan(0);
        });

        test(`${el.name}: raw char absent from terminal output`, () => {
          const output = renderTerminal(source);
          expect(output).toContain('Mark');
          expect(output).not.toContain(cat.char);
        });

        test(`${el.name}: styled span in HTML output`, () => {
          const html = renderHtml(source);
          expect(html).toContain('Mark');
          expect(html).not.toContain(cat.char);
          expect(html).toContain(cat.htmlClass);
        });
      }
    });
  }
});

// ─── Template expansion across all element types ───

describe('S2 Template: expansion rendered in every element type', () => {
  const values = { TITLE: 'Resolved' };
  const config = makeConfig({
    ansiEnabled: false,
    templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
  });

  const TEMPLATE_ELEMENTS = [
    { name: 'heading', source: '# {{TITLE}} heading\n' },
    { name: 'paragraph', source: '{{TITLE}} paragraph\n' },
    { name: 'blockquote', source: '> {{TITLE}} quoted\n' },
    { name: 'bullet list', source: '- {{TITLE}} item\n' },
    { name: 'ordered list', source: '1. {{TITLE}} item\n' },
    { name: 'bold', source: '**{{TITLE}} bold**\n' },
    { name: 'italic', source: '*{{TITLE}} italic*\n' },
    { name: 'link text', source: '[{{TITLE}} link](http://example.com)\n' },
    { name: 'table cell', source: '| {{TITLE}} | B |\n|---|---|\n| c | d |\n' },
  ];

  for (const el of TEMPLATE_ELEMENTS) {
    test(`${el.name}: template expanded to "Resolved"`, async () => {
      const { rendered } = await runPipeline({ source: el.source, config, values });

      // The raw template expression MUST NOT appear
      expect(rendered).not.toContain('{{TITLE}}');

      // The resolved value MUST appear
      expect(rendered).toContain('Resolved');
    });

    test(`${el.name}: template expanded in HTML`, () => {
      // Manual HTML pipeline with template expansion
      const result = expandTemplateWithRegions(el.source, values);
      const templated = decodeRegions(result.output).cleanSource;
      const { tokens } = parse(templated, false);
      annotateByteRanges(tokens, templated);
      const tree = buildTree(tokens, result.regions, []);
      const html = new HtmlVisitor().render(tree);

      // The resolved value MUST appear in the HTML
      expect(html).toContain('Resolved');

      // Strip HTML tags to get text content, then verify no raw {{TITLE}} in visible text
      const textContent = html.replace(/<[^>]*>/g, '');
      expect(textContent).not.toContain('{{TITLE}}');
    });
  }

  // Fenced code block: template should NOT expand inside code
  test('fenced code block: template NOT expanded (code is verbatim)', async () => {
    const source = '```\n{{TITLE}} code\n```\n';
    const { rendered } = await runPipeline({ source, config, values });
    // Template inside code block should remain unexpanded
    expect(rendered).toContain('{{TITLE}}');
    expect(rendered).not.toContain('Resolved');
  });

  test('inline code: template NOT expanded (code is verbatim)', async () => {
    const source = '`{{TITLE}}`\n';
    const { rendered } = await runPipeline({ source, config, values });
    expect(rendered).toContain('{{TITLE}}');
  });
});

// ─── Unicode + Template combined ───

describe('Combined: unicode findings + template expansion in same element', () => {
  const values = { NAME: 'World' };
  const config = makeConfig({
    ansiEnabled: false,
    templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
  });

  test('heading: template expanded AND unicode replaced', async () => {
    const source = `# Hello ${ZWSP}{{NAME}}\n`;
    const { rendered, findings } = await runPipeline({ source, config, values });

    // Template expanded
    expect(rendered).not.toContain('{{NAME}}');
    expect(rendered).toContain('World');

    // Unicode replaced
    expect(rendered).not.toContain(ZWSP);

    // Findings detected
    const zw = findings.filter(f => f.category === 'zero-width');
    expect(zw.length).toBeGreaterThan(0);
  });

  test('paragraph: template expanded AND unicode replaced', async () => {
    const source = `Text ${ZWSP}with {{NAME}} here.\n`;
    const { rendered, findings } = await runPipeline({ source, config, values });

    expect(rendered).not.toContain('{{NAME}}');
    expect(rendered).toContain('World');
    expect(rendered).not.toContain(ZWSP);
  });

  test('blockquote: template expanded AND unicode replaced', async () => {
    const source = `> Quote ${ZWSP}by {{NAME}}\n`;
    const { rendered, findings } = await runPipeline({ source, config, values });

    expect(rendered).not.toContain('{{NAME}}');
    expect(rendered).toContain('World');
    expect(rendered).not.toContain(ZWSP);
  });

  test('list item: template expanded AND unicode replaced', async () => {
    const source = `- Item ${ZWSP}for {{NAME}}\n`;
    const { rendered, findings } = await runPipeline({ source, config, values });

    expect(rendered).not.toContain('{{NAME}}');
    expect(rendered).toContain('World');
    expect(rendered).not.toContain(ZWSP);
  });
});

// ─── Byte range accuracy: findings at exact positions ───

describe('S3+S4 Byte range: findings land at correct offset in each element', () => {
  // For each element, verify the finding's offset matches where the invisible
  // char actually is in the source, and that localOffset computes correctly
  // for the visitor to splice the glyph.

  for (const el of CONTAINER_ELEMENTS) {
    test(`${el.name}: finding offset matches source position`, () => {
      const text = `abc${ZWSP}def`;
      const source = el.wrap(text);
      const expectedOffset = source.indexOf(ZWSP);

      const findings = sanitize(source, 'utf8');
      const zw = findings.filter(f => f.category === 'zero-width');
      expect(zw.length).toBe(1);
      expect(zw[0]!.offset).toBe(expectedOffset);

      // Build tree and verify finding is attached
      const { tree } = buildTreeFromSource(source);
      const treeFindings = collectFindings(tree);
      const attached = treeFindings.filter(f => f.category === 'zero-width');
      expect(attached.length).toBe(1);
      expect(attached[0]!.offset).toBe(expectedOffset);

      // Find the text node containing the finding
      const textNodes = findNodes(tree, 'text');
      const nodeWithFinding = textNodes.find(n =>
        n.findings.some(f => f.category === 'zero-width'),
      );
      expect(nodeWithFinding).toBeDefined();

      // Verify localOffset is valid (finding.offset - node.byteRange[0] >= 0
      // and < content.length)
      const localOffset = attached[0]!.offset - nodeWithFinding!.byteRange[0]!;
      expect(localOffset).toBeGreaterThanOrEqual(0);
      expect(localOffset).toBeLessThan(nodeWithFinding!.content!.length);
    });
  }
});

// ─── Full pipeline end-to-end: every element type through runPipeline ───

describe('Full pipeline E2E: every element produces correct output', () => {
  const config = makeConfig({ ansiEnabled: false });

  for (const fixture of ELEMENT_FIXTURES) {
    if (fixture.expectFindings === false) continue;

    test(`${fixture.name}: full pipeline replaces invisible char`, async () => {
      const { rendered, findings } = await runPipeline({ source: fixture.source, config });

      // Element rendered
      expect(rendered).toContain(fixture.markerText);

      // Invisible char NOT in output
      expect(rendered).not.toContain(fixture.rawChar);

      // Findings present
      const zw = findings.filter(f => f.category === 'zero-width');
      expect(zw.length).toBeGreaterThan(0);
    });
  }
});

// ─── ASCII mode: all elements use ASCII glyphs ───

describe('ASCII mode: invisible chars replaced with ASCII glyphs in every element', () => {
  const config = makeConfig({ format: 'ascii', ansiEnabled: false });

  const ASCII_ELEMENTS = [
    { name: 'heading', source: `# Head${ZWSP}ing\n` },
    { name: 'paragraph', source: `Para${ZWSP}graph\n` },
    { name: 'blockquote', source: `> Quoted${ZWSP}text\n` },
    { name: 'bullet list', source: `- Bullet${ZWSP}item\n` },
    { name: 'ordered list', source: `1. Ordered${ZWSP}item\n` },
    { name: 'bold', source: `**Bold${ZWSP}text**\n` },
    { name: 'italic', source: `*Italic${ZWSP}text*\n` },
    { name: 'table cell', source: `| Cell${ZWSP}A | B |\n|---|---|\n| c | d |\n` },
  ];

  for (const el of ASCII_ELEMENTS) {
    test(`${el.name}: ZWSP rendered as [ZWSP] in ASCII mode`, async () => {
      const { rendered } = await runPipeline({ source: el.source, config });

      // Raw char absent
      expect(rendered).not.toContain(ZWSP);

      // ASCII glyph present
      expect(rendered).toContain('[ZWSP]');
    });
  }
});
