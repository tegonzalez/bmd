/**
 * Reconciliation corner case tests.
 * Tests the full adapter flow for digest-mismatch scenarios where
 * the server must compute an incremental diff that preserves client edits.
 *
 * Key invariant: the reconcile:request must include baseContent that
 * matches lastDigest — the server's last known state from the client's
 * perspective, INCLUDING applied file:changed updates but EXCLUDING
 * unsaved user editor changes.
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';
import {
  createInitialAdapterState,
  processServerMessage,
  handleEditorUpdate,
  type AdapterState,
} from '../../src/web/client-adapter.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import type { ServerMessage } from '../../src/types/ws-messages.ts';

const FILE_CONFIG = { readonly: false, unsafeHtml: false, theme: null, mode: 'both' as const, colorMode: 'auto' as const };

function fileOpen(content: string, digest?: string): ServerMessage {
  return {
    type: 'file:open',
    path: '/test.md',
    content,
    config: FILE_CONFIG,
    digest: digest ?? hashContent(content),
  };
}

/**
 * Build a file:changed message simulating a SERVER-SIDE file change.
 * Uses the adapter's syncDoc (shadow doc — server's view without user edits)
 * to build the Yjs update, matching what the real server would produce.
 */
function fileChanged(adapter: AdapterState, newContent: string): ServerMessage {
  // Use the shadow doc (server's view) — this matches what the real server does
  const sourceDoc = adapter.syncDoc!;
  const siblingDoc = new Y.Doc();
  Y.applyUpdate(siblingDoc, Y.encodeStateAsUpdate(sourceDoc));
  const oldContent = siblingDoc.getText('content').toString();
  const diffs = diff(oldContent, newContent);
  let update: Uint8Array | null = null;
  siblingDoc.on('update', (u: Uint8Array) => { update = u; });
  siblingDoc.transact(() => {
    const text = siblingDoc.getText('content');
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  siblingDoc.off('update', () => {});
  siblingDoc.destroy();
  const base64Update = btoa(String.fromCharCode(...update!));
  return {
    type: 'file:changed',
    update: base64Update,
    digest: hashContent(newContent),
  };
}

// Helper: connect and return adapter state
function connectClient(content: string): AdapterState {
  let state = createInitialAdapterState();
  const result = processServerMessage(state, fileOpen(content));
  return result.state;
}

// ---------------------------------------------------------------------------
// Corner case 1: baseContent in reconcile:request matches lastDigest
// ---------------------------------------------------------------------------

describe('reconcile:request baseContent matches lastDigest', () => {
  test('simple case: no edits, no pending deltas — baseContent = original', () => {
    const original = '# Hello\n';
    const state = connectClient(original);

    // Reconnect with different digest (file changed on disk)
    const newContent = '# Changed\n';
    const result = processServerMessage(state, fileOpen(newContent));

    expect(result.outgoing).toHaveLength(1);
    const req = result.outgoing[0]! as any;
    expect(req.type).toBe('reconcile:request');
    // baseContent must match the OLD digest
    expect(req.baseContent).toBeDefined();
    expect(hashContent(req.baseContent)).toBe(hashContent(original));
  });

  test('user has unsaved edits — baseContent still matches original (no user edits)', () => {
    let state = connectClient('# Hello\n');

    // User types (no save)
    state = handleEditorUpdate(state, '# Hello\n\nUser typed this.\n');
    expect(state.yDoc!.getText('content').toString()).toContain('User typed this');

    // Reconnect with changed file
    const newContent = '# Changed\n';
    const result = processServerMessage(state, fileOpen(newContent));

    const req = result.outgoing[0]! as any;
    expect(req.baseContent).toBeDefined();
    // baseContent must be the ORIGINAL content, NOT including user edits
    expect(req.baseContent).toBe('# Hello\n');
    expect(req.baseContent).not.toContain('User typed this');
  });

  test('pending file:changed deltas — baseContent includes them', () => {
    let state = connectClient('# Hello\n');

    // Server sends file:changed while connected (user hasn't clicked banner)
    const fc = fileChanged(state, '# Hello Updated\n');
    const fcResult = processServerMessage(state, fc);
    state = fcResult.state;
    expect(state.pendingDeltas.length).toBeGreaterThan(0);

    // Now disconnect, file changes again on disk
    const finalContent = '# Hello Final\n';
    const result = processServerMessage(state, fileOpen(finalContent));

    const req = result.outgoing[0]! as any;
    expect(req.baseContent).toBeDefined();
    // baseContent should include the file:changed update (matches lastDigest)
    expect(hashContent(req.baseContent)).toBe(hashContent('# Hello Updated\n'));
    expect(req.baseContent).not.toContain('Final');
  });

  test('user edits + pending deltas — baseContent has deltas but NOT user edits', () => {
    let state = connectClient('# Hello\n');

    // User types
    state = handleEditorUpdate(state, '# Hello\n\nMy work.\n');

    // Server sends file:changed based on external file edit.
    // Use a clone of the client's doc for shared lineage, but apply
    // the server-side change (original → original + server addition).
    const fc = fileChanged(state, '# Hello\n\nServer addition.\n');
    const fcResult = processServerMessage(state, fc);
    state = fcResult.state;

    // Now disconnect, file changes again
    const finalContent = '# Changed completely\n';
    const result = processServerMessage(state, fileOpen(finalContent));

    const req = result.outgoing[0]! as any;
    expect(req.baseContent).toBeDefined();
    // baseContent = original + server addition (matches lastDigest from file:changed)
    // Must NOT contain user edits
    expect(req.baseContent).toContain('Server addition');
    expect(req.baseContent).not.toContain('My work');
    expect(hashContent(req.baseContent)).toBe(hashContent('# Hello\n\nServer addition.\n'));
  });
});

// ---------------------------------------------------------------------------
// Corner case 2: server incremental diff preserves client edits
// ---------------------------------------------------------------------------

describe('server diff preserves client edits', () => {
  test('user edits preserved when file changed on disk', () => {
    let state = connectClient('# Hello\n');

    // User types
    state = handleEditorUpdate(state, '# Hello\n\nUser work.\n');

    // Disconnect, file changes, reconnect
    const newContent = '# Hello Updated\n';
    const reconnectResult = processServerMessage(state, fileOpen(newContent));
    state = reconnectResult.state;

    // Server receives reconcile:request with baseContent = '# Hello\n'
    // Server diffs '# Hello\n' → '# Hello Updated\n', applies to client Yjs doc
    // Simulating what the server would do:
    const req = reconnectResult.outgoing[0]! as any;
    const serverUpdate = computeServerUpdate(
      req.update, // client's Yjs state
      req.baseContent, // '# Hello\n'
      newContent, // '# Hello Updated\n'
    );

    // Server sends reconcile:complete with the update
    const ackResult = processServerMessage(state, {
      type: 'reconcile:complete',
      digest: hashContent(newContent),
      ...(serverUpdate ? { update: serverUpdate } : {}),
    } as ServerMessage);
    state = ackResult.state;

    // Client's Yjs doc should have BOTH server changes AND user edits
    const finalContent = state.yDoc!.getText('content').toString();
    expect(finalContent).toContain('Hello Updated');
    expect(finalContent).toContain('User work');
    // No duplication
    expect(finalContent.split('Hello Updated').length - 1).toBe(1);
    expect(finalContent.split('User work').length - 1).toBe(1);
  });
});

/**
 * Simulate server-side reconciliation:
 * 1. Decode client Yjs state
 * 2. Reverse-diff to baseContent (undo user edits)
 * 3. Forward-diff baseContent → newContent (server's change only)
 * 4. Return base64 Yjs update for the forward-diff
 */
function computeServerUpdate(
  clientUpdateBase64: string,
  baseContent: string,
  newFileContent: string,
): string | undefined {
  // Decode client's Yjs state
  const clientDoc = new Y.Doc();
  const clientBytes = Uint8Array.from(atob(clientUpdateBase64), c => c.charCodeAt(0));
  Y.applyUpdate(clientDoc, clientBytes);

  // Clone for manipulation (preserves lineage)
  const siblingDoc = new Y.Doc();
  Y.applyUpdate(siblingDoc, Y.encodeStateAsUpdate(clientDoc));

  // Step 1: Reverse-diff current → base (undo user edits on sibling)
  const currentContent = siblingDoc.getText('content').toString();
  if (currentContent !== baseContent) {
    const reverseDiffs = diff(currentContent, baseContent);
    siblingDoc.transact(() => {
      const text = siblingDoc.getText('content');
      let cursor = 0;
      for (const [op, str] of reverseDiffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });
  }

  // Step 2: Forward-diff base → new (server's change only)
  if (baseContent === newFileContent) {
    clientDoc.destroy();
    siblingDoc.destroy();
    return undefined;
  }

  let serverUpdate: Uint8Array | null = null;
  const handler = (u: Uint8Array) => { serverUpdate = u; };
  siblingDoc.on('update', handler);
  const forwardDiffs = diff(baseContent, newFileContent);
  siblingDoc.transact(() => {
    const text = siblingDoc.getText('content');
    let cursor = 0;
    for (const [op, str] of forwardDiffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  siblingDoc.off('update', handler);
  clientDoc.destroy();
  siblingDoc.destroy();

  if (!serverUpdate) return undefined;
  return btoa(String.fromCharCode(...(serverUpdate as Uint8Array)));
}
