/**
 * Pure functions for file-watch delta processing.
 *
 * Converts Yjs Y.Text observe deltas into ProseMirror transaction steps
 * and DiffData for decoration rendering.
 *
 * No DOM or editor dependencies -- all functions are pure and testable.
 */

import diff from 'fast-diff';

/** A stashed Yjs delta captured from Y.Text.observe during Y.applyUpdate. */
export interface StashedDelta {
  delta: Array<{ insert?: string; delete?: number; retain?: number }>;
  contentBefore: string;
}

/** Resolved diff data with positions and recovered deleted text. */
export interface DiffData {
  added: Array<{ from: number; to: number; text: string }>;
  deleted: Array<{ pos: number; text: string }>;
}

/**
 * Walk a Yjs delta and resolve deleted text from contentBefore.
 * Positions are 0-based text positions (no PM_OFFSET).
 *
 * Uses two cursors:
 *   - oldCursor: position in contentBefore (advances on retain + delete)
 *   - newCursor: position in resulting text (advances on retain + insert)
 */
export function resolveDeletedText(
  delta: StashedDelta['delta'],
  contentBefore: string,
): DiffData {
  // First, compute contentAfter by applying the delta to contentBefore.
  // This is needed because Yjs CRDT deltas can fragment inserts across
  // retained characters. A clean text diff gives better decoration regions.
  const contentAfter = applyDeltaToString(delta, contentBefore);

  // Use a clean text diff for decoration positions — produces contiguous
  // add/delete regions instead of fragmented ones from CRDT item boundaries.
  return resolveFromTextDiff(contentBefore, contentAfter);
}

/**
 * Apply a Yjs text delta to a plain string, producing the result text.
 */
function applyDeltaToString(delta: StashedDelta['delta'], content: string): string {
  let result = '';
  let cursor = 0;
  for (const op of delta) {
    if (op.retain !== undefined) {
      result += content.slice(cursor, cursor + op.retain);
      cursor += op.retain;
    } else if (op.delete !== undefined) {
      cursor += op.delete;
    } else if (op.insert !== undefined && typeof op.insert === 'string') {
      result += op.insert;
    }
  }
  result += content.slice(cursor);
  return result;
}

/**
 * Compute DiffData from a plain text diff (contentBefore → contentAfter).
 * Uses fast-diff with cleanup for semantic grouping — coalesces fragmented
 * character-level diffs into contiguous regions for readable highlights.
 */
function resolveFromTextDiff(contentBefore: string, contentAfter: string): DiffData {
  const diffs: Array<[number, string]> = diff(contentBefore, contentAfter);

  // Coalesce: merge adjacent delete+insert sequences separated by small
  // retains (≤3 chars) into single contiguous change regions.
  const coalesced = coalesceDiffs(diffs);

  const added: DiffData['added'] = [];
  const deleted: DiffData['deleted'] = [];
  let oldCursor = 0;
  let newCursor = 0;

  for (const [op, text] of coalesced) {
    if (op === 0) {
      oldCursor += text.length;
      newCursor += text.length;
    } else if (op === -1) {
      deleted.push({ pos: newCursor, text });
      oldCursor += text.length;
    } else if (op === 1) {
      added.push({ from: newCursor, to: newCursor + text.length, text });
      newCursor += text.length;
    }
  }

  return { added, deleted };
}

/**
 * Coalesce fragmented diffs: absorb small retains (≤3 chars) between
 * change ops into the surrounding delete/insert. This prevents
 * character-level diffing from producing many tiny highlight fragments.
 *
 * e.g., [-1,"H"],[1,"Updat"],[0,"e"],[-1,"llo"],[1,"d"]
 * becomes [-1,"Hello"],[1,"Updated"]
 */
function coalesceDiffs(diffs: Array<[number, string]>): Array<[number, string]> {
  if (diffs.length <= 1) return diffs;

  const result: Array<[number, string]> = [];
  let i = 0;

  while (i < diffs.length) {
    const [op] = diffs[i]!;

    if (op === 0) {
      // Check if this retain is small and sandwiched between changes
      const isSmall = diffs[i]![1]!.length <= 1;
      const hasPrev = result.length > 0 && result[result.length - 1]![0]! !== 0;
      const hasNext = i + 1 < diffs.length && diffs[i + 1]![0]! !== 0;

      if (isSmall && hasPrev && hasNext) {
        // Absorb small retain into surrounding changes:
        // treat retained text as both deleted and inserted
        result.push([-1, diffs[i]![1]!]);
        result.push([1, diffs[i]![1]!]);
      } else {
        result.push(diffs[i]!);
      }
    } else {
      result.push(diffs[i]!);
    }
    i++;
  }

  // Merge consecutive same-type ops
  const merged: Array<[number, string]> = [result[0]!];
  for (let j = 1; j < result.length; j++) {
    const prev = merged[merged.length - 1]!;
    if (prev[0]! === result[j]![0]!) {
      merged[merged.length - 1] = [prev[0]!, prev[1]! + result[j]![1]!];
    } else {
      merged.push(result[j]!);
    }
  }

  return merged;
}

/**
 * ProseMirror position offset for CodeBlock schema.
 * All positions in the editor are shifted by 1 due to the CodeBlock node boundary.
 */
const PM_OFFSET = 1;

/**
 * Convert Yjs delta ops into ProseMirror transaction steps.
 * Applies inserts via tr.insertText() and deletes via tr.delete().
 *
 * Cursor tracking:
 *   - Starts at PM_OFFSET (1)
 *   - Advances on retain and insert
 *   - Does NOT advance on delete (ProseMirror positions shift automatically)
 */
export function applyDeltaToTransaction(
  tr: { insertText(text: string, pos: number): void; delete(from: number, to: number): void },
  delta: StashedDelta['delta'],
  _contentBefore: string,
): void {
  let cursor = PM_OFFSET;

  for (const op of delta) {
    if (op.retain !== undefined) {
      cursor += op.retain;
    } else if (op.delete !== undefined) {
      tr.delete(cursor, cursor + op.delete);
      // cursor does NOT advance on delete
    } else if (op.insert !== undefined && typeof op.insert === 'string') {
      tr.insertText(op.insert, cursor);
      cursor += op.insert.length;
    }
  }
}

/**
 * Merge multiple DiffData into a combined view.
 * Concatenates all added/deleted arrays from sequential diffs.
 */
export function combineDiffs(diffs: DiffData[]): DiffData {
  if (diffs.length === 0) return { added: [], deleted: [] };
  if (diffs.length === 1) return diffs[0]!;

  const added: DiffData['added'] = [];
  const deleted: DiffData['deleted'] = [];

  for (const diff of diffs) {
    added.push(...diff.added);
    deleted.push(...diff.deleted);
  }

  return { added, deleted };
}
