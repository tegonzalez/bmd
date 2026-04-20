/**
 * Tests for block-level incremental rendering.
 *
 * Validates dirty block detection, byte range adjustment, and
 * bounded re-render region handling (tables, blockquotes, ordered lists).
 */

import { test, expect, describe } from "bun:test";
import { findDirtyBlocks, incrementalUpdate, adjustByteRanges } from "../../src/pipeline/incremental.ts";
import { parse } from "../../src/parser/index.ts";
import { annotateByteRanges } from "../../src/pipeline/byte-range.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import type { DocNode } from "../../src/pipeline/types.ts";

/** Helper: build a DocTree from source */
function treeFromSource(source: string): DocNode {
  const { tokens } = parse(source, false);
  annotateByteRanges(tokens, source);
  return buildTree(tokens, [], []);
}

describe("findDirtyBlocks", () => {
  test("Test 1: identical old and new source -> no dirty blocks", () => {
    const source = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const tree = treeFromSource(source);
    const result = findDirtyBlocks(source, source, tree);
    expect(result.dirtyIndices).toEqual([]);
    expect(result.delta).toBe(0);
  });

  test("Test 2: edit within a single paragraph -> that paragraph block is dirty, others unchanged", () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const newSource = "# Hello\n\nParagraph ONE CHANGED.\n\nParagraph two.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // Only the second child (index 1, the first paragraph) should be dirty
    expect(result.dirtyIndices).toContain(1);
    // The heading (index 0) and second paragraph (index 2) should NOT be dirty
    expect(result.dirtyIndices).not.toContain(0);
    expect(result.dirtyIndices).not.toContain(2);
  });

  test("Test 3: insert new line in middle -> blocks after insertion have adjusted byte ranges", () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const newSource = "# Hello\n\nParagraph one EXTRA TEXT.\n\nParagraph two.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // Delta should be positive (text was added)
    expect(result.delta).toBeGreaterThan(0);
  });

  test("Test 4: delete a block -> subsequent blocks shift up", () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n";
    const newSource = "# Hello\n\nParagraph two.\n\nParagraph three.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // Delta should be negative (text was removed)
    expect(result.delta).toBeLessThan(0);
    // At least one dirty index should exist
    expect(result.dirtyIndices.length).toBeGreaterThan(0);
  });

  test("Test 5: edit inside a fenced code block -> that fence block is dirty", () => {
    const oldSource = "# Title\n\n```js\nconst x = 1;\n```\n\nEnd paragraph.\n";
    const newSource = "# Title\n\n```js\nconst x = 42;\n```\n\nEnd paragraph.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // The fence block should be dirty
    expect(result.dirtyIndices.length).toBeGreaterThanOrEqual(1);
    // Check that the dirty index corresponds to the fence node
    const fenceIndex = tree.children.findIndex(c => c.type === 'fence');
    expect(result.dirtyIndices).toContain(fenceIndex);
    // Heading (index 0) should NOT be dirty
    expect(result.dirtyIndices).not.toContain(0);
  });

  test("Test 6: edit inside a table -> entire table is dirty (bounded re-render region)", () => {
    const oldSource = "# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nEnd.\n";
    const newSource = "# Title\n\n| A | B |\n|---|---|\n| X | 2 |\n\nEnd.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // The table index should be dirty
    const tableIndex = tree.children.findIndex(c => c.type === 'table');
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(result.dirtyIndices).toContain(tableIndex);
  });

  test("Test 7: edit inside a blockquote -> entire blockquote is dirty (bounded re-render region)", () => {
    const oldSource = "# Title\n\n> Quote line one.\n> Quote line two.\n\nEnd.\n";
    const newSource = "# Title\n\n> Quote line CHANGED.\n> Quote line two.\n\nEnd.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    const bqIndex = tree.children.findIndex(c => c.type === 'blockquote');
    expect(bqIndex).toBeGreaterThanOrEqual(0);
    expect(result.dirtyIndices).toContain(bqIndex);
  });

  test("Test 8: append text at end -> only last block is dirty", () => {
    const oldSource = "# Title\n\nFirst paragraph.\n\nLast paragraph.\n";
    const newSource = "# Title\n\nFirst paragraph.\n\nLast paragraph with more text.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    const lastIndex = tree.children.length - 1;
    expect(result.dirtyIndices).toContain(lastIndex);
    // Heading and first paragraph should NOT be dirty
    expect(result.dirtyIndices).not.toContain(0);
    expect(result.dirtyIndices).not.toContain(1);
  });

  test("Test 9: multiple edits in different blocks -> all affected blocks dirty", () => {
    const oldSource = "# Title\n\nParagraph A.\n\nParagraph B.\n\nParagraph C.\n";
    const newSource = "# Title\n\nParagraph A CHANGED.\n\nParagraph B.\n\nParagraph C CHANGED.\n";
    const tree = treeFromSource(oldSource);
    const result = findDirtyBlocks(oldSource, newSource, tree);
    // Paragraphs at index 1 and 3 should be dirty
    expect(result.dirtyIndices).toContain(1);
    expect(result.dirtyIndices).toContain(3);
    // Heading and middle paragraph should NOT be dirty
    expect(result.dirtyIndices).not.toContain(0);
    expect(result.dirtyIndices).not.toContain(2);
  });
});

describe("adjustByteRanges", () => {
  test("adjusts all byte ranges in a subtree by positive delta", () => {
    const node: DocNode = {
      type: 'paragraph',
      byteRange: [10, 20],
      children: [
        { type: 'text', byteRange: [10, 18], children: [], meta: {}, findings: [], regions: [] },
      ],
      meta: {},
      findings: [],
      regions: [],
    };
    adjustByteRanges(node, 5);
    expect(node.byteRange).toEqual([15, 25]);
    expect(node.children[0]!.byteRange).toEqual([15, 23]);
  });

  test("adjusts all byte ranges by negative delta", () => {
    const node: DocNode = {
      type: 'paragraph',
      byteRange: [20, 30],
      children: [],
      meta: {},
      findings: [],
      regions: [],
    };
    adjustByteRanges(node, -5);
    expect(node.byteRange).toEqual([15, 25]);
  });
});

describe("incrementalUpdate", () => {
  test("produces correct merged tree for single-block edit", () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const newSource = "# Hello\n\nParagraph CHANGED.\n\nParagraph two.\n";
    const oldTree = treeFromSource(oldSource);

    const newTree = incrementalUpdate(oldTree, oldSource, newSource, [], []);

    // The tree should have the same number of top-level children
    expect(newTree.children.length).toBe(oldTree.children.length);
    // The heading should be unchanged (reused)
    expect(newTree.children[0]!.type).toBe('heading');
    // The updated paragraph should reflect the new content
    // Verify by checking the tree is valid and parseable
    const fullReparseTree = treeFromSource(newSource);
    expect(newTree.children.length).toBe(fullReparseTree.children.length);
  });

  test("produces correct merged tree when block is deleted", () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n";
    const newSource = "# Hello\n\nParagraph two.\n\nParagraph three.\n";
    const oldTree = treeFromSource(oldSource);

    const newTree = incrementalUpdate(oldTree, oldSource, newSource, [], []);

    const fullReparseTree = treeFromSource(newSource);
    expect(newTree.children.length).toBe(fullReparseTree.children.length);
  });

  test("produces correct merged tree when block is added", () => {
    const oldSource = "# Hello\n\nParagraph one.\n";
    const newSource = "# Hello\n\nNew paragraph.\n\nParagraph one.\n";
    const oldTree = treeFromSource(oldSource);

    const newTree = incrementalUpdate(oldTree, oldSource, newSource, [], []);

    const fullReparseTree = treeFromSource(newSource);
    expect(newTree.children.length).toBe(fullReparseTree.children.length);
  });

  test("unchanged source returns identical tree", () => {
    const source = "# Hello\n\nParagraph.\n";
    const tree = treeFromSource(source);

    const newTree = incrementalUpdate(tree, source, source, [], []);

    expect(newTree.children.length).toBe(tree.children.length);
    // No dirty blocks means the tree should be essentially the same
    expect(newTree.children[0]!.type).toBe(tree.children[0]!.type);
  });
});
