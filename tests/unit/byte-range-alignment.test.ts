/**
 * Byte-range alignment tests.
 *
 * Validates that unicode findings survive markdown parsing across
 * all common formatting contexts with EXACT byteRange and localOffset
 * assertions. Findings detected on raw source must be attached to the
 * correct tree nodes where localOffset = finding.offset - node.byteRange[0]
 * matches the content index of the finding character.
 */

import { test, expect, describe } from 'bun:test';
import { sanitize } from '../../src/pipeline/sanitize';
import { parse } from '../../src/parser/index';
import { annotateByteRanges } from '../../src/pipeline/byte-range';
import { buildTree } from '../../src/pipeline/tree-build';
import type { Finding } from '../../src/unicode/types';

/** Walk tree collecting all findings attached to nodes */
function collectFindings(node: any): Finding[] {
  const result: Finding[] = [];
  if (node.findings) result.push(...node.findings);
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectFindings(child));
    }
  }
  return result;
}

/** Walk tree collecting all nodes that have findings */
function collectFindingNodes(node: any): { node: any; findings: Finding[] }[] {
  const result: { node: any; findings: Finding[] }[] = [];
  if (node.findings && node.findings.length > 0) {
    result.push({ node, findings: node.findings });
  }
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectFindingNodes(child));
    }
  }
  return result;
}

/** Walk tree collecting nodes by type */
function collectNodesByType(node: any, type: string): any[] {
  const result: any[] = [];
  if (node.type === type) result.push(node);
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectNodesByType(child, type));
    }
  }
  return result;
}

/** Build a tree from source, running the full S1->S3->S4 pipeline stages */
function buildTreeFromSource(source: string) {
  const findings = sanitize(source, 'utf8');
  const { tokens } = parse(source, false);
  annotateByteRanges(tokens, source);
  const tree = buildTree(tokens, [], findings);
  return { tree, findings };
}

// ─── Exact byteRange Assertions ───

describe('Byte-range alignment: exact byteRange for block types', () => {
  test('ATX heading: text node byteRange starts after "# " prefix', () => {
    // Source: "# Hello \uE200 world" (15 chars)
    // Content: "Hello \uE200 world" (13 chars) starts at source offset 2
    const source = '# Hello \uE200 world';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(2);
    expect(textNodes[0]!.byteRange[1]!).toBe(15);
  });

  test('blockquote: text node byteRange starts after "> " prefix', () => {
    // Source: "> Quote \uE200 text" (14 chars)
    // Content: "Quote \uE200 text" (12 chars) starts at source offset 2
    const source = '> Quote \uE200 text';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(2);
    expect(textNodes[0]!.byteRange[1]!).toBe(14);
  });

  test('list item: text node byteRange starts after "- " prefix', () => {
    // Source: "- List \uE200 item" (13 chars)
    // Content: "List \uE200 item" (11 chars) starts at source offset 2
    const source = '- List \uE200 item';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(2);
    expect(textNodes[0]!.byteRange[1]!).toBe(13);
  });

  test('ordered list: text node byteRange starts after "1. " prefix', () => {
    // Source: "1. Ordered \uE200" (12 chars)
    // Content: "Ordered \uE200" (9 chars) starts at source offset 3
    const source = '1. Ordered \uE200';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(3);
    expect(textNodes[0]!.byteRange[1]!).toBe(12);
  });

  test('nested blockquote: text node byteRange starts after "> > " prefix', () => {
    // Source: "> > Nested \uE200" (12 chars)
    // Content: "Nested \uE200" (8 chars) starts at source offset 4
    const source = '> > Nested \uE200';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(4);
    expect(textNodes[0]!.byteRange[1]!).toBe(12);
  });

  test('blockquote-in-list: text node byteRange starts after "> - " prefix', () => {
    // Source: "> - Item \uE200" (10 chars)
    // Content: "Item \uE200" (6 chars) starts at source offset 4
    const source = '> - Item \uE200';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(4);
    expect(textNodes[0]!.byteRange[1]!).toBe(10);
  });

  test('multiline blockquote: per-line content offsets', () => {
    // Source: "> Line one\n> Line \uE200 two" (23 chars)
    // Line 0 content "Line one" starts at 2, line 1 content "Line \uE200 two" starts at 13
    const source = '> Line one\n> Line \uE200 two';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    // Two text nodes split by softbreak
    expect(textNodes.length).toBe(2);
    // First text: "Line one" at [2, 10]
    expect(textNodes[0]!.byteRange[0]!).toBe(2);
    expect(textNodes[0]!.byteRange[1]!).toBe(10);
    // Second text: "Line \uE200 two" at [13, 23]
    expect(textNodes[1]!.byteRange[0]!).toBe(13);
    expect(textNodes[1]!.byteRange[1]!).toBe(23);
  });

  test('multiline list continuation: per-line content offsets', () => {
    // Source: "- Line one\n  Line \uE200 two" (23 chars)
    // Line 0 content "Line one" starts at 2, line 1 content "Line \uE200 two" starts at 13
    const source = '- Line one\n  Line \uE200 two';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(2);
    // First text: "Line one" at [2, 10]
    expect(textNodes[0]!.byteRange[0]!).toBe(2);
    expect(textNodes[0]!.byteRange[1]!).toBe(10);
    // Second text: "Line \uE200 two" at [13, 23]
    expect(textNodes[1]!.byteRange[0]!).toBe(13);
    expect(textNodes[1]!.byteRange[1]!).toBe(23);
  });

  test('setext heading: no prefix, byteRange starts at 0', () => {
    // Source: "Heading \uE200\n======" (16 chars)
    // Content: "Heading \uE200" starts at 0 (no prefix)
    const source = 'Heading \uE200\n======';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(0);
  });

  test('plain paragraph: no prefix, byteRange unchanged', () => {
    // Source: "Hello \uE200 world" (13 chars)
    // Content: "Hello \uE200 world" starts at 0
    const source = 'Hello \uE200 world';
    const { tree } = buildTreeFromSource(source);
    const textNodes = collectNodesByType(tree, 'text');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0]!.byteRange[0]!).toBe(0);
    expect(textNodes[0]!.byteRange[1]!).toBe(13);
  });
});

// ─── Exact localOffset Assertions ───

describe('Byte-range alignment: exact localOffset values', () => {
  test('heading localOffset matches content index', () => {
    // "\uE200" is at source offset 8, content "Hello \uE200 world" has it at index 6
    const source = '# Hello \uE200 world';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(6);
      }
    }
  });

  test('blockquote localOffset matches content index', () => {
    // "\uE200" at source offset 8, content "Quote \uE200 text" has it at index 6
    const source = '> Quote \uE200 text';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(6);
      }
    }
  });

  test('list item localOffset matches content index', () => {
    // "\uE200" at source offset 7, content "List \uE200 item" has it at index 5
    const source = '- List \uE200 item';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(5);
      }
    }
  });

  test('ordered list localOffset matches content index', () => {
    // "\uE200" at source offset 11, content "Ordered \uE200" has it at index 8
    const source = '1. Ordered \uE200';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(8);
      }
    }
  });

  test('nested blockquote localOffset matches content index', () => {
    // "\uE200" at source offset 11, content "Nested \uE200" has it at index 7
    const source = '> > Nested \uE200';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(7);
      }
    }
  });

  test('blockquote-in-list localOffset matches content index', () => {
    // "\uE200" at source offset 9, content "Item \uE200" has it at index 5
    const source = '> - Item \uE200';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(5);
      }
    }
  });

  test('multiline blockquote: finding on line 2 has correct localOffset', () => {
    // "\uE200" at source offset 18, text node "Line \uE200 two" starts at 13
    // localOffset = 18 - 13 = 5, which is content index of \uE200 in "Line \uE200 two"
    const source = '> Line one\n> Line \uE200 two';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(5);
      }
    }
  });

  test('multiline list continuation: finding on line 2 has correct localOffset', () => {
    // "\uE200" at source offset 18, text node "Line \uE200 two" starts at 13
    // localOffset = 18 - 13 = 5
    const source = '- Line one\n  Line \uE200 two';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(5);
      }
    }
  });

  test('plain paragraph localOffset unchanged (no regression)', () => {
    // "\uE200" at source offset 6, content "Hello \uE200 world" at index 6
    const source = 'Hello \uE200 world';
    const { tree } = buildTreeFromSource(source);
    const nodes = collectFindingNodes(tree);
    expect(nodes.length).toBeGreaterThan(0);
    for (const { node, findings } of nodes) {
      for (const f of findings) {
        if (f.category !== 'ai-watermark') continue;
        const localOffset = f.offset - node.byteRange[0]!;
        expect(localOffset).toBe(6);
      }
    }
  });
});

// ─── Markdown Context Tests (preserved from original) ───

describe('Byte-range alignment: findings in markdown contexts', () => {
  test('no findings lost to byte-range misalignment across all contexts', () => {
    const contexts = [
      '# \uE200 heading',
      '## Sub \uE200 heading',
      '- item \uE200',
      '1. item \uE200',
      '**\uE200**',
      '*\uE200*',
      '> \uE200',
      '`\uE200`',
      '> - **\uE200**',
      '> > \uE200',
    ];

    for (const source of contexts) {
      const { tree, findings } = buildTreeFromSource(source);
      const wmFindings = findings.filter(f => f.category === 'ai-watermark');
      const attached = collectFindings(tree).filter(f => f.category === 'ai-watermark');

      expect(attached.length).toBe(
        wmFindings.length,
      );
    }
  });
});
