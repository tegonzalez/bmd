/**
 * Tiptap editor with CodeBlock-only schema for Markdown source editing.
 * Uses lowlight for Markdown syntax highlighting in the editor pane.
 * Includes History extension for undo/redo with keystroke grouping.
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import { Editor, Extension } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import History from '@tiptap/extension-history';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin, type EditorState } from '@tiptap/pm/state';
import { common, createLowlight } from 'lowlight';
import markdown from 'highlight.js/lib/languages/markdown';
import { UnicodeDetection } from './unicode-decoration.ts';
import { DiffDecoration } from './diff-decoration.ts';

const lowlight = createLowlight(common);
lowlight.register('markdown', markdown);

export interface EditorOptions {
  editable: boolean;
  onUpdate: (text: string) => void;
}

/**
 * Custom extension that breaks the undo group when the cursor moves
 * without content changing (click, arrow keys). This ensures cursor
 * repositioning starts a new undo step.
 */
const CursorJumpGroupBreaker = Extension.create({
  name: 'cursorJumpGroupBreaker',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, oldState, newState) {
        const selChanged = !oldState.selection.eq(newState.selection);
        const docChanged = !oldState.doc.eq(newState.doc);
        if (selChanged && !docChanged) {
          return closeHistory(newState.tr);
        }
        return null;
      },
    })];
  },
});

/**
 * Create a Tiptap editor in the given element with CodeBlock-only schema.
 */
export function createEditor(element: HTMLElement, options: EditorOptions): Editor {
  return new Editor({
    element,
    extensions: [
      Document,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'markdown',
      }),
      Text,
      UnicodeDetection,
      DiffDecoration,
      History.configure({
        depth: 200,
        newGroupDelay: 500,
      }),
      CursorJumpGroupBreaker,
    ],
    content: '<pre><code class="language-markdown"></code></pre>',
    editable: options.editable,
    onUpdate({ editor }) {
      options.onUpdate(editor.state.doc.textContent);
    },
  });
}

/**
 * Set editor content without triggering onUpdate and without adding to undo history.
 * Uses a raw ProseMirror transaction with addToHistory:false to prevent
 * initial loads and file-watch updates from polluting the undo stack (UNDO-04).
 */
export function setEditorContent(editor: Editor, text: string): void {
  const html = `<pre><code class="language-markdown">${escapeHtml(text)}</code></pre>`;
  const { schema } = editor.state;
  // Parse HTML into a ProseMirror document fragment
  const domParser = (globalThis as any).DOMParser
    ? new (globalThis as any).DOMParser()
    : null;
  if (!domParser) {
    // Fallback: use Tiptap setContent (won't exclude from history in edge cases)
    writeDiagnostic({ file: 'src/web/editor.ts', line: 92, col: 5, span: 0, message: 'DOMParser unavailable -- setEditorContent history exclusion degraded', severity: Severity.Info });
    editor.commands.setContent(html, { emitUpdate: false });
    return;
  }
  const parsed = domParser.parseFromString(html, 'text/html');
  const doc = PmDOMParser.fromSchema(schema).parse(parsed.body);
  const { tr } = editor.state;
  tr.replaceWith(0, editor.state.doc.content.size, doc.content);
  tr.setMeta('addToHistory', false);
  tr.setMeta('preventUpdate', true);
  editor.view.dispatch(tr);
}

/**
 * Clear the editor's undo/redo history.
 * Called after background file changes replace the document, since old undo
 * steps reference a document state that no longer exists and would corrupt
 * undo behavior.
 *
 * Works by finding the ProseMirror history plugin via its key convention
 * ("history$") and dispatching a transaction that replaces its internal
 * state with a fresh empty state (matching the plugin's init pattern).
 */
export function clearEditorHistory(editor: Editor): void {
  const state = editor.state;
  // Find the history plugin key by convention -- prosemirror-history uses
  // PluginKey("history") which produces key string "history$"
  const historyPlugin = state.plugins.find(
    (p: any) => p.key === 'history$'
  );
  if (!historyPlugin) {
    writeDiagnostic({ file: 'src/web/editor.ts', line: 123, col: 5, span: 0, message: 'clearEditorHistory: history plugin not found', severity: Severity.DiagError });
    return;
  }

  // Read the current plugin state to get the Branch constructor for empty branches
  const currentHistState = (historyPlugin as any).getState(state);
  if (!currentHistState) return;

  // Branch.empty objects from the done/undone fields -- we need structurally
  // identical empty branches. Access the constructor's empty static if available,
  // otherwise create a minimal compatible shape.
  const emptyBranch = currentHistState.done.constructor.empty
    ?? { items: { length: 0 }, eventCount: 0 };

  // Build fresh empty history state matching HistoryState(Branch.empty, Branch.empty, null, 0, -1)
  const freshState = new currentHistState.constructor(
    emptyBranch, emptyBranch, null, 0, -1
  );

  // Dispatch a transaction with the history plugin's key as meta.
  // prosemirror-history checks tr.getMeta(historyKey) and if present,
  // returns historyTr.historyState directly as the new plugin state.
  const { tr } = state;
  tr.setMeta((historyPlugin as unknown as { key: string }).key, { historyState: freshState });
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
}

/**
 * Get the raw text content from the editor.
 */
export function getEditorContent(editor: Editor): string {
  return editor.state.doc.textContent;
}

/**
 * Set whether the editor is editable.
 */
export function setEditorEditable(editor: Editor, editable: boolean): void {
  editor.setEditable(editable);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ProseMirror model DOMParser — static import (bundled by esbuild)
import { DOMParser as PmDOMParser } from '@tiptap/pm/model';
