/**
 * Main app entry point for bmd web preview.
 * THIN UI LAYER — no protocol logic.
 *
 * All protocol state, Yjs operations, digest tracking, and reconciliation
 * live in client-adapter.ts. This file only wires DOM events to the adapter
 * and applies UI-side effects (editor content, preview, notifications).
 */

// Explicit browser marker — used by the WASM guard in transform.ts to detect
// real browser context without relying on fragile typeof window checks that
// break under test environments (happy-dom, jsdom).
(globalThis as any).__BMD_BROWSER__ = true;

import { createEditor, setEditorContent, getEditorContent, setEditorEditable, clearEditorHistory } from './editor.ts';
import { closeHistory, undoDepth, redoDepth } from '@tiptap/pm/history';
import { applyDeltaToTransaction, resolveDeletedText } from './file-watch-delta.ts';
import { renderPreview, initPreviewRenderer, resetIncrementalState } from './preview.ts';
import { setFindings, setRegions } from './unicode-decoration.ts';
import { createWebSocketClient, type WebSocketClient } from './ws-client.ts';
import { initConnectionStatus, type ConnectionStatus } from './connection-status.ts';
import { initNotifications, notifyPersistent, notifyClickable, notifyTransient } from './notifications.ts';
import { setViewMode, initDivider, initModeButtons, initLockBadge } from './layout.ts';
import { initColorMode, applyUnicTheme } from './theme.ts';
import { DEFAULT_UNIC } from '../theme/defaults.ts';
import { writeDiagnostic, defaultLogger, bindDiagnosticTransport, unbindDiagnosticTransport, setLogLevel, Severity } from '../diagnostics/formatter.ts';
import {
  createInitialAdapterState,
  processServerMessage,
  handleEditorUpdate,
  drainPendingDeltas,
  syncLastYjsContentAfterDeltaDrain,
  determineSaveAction,
  type AdapterState,
} from './client-adapter.ts';
import type { ClientEffect } from '../protocol/types.ts';
import type { Editor } from '@tiptap/core';

let editor: Editor | null = null;
let wsClient: WebSocketClient | null = null;
let adapter: AdapterState = createInitialAdapterState();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncingScroll = false;
let previewPaneRef: HTMLElement | null = null;
let setStatusDot: ((status: ConnectionStatus) => void) | null = null;

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Pure UI helpers — DOM only, no protocol logic
// ---------------------------------------------------------------------------

function updateFilename(path: string | null, modified: boolean) {
  const el = document.getElementById('filename');
  if (!el) return;
  const name = path ? path.split('/').pop()! : 'Untitled';
  el.textContent = modified ? `${name} •` : name;
}

function setUnsaved(val: boolean) {
  const el = document.getElementById('filename');
  if (!el) return;
  const text = el.textContent || '';
  if (val && !text.endsWith(' •')) {
    el.textContent = text + ' •';
  } else if (!val && text.endsWith(' •')) {
    el.textContent = text.slice(0, -2);
  }
}

function safeRenderPreview(source: string, target: HTMLElement, unsafeHtml?: boolean): void {
  renderPreview(source, target, unsafeHtml, adapter.currentValues, adapter.templatesEnabled)
    .then(({ findings, regions }) => {
      setRegions(regions);
      setFindings(findings, editor?.view);
    })
    .catch((err: unknown) => writeDiagnostic({ file: 'src/web/app.ts', line: 72, col: 5, span: 0, message: `preview render: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError }));
}

// ---------------------------------------------------------------------------
// Apply pending deltas to editor (DOM-side of drainPendingDeltas)
// ---------------------------------------------------------------------------

function applyPendingDeltasToEditor(): void {
  if (!editor) return;
  const { deltas, state } = drainPendingDeltas(adapter);
  if (deltas.length === 0) return;
  adapter = state;

  const isLast = (i: number) => i === deltas.length - 1;
  for (let i = 0; i < deltas.length; i++) {
    const stashed = deltas[i]!;
    editor.view.dispatch(closeHistory(editor.state.tr));
    const { tr } = editor.state;
    applyDeltaToTransaction(tr, stashed.delta, stashed.contentBefore);
    const diffData = resolveDeletedText(stashed.delta, stashed.contentBefore);
    tr.setMeta('fileWatch', { diffData });
    if (isLast(i)) tr.setMeta('fileWatchLast', true);
    editor.view.dispatch(tr);
  }
  editor.view.dispatch(closeHistory(editor.state.tr));
  adapter = syncLastYjsContentAfterDeltaDrain(adapter);
  if (previewPaneRef) {
    safeRenderPreview(getEditorContent(editor), previewPaneRef, adapter.clientState.fileConfig?.unsafeHtml);
  }
}

// ---------------------------------------------------------------------------
// UI effect dispatcher — handles ONLY DOM-side effects
// ---------------------------------------------------------------------------

function applyUiEffect(effect: ClientEffect, previewPane: HTMLElement): void {
  switch (effect.type) {
    case 'set-editor-content':
      if (editor) {
        setEditorContent(editor, effect.content);
        clearEditorHistory(editor);
        resetIncrementalState();
      }
      break;
    case 'render-preview':
      safeRenderPreview(effect.content, previewPane, effect.unsafeHtml);
      break;
    case 'set-view-mode':
      setViewMode(effect.mode);
      break;
    case 'init-color-mode':
      initColorMode(effect.colorMode);
      break;
    case 'init-lock-badge':
      initLockBadge(effect.readonly);
      break;
    case 'set-editor-editable':
      if (editor) setEditorEditable(editor, effect.editable);
      break;
    case 'update-filename':
      updateFilename(effect.path, effect.modified);
      break;
    case 'set-unsaved':
      setUnsaved(effect.unsaved);
      break;
    case 'show-banner': {
      const enriched = effect as any;
      if (enriched._hasPendingDeltas) {
        notifyClickable(enriched.text, () => {
          if (!editor || !previewPaneRef) return;
          applyPendingDeltasToEditor();
          const merged = getEditorContent(editor);
          adapter = {
            ...adapter,
            clientState: { ...adapter.clientState, content: merged },
          };
        });
      } else {
        notifyPersistent(effect.text);
      }
      break;
    }
    case 'show-timed-banner':
      notifyTransient(effect.text, effect.durationMs);
      break;
    case 'refresh-from-yjs': {
      if (!adapter.yDoc) break;
      const merged = adapter.yDoc.getText('content').toString();
      if (editor) {
        setEditorContent(editor, merged);
        clearEditorHistory(editor);
        safeRenderPreview(merged, previewPane, adapter.clientState.fileConfig?.unsafeHtml);
      }
      break;
    }
    case 'store-values':
      // Adapter already updated currentValues/templatesEnabled
      if (editor && previewPaneRef) {
        const text = getEditorContent(editor);
        safeRenderPreview(text, previewPaneRef, adapter.clientState.fileConfig?.unsafeHtml);
      }
      break;
    case 'set-connection-status':
      setStatusDot?.(effect.status);
      break;
    case 'notify-version-mismatch':
      notifyPersistent(`Protocol mismatch: client v${effect.clientVersion} / server v${effect.serverVersion}`);
      break;
    case 'set-log-level':
      setLogLevel(effect.level);
      break;
  }
}

// ---------------------------------------------------------------------------
// Error reporting
// ---------------------------------------------------------------------------

window.addEventListener('unhandledrejection', (e) => writeDiagnostic({ file: e.reason?.fileName || 'src/web/app.ts', line: e.reason?.lineNumber || 187, col: e.reason?.columnNumber || 1, span: 0, message: `unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`, severity: Severity.DiagError }));
window.addEventListener('error', (e) => writeDiagnostic({ file: e.filename || 'src/web/app.ts', line: e.lineno || 188, col: e.colno || 1, span: 0, message: `uncaught error: ${e.error instanceof Error ? e.error.message : String(e.error ?? e.message)}`, severity: Severity.DiagError }));

// ---------------------------------------------------------------------------
// App initialization — DOM wiring only
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  defaultLogger.log(Severity.Debug, 'DOMContentLoaded fired');

  const editorPane = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  if (!editorPane || !previewPane) {
    writeDiagnostic({ file: 'src/web/app.ts', line: 202, col: 3, span: 0, message: `panes missing: editor=${!!editorPane} preview=${!!previewPane}`, severity: Severity.DiagError });
    return;
  }
  previewPaneRef = previewPane;

  defaultLogger.log(Severity.Debug, 'initPreviewRenderer start');
  await initPreviewRenderer();
  defaultLogger.log(Severity.Debug, 'initPreviewRenderer done');
  applyUnicTheme(DEFAULT_UNIC);

  defaultLogger.log(Severity.Debug, 'createEditor start');
  // Create editor
  editor = createEditor(editorPane, {
    editable: true,
    onUpdate(text: string) {
      adapter = handleEditorUpdate(adapter, text);
      setUnsaved(true);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        safeRenderPreview(text, previewPane, adapter.clientState.fileConfig?.unsafeHtml);
      }, DEBOUNCE_MS);
    },
  });

  // Wire undo/redo toolbar buttons
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');

  undoBtn?.addEventListener('click', () => {
    editor?.chain().focus().undo().run();
  });
  redoBtn?.addEventListener('click', () => {
    editor?.chain().focus().redo().run();
  });

  function updateUndoRedoButtons() {
    if (!editor || !undoBtn || !redoBtn) return;
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
  defaultLogger.log(Severity.Debug, 'createEditor done, creating WS client');

  // WebSocket client — adapter handles all protocol logic
  const ws = wsClient = createWebSocketClient({
    onMessage(msg) {
      defaultLogger.log(Severity.Debug, `onMessage: ${msg.type}`);
      try {
        const result = processServerMessage(adapter, msg);
        adapter = result.state;

        for (const out of result.outgoing) {
          ws.send(out);
        }

        defaultLogger.log(Severity.Debug, `effects: [${result.effects.map(e => e.type).join(', ')}]`);
        for (const effect of result.effects) {
          applyUiEffect(effect, previewPane);
        }
      } catch (err) {
        writeDiagnostic({ file: 'src/web/app.ts', line: 268, col: 7, span: 0, message: `onMessage CRASHED on ${msg.type}: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
      }
    },
    onStatusChange(status) {
      defaultLogger.log(Severity.Debug, `onStatusChange: ${status}`);
      adapter = { ...adapter, isOnline: status === 'connected' };
      setStatusDot?.(status);
      if (status === 'connected') {
        bindDiagnosticTransport((msg) => wsClient?.send(msg));
      } else if (status === 'disconnected') {
        unbindDiagnosticTransport();
      }
    },
  });

  // Initialize layout
  initModeButtons();
  initDivider();
  initNotifications();

  // Initialize connection status dot
  setStatusDot = initConnectionStatus('.status-left', () => wsClient?.retryNow());
  setStatusDot('connected');

  // Save handler: Ctrl+S / Cmd+S
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!editor) return;

      // Auto-apply pending deltas before save
      if (adapter.pendingDeltas.length > 0) {
        applyPendingDeltasToEditor();
      }

      const content = getEditorContent(editor);
      adapter = {
        ...adapter,
        clientState: { ...adapter.clientState, content },
      };

      const action = determineSaveAction(
        content,
        adapter.isOnline,
        adapter.clientState.currentPath,
      );

      if (action.type === 'write') {
        ws.send({ type: 'file:write', content: action.content });
      } else {
        const blob = new Blob([action.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = action.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  });

  // Lock badge toggle
  document.addEventListener('lock-changed', ((e: CustomEvent) => {
    if (editor) {
      setEditorEditable(editor, !e.detail.locked);
      updateUndoRedoButtons();
    }
  }) as EventListener);

  // Scroll sync between editor and preview
  function syncScroll(source: HTMLElement, target: HTMLElement) {
    if (syncingScroll) return;
    syncingScroll = true;
    requestAnimationFrame(() => {
      const maxSource = source.scrollHeight - source.clientHeight;
      const maxTarget = target.scrollHeight - target.clientHeight;
      if (maxSource > 0 && maxTarget > 0) {
        const ratio = source.scrollTop / maxSource;
        target.scrollTop = ratio * maxTarget;
      }
      syncingScroll = false;
    });
  }

  requestAnimationFrame(() => {
    const tiptapEl = editorPane.querySelector('.tiptap') as HTMLElement | null;
    if (tiptapEl) {
      tiptapEl.addEventListener('scroll', () => syncScroll(tiptapEl, previewPane));
      previewPane.addEventListener('scroll', () => syncScroll(previewPane, tiptapEl));
    }
  });
});
