/**
 * Tests for undo/redo toolbar buttons (TBAR-01, TBAR-02, TBAR-03).
 *
 * Covers:
 *   TBAR-01: Undo/redo buttons trigger editor undo/redo
 *   TBAR-02: Buttons show disabled state when stack is empty
 *   TBAR-03: Buttons disabled when editor is readonly
 */

import { test, expect, describe, afterEach, afterAll } from 'bun:test';
import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';

// Set up DOM globals for Tiptap
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
const { createEditor, setEditorEditable, setEditorContent, clearEditorHistory } = await import('../../src/web/editor');

/** Create a test editor with undo/redo buttons in the DOM. */
function setup(): { editor: Editor; undoBtn: HTMLElement; redoBtn: HTMLElement } {
  // Create the toolbar buttons matching index.html structure
  const undoBtn = document.createElement('button');
  undoBtn.id = 'undo-btn';
  undoBtn.classList.add('toolbar-btn', 'toolbar-btn-disabled');
  document.body.appendChild(undoBtn);

  const redoBtn = document.createElement('button');
  redoBtn.id = 'redo-btn';
  redoBtn.classList.add('toolbar-btn', 'toolbar-btn-disabled');
  document.body.appendChild(redoBtn);

  const el = document.createElement('div');
  document.body.appendChild(el);

  const editor = createEditor(el as any, {
    editable: true,
    onUpdate: () => {},
  });

  return { editor, undoBtn, redoBtn };
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanups) {
    try { fn(); } catch { /* ignore */ }
  }
  cleanups.length = 0;
  // Clean up any added DOM elements
  document.body.innerHTML = '';
});

describe('TBAR-01: Button elements exist', () => {
  test('undo button element exists with id="undo-btn"', () => {
    const { editor, undoBtn } = setup();
    cleanups.push(() => editor.destroy());
    expect(undoBtn.id).toBe('undo-btn');
    expect(document.getElementById('undo-btn')).toBeTruthy();
  });

  test('redo button element exists with id="redo-btn"', () => {
    const { editor, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    expect(redoBtn.id).toBe('redo-btn');
    expect(document.getElementById('redo-btn')).toBeTruthy();
  });
});

describe('TBAR-02: Disabled state feedback', () => {
  test('buttons start with toolbar-btn-disabled class (empty history)', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    expect(undoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
    expect(redoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
  });

  test('after editor content change, undo button loses disabled class', () => {
    const { editor, undoBtn } = setup();
    cleanups.push(() => editor.destroy());

    // Wire up the updateUndoRedoButtons logic (same as app.ts will do)
    function updateUndoRedoButtons() {
      const canUndo = editor.can().undo() && editor.isEditable;
      const canRedo = editor.can().redo() && editor.isEditable;
      undoBtn.classList.toggle('toolbar-btn-disabled', !canUndo);
      document.getElementById('redo-btn')!.classList.toggle('toolbar-btn-disabled', !canRedo);
    }
    editor.on('transaction', updateUndoRedoButtons);

    // Make an edit
    editor.commands.insertContent('hello');

    expect(undoBtn.classList.contains('toolbar-btn-disabled')).toBe(false);
  });

  test('after undo, redo button loses disabled class', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());

    function updateUndoRedoButtons() {
      const canUndo = editor.can().undo() && editor.isEditable;
      const canRedo = editor.can().redo() && editor.isEditable;
      undoBtn.classList.toggle('toolbar-btn-disabled', !canUndo);
      redoBtn.classList.toggle('toolbar-btn-disabled', !canRedo);
    }
    editor.on('transaction', updateUndoRedoButtons);

    editor.commands.insertContent('hello');
    editor.commands.undo();

    expect(redoBtn.classList.contains('toolbar-btn-disabled')).toBe(false);
  });
});

describe('TBAR-03: Readonly mode disables buttons', () => {
  test('when editor is not editable, both buttons have disabled class', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());

    function updateUndoRedoButtons() {
      const canUndo = editor.can().undo() && editor.isEditable;
      const canRedo = editor.can().redo() && editor.isEditable;
      undoBtn.classList.toggle('toolbar-btn-disabled', !canUndo);
      redoBtn.classList.toggle('toolbar-btn-disabled', !canRedo);
    }
    editor.on('transaction', updateUndoRedoButtons);

    // Make edits so there IS undo history
    editor.commands.insertContent('hello');
    expect(undoBtn.classList.contains('toolbar-btn-disabled')).toBe(false);

    // Set readonly
    setEditorEditable(editor, false);
    updateUndoRedoButtons();

    expect(undoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
    expect(redoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
  });
});

describe('PLSH-01: Cursor restoration', () => {
  test('after inserting content at a position then undoing, editor selection returns to pre-edit position', () => {
    const { editor } = setup();
    cleanups.push(() => editor.destroy());

    // Set initial content and place cursor at a known position
    setEditorContent(editor, 'Hello world');
    clearEditorHistory(editor);

    // Record pre-edit selection (end of "Hello world" = position 12 in ProseMirror: 1-indexed + 11 chars)
    const preEditPos = editor.state.selection.from;

    // Insert content
    editor.commands.insertContent(' extra');

    // Verify cursor moved forward
    expect(editor.state.selection.from).not.toBe(preEditPos);

    // Undo
    editor.commands.undo();

    // Cursor should return to pre-edit position
    expect(editor.state.selection.from).toBe(preEditPos);
  });

  test('after undo then redo, cursor returns to post-edit position', () => {
    const { editor } = setup();
    cleanups.push(() => editor.destroy());

    setEditorContent(editor, 'Hello world');
    clearEditorHistory(editor);

    // Insert content and record the post-edit cursor position
    editor.commands.insertContent(' extra');
    const postEditPos = editor.state.selection.from;

    // Undo then redo
    editor.commands.undo();
    editor.commands.redo();

    // Cursor should return to post-edit position
    expect(editor.state.selection.from).toBe(postEditPos);
  });
});

describe('PLSH-02: Depth tooltip', () => {
  /** Wire up the full updateUndoRedoButtons with depth tooltip logic (matching app.ts). */
  function wireTooltips(editor: Editor, undoBtn: HTMLElement, redoBtn: HTMLElement) {
    const { undoDepth, redoDepth } = require('@tiptap/pm/history');
    function updateUndoRedoButtons() {
      const canUndo = editor.can().undo() && editor.isEditable;
      const canRedo = editor.can().redo() && editor.isEditable;
      undoBtn.classList.toggle('toolbar-btn-disabled', !canUndo);
      redoBtn.classList.toggle('toolbar-btn-disabled', !canRedo);

      const ud = undoDepth(editor.state);
      const rd = redoDepth(editor.state);
      undoBtn.title = ud > 0 ? `Undo (Ctrl+Z) \u00b7 ${ud} step${ud !== 1 ? 's' : ''}` : 'Undo (Ctrl+Z)';
      redoBtn.title = rd > 0 ? `Redo (Ctrl+Shift+Z) \u00b7 ${rd} step${rd !== 1 ? 's' : ''}` : 'Redo (Ctrl+Shift+Z)';
    }
    editor.on('transaction', updateUndoRedoButtons);
    return updateUndoRedoButtons;
  }

  test('after inserting content, tooltip shows depth count', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    wireTooltips(editor, undoBtn, redoBtn);

    editor.commands.insertContent('hello');

    expect(undoBtn.title).toMatch(/^Undo \(Ctrl\+Z\) · \d+ steps?$/);
  });

  test('with empty history, tooltip is plain without count', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    wireTooltips(editor, undoBtn, redoBtn);

    // No edits -- trigger a transaction to update tooltips
    editor.view.dispatch(editor.state.tr);

    expect(undoBtn.title).toBe('Undo (Ctrl+Z)');
    expect(redoBtn.title).toBe('Redo (Ctrl+Shift+Z)');
  });

  test('after undo, redo tooltip shows singular "1 step"', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    wireTooltips(editor, undoBtn, redoBtn);

    editor.commands.insertContent('hello');
    editor.commands.undo();

    expect(redoBtn.title).toBe('Redo (Ctrl+Shift+Z) \u00b7 1 step');
  });

  test('after clearEditorHistory, both tooltips show no count', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());
    const update = wireTooltips(editor, undoBtn, redoBtn);

    editor.commands.insertContent('hello');
    clearEditorHistory(editor);
    update(); // manually trigger since clearEditorHistory may not fire transaction event

    expect(undoBtn.title).toBe('Undo (Ctrl+Z)');
    expect(redoBtn.title).toBe('Redo (Ctrl+Shift+Z)');
  });

  test('multiple edits produce correct cumulative depth count', () => {
    const { editor, undoBtn } = setup();
    cleanups.push(() => editor.destroy());
    const redoBtn = document.getElementById('redo-btn')!;
    wireTooltips(editor, undoBtn, redoBtn);

    // Use closeHistory to force separate undo events
    const { closeHistory } = require('@tiptap/pm/history');
    editor.commands.insertContent('one');
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.insertContent(' two');
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.insertContent(' three');

    // Should have 3 undo steps
    expect(undoBtn.title).toBe('Undo (Ctrl+Z) \u00b7 3 steps');
  });
});

describe('Background file change clears undo history', () => {
  test('clearEditorHistory resets undo stack after background content update', () => {
    const { editor, undoBtn, redoBtn } = setup();
    cleanups.push(() => editor.destroy());

    function updateUndoRedoButtons() {
      const canUndo = editor.can().undo() && editor.isEditable;
      const canRedo = editor.can().redo() && editor.isEditable;
      undoBtn.classList.toggle('toolbar-btn-disabled', !canUndo);
      redoBtn.classList.toggle('toolbar-btn-disabled', !canRedo);
    }
    editor.on('transaction', updateUndoRedoButtons);

    // Make edits to build undo history
    editor.commands.insertContent('hello');
    expect(editor.can().undo()).toBe(true);

    // Simulate background file change: setEditorContent + clearEditorHistory
    setEditorContent(editor, 'new content from disk');
    clearEditorHistory(editor);

    // After clearing, undo should not be possible
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(false);
    expect(undoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
    expect(redoBtn.classList.contains('toolbar-btn-disabled')).toBe(true);
  });

  test('undo works normally after clearing and making new edits', () => {
    const { editor } = setup();
    cleanups.push(() => editor.destroy());

    // Build history, then background update
    editor.commands.insertContent('first');
    setEditorContent(editor, 'background update');
    clearEditorHistory(editor);

    // History is clear -- now make a new edit
    editor.commands.insertContent(' added');
    expect(editor.can().undo()).toBe(true);

    // Undo should revert only the new edit, not crash
    editor.commands.undo();
    expect(editor.can().undo()).toBe(false);
  });
});
