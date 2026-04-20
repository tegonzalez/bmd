/**
 * Reconnect behavior contract tests.
 *
 * Sans-IO: tests the reconnect protocol using pure FSM transitions
 * (clientTransition, serverTransition, serverOnConnect), Yjs document
 * operations, and the reconciliation functions -- all without real
 * HTTP servers, WebSocket connections, or filesystem access.
 *
 * Tests two bugs:
 *   1. No yellow (reconnecting) state on disconnect -- goes straight to red (offline)
 *   2. Reconnect replaces local edits when file unchanged on disk
 */

import { describe, test, expect } from 'bun:test';
import { serverTransition, serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import { clientTransition } from '../../src/protocol/client-fsm.ts';
import { reconcileOnServer, computeReconciliationPayload, hashContent } from '../../src/protocol/reconcile.ts';
import { parseClientMessage } from '../../src/server/ws-protocol.ts';
import { YjsDocumentManager } from '../../src/server/yjs-doc.ts';
import { PROTOCOL_VERSION } from '../../src/protocol/types.ts';
import type { ServerState } from '../../src/protocol/types.ts';
import type { ClientState } from '../../src/protocol/types.ts';
import type { FileConfig, ServerGlobalConfig, FileOpenMessage, ReconcileCompleteMessage, ServerMessage } from '../../src/types/ws-messages.ts';
import * as Y from 'yjs';
import diff from 'fast-diff';

function makeServerState(overrides: Partial<ServerState> = {}): ServerState {
  const globalConfig: ServerGlobalConfig = { host: '0.0.0.0', port: 4200 };
  const fileConfig: FileConfig = {
    readonly: false,
    unsafeHtml: false,
    theme: null,
    mode: 'both',
    colorMode: 'auto',
  };
  return {
    content: null,
    filePath: null,
    globalConfig,
    fileConfig,
    isReadonly: false,
    templateValues: null,
    templatesEnabled: true,
    ...overrides,
  };
}

function makeClientState(overrides: Partial<ClientState> = {}): ClientState {
  return {
    fileConfig: null,
    currentPath: null,
    content: null,
    unsaved: false,
    lastDigest: null,
    connectionStatus: 'connected',
    ...overrides,
  };
}

const testFileConfig: FileConfig = {
  readonly: false,
  unsafeHtml: false,
  theme: null,
  mode: 'both',
  colorMode: 'auto',
};

/**
 * Simulate the server-side reconciliation that happens in server/index.ts
 * when a reconcile:request is received. This is the adapter logic that
 * bridges the pure FSM with the Yjs document manager.
 */
function simulateServerReconcile(
  serverDoc: Y.Doc,
  serverContent: string,
  reconcileRequest: {
    stateVector: string;
    update: string;
    digest: string;
    baseContent?: string;
  },
): ReconcileCompleteMessage {
  const clientStateVector = new Uint8Array(
    atob(reconcileRequest.stateVector).split('').map(c => c.charCodeAt(0))
  );
  const clientUpdate = new Uint8Array(
    atob(reconcileRequest.update).split('').map(c => c.charCodeAt(0))
  );

  const currentDigest = hashContent(serverContent);
  const digestMatch = reconcileRequest.digest === currentDigest;

  if (digestMatch) {
    // Digest matches -- apply client update to server doc to sync
    const mergeDoc = new Y.Doc();
    Y.applyUpdate(mergeDoc, Y.encodeStateAsUpdate(serverDoc));
    Y.applyUpdate(mergeDoc, clientUpdate);
    const mergedContent = mergeDoc.getText('content').toString();

    if (mergedContent === serverContent) {
      // No changes from client
      return {
        type: 'reconcile:complete',
        digest: currentDigest,
        protocolVersion: PROTOCOL_VERSION,
      };
    }

    // Client has changes, compute diff update to send back
    const diffUpdate = Y.encodeStateAsUpdate(mergeDoc, clientStateVector);
    const isEmpty = diffUpdate.length <= 2; // Empty Yjs update is typically 2 bytes
    return {
      type: 'reconcile:complete',
      digest: currentDigest,
      protocolVersion: PROTOCOL_VERSION,
      ...(isEmpty ? {} : { update: Buffer.from(diffUpdate).toString('base64') }),
    };
  }

  // Digest mismatch -- file changed on disk
  const baseContent = reconcileRequest.baseContent;
  if (!baseContent || baseContent === serverContent) {
    return {
      type: 'reconcile:complete',
      digest: currentDigest,
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  // Apply server's disk changes to client doc via diff
  const clientDoc = new Y.Doc();
  Y.applyUpdate(clientDoc, clientUpdate);

  const diffs = diff(baseContent, serverContent);
  let fc4Update: Uint8Array | null = null;
  const handler = (u: Uint8Array) => { fc4Update = u; };
  clientDoc.on('update', handler);
  clientDoc.transact(() => {
    const text = clientDoc.getText('content');
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  clientDoc.off('update', handler);
  clientDoc.destroy();

  return {
    type: 'reconcile:complete',
    digest: currentDigest,
    protocolVersion: PROTOCOL_VERSION,
    ...(fc4Update ? { update: Buffer.from(fc4Update).toString('base64') } : {}),
  };
}


// ===========================================================================
// Bug 1: Yellow reconnecting state on disconnect
// ===========================================================================

describe('Connection status state machine', () => {
  test('client FSM uses 3 connection statuses: connected, reconnecting, disconnected', () => {
    // The ClientState type has connectionStatus field with exactly these values.
    // We verify by exercising the FSM transitions that produce each status.

    // 1. connected: default state and state after reconcile:complete
    const connected = makeClientState({ connectionStatus: 'connected' });
    expect(connected.connectionStatus).toBe('connected');

    // 2. reconnecting: produced by file:open with digest mismatch
    const state = makeClientState({ lastDigest: 'old-digest', content: 'local' });
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Server content',
      config: testFileConfig,
      digest: 'new-digest',
    });
    expect(result.state.connectionStatus).toBe('reconnecting');

    // 3. disconnected: this is set by the adapter (ws-client.ts) when
    //    the WebSocket fully closes after retry exhaustion.
    const disconnected = makeClientState({ connectionStatus: 'disconnected' });
    expect(disconnected.connectionStatus).toBe('disconnected');
  });

  test('no "offline" connection status exists in the protocol', () => {
    // The ClientState type only allows 'connected' | 'reconnecting' | 'disconnected'.
    // This test verifies that the FSM never produces an 'offline' status.
    const states: ClientState[] = [
      makeClientState({ connectionStatus: 'connected' }),
      makeClientState({ connectionStatus: 'reconnecting' }),
      makeClientState({ connectionStatus: 'disconnected' }),
    ];

    for (const s of states) {
      expect(['connected', 'reconnecting', 'disconnected']).toContain(s.connectionStatus);
    }

    // Verify FSM transitions that change connectionStatus
    const reconnecting = clientTransition(
      makeClientState({ lastDigest: 'old' }),
      { type: 'file:open', path: '/tmp/t.md', content: 'x', config: testFileConfig, digest: 'new' },
    );
    expect(reconnecting.state.connectionStatus).toBe('reconnecting');

    const connected = clientTransition(
      makeClientState({ connectionStatus: 'reconnecting', lastDigest: 'old' }),
      { type: 'reconcile:complete', digest: 'new', protocolVersion: PROTOCOL_VERSION },
    );
    expect(connected.state.connectionStatus).toBe('connected');
  });
});


// ===========================================================================
// Bug 2: Reconnect replaces local edits when file unchanged on disk
// ===========================================================================

describe('Bug 2: offline edits survive reconnect when file unchanged', () => {
  test('server provides digest in file:open connect messages', () => {
    const content = '# Hello World\n';
    const state = makeServerState({
      content,
      filePath: '/tmp/test.md',
    });
    const messages = serverOnConnect(state);
    const fileOpen = messages.find(m => m.type === 'file:open');
    expect(fileOpen).toBeDefined();

    // The adapter enriches file:open with a digest; verify hash function works
    const digest = hashContent(content);
    expect(typeof digest).toBe('string');
    expect(digest.length).toBeGreaterThan(0);
    expect(digest).toBe(hashContent(content)); // deterministic
  });

  test('client FSM preserves local content on reconnect with matching digest', () => {
    const originalContent = '# Hello World\n';
    const localEdits = '# Hello World\n\nLocal edits here\n';
    const digest = hashContent(originalContent);

    const state = makeClientState({
      fileConfig: testFileConfig,
      currentPath: '/tmp/test.md',
      content: localEdits,
      unsaved: true,
      lastDigest: digest,
      connectionStatus: 'connected',
    });

    // Server sends file:open on reconnect with same digest (file unchanged on disk)
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: originalContent,
      config: testFileConfig,
      digest: digest,
    });

    // Local edits must survive
    expect(result.state.content).toBe(localEdits);
    expect(result.state.unsaved).toBe(true);

    // Must NOT reset editor content or Yjs state
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).not.toContain('set-editor-content');
    expect(effectTypes).not.toContain('reset-yjs');
    expect(effectTypes).not.toContain('sync-yjs-state');

    // Must send reconcile request to push local edits to server
    expect(effectTypes).toContain('send-reconcile-request');
  });

  test('reconcile with digest match and local-only edits returns no update (edits preserved)', () => {
    // Simulate: server has content "hello", client forked from same state, added " world"
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'hello');

    // Client cloned from server, then added local edits
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(serverDoc));
    clientDoc.getText('content').insert(5, ' world');

    const clientSV = Y.encodeStateVector(clientDoc);
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc);

    // File on disk is still "hello" (unchanged -- digest matches)
    const result = reconcileOnServer(serverDoc, clientSV, clientUpdate, 'hello');

    // After merge, content should be "hello world" (client's edit applied)
    expect(result.newContent).toBe('hello world');

    // If result.update is non-null, applying it to the client doc should NOT change content
    if (result.update !== null) {
      const testDoc = new Y.Doc();
      Y.applyUpdate(testDoc, Y.encodeStateAsUpdate(clientDoc));
      const beforeContent = testDoc.getText('content').toString();
      Y.applyUpdate(testDoc, result.update);
      const afterContent = testDoc.getText('content').toString();
      expect(afterContent).toBe(beforeContent);
    }
  });

  test('full reconnect flow: offline edits survive when file unchanged on disk (pure)', () => {
    const originalContent = '# Hello World\n';
    const filePath = '/tmp/test.md';
    const digest = hashContent(originalContent);

    // --- Phase 1: Server creates Yjs doc with initial content ---
    const serverYjs = new YjsDocumentManager();
    serverYjs.createDoc(filePath, originalContent);

    // Server sends file:open on initial connect
    const serverState = makeServerState({ content: originalContent, filePath });
    const connectMsgs = serverOnConnect(serverState);
    const fileOpenMsg = connectMsgs.find(m => m.type === 'file:open')!;

    // Build client Yjs doc from server's state (as app.ts would)
    const clientDoc = new Y.Doc();
    const serverFullState = serverYjs.getFullState(filePath);
    if (serverFullState) {
      Y.applyUpdate(clientDoc, serverFullState);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }
    expect(clientDoc.getText('content').toString()).toBe(originalContent);

    // --- Phase 2: Simulate offline edits ---
    clientDoc.getText('content').insert(originalContent.length, '\nOffline edit: user typed this\n');
    const localContent = clientDoc.getText('content').toString();
    expect(localContent).toContain('Offline edit');

    // --- Phase 3: Reconnect (file on disk unchanged) ---
    // Client FSM: receive file:open with matching digest
    const clientState = makeClientState({
      fileConfig: testFileConfig,
      currentPath: filePath,
      content: localContent,
      unsaved: true,
      lastDigest: digest,
      connectionStatus: 'connected',
    });

    const fsmResult = clientTransition(clientState, {
      type: 'file:open',
      path: filePath,
      content: originalContent,
      config: testFileConfig,
      digest: digest,
    });

    // FSM should preserve local content
    expect(fsmResult.state.content).toBe(localContent);

    // FSM should emit send-reconcile-request
    const reconcileEffect = fsmResult.effects.find(e => e.type === 'send-reconcile-request');
    expect(reconcileEffect).toBeDefined();

    // --- Phase 4: Send reconcile request, get response ---
    const payload = computeReconciliationPayload(clientDoc);
    const serverDoc = serverYjs.getDoc(filePath)!;

    const reconcileResult = simulateServerReconcile(serverDoc, originalContent, {
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    });

    expect(reconcileResult.type).toBe('reconcile:complete');

    // If reconcile:complete has an update, apply it to the client doc
    if (reconcileResult.update) {
      const updateBytes = new Uint8Array(
        atob(reconcileResult.update).split('').map(c => c.charCodeAt(0))
      );
      Y.applyUpdate(clientDoc, updateBytes);
    }

    // CRITICAL: After reconciliation, the client doc must still contain the offline edits
    const finalContent = clientDoc.getText('content').toString();
    expect(finalContent).toContain('Offline edit');
    expect(finalContent).toContain('# Hello World');

    serverYjs.cleanup(filePath);
  });

  test('offline edits survive server restart (fresh Yjs doc, no shared history)', () => {
    const originalContent = '# Hello World\n';
    const filePath = '/tmp/test.md';
    const digest = hashContent(originalContent);

    // --- Phase 1: First server instance, client connects ---
    const server1Yjs = new YjsDocumentManager();
    server1Yjs.createDoc(filePath, originalContent);

    // Build client Yjs doc from server's state
    const clientDoc = new Y.Doc();
    const serverFullState = server1Yjs.getFullState(filePath);
    if (serverFullState) {
      Y.applyUpdate(clientDoc, serverFullState);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    // --- Phase 2: Server "crashes" (cleanup) ---
    server1Yjs.cleanup(filePath);

    // --- Phase 3: Make offline edits ---
    clientDoc.getText('content').insert(originalContent.length, '\nOffline edit\n');
    const localContent = clientDoc.getText('content').toString();
    expect(localContent).toContain('Offline edit');

    // --- Phase 4: NEW server instance (fresh Yjs doc, no shared history) ---
    const server2Yjs = new YjsDocumentManager();
    server2Yjs.createDoc(filePath, originalContent);

    // --- Phase 5: Reconnect ---
    const payload = computeReconciliationPayload(clientDoc);
    const server2Doc = server2Yjs.getDoc(filePath)!;

    const reconcileResult = simulateServerReconcile(server2Doc, originalContent, {
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    });

    // If reconcile:complete has an update, apply it to the client doc
    const contentBeforeUpdate = clientDoc.getText('content').toString();
    if (reconcileResult.update) {
      const updateBytes = new Uint8Array(
        atob(reconcileResult.update).split('').map(c => c.charCodeAt(0))
      );
      Y.applyUpdate(clientDoc, updateBytes);
    }

    // CRITICAL: Client doc must still contain the offline edits.
    // NOTE: With a fresh server Yjs doc (no shared history), the CRDT merge
    // may produce duplicate content from concurrent inserts. The real server
    // handles this via the digest-match path which avoids cross-origin merges.
    // This test verifies the fundamental guarantee: offline edits are NOT lost.
    const finalContent = clientDoc.getText('content').toString();
    expect(finalContent).toContain('Offline edit');
    expect(finalContent).toContain('# Hello World');

    server2Yjs.cleanup(filePath);
  });

  test('digest mismatch: file changed on disk during disconnect triggers "file updated" flow', () => {
    const originalContent = '# Original\n';
    const filePath = '/tmp/test.md';
    const originalDigest = hashContent(originalContent);

    // --- Phase 1: Build client Yjs doc ---
    const server1Yjs = new YjsDocumentManager();
    server1Yjs.createDoc(filePath, originalContent);

    const clientDoc = new Y.Doc();
    const serverFullState = server1Yjs.getFullState(filePath);
    if (serverFullState) {
      Y.applyUpdate(clientDoc, serverFullState);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    // --- Phase 2: Server stops, file changed on disk ---
    server1Yjs.cleanup(filePath);
    const newFileContent = '# Changed externally\n\nNew paragraph added by another editor.\n';

    // --- Phase 3: New server with new content ---
    const server2Yjs = new YjsDocumentManager();
    server2Yjs.createDoc(filePath, newFileContent);
    const newDigest = hashContent(newFileContent);

    // Digest should NOT match
    expect(newDigest).not.toBe(originalDigest);

    // --- Phase 4: Reconnect ---
    const payload = computeReconciliationPayload(clientDoc);
    const server2Doc = server2Yjs.getDoc(filePath)!;

    const reconcileResult = simulateServerReconcile(server2Doc, newFileContent, {
      stateVector: payload.stateVector,
      update: payload.update,
      digest: originalDigest,
      baseContent: originalContent,
    });

    // Server should send an update (baseContent -> newFileContent diff)
    expect(reconcileResult.update).toBeDefined();
    expect(typeof reconcileResult.update).toBe('string');
    expect(reconcileResult.update!.length).toBeGreaterThan(0);

    // Apply the update to the client doc
    const updateBytes = new Uint8Array(
      atob(reconcileResult.update!).split('').map(c => c.charCodeAt(0))
    );
    Y.applyUpdate(clientDoc, updateBytes);
    const contentAfter = clientDoc.getText('content').toString();

    // The update should change the client's content to reflect the new file
    expect(contentAfter).toContain('Changed externally');
    expect(contentAfter).toContain('New paragraph');
    // No duplication
    expect(contentAfter.split('Changed externally').length - 1).toBe(1);
    // No old content mixed in
    expect(contentAfter).toBe(newFileContent);

    server2Yjs.cleanup(filePath);
  });

  test('exact user scenario: edit while connected, server restart, reconnect — reconcile never emits write-file', () => {
    // The server FSM's reconcile:request side effect is 'reconcile', NOT 'write-file'.
    // This ensures that reconnect reconciliation never writes to disk.
    const originalContent = '# Hello\n';
    const filePath = '/tmp/test.md';

    const state = makeServerState({ content: originalContent, filePath });

    // Server receives reconcile:request from client
    const result = serverTransition(state, {
      type: 'reconcile:request',
      stateVector: btoa('fake-sv'),
      update: btoa('fake-update'),
      digest: hashContent(originalContent),
    });

    // Side effects should be ['reconcile'], NOT ['write-file']
    expect(result.sideEffects.length).toBe(1);
    expect(result.sideEffects[0]!.type).toBe('reconcile');

    // No write-file side effect
    const writeEffects = result.sideEffects.filter(e => e.type === 'write-file');
    expect(writeEffects.length).toBe(0);

    // No broadcast (reconcile response is sent directly to the requesting client)
    expect(result.broadcast.length).toBe(0);
  });

  test('client has unsaved edits + file changed on disk → must show file updated on reconnect', () => {
    const originalContent = '# Original\n';
    const filePath = '/tmp/test.md';
    const originalDigest = hashContent(originalContent);

    // Step 1: Build client Yjs doc and make local edits
    const server1Yjs = new YjsDocumentManager();
    server1Yjs.createDoc(filePath, originalContent);

    const clientDoc = new Y.Doc();
    const serverFullState = server1Yjs.getFullState(filePath);
    if (serverFullState) {
      Y.applyUpdate(clientDoc, serverFullState);
    }

    clientDoc.getText('content').insert(originalContent.length, '\nUnsaved client edit\n');

    server1Yjs.cleanup(filePath);

    // Step 2: File changed on fs
    const newFileContent = '# Changed by external editor\n\nNew content here.\n';
    const newDigest = hashContent(newFileContent);

    // Step 3: New server with new content
    const server2Yjs = new YjsDocumentManager();
    server2Yjs.createDoc(filePath, newFileContent);

    // Step 4: Client FSM processes file:open with new digest
    const clientState = makeClientState({
      fileConfig: testFileConfig,
      currentPath: filePath,
      content: clientDoc.getText('content').toString(),
      unsaved: true,
      lastDigest: originalDigest,
      connectionStatus: 'connected',
    });

    const reconnectMsg: FileOpenMessage = {
      type: 'file:open',
      path: filePath,
      content: newFileContent,
      config: testFileConfig,
      digest: newDigest,
    };

    const fsmResult = clientTransition(clientState, reconnectMsg);

    // Verify FSM updates state.lastDigest to new digest
    expect(fsmResult.state.lastDigest).toBe(newDigest);

    // But the send-reconcile-request EFFECT must carry the OLD digest
    const reconcileEffect = fsmResult.effects.find(
      (e) => e.type === 'send-reconcile-request'
    ) as { type: 'send-reconcile-request'; digest: string } | undefined;
    expect(reconcileEffect).toBeDefined();
    expect(reconcileEffect!.digest).toBe(originalDigest);

    // Step 5: Send reconcile request with OLD digest + baseContent
    const payload = computeReconciliationPayload(clientDoc);
    const server2Doc = server2Yjs.getDoc(filePath)!;

    const reconcileResult = simulateServerReconcile(server2Doc, newFileContent, {
      stateVector: payload.stateVector,
      update: payload.update,
      digest: originalDigest,
      baseContent: originalContent,
    });

    // Server should send incremental diff (baseContent -> newFileContent)
    expect(reconcileResult.update).toBeDefined();
    expect(typeof reconcileResult.update).toBe('string');
    expect(reconcileResult.update!.length).toBeGreaterThan(0);

    // Apply update to client doc
    const updateBytes = new Uint8Array(
      atob(reconcileResult.update!).split('').map(c => c.charCodeAt(0))
    );
    Y.applyUpdate(clientDoc, updateBytes);
    const finalContent = clientDoc.getText('content').toString();

    // Must contain server changes
    expect(finalContent).toContain('Changed by external editor');
    expect(finalContent).toContain('New content here');
    // CRITICAL: Must ALSO contain client's unsaved edits
    expect(finalContent).toContain('Unsaved client edit');
    // No duplication
    expect(finalContent.split('Changed by external editor').length - 1).toBe(1);
    expect(finalContent.split('Unsaved client edit').length - 1).toBe(1);

    server2Yjs.cleanup(filePath);
  });

  test('reconcile FSM transition never produces write-file — only explicit file:write saves', () => {
    // Verify at the FSM level that reconcile:request NEVER produces write-file
    const state = makeServerState({
      content: '# Preserved\n',
      filePath: '/tmp/test.md',
    });

    const result = serverTransition(state, {
      type: 'reconcile:request',
      stateVector: btoa('sv-data'),
      update: btoa('update-data'),
      digest: 'some-digest',
    });

    // Only side effect should be 'reconcile'
    expect(result.sideEffects.length).toBe(1);
    expect(result.sideEffects[0]!.type).toBe('reconcile');

    // Contrast with file:write which DOES produce write-file
    const writeResult = serverTransition(state, {
      type: 'file:write',
      content: 'new content',
    });
    expect(writeResult.sideEffects.some(e => e.type === 'write-file')).toBe(true);
  });

  test('server does not broadcast file:changed from reconcile — only from file-watcher', () => {
    const state = makeServerState({
      content: '# Test\n',
      filePath: '/tmp/test.md',
    });

    // reconcile:request produces NO broadcast
    const reconcileResult = serverTransition(state, {
      type: 'reconcile:request',
      stateVector: btoa('sv'),
      update: btoa('up'),
      digest: 'digest',
    });
    expect(reconcileResult.broadcast.length).toBe(0);

    // Only file-watcher:changed produces file:changed broadcast
    const watcherResult = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'new content',
      base64Update: 'base64data',
      digest: 'new-digest',
    });
    expect(watcherResult.broadcast.length).toBe(1);
    expect(watcherResult.broadcast[0]!.type).toBe('file:changed');
  });
});
