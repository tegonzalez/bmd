/**
 * Tests for Tiptap History extension integration in the bmd editor.
 *
 * Covers:
 *   UNDO-01: Undo available after edit
 *   UNDO-02: Redo available after undo
 *   UNDO-03: Adjacent inserts group into one undo step
 *   UNDO-04: setEditorContent does NOT pollute undo stack
 */

import { test, expect, describe, afterEach, afterAll } from 'bun:test';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import { undoDepth, redoDepth } from '@tiptap/pm/history';

// Set up DOM globals for Tiptap (requires document, window, etc.)
const happyWindow = new Window();

// Patch missing globals that Tiptap expects on the window object
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
const { createEditor, setEditorContent } = await import('../../src/web/editor');

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

describe('History extension presence', () => {
  test('History extension is loaded in editor', () => {
    const editor = tracked(makeEditor());
    const names = editor.extensionManager.extensions.map(e => e.name);
    expect(names).toContain('undoRedo');
  });
});

describe('UNDO-01: Undo after edit', () => {
  test('editor.can().undo() returns true after insertContent', () => {
    const editor = tracked(makeEditor());
    editor.commands.insertContent('hello');
    expect(editor.can().undo()).toBe(true);
  });
});

describe('UNDO-02: Redo after undo', () => {
  test('editor.can().redo() returns true after undo', () => {
    const editor = tracked(makeEditor());
    editor.commands.insertContent('hello');
    editor.commands.undo();
    expect(editor.can().redo()).toBe(true);
  });
});

describe('UNDO-03: Keystroke grouping', () => {
  test('two adjacent insertContent calls group into one undo step', () => {
    const editor = tracked(makeEditor());
    // Two back-to-back inserts with no selection change between them
    editor.commands.insertContent('a');
    editor.commands.insertContent('b');
    // Both should be in one group -- undoDepth should be 1
    expect(undoDepth(editor.state)).toBe(1);
    // A single undo should revert both
    editor.commands.undo();
    expect(undoDepth(editor.state)).toBe(0);
  });
});

describe('UNDO-04: setEditorContent excluded from history', () => {
  test('setEditorContent does NOT add to undo stack', () => {
    const editor = tracked(makeEditor());
    setEditorContent(editor, 'initial content');
    expect(editor.can().undo()).toBe(false);
    expect(undoDepth(editor.state)).toBe(0);
  });

  test('setEditorContent after edits does not add new undo step', () => {
    const editor = tracked(makeEditor());
    editor.commands.insertContent('typed');
    const depthBefore = undoDepth(editor.state);
    setEditorContent(editor, 'file reload');
    // undo depth should not have increased
    expect(undoDepth(editor.state)).toBe(depthBefore);
  });
});
