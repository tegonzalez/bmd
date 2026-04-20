/**
 * Tests for diff-decoration.ts ProseMirror plugin.
 *
 * Covers:
 *   DIFF-01: Added text gets green highlight decorations
 *   DIFF-02: Deleted text gets ghost widget decorations
 *   DIFF-03: Decorations dismiss on content-modifying keystroke, NOT on navigation
 *   DIFF-04: Decorations reappear on undo/redo to file-watch position
 *   Navigation: F7/Shift+F7 cycle through diff regions
 *   Combined diff: fileWatchLast triggers combineDiffs display
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
  KeyboardEvent: happyWindow.KeyboardEvent ?? class KeyboardEvent extends Event {
    key: string; shiftKey: boolean;
    constructor(type: string, init?: any) {
      super(type, init);
      this.key = init?.key ?? '';
      this.shiftKey = init?.shiftKey ?? false;
    }
  },
});

afterAll(() => {
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator', 'getComputedStyle', 'DOMParser', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'KeyboardEvent']) {
    delete (globalThis as any)[key];
  }
});

// Import after DOM globals are set
const { createEditor, setEditorContent, getEditorContent } = await import('../../src/web/editor');
const { closeHistory, undoDepth } = await import('@tiptap/pm/history');
const { applyDeltaToTransaction, resolveDeletedText } = await import('../../src/web/file-watch-delta');
const { diffPluginKey, DiffDecoration, DiffDecorationPlugin } = await import('../../src/web/diff-decoration');
const { TextSelection } = await import('@tiptap/pm/state');

import type { Editor } from '@tiptap/core';
import type { DiffPluginState } from '../../src/web/diff-decoration';

// Build editor extensions with DiffDecoration included
const { Editor: TiptapEditor } = await import('@tiptap/core');
const Document = (await import('@tiptap/extension-document')).default;
const TextExt = (await import('@tiptap/extension-text')).default;
const CodeBlockLowlight = (await import('@tiptap/extension-code-block-lowlight')).default;
const History = (await import('@tiptap/extension-history')).default;
const { createLowlight, common } = await import('lowlight');
const markdownLang = (await import('highlight.js/lib/languages/markdown')).default;
const lowlight = createLowlight(common);
lowlight.register('markdown', markdownLang);

/** Create a test editor with DiffDecoration extension included. */
function makeEditor(): Editor {
  const el = document.createElement('div');
  return new TiptapEditor({
    element: el as any,
    extensions: [
      Document,
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'markdown' }),
      TextExt,
      DiffDecoration,
      History.configure({ depth: 200, newGroupDelay: 500 }),
    ],
    content: '<pre><code class="language-markdown"></code></pre>',
    editable: true,
    onUpdate() {},
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

/** Helper: get the diff plugin state from editor. */
function getDiffState(editor: Editor): DiffPluginState {
  return diffPluginKey.getState(editor.state)!;
}

/** Helper: set editor content without history. */
function setContent(editor: Editor, text: string): void {
  setEditorContent(editor, text);
}

/**
 * Helper: apply a file-watch delta to the editor using the same flow
 * as app.ts banner click handler (closeHistory + dispatch with meta).
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

describe('Plugin init', () => {
  test('plugin init returns idle state with empty decorations', () => {
    const editor = tracked(makeEditor());
    const state = getDiffState(editor);
    expect(state.phase).toBe('idle');
    expect(state.decorations.find().length).toBe(0);
  });
});

describe('DIFF-01: Added text highlighted', () => {
  test('fileWatch meta with added ranges produces inline decorations with bmd-diff-added class', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello world');

    // Simulate file-watch: insert " there" at position 5
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: ' there' }], 'hello world');

    const state = getDiffState(editor);
    expect(state.phase).toBe('showing');
    const decorations = state.decorations.find();
    // Should have at least one inline decoration for the added text
    const addedDeco = decorations.filter((d: any) =>
      d.type && d.type.attrs && d.type.attrs.class === 'bmd-diff-added'
    );
    expect(addedDeco.length).toBeGreaterThan(0);
  });
});

describe('DIFF-02: Deleted text as ghost widget', () => {
  test('fileWatch meta with deleted text produces widget decorations', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello world');

    // Simulate file-watch: delete "world" (5 chars starting at pos 6)
    applyFileWatchDelta(editor, [{ retain: 6 }, { delete: 5 }], 'hello world');

    const state = getDiffState(editor);
    expect(state.phase).toBe('showing');
    const decorations = state.decorations.find();
    // Should have at least one widget decoration for deleted ghost text
    const widgetDeco = decorations.filter((d: any) => d.type && d.type.toDOM);
    expect(widgetDeco.length).toBeGreaterThan(0);
  });
});

describe('DIFF-03: Decorations dismiss on content edit, not navigation', () => {
  test('content-modifying transaction (not undo/redo) transitions to dismissed', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    // Show decorations
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    expect(getDiffState(editor).phase).toBe('showing');

    // User types something (content edit)
    editor.commands.insertContent('x');
    expect(getDiffState(editor).phase).toBe('dismissed');
    expect(getDiffState(editor).decorations.find().length).toBe(0);
  });

  test('selection-only transaction does NOT dismiss decorations', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello world');

    // Show decorations
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello world');
    expect(getDiffState(editor).phase).toBe('showing');

    // Move selection (no doc change) -- dispatch a selection-only transaction
    const { tr } = editor.state;
    tr.setSelection(TextSelection.create(editor.state.doc, 1));
    editor.view.dispatch(tr);

    expect(getDiffState(editor).phase).toBe('showing');
    expect(getDiffState(editor).decorations.find().length).toBeGreaterThan(0);
  });
});

describe('DIFF-04: Decorations reappear on undo to file-watch position', () => {
  test('undo file-watch step then redo restores decorations', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    // Apply file-watch delta
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    editor.view.dispatch(closeHistory(editor.state.tr));

    expect(getDiffState(editor).phase).toBe('showing');

    // Undo the file-watch change (no user edits in between, versions preserved)
    editor.commands.undo();
    // After undo, should go to idle (undo depth no longer matches)
    expect(getDiffState(editor).phase).toBe('idle');

    // Redo the file-watch change -- undo depth matches stored version
    editor.commands.redo();
    const state = getDiffState(editor);
    expect(state.phase).toBe('showing');
    expect(state.decorations.find().length).toBeGreaterThan(0);
  });

  test('user types after file-watch, then undo restores decorations (DIFF-04 regression)', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    // Apply file-watch delta (adds "!" at end)
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    editor.view.dispatch(closeHistory(editor.state.tr));

    expect(getDiffState(editor).phase).toBe('showing');
    expect(getDiffState(editor).decorations.find().length).toBeGreaterThan(0);

    // User types something -- decorations dismissed
    editor.commands.insertContent('x');
    expect(getDiffState(editor).phase).toBe('dismissed');
    expect(getDiffState(editor).decorations.find().length).toBe(0);

    // fileWatchVersions must still be populated after content edit
    expect(getDiffState(editor).fileWatchVersions.size).toBeGreaterThan(0);

    // Undo the user's typing -- lands back on file-watch position
    editor.commands.undo();
    const afterUndo = getDiffState(editor);
    expect(afterUndo.phase).toBe('showing');
    expect(afterUndo.decorations.find().length).toBeGreaterThan(0);
  });

  test('redo after undo restores decorations through dismiss cycle', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    // Apply file-watch delta
    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    editor.view.dispatch(closeHistory(editor.state.tr));
    expect(getDiffState(editor).phase).toBe('showing');

    // User types -> dismissed
    editor.commands.insertContent('x');
    expect(getDiffState(editor).phase).toBe('dismissed');

    // Undo typing -> showing
    editor.commands.undo();
    expect(getDiffState(editor).phase).toBe('showing');

    // Undo file-watch -> idle
    editor.commands.undo();
    expect(getDiffState(editor).phase).toBe('idle');

    // Redo file-watch -> showing again
    editor.commands.redo();
    const afterRedo = getDiffState(editor);
    expect(afterRedo.phase).toBe('showing');
    expect(afterRedo.decorations.find().length).toBeGreaterThan(0);
  });
});

describe('Combined diff on fileWatchLast', () => {
  test('intermediate fileWatch without fileWatchLast does not show decorations', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'abc');

    // First delta (intermediate - not last)
    applyFileWatchDelta(editor, [{ retain: 1 }, { insert: 'X' }], 'abc', false);

    const state = getDiffState(editor);
    // Should not be showing yet (waiting for fileWatchLast)
    expect(state.decorations.find().length).toBe(0);
  });

  test('fileWatchLast triggers combined diff display from accumulated diffs', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'abc');

    // First delta (intermediate)
    applyFileWatchDelta(editor, [{ retain: 1 }, { insert: 'X' }], 'abc', false);
    // Second delta (last)
    applyFileWatchDelta(editor, [{ retain: 3 }, { insert: 'Y' }], 'aXbc', true);

    const state = getDiffState(editor);
    expect(state.phase).toBe('showing');
    // Should have decorations for both additions
    expect(state.decorations.find().length).toBeGreaterThanOrEqual(2);
  });
});

describe('F7 navigation', () => {
  test('F7 returns false when not in showing state', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    const state = getDiffState(editor);
    // After setContent (addToHistory:false), phase remains idle
    expect(state.phase).toBe('idle');

    // F7 should not be handled when not showing
    const event = new (globalThis as any).KeyboardEvent('keydown', { key: 'F7' });
    // We test via the plugin props handleKeyDown
    const handled = (DiffDecorationPlugin.props as any).handleKeyDown!(editor.view, event);
    expect(handled).toBe(false);
  });

  test('F7 moves to next diff region when showing', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello world test');

    // Add decorations with multiple added regions
    applyFileWatchDelta(
      editor,
      [{ retain: 5 }, { insert: 'X' }, { retain: 6 }, { insert: 'Y' }],
      'hello world test',
    );

    const state = getDiffState(editor);
    expect(state.phase).toBe('showing');

    const event = new (globalThis as any).KeyboardEvent('keydown', { key: 'F7' });
    const handled = (DiffDecorationPlugin.props as any).handleKeyDown!(editor.view, event);
    expect(handled).toBe(true);
  });
});

describe('File-watch version tracking preserved for undo restoration', () => {
  test('fileWatchVersions preserved when user edits content (for DIFF-04 undo)', () => {
    const editor = tracked(makeEditor());
    setContent(editor, 'hello');

    applyFileWatchDelta(editor, [{ retain: 5 }, { insert: '!' }], 'hello');
    editor.view.dispatch(closeHistory(editor.state.tr));

    let state = getDiffState(editor);
    expect(state.fileWatchVersions.size).toBeGreaterThan(0);

    // User types -- versions must persist for undo restoration
    editor.commands.insertContent('x');
    state = getDiffState(editor);
    expect(state.fileWatchVersions.size).toBeGreaterThan(0);
  });
});
