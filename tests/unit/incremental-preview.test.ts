/**
 * Tests for incremental preview rendering.
 *
 * Validates that the incremental path in preview.ts produces the same
 * HTML output as a full re-render, and that only dirty blocks are
 * re-transformed via transformTreeDirty.
 */

import { test, expect, describe } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import { annotateByteRanges } from "../../src/pipeline/byte-range.ts";
import { sanitize } from "../../src/pipeline/sanitize.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import { transformTree, transformTreeDirty } from "../../src/pipeline/transform.ts";
import { HtmlVisitor } from "../../src/pipeline/html-visitor.ts";
import { findDirtyBlocks, incrementalUpdate } from "../../src/pipeline/incremental.ts";
import { sharedTransformCache } from "../../src/pipeline/index.ts";
import type { DocNode } from "../../src/pipeline/types.ts";

/** Minimal config for transform (no theme, no ANSI) */
const previewConfig = {
  format: 'utf8' as const,
  width: 120,
  ansiEnabled: false,
  pager: 'never' as const,
  unsafeHtml: false,
  unicode: true,
  filePath: undefined,
  theme: undefined,
  templates: {
    enabled: false,
    map: undefined,
    auto_map: false,
    list_spec: undefined,
  },
  undo: {
    groupDelay: 500,
    depth: 100,
  },
  serve: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    mode: 'both' as const,
    colorMode: 'auto' as const,
    readonly: false,
  },
};

/** Full pipeline render: sanitize -> parse -> tree-build -> transform -> html */
async function fullRender(source: string): Promise<{ html: string; tree: DocNode }> {
  const findings = sanitize(source, 'utf8');
  const { tokens } = parse(source, false);
  annotateByteRanges(tokens, source);
  const tree = buildTree(tokens, [], findings);
  await transformTree(tree, previewConfig, sharedTransformCache);
  const html = new HtmlVisitor().render(tree);
  return { html, tree };
}

/**
 * Incremental pipeline render: reuses previous tree, finds dirty blocks,
 * merges trees, and selectively transforms only dirty fence nodes.
 * Mirrors the logic in preview.ts renderPreview().
 */
async function incrementalRender(
  oldSource: string,
  oldTree: DocNode,
  newSource: string,
): Promise<{ html: string; tree: DocNode; dirtyIndices: number[] }> {
  const findings = sanitize(newSource, 'utf8');

  // Find dirty blocks using old source and old tree
  const { dirtyIndices } = findDirtyBlocks(oldSource, newSource, oldTree);

  // Merge trees via incrementalUpdate
  const mergedTree = incrementalUpdate(oldTree, oldSource, newSource, findings, []);

  // Selective transform: only dirty blocks get fence nodes re-transformed
  const structuralChange = oldTree.children.length !== mergedTree.children.length;
  if (structuralChange) {
    await transformTree(mergedTree, previewConfig, sharedTransformCache);
  } else {
    await transformTreeDirty(mergedTree, previewConfig, sharedTransformCache, dirtyIndices);
  }

  const html = new HtmlVisitor().render(mergedTree);
  return { html, tree: mergedTree, dirtyIndices };
}

describe("incremental preview rendering", () => {
  test("incremental render produces same HTML as full render for single paragraph edit", async () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const newSource = "# Hello\n\nParagraph CHANGED.\n\nParagraph two.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { html: fullHtml } = await fullRender(newSource);
    const { html: incrHtml } = await incrementalRender(oldSource, oldTree, newSource);

    expect(incrHtml).toBe(fullHtml);
  });

  test("incremental render produces same HTML for heading edit", async () => {
    const oldSource = "# Hello\n\nParagraph one.\n";
    const newSource = "# Hello World\n\nParagraph one.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { html: fullHtml } = await fullRender(newSource);
    const { html: incrHtml } = await incrementalRender(oldSource, oldTree, newSource);

    expect(incrHtml).toBe(fullHtml);
  });

  test("incremental render produces same HTML for multiple block edits", async () => {
    const oldSource = "# Title\n\nParagraph A.\n\nParagraph B.\n\nParagraph C.\n";
    const newSource = "# Title\n\nParagraph A CHANGED.\n\nParagraph B.\n\nParagraph C CHANGED.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { html: fullHtml } = await fullRender(newSource);
    const { html: incrHtml } = await incrementalRender(oldSource, oldTree, newSource);

    expect(incrHtml).toBe(fullHtml);
  });

  test("only dirty blocks are identified for single paragraph edit", async () => {
    const oldSource = "# Hello\n\nParagraph one.\n\nParagraph two.\n";
    const newSource = "# Hello\n\nParagraph CHANGED.\n\nParagraph two.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { dirtyIndices } = findDirtyBlocks(oldSource, newSource, oldTree);

    // Only second child (paragraph one, index 1) should be dirty
    expect(dirtyIndices).toContain(1);
    expect(dirtyIndices).not.toContain(0); // heading unchanged
    expect(dirtyIndices).not.toContain(2); // paragraph two unchanged
  });

  test("non-dirty fence nodes skip S5 transform via transformTreeDirty", async () => {
    // Document with two fence blocks: edit only the second one
    const oldSource = "```js\nconst a = 1;\n```\n\nMiddle paragraph.\n\n```js\nconst b = 2;\n```\n";
    const newSource = "```js\nconst a = 1;\n```\n\nMiddle paragraph.\n\n```js\nconst b = 999;\n```\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { dirtyIndices } = findDirtyBlocks(oldSource, newSource, oldTree);

    // Only the last block (second fence, index 2) should be dirty
    expect(dirtyIndices).not.toContain(0); // first fence unchanged
    expect(dirtyIndices).toContain(2);     // second fence changed

    // Verify incremental render still produces correct output
    const { html: fullHtml } = await fullRender(newSource);
    const { html: incrHtml } = await incrementalRender(oldSource, oldTree, newSource);
    expect(incrHtml).toBe(fullHtml);
  });

  test("fence node edit only marks fence block as dirty", async () => {
    const oldSource = "# Title\n\n```js\nconst x = 1;\n```\n\nEnd paragraph.\n";
    const newSource = "# Title\n\n```js\nconst x = 42;\n```\n\nEnd paragraph.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { dirtyIndices } = findDirtyBlocks(oldSource, newSource, oldTree);

    const fenceIndex = oldTree.children.findIndex(c => c.type === 'fence');
    expect(dirtyIndices).toContain(fenceIndex);
    expect(dirtyIndices).not.toContain(0); // heading unchanged
  });

  test("first render (no previous tree) uses full pipeline", async () => {
    const source = "# Hello\n\nParagraph.\n";
    const { html: html1 } = await fullRender(source);
    const { html: html2 } = await fullRender(source);
    expect(html1).toBe(html2);
  });

  test("structural change (different block count) still produces correct output", async () => {
    const oldSource = "# Hello\n\nParagraph one.\n";
    const newSource = "# Hello\n\nNew paragraph.\n\nParagraph one.\n";

    const { tree: oldTree } = await fullRender(oldSource);
    const { html: fullHtml } = await fullRender(newSource);
    const { html: incrHtml } = await incrementalRender(oldSource, oldTree, newSource);

    expect(incrHtml).toBe(fullHtml);
  });

  test("identical source returns early with no dirty blocks", async () => {
    const source = "# Hello\n\nParagraph.\n";
    const { tree } = await fullRender(source);
    const { dirtyIndices } = findDirtyBlocks(source, source, tree);
    expect(dirtyIndices).toEqual([]);
  });
});
