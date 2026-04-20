/**
 * Integration tests for file-watch undo stack behavior.
 *
 * Covers:
 *   FWAT-01: File-watch change is undoable after banner acceptance
 *   FWAT-02: File-watch changes are discrete undo steps, never merged with typing
 *
 * Uses happy-dom for ProseMirror DOM environment (same pattern as undo-history.test.ts).
 */

import { test, expect, describe, afterEach, afterAll } from 'bun:test';
import { Window } from 'happy-dom';

// Set up DOM globals for Tiptap (requires document, window, etc.)
const happyWindow = new Window();
(happyWindow as any).SyntaxError = SyntaxError;

Object.assign(globalThis, {
  window: happyWindow,
  document: happyWindow.document,
  HTMLElement: happyWindow.HTMLElement,
  Element: happyWindow.Element,
  Node: happyWindow.Node,
  navigator: happyWindow.navigator,
  getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
  DOMParser: happyWindow.DOMParser,
  MutationObserver: happyWindow.MutationObserver,
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  cancelAnimationFrame: clearTimeout,
});

afterAll(() => {
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator', 'getComputedStyle', 'DOMParser', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    delete (globalThis as any)[key];
  }
});

// Import after DOM globals are set
const { createEditor, setEditorContent, getEditorContent } = await import('../../src/web/editor');
const { closeHistory } = await import('@tiptap/pm/history');
const { undoDepth } = await import('@tiptap/pm/history');
const { applyDeltaToTransaction, resolveDeletedText } = await import('../../src/web/file-watch-delta');

import type { Editor } from '@tiptap/core';

/** Create a test editor attached to a DOM element. */
function makeEditor(): Editor {
  const el = document.createElement('div');
  return createEditor(el as any, {
    editable: true,
    onUpdate: () => {},
  });
}

const editors: Editor[] = [];
function tracked(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const e of editors) {
    try { e.destroy(); } catch { /* ignore */ }
  }
  editors.length = 0;
});

/**
 * Helper: apply a file-watch delta to the editor using the same flow
 * as app.ts banner click handler (closeHistory + dispatch).
 */
function applyFileWatchDelta(
  editor: Editor,
  delta: Array<{ insert?: string; delete?: number; retain?: number }>,
  contentBefore: string,
  isLast: boolean = true,
): void {
  // Force new undo group
  editor.view.dispatch(closeHistory(editor.state.tr));
  // Build and dispatch the content-changing transaction
  const { tr } = editor.state;
  applyDeltaToTransaction(tr, delta, contentBefore);
  const diffData = resolveDeletedText(delta, contentBefore);
  tr.setMeta('fileWatch', { diffData });
  if (isLast) {
    tr.setMeta('fileWatchLast', true);
  }
  editor.view.dispatch(tr);
}

describe('FWAT-01: File-watch change is undoable', () => {
  test('undoDepth increases by 1 after applying a file-watch delta', () => {
    const editor = tracked(makeEditor());
    setEditorContent(editor, 'hello world');
    const depthBefore = undoDepth(editor.state);

    // Simulate file-watch: insert " there" at position 5
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: ' there' }], 'hello world');
    // Close history after last delta
    editor.view.dispatch(closeHistory(editor.state.tr));

    expect(undoDepth(editor.state)).toBe(depthBefore + 1);
  });

  test('undoing a file-watch step restores previous content', () => {
    const editor = tracked(makeEditor());
    setEditorContent(editor, 'original');

    applyFileWatchDelta(editor, [{ delete: 8 }, { insert: 'modified' }], 'original');
    editor.view.dispatch(closeHistory(editor.state.tr));

    expect(getEditorContent(editor)).toBe('modified');

    // Undo the file-watch change
    editor.commands.undo();
    expect(getEditorContent(editor)).toBe('original');
  });
});

describe('FWAT-02: File-watch changes are discrete undo steps', () => {
  test('two file-watch deltas produce two separate undo steps', () => {
    const editor = tracked(makeEditor());
    setEditorContent(editor, 'abc');
    const depthBefore = undoDepth(editor.state);

    // First file-watch: insert "X" at position 1
    applyFileWatchDelta(editor, [{ retain: 1 }, { insert: 'X' }], 'abc', false);
    // Second file-watch: insert "Y" at position 3
    applyFileWatchDelta(editor, [{ retain: 3 }, { insert: 'Y' }], 'aXbc', true);
    // Close history after last delta
    editor.view.dispatch(closeHistory(editor.state.tr));

    expect(undoDepth(editor.state)).toBe(depthBefore + 2);
  });

  test('file-watch steps do NOT merge with subsequent typing', () => {
    const editor = tracked(makeEditor());
    setEditorContent(editor, 'hello');

    // Apply file-watch delta
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    editor.view.dispatch(closeHistory(editor.state.tr));

    const depthAfterFileWatch = undoDepth(editor.state);

    // Type some text (simulated via insertContent)
    editor.commands.insertContent('typed');
    const depthAfterTyping = undoDepth(editor.state);

    // Typing should have added a new undo step (not merged with file-watch)
    expect(depthAfterTyping).toBeGreaterThan(depthAfterFileWatch);

    // Undo should only revert the typing, not the file-watch change
    editor.commands.undo();
    // The file-watch change (appending '!') should still be present
    // Content should have '!' from file-watch but not 'typed'
    const content = getEditorContent(editor);
    expect(content).toContain('!');
    expect(content).not.toContain('typed');
  });
});
