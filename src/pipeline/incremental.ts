/**
 * Incremental Rendering - Block-level dirty detection and tree merging.
 *
 * On each edit in the browser editor, identifies which top-level blocks
 * changed, re-parses only those blocks, and merges the result into the
 * existing DocTree. Unchanged blocks are reused with adjusted byte ranges.
 *
 * Key invariants:
 *   - Minimum re-parse unit: one block (never partial block)
 *   - Bounded re-render regions (table, blockquote, ordered_list): if any
 *     child line is dirty, the entire region is dirty
 *   - Byte ranges of non-dirty blocks after the edit point are adjusted by delta
 */

import type { DocNode, RegionMap } from './types.js';
import type { Finding } from '../unicode/types.js';
import { parse } from '../parser/index.ts';
import { annotateByteRanges, computeLineByteOffsets } from './byte-range.ts';
import { buildTree } from './tree-build.ts';

/** Result of dirty block detection */
export interface DirtyResult {
  /** Indices of top-level children in oldTree that need re-parsing */
  dirtyIndices: number[];
  /** Byte offset change: newSource.length - oldSource.length */
  delta: number;
}

/** Node types that are bounded re-render regions per CONTEXT.md */
const BOUNDED_REGION_TYPES = new Set(['table', 'blockquote', 'ordered_list']);

/**
 * Compare old and new source to find which top-level blocks changed.
 *
 * Algorithm:
 *   1. Split both sources into lines
 *   2. Find individual changed lines using front/back matching
 *   3. Collect changed byte ranges (may be non-contiguous)
 *   4. Find top-level children whose byte ranges overlap any changed range
 *   5. Bounded regions (table, blockquote, ordered_list) are atomic
 */
export function findDirtyBlocks(
  oldSource: string,
  newSource: string,
  oldTree: DocNode,
): DirtyResult {
  const delta = newSource.length - oldSource.length;

  if (oldSource === newSource) {
    return { dirtyIndices: [], delta: 0 };
  }

  const oldLines = oldSource.split('\n');
  const newLines = newSource.split('\n');

  // Find changed line indices in the old source using front/back matching.
  // Lines matching from the front and from the back are unchanged.
  // Lines in the middle range are changed.
  const changedOldLines = findChangedLineIndices(oldLines, newLines);

  if (changedOldLines.length === 0) {
    // Length changed but all lines match -- trailing newline difference
    // Mark the last block as dirty
    if (oldTree.children.length > 0) {
      return { dirtyIndices: [oldTree.children.length - 1], delta };
    }
    return { dirtyIndices: [], delta };
  }

  // Convert changed line indices to byte offset ranges in old source
  const oldOffsets = computeLineByteOffsets(oldSource);
  const changedByteRanges: Array<[number, number]> = [];

  for (const lineIdx of changedOldLines) {
    const start = oldOffsets[lineIdx]! ?? oldSource.length;
    const end = lineIdx + 1 < oldOffsets.length
      ? oldOffsets[lineIdx + 1]!
      : oldSource.length;
    changedByteRanges.push([start, end]);
  }

  // Find overlapping top-level children
  const dirtySet = new Set<number>();
  const children = oldTree.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const [cStart, cEnd] = child.byteRange;

    // Check if this child's byte range overlaps any changed byte range
    for (const [rStart, rEnd] of changedByteRanges) {
      if (cStart < rEnd && cEnd > rStart) {
        dirtySet.add(i);
        break;
      }
    }
  }

  // If no children matched (e.g., edit at end beyond existing blocks),
  // mark the last child as dirty
  if (dirtySet.size === 0 && children.length > 0) {
    dirtySet.add(children.length - 1);
  }

  // Bounded re-render regions: table, blockquote, ordered_list are
  // already top-level nodes, so marking the parent automatically
  // includes all children (atomic re-render unit).

  const dirtyIndices = Array.from(dirtySet).sort((a, b) => a - b);
  return { dirtyIndices, delta };
}

/**
 * Find which line indices in the old source are changed.
 *
 * When line counts match: direct per-line comparison (detects non-contiguous edits).
 * When line counts differ: front-and-back matching to find the changed range.
 */
function findChangedLineIndices(
  oldLines: string[],
  newLines: string[],
): number[] {
  if (oldLines.length === newLines.length) {
    // Same number of lines: compare each line individually
    const changed: number[] = [];
    for (let i = 0; i < oldLines.length; i++) {
      if (oldLines[i]! !== newLines[i]!) {
        changed.push(i);
      }
    }
    return changed;
  }

  // Different line counts: use front/back matching
  let front = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (front < minLen && oldLines[front]! === newLines[front]!) {
    front++;
  }

  let oldBack = oldLines.length - 1;
  let newBack = newLines.length - 1;
  while (oldBack >= front && newBack >= front && oldLines[oldBack]! === newLines[newBack]!) {
    oldBack--;
    newBack--;
  }

  const changed: number[] = [];
  for (let i = front; i <= oldBack; i++) {
    changed.push(i);
  }

  return changed;
}

/**
 * Recursively adjust all byte ranges in a subtree by the given delta.
 * Positive delta = insertion (ranges shift right).
 * Negative delta = deletion (ranges shift left).
 */
export function adjustByteRanges(node: DocNode, delta: number): void {
  node.byteRange[0] += delta;
  node.byteRange[1] += delta;

  for (const child of node.children) {
    adjustByteRanges(child, delta);
  }
}

/**
 * Copy a new tree node's structure but carry over meta from the old tree node.
 * This preserves transform results (highlight tokens, mermaid outputs) from
 * the previous render cycle for non-dirty blocks.
 * Recurses into children to preserve meta at all depths.
 */
function copyWithOldMeta(newNode: DocNode, oldNode: DocNode): DocNode {
  // If types differ or child counts differ, just use the new node
  if (!oldNode || newNode.type !== oldNode.type || newNode.children.length !== oldNode.children.length) {
    return newNode;
  }

  const mergedChildren: DocNode[] = [];
  for (let i = 0; i < newNode.children.length; i++) {
    mergedChildren.push(copyWithOldMeta(newNode.children[i]!, oldNode.children[i]!));
  }

  return {
    ...newNode,
    meta: { ...oldNode.meta, ...newNode.meta },
    children: mergedChildren,
  };
}

/**
 * Incrementally update a DocTree given old and new source.
 *
 * Steps:
 *   1. Find dirty blocks via line-level diff
 *   2. If no dirty blocks, return oldTree as-is
 *   3. Re-parse the entire new source (block-level) to get new tokens
 *   4. Build a fresh tree from the new source
 *   5. Merge: for non-dirty indices, reuse old nodes with adjusted byte ranges;
 *      for dirty indices and structural changes, use new tree nodes
 *
 * The "minimum re-parse unit is one block" invariant is satisfied because
 * we always re-parse at block granularity (the parser produces block tokens).
 *
 * For the initial implementation, we do a full re-parse of the new source
 * but only rebuild dirty subtrees. This is still beneficial because the
 * expensive Transform stage (Shiki/Mermaid) can skip non-dirty nodes
 * using the dirty indices information.
 */
export function incrementalUpdate(
  oldTree: DocNode,
  oldSource: string,
  newSource: string,
  findings: Finding[],
  regions: RegionMap[],
): DocNode {
  const { dirtyIndices, delta } = findDirtyBlocks(oldSource, newSource, oldTree);

  // No changes -- return a shallow copy with same children
  if (dirtyIndices.length === 0) {
    return {
      ...oldTree,
      children: [...oldTree.children],
    };
  }

  // Re-parse the new source to get the new tree
  const { tokens } = parse(newSource, false);
  annotateByteRanges(tokens, newSource);
  const newTree = buildTree(tokens, regions, findings);

  // If the structure changed significantly (different number of blocks),
  // just return the new tree -- structural diff is too complex to merge safely
  if (oldTree.children.length !== newTree.children.length) {
    return newTree;
  }

  // Merge: reuse old nodes for non-dirty, use new for dirty
  const mergedChildren: DocNode[] = [];
  const dirtySet = new Set(dirtyIndices);

  for (let i = 0; i < newTree.children.length; i++) {
    if (dirtySet.has(i)) {
      // Use the new tree's version of this node (fresh parse, needs transform)
      mergedChildren.push(newTree.children[i]!);
    } else {
      // Non-dirty: use new tree structure (correct byte ranges for new source)
      // but carry over meta from old tree (has transform results from previous cycle)
      const merged = copyWithOldMeta(newTree.children[i]!, oldTree.children[i]!);
      mergedChildren.push(merged);
    }
  }

  return {
    type: 'document',
    byteRange: newTree.byteRange,
    children: mergedChildren,
    meta: {},
    findings: newTree.findings,
    regions: newTree.regions,
  };
}
