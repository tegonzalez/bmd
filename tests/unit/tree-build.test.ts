import { test, expect, describe } from 'bun:test';
import { buildTree, attachFindingsAndRegions } from '../../src/pipeline/tree-build.js';
import type { DocNode, RegionMap, ByteRange } from '../../src/pipeline/types.js';
import type { Finding } from '../../src/unicode/types.js';

/** Helper to create a minimal token matching markdown-it shape */
function tok(
  type: string,
  nesting: 1 | 0 | -1,
  content = '',
  opts: {
    markup?: string;
    tag?: string;
    map?: [number, number] | null;
    meta?: any;
    children?: any[] | null;
    hidden?: boolean;
    attrs?: [string, string][] | null;
    info?: string;
  } = {},
): any {
  return {
    type,
    nesting,
    content,
    markup: opts.markup ?? '',
    tag: opts.tag ?? '',
    map: opts.map ?? null,
    meta: opts.meta ?? null,
    children: opts.children ?? null,
    hidden: opts.hidden ?? false,
    attrs: opts.attrs ?? null,
    info: opts.info ?? '',
  };
}

describe('buildTree', () => {
  test('single heading token produces heading DocNode with content', () => {
    const tokens = [
      tok('heading_open', 1, '', { tag: 'h1', map: [0, 1], meta: { byteRange: [0, 10] } }),
      tok('inline', 0, 'Hello', {
        map: [0, 1],
        meta: { byteRange: [2, 7] },
        children: [tok('text', 0, 'Hello', { meta: { byteRange: [2, 7] } })],
      }),
      tok('heading_close', -1, '', { tag: 'h1' }),
    ];
    const tree = buildTree(tokens, [], []);
    expect(tree.type).toBe('document');
    expect(tree.children.length).toBe(1);
    const heading = tree.children[0]!;
    expect(heading.type).toBe('heading');
    expect(heading.meta.level).toBe(1);
    // Should have inline children
    expect(heading.children.length).toBeGreaterThanOrEqual(1);
  });

  test('nested list produces correct tree structure', () => {
    const tokens = [
      tok('bullet_list_open', 1, '', { map: [0, 3], meta: { byteRange: [0, 30] } }),
      tok('list_item_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 10] } }),
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [2, 8] } }),
      tok('inline', 0, 'item', {
        map: [0, 1],
        meta: { byteRange: [2, 6] },
        children: [tok('text', 0, 'item', { meta: { byteRange: [2, 6] } })],
      }),
      tok('paragraph_close', -1),
      tok('list_item_close', -1),
      tok('bullet_list_close', -1),
    ];
    const tree = buildTree(tokens, [], []);
    expect(tree.children.length).toBe(1); // one bullet_list
    const list = tree.children[0]!;
    expect(list.type).toBe('bullet_list');
    expect(list.children.length).toBe(1); // one list_item
    const item = list.children[0]!;
    expect(item.type).toBe('list_item');
    expect(item.children.length).toBe(1); // one paragraph
    expect(item.children[0]!.type).toBe('paragraph');
  });

  test('hidden paragraph sets meta.hidden = true', () => {
    const tokens = [
      tok('bullet_list_open', 1, '', { map: [0, 2], meta: { byteRange: [0, 20] } }),
      tok('list_item_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 10] } }),
      tok('paragraph_open', 1, '', { hidden: true, map: [0, 1], meta: { byteRange: [2, 8] } }),
      tok('inline', 0, 'tight', {
        map: [0, 1],
        meta: { byteRange: [2, 7] },
        children: [tok('text', 0, 'tight', { meta: { byteRange: [2, 7] } })],
      }),
      tok('paragraph_close', -1, '', { hidden: true }),
      tok('list_item_close', -1),
      tok('bullet_list_close', -1),
    ];
    const tree = buildTree(tokens, [], []);
    const para = tree.children[0]!.children[0]!.children[0]!; // list > item > paragraph
    expect(para.type).toBe('paragraph');
    expect(para.meta.hidden).toBe(true);
  });

  test('inline token with children expands into text/strong/em/code_inline', () => {
    const tokens = [
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 30] } }),
      tok('inline', 0, 'hello **bold** `code`', {
        map: [0, 1],
        meta: { byteRange: [0, 20] },
        children: [
          tok('text', 0, 'hello ', { meta: { byteRange: [0, 6] } }),
          tok('strong_open', 1, '', { markup: '**', meta: { byteRange: [6, 8] } }),
          tok('text', 0, 'bold', { meta: { byteRange: [8, 12] } }),
          tok('strong_close', -1, '', { markup: '**', meta: { byteRange: [12, 14] } }),
          tok('text', 0, ' ', { meta: { byteRange: [14, 15] } }),
          tok('code_inline', 0, 'code', { markup: '`', meta: { byteRange: [15, 21] } }),
        ],
      }),
      tok('paragraph_close', -1),
    ];
    const tree = buildTree(tokens, [], []);
    const para = tree.children[0]!;
    expect(para.type).toBe('paragraph');
    // Inline children should be expanded
    const types = para.children.map((c: DocNode) => c.type);
    expect(types).toContain('text');
    expect(types).toContain('strong');
    expect(types).toContain('code_inline');
  });

  test('findings attach to deepest node whose byteRange contains them', () => {
    const finding: Finding = {
      offset: 3,
      length: 2,
      category: 'zero-width',
      codepoint: 0x200b,
      glyph: '[ZWSP]',
      tooltip: 'Zero Width Space',
      isAtomic: false,
    };

    const tokens = [
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 20] } }),
      tok('inline', 0, 'hello world', {
        map: [0, 1],
        meta: { byteRange: [0, 11] },
        children: [tok('text', 0, 'hello world', { meta: { byteRange: [0, 11] } })],
      }),
      tok('paragraph_close', -1),
    ];
    const tree = buildTree(tokens, [], [finding]);
    // The finding [3,5) should attach to the text node [0,11), not the paragraph [0,20)
    const textNode = tree.children[0]!.children[0]!; // paragraph > text
    expect(textNode.type).toBe('text');
    expect(textNode.findings.length).toBe(1);
    expect(textNode.findings[0]!.offset).toBe(3);
  });

  test('finding spanning two siblings attaches to nearest common ancestor', () => {
    const finding: Finding = {
      offset: 5,
      length: 10, // spans across two text nodes
      category: 'bidi',
      codepoint: 0x202a,
      glyph: '[LRE]',
      tooltip: 'Left-to-Right Embedding',
      isAtomic: false,
    };

    const tokens = [
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 30] } }),
      tok('inline', 0, 'hello bold world', {
        map: [0, 1],
        meta: { byteRange: [0, 20] },
        children: [
          tok('text', 0, 'hello ', { meta: { byteRange: [0, 6] } }),
          tok('strong_open', 1, '', { markup: '**', meta: { byteRange: [6, 8] } }),
          tok('text', 0, 'bold', { meta: { byteRange: [8, 12] } }),
          tok('strong_close', -1, '', { markup: '**', meta: { byteRange: [12, 14] } }),
          tok('text', 0, ' world', { meta: { byteRange: [14, 20] } }),
        ],
      }),
      tok('paragraph_close', -1),
    ];
    const tree = buildTree(tokens, [], [finding]);
    // Finding [5,15) spans text[0,6), strong[6,14), text[14,20) -- no single child contains it
    // Should attach to the paragraph (nearest common ancestor that contains [5,15))
    const para = tree.children[0]!;
    expect(para.findings.length).toBe(1);
  });

  test('regions attach to nodes by expandedByteRange overlap', () => {
    const region: RegionMap = {
      id: 1,
      type: 'T',
      originalByteRange: [0, 5],
      expandedByteRange: [0, 10],
      originalContent: '{{v}}',
      expandedContent: 'helloworld',
    };

    const tokens = [
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 20] } }),
      tok('inline', 0, 'helloworld test', {
        map: [0, 1],
        meta: { byteRange: [0, 15] },
        children: [tok('text', 0, 'helloworld test', { meta: { byteRange: [0, 15] } })],
      }),
      tok('paragraph_close', -1),
    ];
    const tree = buildTree(tokens, [region], []);
    // Region [0,10) fits inside text node [0,15)
    const textNode = tree.children[0]!.children[0]!;
    expect(textNode.regions.length).toBe(1);
    expect(textNode.regions[0]!.id).toBe(1);
  });

  test('token type mapping strips _open/_close suffix', () => {
    const tokens = [
      tok('blockquote_open', 1, '', { map: [0, 2], meta: { byteRange: [0, 20] } }),
      tok('paragraph_open', 1, '', { map: [0, 1], meta: { byteRange: [2, 15] } }),
      tok('inline', 0, 'quote', {
        map: [0, 1],
        meta: { byteRange: [2, 7] },
        children: [tok('text', 0, 'quote', { meta: { byteRange: [2, 7] } })],
      }),
      tok('paragraph_close', -1),
      tok('blockquote_close', -1),
    ];
    const tree = buildTree(tokens, [], []);
    expect(tree.children[0]!.type).toBe('blockquote');
    expect(tree.children[0]!.children[0]!.type).toBe('paragraph');
  });

  test('fence token becomes leaf with content and meta.info', () => {
    const tokens = [
      tok('fence', 0, 'const x = 1;', {
        map: [0, 3],
        meta: { byteRange: [0, 30] },
        info: 'typescript',
        markup: '```',
      }),
    ];
    const tree = buildTree(tokens, [], []);
    expect(tree.children.length).toBe(1);
    const fence = tree.children[0]!;
    expect(fence.type).toBe('fence');
    expect(fence.content).toBe('const x = 1;');
    expect(fence.meta.info).toBe('typescript');
    expect(fence.children.length).toBe(0);
  });

  test('table tokens build correct hierarchy', () => {
    const tokens = [
      tok('table_open', 1, '', { map: [0, 4], meta: { byteRange: [0, 50] } }),
      tok('thead_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 15] } }),
      tok('tr_open', 1, '', { map: [0, 1], meta: { byteRange: [0, 15] } }),
      tok('th_open', 1, '', { meta: { byteRange: [1, 5] } }),
      tok('inline', 0, 'Header', {
        meta: { byteRange: [1, 7] },
        children: [tok('text', 0, 'Header', { meta: { byteRange: [1, 7] } })],
      }),
      tok('th_close', -1),
      tok('tr_close', -1),
      tok('thead_close', -1),
      tok('tbody_open', 1, '', { map: [2, 4], meta: { byteRange: [20, 50] } }),
      tok('tr_open', 1, '', { map: [2, 3], meta: { byteRange: [20, 35] } }),
      tok('td_open', 1, '', { meta: { byteRange: [21, 25] } }),
      tok('inline', 0, 'Cell', {
        meta: { byteRange: [21, 25] },
        children: [tok('text', 0, 'Cell', { meta: { byteRange: [21, 25] } })],
      }),
      tok('td_close', -1),
      tok('tr_close', -1),
      tok('tbody_close', -1),
      tok('table_close', -1),
    ];
    const tree = buildTree(tokens, [], []);
    expect(tree.children.length).toBe(1);
    const table = tree.children[0]!;
    expect(table.type).toBe('table');
    // Should have table_row children (thead/tbody are structural wrappers)
    const allRows = flatCollect(table, 'table_row');
    expect(allRows.length).toBe(2);
    const allCells = flatCollect(table, 'table_cell');
    expect(allCells.length).toBe(2);
  });
});

/** Helper: collect all descendants of a given type */
function flatCollect(node: DocNode, type: string): DocNode[] {
  const result: DocNode[] = [];
  if (node.type === type) result.push(node);
  for (const child of node.children) {
    result.push(...flatCollect(child, type));
  }
  return result;
}
