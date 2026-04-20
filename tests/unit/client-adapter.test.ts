/**
 * Unit tests for client-adapter.ts — all protocol logic extracted from app.ts.
 * Tests Yjs operations, digest handling, reconciliation, message processing,
 * and save logic WITHOUT any browser/DOM dependencies.
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';
import {
  createInitialAdapterState,
  processServerMessage,
  syncToYjs,
  applyYjsUpdate,
  syncYjsState,
  resetYjs,
  drainPendingDeltas,
  syncLastYjsContentAfterDeltaDrain,
  buildReconcileRequest,
  determineSaveAction,
  handleEditorUpdate,
  type AdapterState,
} from '../../src/web/client-adapter.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import type { FileOpenMessage, ReconcileCompleteMessage, ServerMessage } from '../../src/types/ws-messages.ts';

function adapterWithContent(content: string): AdapterState {
  const state = createInitialAdapterState();
  const doc = new Y.Doc();
  doc.getText('content').insert(0, content);
  // Clone for syncDoc (shared lineage, same as production code)
  const sync = new Y.Doc();
  Y.applyUpdate(sync, Y.encodeStateAsUpdate(doc));
  return {
    ...state,
    yDoc: doc,
    syncDoc: sync,
    lastYjsContent: content,
    clientState: {
      ...state.clientState,
      content,
      lastDigest: hashContent(content),
    },
  };
}

// ---------------------------------------------------------------------------
// Yjs operations
// ---------------------------------------------------------------------------

describe('syncToYjs', () => {
  test('syncs new text into Y.Doc via diff', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'hello');
    const result = syncToYjs(doc, 'hello', 'hello world');
    expect(doc.getText('content').toString()).toBe('hello world');
    expect(result).toBe('hello world');
  });

  test('returns old content when yDoc is null', () => {
    const result = syncToYjs(null, 'old', 'new');
    expect(result).toBe('old');
  });
});

describe('applyYjsUpdate', () => {
  test('applies update and captures delta', () => {
    // Create two docs, apply change to one, send update to other
    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'hello');
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Make change in doc1
    let update: Uint8Array | null = null;
    doc1.on('update', (u: Uint8Array) => { update = u; });
    doc1.getText('content').insert(5, ' world');
    doc1.off('update', () => {});

    // Apply to doc2 via adapter
    const base64 = btoa(String.fromCharCode(...update!));
    const result = applyYjsUpdate(doc2, base64);

    expect(result).not.toBeNull();
    expect(result!.contentBefore).toBe('hello');
    expect(doc2.getText('content').toString()).toBe('hello world');
  });

  test('returns null when yDoc is null', () => {
    expect(applyYjsUpdate(null, 'abc')).toBeNull();
  });
});

describe('syncYjsState', () => {
  test('creates doc from base64 state', () => {
    const source = new Y.Doc();
    source.getText('content').insert(0, 'test content');
    const base64 = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(source)));

    const result = syncYjsState(null, base64);
    expect(result.content).toBe('test content');
    expect(result.doc.getText('content').toString()).toBe('test content');
  });

  test('destroys existing doc', () => {
    const old = new Y.Doc();
    old.getText('content').insert(0, 'old');
    const source = new Y.Doc();
    source.getText('content').insert(0, 'new');
    const base64 = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(source)));

    const result = syncYjsState(old, base64);
    expect(result.content).toBe('new');
  });
});

describe('resetYjs', () => {
  test('creates fresh doc with content', () => {
    const result = resetYjs(null, 'hello');
    expect(result.content).toBe('hello');
    expect(result.doc.getText('content').toString()).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Pending delta queue
// ---------------------------------------------------------------------------

describe('drainPendingDeltas', () => {
  test('returns deltas and clears queue', () => {
    const delta = { delta: [{ insert: 'x' }], contentBefore: '' };
    const state = { ...createInitialAdapterState(), pendingDeltas: [delta] };
    const { deltas, state: newState } = drainPendingDeltas(state);
    expect(deltas).toHaveLength(1);
    expect(newState.pendingDeltas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

describe('buildReconcileRequest', () => {
  test('builds message with correct digest', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'hello');
    const msg = buildReconcileRequest(doc, 'old-digest-abc');
    expect(msg.type).toBe('reconcile:request');
    expect(msg.digest).toBe('old-digest-abc');
    expect((msg as any).stateVector.length).toBeGreaterThan(0);
    expect((msg as any).update.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Save logic
// ---------------------------------------------------------------------------

describe('determineSaveAction', () => {
  test('online → write', () => {
    const action = determineSaveAction('content', true, '/path/file.md');
    expect(action.type).toBe('write');
    expect(action.content).toBe('content');
  });

  test('offline → download with filename from path', () => {
    const action = determineSaveAction('content', false, '/path/notes.md');
    expect(action.type).toBe('download');
    expect((action as any).filename).toBe('notes.md');
  });

  test('offline with null path → untitled.md', () => {
    const action = determineSaveAction('content', false, null);
    expect(action.type).toBe('download');
    expect((action as any).filename).toBe('untitled.md');
  });
});

// ---------------------------------------------------------------------------
// processServerMessage — the critical integration point
// ---------------------------------------------------------------------------

describe('processServerMessage', () => {
  test('file:open first connect sets content and initializes Yjs', () => {
    const state = createInitialAdapterState();
    const msg: FileOpenMessage = {
      type: 'file:open',
      path: '/test.md',
      content: '# Hello',
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: 'abc123',
    };
    const result = processServerMessage(state, msg);
    expect(result.state.clientState.content).toBe('# Hello');
    expect(result.state.clientState.lastDigest).toBe('abc123');
    expect(result.outgoing).toHaveLength(0);
  });

  test('file:open digest match reconnect sends reconcile with OLD digest', () => {
    const originalContent = '# Hello';
    const originalDigest = hashContent(originalContent);
    const state = adapterWithContent(originalContent);

    // Reconnect: server sends file:open with same digest
    const msg: FileOpenMessage = {
      type: 'file:open',
      path: '/test.md',
      content: originalContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: originalDigest,
    };
    const result = processServerMessage(state, msg);

    // Should send reconcile:request
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]!.type).toBe('reconcile:request');
    // Digest in the request must be the OLD digest
    expect((result.outgoing[0]! as any).digest).toBe(originalDigest);
  });

  test('file:open digest MISMATCH reconnect sends reconcile with OLD digest, not new', () => {
    const originalContent = '# Hello';
    const originalDigest = hashContent(originalContent);
    const state = adapterWithContent(originalContent);

    const newContent = '# Changed';
    const newDigest = hashContent(newContent);

    // Reconnect: server sends file:open with DIFFERENT digest
    const msg: FileOpenMessage = {
      type: 'file:open',
      path: '/test.md',
      content: newContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: newDigest,
    };
    const result = processServerMessage(state, msg);

    // Should send reconcile:request
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]!.type).toBe('reconcile:request');

    // CRITICAL: digest must be the OLD digest, not the new one.
    // The FSM updates state.lastDigest to newDigest, but the effect
    // captures the old digest. processServerMessage uses effect.digest.
    expect((result.outgoing[0]! as any).digest).toBe(originalDigest);
    expect((result.outgoing[0]! as any).digest).not.toBe(newDigest);

    // State should be updated to new digest
    expect(result.state.clientState.lastDigest).toBe(newDigest);
  });

  test('reconcile:complete with update creates pending delta', () => {
    const state = adapterWithContent('hello');

    // Create an update from a different doc
    const otherDoc = new Y.Doc();
    Y.applyUpdate(otherDoc, Y.encodeStateAsUpdate(state.yDoc!));
    let update: Uint8Array | null = null;
    otherDoc.on('update', (u: Uint8Array) => { update = u; });
    otherDoc.getText('content').insert(5, ' world');
    const base64Update = btoa(String.fromCharCode(...update!));

    const msg: ReconcileCompleteMessage = {
      type: 'reconcile:complete',
      digest: 'new-digest',
      update: base64Update,
    };
    const result = processServerMessage(state, msg);

    // Should have captured a pending delta
    expect(result.state.pendingDeltas.length).toBeGreaterThan(0);
    // Should have a show-banner effect for UI
    const banner = result.effects.find(e => e.type === 'show-banner');
    expect(banner).toBeDefined();
  });

  test('reconcile:complete without update has no pending delta', () => {
    const state = adapterWithContent('hello');
    const msg: ReconcileCompleteMessage = {
      type: 'reconcile:complete',
      digest: 'same-digest',
    };
    const result = processServerMessage(state, msg);
    expect(result.state.pendingDeltas).toHaveLength(0);
    // No banner effect
    const banner = result.effects.find(e => e.type === 'show-banner');
    expect(banner).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full reconciliation flow — changes on BOTH sides
// ---------------------------------------------------------------------------

describe('full reconciliation: client edits + file changed on disk', () => {
  test('end-to-end: client types offline, file changes on disk, reconnect produces file:updated', () => {
    const originalContent = '# Hello\n';
    const originalDigest = hashContent(originalContent);

    // Step 1: Client connects, gets initial state
    let state = createInitialAdapterState();
    const connectMsg: ServerMessage = {
      type: 'file:open',
      path: '/test.md',
      content: originalContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: originalDigest,
    };
    const connectResult = processServerMessage(state, connectMsg);
    state = connectResult.state;
    expect(state.clientState.lastDigest).toBe(originalDigest);

    // Step 2: Client edits locally (no save)
    state = handleEditorUpdate(state, '# Hello\n\nClient typed this.\n');
    expect(state.clientState.unsaved).toBe(true);
    expect(state.yDoc!.getText('content').toString()).toBe('# Hello\n\nClient typed this.\n');

    // Step 3: Server stops, file changes on disk externally
    const newFileContent = '# Hello Updated\n\nExternal editor added this.\n';
    const newDigest = hashContent(newFileContent);

    // Step 4: Server restarts, client reconnects — file:open with new digest
    const reconnectMsg: ServerMessage = {
      type: 'file:open',
      path: '/test.md',
      content: newFileContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: newDigest,
    };
    const reconnectResult = processServerMessage(state, reconnectMsg);
    state = reconnectResult.state;

    // Should detect digest mismatch and send reconcile:request with OLD digest
    expect(reconnectResult.outgoing).toHaveLength(1);
    expect(reconnectResult.outgoing[0]!.type).toBe('reconcile:request');
    expect((reconnectResult.outgoing[0]! as any).digest).toBe(originalDigest);

    // FSM state updated to new digest
    expect(state.clientState.lastDigest).toBe(newDigest);

    // Should NOT have set-editor-content (editor preserves local state during reconcile)
    const setEditor = reconnectResult.effects.find(e => e.type === 'set-editor-content');
    expect(setEditor).toBeUndefined();

    // Step 5: Server sends reconcile:complete with a Yjs update
    // (Simulating what the server's digest-mismatch handler does:
    //  it diffs client content against new file content in client's Yjs lineage)
    //
    // Build the update the same way the server does: create a doc from
    // client state, apply text diff to it, capture the update.
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, Y.encodeStateAsUpdate(state.yDoc!));
    const clientText = tempDoc.getText('content').toString();
    const diffs = diff(clientText, newFileContent);
    let serverUpdate: Uint8Array | null = null;
    tempDoc.on('update', (u: Uint8Array) => { serverUpdate = u; });
    tempDoc.transact(() => {
      const text = tempDoc.getText('content');
      let cursor = 0;
      for (const [op, str] of diffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });
    tempDoc.destroy();

    const base64Update = btoa(String.fromCharCode(...serverUpdate!));
    const reconcileMsg: ServerMessage = {
      type: 'reconcile:complete',
      digest: newDigest,
      update: base64Update,
    };
    const reconcileResult = processServerMessage(state, reconcileMsg);
    state = reconcileResult.state;

    // Should have a pending delta (for "File updated" banner)
    expect(state.pendingDeltas.length).toBeGreaterThan(0);

    // Should have a show-banner effect
    const banner = reconcileResult.effects.find(e => e.type === 'show-banner');
    expect(banner).toBeDefined();

    // The Yjs doc should now contain the new file content
    const finalContent = state.yDoc!.getText('content').toString();
    expect(finalContent).toContain('Hello Updated');
    expect(finalContent).toContain('External editor added');
    // No duplication
    expect(finalContent.split('Hello Updated').length - 1).toBe(1);
  });

  test('digest match: client edits preserved, no file:updated banner', () => {
    const originalContent = '# Hello\n';
    const originalDigest = hashContent(originalContent);

    // Connect
    let state = createInitialAdapterState();
    const connectResult = processServerMessage(state, {
      type: 'file:open',
      path: '/test.md',
      content: originalContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: originalDigest,
    } as ServerMessage);
    state = connectResult.state;

    // Client edits
    state = handleEditorUpdate(state, '# Hello\n\nMy unsaved work.\n');

    // Reconnect with SAME digest (file unchanged)
    const reconnectResult = processServerMessage(state, {
      type: 'file:open',
      path: '/test.md',
      content: originalContent,
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: originalDigest,
    } as ServerMessage);
    state = reconnectResult.state;

    // Sends reconcile:request
    expect(reconnectResult.outgoing).toHaveLength(1);

    // Server acks without update (digest match, no Yjs update needed)
    const ackResult = processServerMessage(state, {
      type: 'reconcile:complete',
      digest: originalDigest,
    } as ServerMessage);
    state = ackResult.state;

    // No pending deltas, no banner
    expect(state.pendingDeltas).toHaveLength(0);
    const banner = ackResult.effects.find(e => e.type === 'show-banner');
    expect(banner).toBeUndefined();

    // Client's Yjs doc still has the unsaved edits
    expect(state.yDoc!.getText('content').toString()).toBe('# Hello\n\nMy unsaved work.\n');
  });
});

// ---------------------------------------------------------------------------
// handleEditorUpdate
// ---------------------------------------------------------------------------

describe('handleEditorUpdate', () => {
  test('marks unsaved and syncs to Yjs', () => {
    const state = adapterWithContent('hello');
    const updated = handleEditorUpdate(state, 'hello world');
    expect(updated.clientState.unsaved).toBe(true);
    expect(updated.lastYjsContent).toBe('hello world');
    expect(updated.yDoc!.getText('content').toString()).toBe('hello world');
  });
});
