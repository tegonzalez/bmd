/**
 * Tests for file-watch-delta.ts pure functions.
 *
 * Covers:
 *   - resolveDeletedText: delta -> DiffData with recovered deleted text
 *   - applyDeltaToTransaction: delta -> ProseMirror transaction steps
 *   - combineDiffs: merge multiple DiffData into combined view
 */

import { test, expect, describe } from 'bun:test';
import {
  resolveDeletedText,
  applyDeltaToTransaction,
  combineDiffs,
  type StashedDelta,
  type DiffData,
} from '../../src/web/file-watch-delta.ts';

describe('resolveDeletedText', () => {
  test('retain-only delta returns empty added/deleted arrays', () => {
    const delta = [{ retain: 10 }];
    const result = resolveDeletedText(delta, 'abcdefghij');
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  test('insert delta returns correct added range with text', () => {
    const delta = [{ retain: 3 }, { insert: 'XYZ' }];
    const result = resolveDeletedText(delta, 'abcdef');
    expect(result.added).toEqual([{ from: 3, to: 6, text: 'XYZ' }]);
    expect(result.deleted).toEqual([]);
  });

  test('delete delta returns correct deleted position with recovered text', () => {
    const delta = [{ retain: 2 }, { delete: 3 }];
    const result = resolveDeletedText(delta, 'abcdefgh');
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([{ pos: 2, text: 'cde' }]);
  });

  test('mixed retain/insert/delete delta returns correct combined DiffData', () => {
    // Content before: "Hello World"
    // Delta: retain 5, delete 1 (space), insert " Beautiful"
    // After: "Hello BeautifulWorld"
    // Text diff sees " Beautiful" inserted between "Hello " and "World"
    const delta = [{ retain: 5 }, { delete: 1 }, { insert: ' Beautiful' }];
    const result = resolveDeletedText(delta, 'Hello World');
    const allAdded = result.added.map(a => a.text).join('');
    expect(allAdded).toContain('Beautiful');
  });

  test('multiple sequential inserts produce non-overlapping ranges', () => {
    // Insert at position 0 and position 5 (after first insert shifts)
    const delta = [{ insert: 'AB' }, { retain: 3 }, { insert: 'CD' }];
    // contentBefore = "xyz", after delta = "ABxyzCD"
    const result = resolveDeletedText(delta, 'xyz');
    // Text diff "xyz" → "ABxyzCD": added "AB" at start, "CD" at end
    const allAdded = result.added.map(a => a.text).join('');
    expect(allAdded).toContain('AB');
    expect(allAdded).toContain('CD');
    expect(result.deleted).toHaveLength(0);
    // Verify non-overlapping
    if (result.added.length > 1) {
      for (let i = 1; i < result.added.length; i++) {
        expect(result.added[i - 1]!.to).toBeLessThanOrEqual(result.added[i]!.from);
      }
    }
  });

  test('delete at start of content recovers correct text', () => {
    const delta = [{ delete: 3 }];
    const result = resolveDeletedText(delta, 'abcdef');
    expect(result.deleted).toEqual([{ pos: 0, text: 'abc' }]);
  });

  test('insert at end of content', () => {
    const delta = [{ retain: 5 }, { insert: '!!!' }];
    const result = resolveDeletedText(delta, 'hello');
    expect(result.added).toEqual([{ from: 5, to: 8, text: '!!!' }]);
  });
});

describe('applyDeltaToTransaction', () => {
  /** Mock ProseMirror transaction that records calls. */
  function mockTr() {
    const calls: Array<{ method: string; args: any[] }> = [];
    return {
      calls,
      insertText(text: string, pos: number) {
        calls.push({ method: 'insertText', args: [text, pos] });
      },
      delete(from: number, to: number) {
        calls.push({ method: 'delete', args: [from, to] });
      },
    };
  }

  test('insert delta calls tr.insertText at PM_OFFSET + retain position', () => {
    const tr = mockTr();
    const delta = [{ retain: 3 }, { insert: 'XYZ' }];
    applyDeltaToTransaction(tr as any, delta, 'abcdef');
    expect(tr.calls).toEqual([
      { method: 'insertText', args: ['XYZ', 4] }, // PM_OFFSET(1) + 3
    ]);
  });

  test('delete delta calls tr.delete at correct PM_OFFSET range', () => {
    const tr = mockTr();
    const delta = [{ retain: 2 }, { delete: 3 }];
    applyDeltaToTransaction(tr as any, delta, 'abcdefgh');
    expect(tr.calls).toEqual([
      { method: 'delete', args: [3, 6] }, // PM_OFFSET(1) + 2, PM_OFFSET(1) + 2 + 3
    ]);
  });

  test('mixed delta applies ops in order with correct cursor tracking', () => {
    const tr = mockTr();
    // retain 2, insert "AB", delete 1
    const delta = [{ retain: 2 }, { insert: 'AB' }, { delete: 1 }];
    applyDeltaToTransaction(tr as any, delta, 'xyz');
    expect(tr.calls).toEqual([
      { method: 'insertText', args: ['AB', 3] },  // PM_OFFSET(1) + 2
      { method: 'delete', args: [5, 6] },           // cursor at 1+2+2=5, delete 1
    ]);
  });

  test('insert at start (no retain) uses PM_OFFSET', () => {
    const tr = mockTr();
    const delta = [{ insert: 'PREFIX' }];
    applyDeltaToTransaction(tr as any, delta, 'content');
    expect(tr.calls).toEqual([
      { method: 'insertText', args: ['PREFIX', 1] }, // PM_OFFSET only
    ]);
  });
});

describe('combineDiffs', () => {
  test('empty array returns empty DiffData', () => {
    const result = combineDiffs([]);
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  test('single DiffData returned as-is', () => {
    const input: DiffData = {
      added: [{ from: 0, to: 3, text: 'abc' }],
      deleted: [{ pos: 5, text: 'x' }],
    };
    const result = combineDiffs([input]);
    expect(result).toEqual(input);
  });

  test('multiple DiffData arrays concatenated', () => {
    const a: DiffData = {
      added: [{ from: 0, to: 2, text: 'AB' }],
      deleted: [],
    };
    const b: DiffData = {
      added: [{ from: 5, to: 7, text: 'CD' }],
      deleted: [{ pos: 3, text: 'x' }],
    };
    const result = combineDiffs([a, b]);
    expect(result.added).toHaveLength(2);
    expect(result.deleted).toHaveLength(1);
  });
});
