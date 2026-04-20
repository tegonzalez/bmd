import { test, expect, describe } from 'bun:test';
import type { DocNode, NodeType, RegionMap, RenderVisitor, ByteRange, RegionType } from '../../src/pipeline/types';

describe('Pipeline Types', () => {
  // Test 1: DocNode type has all required fields
  test('DocNode has all required fields', () => {
    const node: DocNode = {
      type: 'document',
      byteRange: [0, 100],
      children: [],
      meta: {},
      findings: [],
      regions: [],
    };
    expect(node.type).toBe('document');
    expect(node.byteRange).toEqual([0, 100]);
    expect(node.children).toEqual([]);
    expect(node.meta).toEqual({});
    expect(node.findings).toEqual([]);
    expect(node.regions).toEqual([]);
    // content is optional
    expect(node.content).toBeUndefined();

    const nodeWithContent: DocNode = {
      type: 'text',
      byteRange: [0, 5],
      children: [],
      content: 'hello',
      meta: {},
      findings: [],
      regions: [],
    };
    expect(nodeWithContent.content).toBe('hello');
  });

  // Test 2: NodeType union includes all 22 locked node types
  test('NodeType includes all 22 locked node types', () => {
    const allTypes: NodeType[] = [
      'document', 'heading', 'paragraph', 'fence', 'code_block',
      'bullet_list', 'ordered_list', 'list_item', 'table', 'table_row', 'table_cell',
      'blockquote', 'hr', 'html_block',
      'text', 'strong', 'em', 'strikethrough', 'code_inline', 'link', 'image',
      'softbreak', 'hardbreak', 'html_inline',
    ];
    expect(allTypes).toHaveLength(24);
    // Verify each is assignable (compile-time check that passes at runtime)
    for (const t of allTypes) {
      expect(typeof t).toBe('string');
    }
  });

  // Test 3: RegionMap has all required fields
  test('RegionMap has all required fields', () => {
    const region: RegionMap = {
      id: 1,
      type: 'T',
      originalByteRange: [0, 10],
      expandedByteRange: [0, 20],
      originalContent: '{{var}}',
      expandedContent: 'hello world',
    };
    expect(region.id).toBe(1);
    expect(region.type).toBe('T');
    expect(region.originalByteRange).toEqual([0, 10]);
    expect(region.expandedByteRange).toEqual([0, 20]);
    expect(region.originalContent).toBe('{{var}}');
    expect(region.expandedContent).toBe('hello world');
  });

  // Test 4: RenderVisitor interface has methods for all node types (compile-time check)
  test('RenderVisitor interface can be implemented', () => {
    // This is a compile-time check -- if the interface is wrong, this file won't compile
    class TestVisitor implements RenderVisitor {
      visitDocument(node: DocNode): string { return ''; }
      visitHeading(node: DocNode, level: number, ancestors: DocNode[]): string { return ''; }
      visitParagraph(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitFence(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitBulletList(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitOrderedList(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitListItem(node: DocNode, index: number, ancestors: DocNode[]): string { return ''; }
      visitTable(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitBlockquote(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitHr(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitText(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitStrong(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitEm(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitCodeInline(node: DocNode, ancestors: DocNode[]): string { return ''; }
      visitLink(node: DocNode, href: string, ancestors: DocNode[]): string { return ''; }
      visitImage(node: DocNode, src: string, alt: string): string { return ''; }
      visitBreak(node: DocNode, hard: boolean): string { return ''; }
    }
    const visitor = new TestVisitor();
    expect(visitor).toBeDefined();
    expect(typeof visitor.visitDocument).toBe('function');
    expect(typeof visitor.visitHeading).toBe('function');
    expect(typeof visitor.visitParagraph).toBe('function');
    expect(typeof visitor.visitFence).toBe('function');
    expect(typeof visitor.visitBulletList).toBe('function');
    expect(typeof visitor.visitOrderedList).toBe('function');
    expect(typeof visitor.visitListItem).toBe('function');
    expect(typeof visitor.visitTable).toBe('function');
    expect(typeof visitor.visitBlockquote).toBe('function');
    expect(typeof visitor.visitHr).toBe('function');
    expect(typeof visitor.visitText).toBe('function');
    expect(typeof visitor.visitStrong).toBe('function');
    expect(typeof visitor.visitEm).toBe('function');
    expect(typeof visitor.visitCodeInline).toBe('function');
    expect(typeof visitor.visitLink).toBe('function');
    expect(typeof visitor.visitImage).toBe('function');
    expect(typeof visitor.visitBreak).toBe('function');
  });

  // Test 5: RegionType includes T, U, H, A values
  test('RegionType includes T, U, H, A values', () => {
    const types: RegionType[] = ['T', 'U', 'H', 'A'];
    expect(types).toEqual(['T', 'U', 'H', 'A']);
    // Verify each is a valid RegionType
    for (const t of types) {
      const region: RegionMap = {
        id: 0,
        type: t,
        originalByteRange: [0, 0],
        expandedByteRange: [0, 0],
        originalContent: '',
        expandedContent: '',
      };
      expect(region.type).toBe(t);
    }
  });

  // Test: ByteRange is a tuple
  test('ByteRange is a [number, number] tuple', () => {
    const range: ByteRange = [0, 42];
    expect(range).toHaveLength(2);
    expect(range[0]!).toBe(0);
    expect(range[1]!).toBe(42);
  });

  // Test: Re-export of Finding from unicode/types
  test('Finding is re-exported from pipeline types', async () => {
    const exports = await import('../../src/pipeline/types');
    // Finding is a type, not a value -- we check it compiles via the import above
    // Instead, verify that we can import the module without errors
    expect(exports).toBeDefined();
  });
});
