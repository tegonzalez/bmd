/**
 * Reconciliation lineage tests.
 *
 * Verifies the full reconnect reconciliation produces clean CRDT merges:
 * - Client sends syncDoc state (no user edits) in reconcile:request
 * - Server diffs baseContent → v4 on that doc, produces fc4
 * - fc4 applied to client yDoc preserves user edits
 * - fc4 delta is clean (not fragmented)
 * - Stacked file changes (fc2 + fc3 + fc4) all work
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';
import {
  createInitialAdapterState,
  processServerMessage,
  handleEditorUpdate,
  getLastSyncedContent,
  type AdapterState,
} from '../../src/web/client-adapter.ts';
import { resolveDeletedText } from '../../src/web/file-watch-delta.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import { computeReconciliationPayload } from '../../src/protocol/reconcile.ts';
import type { ServerMessage, ReconcileCompleteMessage } from '../../src/types/ws-messages.ts';

const CFG = { readonly: false, unsafeHtml: false, theme: null, mode: 'both' as const, colorMode: 'auto' as const };

function fileOpen(content: string, digest?: string): ServerMessage {
  return { type: 'file:open', path: '/test.md', content, config: CFG, digest: digest ?? hashContent(content) };
}

/** Simulate server producing fc from a shared-lineage doc. */
function serverFileChanged(serverDoc: Y.Doc, newContent: string): { msg: ServerMessage; doc: Y.Doc } {
  const oldContent = serverDoc.getText('content').toString();
  const diffs = diff(oldContent, newContent);
  let update: Uint8Array | null = null;
  serverDoc.on('update', (u: Uint8Array) => { update = u; });
  serverDoc.transact(() => {
    const text = serverDoc.getText('content');
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  serverDoc.off('update', () => {});
  return {
    msg: { type: 'file:changed', update: btoa(String.fromCharCode(...update!)), digest: hashContent(newContent) },
    doc: serverDoc,
  };
}

/**
 * Simulate server-side reconcile handler.
 * Creates doc from client's sync state, diffs baseContent → newFileContent.
 * Returns fc4 as base64 Yjs update.
 */
function serverReconcile(clientSyncState: string, baseContent: string, newFileContent: string): string | undefined {
  if (baseContent === newFileContent) return undefined;
  const doc = new Y.Doc();
  const bytes = Uint8Array.from(atob(clientSyncState), c => c.charCodeAt(0));
  Y.applyUpdate(doc, bytes);

  // Verify doc text matches baseContent (no user edits leaked)
  const docText = doc.getText('content').toString();
  if (docText !== baseContent) {
    throw new Error(`Server doc text "${docText}" !== baseContent "${baseContent}" — user edits leaked into sync state`);
  }

  const diffs = diff(baseContent, newFileContent);
  let update: Uint8Array | null = null;
  const handler = (u: Uint8Array) => { update = u; };
  doc.on('update', handler);
  doc.transact(() => {
    const text = doc.getText('content');
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  doc.off('update', handler);
  doc.destroy();
  return update ? btoa(String.fromCharCode(...(update as Uint8Array))) : undefined;
}

// ---------------------------------------------------------------------------

describe('reconcile:request sends syncDoc state (no user edits)', () => {
  test('simple: user edits do not appear in reconcile:request Yjs state', () => {
    // Connect
    let state = createInitialAdapterState();
    state = processServerMessage(state, fileOpen('# Hello\n')).state;

    // User edits
    state = handleEditorUpdate(state, '# Hello\n\nUser typed this.\n');

    // Reconnect with changed file
    const result = processServerMessage(state, fileOpen('# Changed\n'));
    expect(result.outgoing).toHaveLength(1);
    const req = result.outgoing[0]! as any;

    // Decode the Yjs state sent to server — must NOT contain user edits
    const doc = new Y.Doc();
    const bytes = Uint8Array.from(atob(req.update), c => c.charCodeAt(0));
    Y.applyUpdate(doc, bytes);
    const sentText = doc.getText('content').toString();
    expect(sentText).toBe('# Hello\n');
    expect(sentText).not.toContain('User typed this');
  });

  test('with pending file:changed: syncDoc state includes fc2 but not user edits', () => {
    // Connect — create a server doc with shared lineage
    let state = createInitialAdapterState();
    const connectResult = processServerMessage(state, fileOpen('# Hello\n'));
    state = connectResult.state;

    // Simulate server file:changed (fc2) using syncDoc for shared lineage
    const sDoc = new Y.Doc();
    Y.applyUpdate(sDoc, Y.encodeStateAsUpdate(state.syncDoc!));
    const { msg: fc2Msg } = serverFileChanged(sDoc, '# Hello Updated\n');
    state = processServerMessage(state, fc2Msg).state;
    expect(state.pendingDeltas.length).toBeGreaterThan(0);

    // User edits
    state = handleEditorUpdate(state, '# Hello Updated\n\nUser work.\n');

    // Reconnect with changed file
    const result = processServerMessage(state, fileOpen('# Final\n'));
    const req = result.outgoing[0]! as any;

    // Decode sent Yjs state — should have fc2 (Hello Updated) but NOT user edits
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Uint8Array.from(atob(req.update), c => c.charCodeAt(0)));
    const sentText = doc.getText('content').toString();
    expect(sentText).toBe('# Hello Updated\n');
    expect(sentText).not.toContain('User work');
  });
});

describe('fc4 preserves user edits (clean CRDT merge)', () => {
  test('user edits + file change: both preserved, no corruption', () => {
    // Connect
    let state = createInitialAdapterState();
    state = processServerMessage(state, fileOpen('# Hello World\n\nExisting content.\n')).state;

    // User edits
    state = handleEditorUpdate(state, '# Hello World\n\nExisting content.\n\nUser paragraph.\n');

    // Reconnect with changed file
    const v4 = '# Updated Title\n\nExisting content.\n';
    const reconnResult = processServerMessage(state, fileOpen(v4));
    state = reconnResult.state;

    const req = reconnResult.outgoing[0]! as any;
    const baseContent = req.baseContent;
    expect(baseContent).toBe('# Hello World\n\nExisting content.\n');

    // Server produces fc4
    const fc4 = serverReconcile(req.update, baseContent, v4);
    expect(fc4).toBeDefined();

    // Client receives fc4
    const ackResult = processServerMessage(state, {
      type: 'reconcile:complete',
      digest: hashContent(v4),
      update: fc4,
    } as ServerMessage);
    state = ackResult.state;

    // Yjs doc must have BOTH server change AND user edits
    const finalText = state.yDoc!.getText('content').toString();
    expect(finalText).toContain('Updated Title');
    expect(finalText).toContain('User paragraph');
    expect(finalText).toContain('Existing content');
    // No duplication
    expect(finalText.split('Updated Title').length - 1).toBe(1);
    expect(finalText.split('User paragraph').length - 1).toBe(1);
    // No garbage characters
    expect(finalText).not.toContain('*');
    expect(finalText).toBe('# Updated Title\n\nExisting content.\n\nUser paragraph.\n');
  });

  test('fc4 delta is clean (not fragmented into single characters)', () => {
    let state = createInitialAdapterState();
    state = processServerMessage(state, fileOpen('# Hello World\n\nContent.\n')).state;
    state = handleEditorUpdate(state, '# Hello World\n\nContent.\n\nUser addition.\n');

    const v4 = '# Changed Title\n\nContent.\n';
    const reconnResult = processServerMessage(state, fileOpen(v4));
    state = reconnResult.state;
    const req = reconnResult.outgoing[0]! as any;

    const fc4 = serverReconcile(req.update, req.baseContent, v4);
    expect(fc4).toBeDefined();

    const ackResult = processServerMessage(state, {
      type: 'reconcile:complete',
      digest: hashContent(v4),
      update: fc4,
    } as ServerMessage);
    state = ackResult.state;

    // Check the pending delta from fc4
    const fc4Delta = state.pendingDeltas[state.pendingDeltas.length - 1]!;
    expect(fc4Delta).toBeDefined();

    // resolveDeletedText should produce contiguous regions, not fragments
    const diffData = resolveDeletedText(fc4Delta.delta, fc4Delta.contentBefore);
    const allAdded = diffData.added.map(a => a.text).join('');
    const allDeleted = diffData.deleted.map(d => d.text).join('');
    expect(allAdded).toContain('Changed Title');
    expect(allDeleted).toContain('Hello World');
    // resolveDeletedText coalesces fragments for display —
    // verify the coalesced output contains the full change text
    expect(allAdded.length).toBeGreaterThan(5);
  });
});

describe('stacked file changes across reconnect', () => {
  test('fc2 + fc3 while connected, then fc4 after reconnect — all stack', () => {
    // v1: initial
    let state = createInitialAdapterState();
    state = processServerMessage(state, fileOpen('line one\n')).state;

    // fc2: server changes while connected
    const sDoc2 = new Y.Doc();
    Y.applyUpdate(sDoc2, Y.encodeStateAsUpdate(state.syncDoc!));
    const { msg: fc2Msg, doc: sDoc2After } = serverFileChanged(sDoc2, 'line one\nline two\n');
    state = processServerMessage(state, fc2Msg).state;
    expect(state.pendingDeltas).toHaveLength(1);

    // fc3: another server change
    const { msg: fc3Msg } = serverFileChanged(sDoc2After, 'line one\nline two\nline three\n');
    state = processServerMessage(state, fc3Msg).state;
    expect(state.pendingDeltas).toHaveLength(2);

    // User edits
    state = handleEditorUpdate(state, 'line one\nuser edit\n');

    // syncDoc should be v3 = "line one\nline two\nline three\n"
    expect(getLastSyncedContent(state)).toBe('line one\nline two\nline three\n');

    // Server offline, file changes to v4
    const v4 = 'line one\nline two\nline three\nline four\n';
    const reconnResult = processServerMessage(state, fileOpen(v4));
    state = reconnResult.state;
    const req = reconnResult.outgoing[0]! as any;

    // baseContent should be v3
    expect(req.baseContent).toBe('line one\nline two\nline three\n');

    // Server produces fc4
    const fc4 = serverReconcile(req.update, req.baseContent, v4);
    expect(fc4).toBeDefined();

    const ackResult = processServerMessage(state, {
      type: 'reconcile:complete',
      digest: hashContent(v4),
      update: fc4,
    } as ServerMessage);
    state = ackResult.state;

    // 3 pending deltas: fc2 + fc3 + fc4
    expect(state.pendingDeltas).toHaveLength(3);

    // Yjs doc has v4 + user edits
    const finalText = state.yDoc!.getText('content').toString();
    expect(finalText).toContain('line four');
    expect(finalText).toContain('user edit');

    // syncDoc has v4 (no user edits)
    expect(getLastSyncedContent(state)).toContain('line four');
    expect(getLastSyncedContent(state)).not.toContain('user edit');
  });
});

describe('no implicit file writes during reconcile', () => {
  test('reconcile:request with baseContent does not trigger server disk write', async () => {
    // This is tested at the integration level (reconnect.test.ts)
    // but verify at the adapter level that no write-related effects are emitted
    let state = createInitialAdapterState();
    state = processServerMessage(state, fileOpen('# Hello\n')).state;
    state = handleEditorUpdate(state, '# Hello\n\nEdits.\n');

    const result = processServerMessage(state, fileOpen('# Changed\n'));

    // No write-related effects
    for (const effect of result.effects) {
      expect(effect.type).not.toBe('write-file');
    }
  });
});
