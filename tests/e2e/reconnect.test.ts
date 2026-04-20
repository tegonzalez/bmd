/**
 * Integration tests for reconnect behavior.
 * Tests two bugs:
 *   1. No yellow (reconnecting) state on disconnect -- goes straight to red (offline)
 *   2. Reconnect replaces local edits when file unchanged on disk
 *
 * Uses REAL bmd server (node:http + ws), real Yjs docs, real WebSocket connections.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { startServer } from '../../src/server/index.ts';
import { resolveConfig } from '../../src/config/merge.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as Y from 'yjs';
import WebSocket from 'ws';
import type { ServerMessage, FileOpenMessage, ReconcileCompleteMessage } from '../../src/types/ws-messages.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import { computeReconciliationPayload } from '../../src/protocol/reconcile.ts';
import { clientTransition } from '../../src/protocol/client-fsm.ts';
import type { ClientState } from '../../src/protocol/types.ts';
import { getRuntime } from '../../src/runtime/index.ts';

let cleanups: Array<() => void | Promise<void>> = [];

const TEST_HOST = '127.0.0.1';
const FETCH_HOST = '127.0.0.1';

const rt = getRuntime();

function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

function testConfig(overrides: {
  port?: number;
  host?: string;
  filePath?: string;
  readonly?: boolean;
  open?: boolean;
} = {}) {
  return resolveConfig({
    format: 'utf8',
    width: 80,
    ansiEnabled: true,
    pager: 'never',
    filePath: overrides.filePath,
    serve: {
      host: overrides.host ?? TEST_HOST,
      port: overrides.port,
      open: overrides.open ?? false,
      readonly: overrides.readonly,
    },
  }, null);
}

/**
 * Connect a WebSocket and return helpers for collecting messages.
 */
function connectWS(port: number): Promise<{
  ws: WebSocket;
  messages: ServerMessage[];
  waitForMessage: (filter?: (msg: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${FETCH_HOST}:${port}/ws`);
    const messages: ServerMessage[] = [];
    const waiters: Array<{
      filter: (msg: ServerMessage) => boolean;
      resolve: (msg: ServerMessage) => void;
      reject: (err: Error) => void;
    }> = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString()) as ServerMessage;
      messages.push(msg);

      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i]!.filter(msg)) {
          waiters[i]!.resolve(msg);
          waiters.splice(i, 1);
        }
      }
    };

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage(filter = () => true, timeoutMs = 3000) {
          const existing = messages.find(filter);
          if (existing) return Promise.resolve(existing);

          return new Promise<ServerMessage>((res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error(`Timed out waiting for message (had ${messages.length}: ${JSON.stringify(messages.map(m => m.type))})`));
            }, timeoutMs);

            waiters.push({
              filter,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: rej,
            });
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = (e) => reject(e);
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 3000);
  });
}

afterEach(async () => {
  for (const fn of cleanups) {
    try { await fn(); } catch {}
  }
  cleanups = [];
});

// ===========================================================================
// Bug 1: Yellow reconnecting state on disconnect
// ===========================================================================

describe('Connection status state machine', () => {
  test('ws-client uses 3 states: connected, reconnecting, disconnected (no "offline")', async () => {
    const src = await rt.readFile('src/web/ws-client.ts');
    expect(src).toContain("onStatusChange?.('connected')");
    expect(src).toContain("onStatusChange?.('reconnecting')");
    expect(src).toContain("onStatusChange?.('disconnected')");
    expect(src).not.toContain("'offline'");
  });

  test('CSS maps: connected=green, reconnecting=yellow, disconnected=red', async () => {
    const css = await rt.readFile('src/web/styles.css');
    expect(css).toContain('.connection-connected');
    expect(css).toContain('.connection-reconnecting');
    expect(css).toContain('.connection-disconnected');
    expect(css).toContain('#22c55e'); // green
    expect(css).toContain('#eab308'); // yellow
    expect(css).toContain('#ef4444'); // red
    // No stale 'offline' class
    expect(css).not.toContain('.connection-offline');
  });
});

// ===========================================================================
// Bug 2: Reconnect replaces local edits when file unchanged on disk
// ===========================================================================

describe('Bug 2: offline edits survive reconnect when file unchanged', () => {
  test('server sends file:open with digest on initial connect', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const content = '# Hello World\n';
    await rt.writeFile(mdFile, content);

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(stop, () => rm(tmpDir, { recursive: true }));

    await rt.sleep(150);

    const client = await connectWS(port);
    const openMsg = await client.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    expect(openMsg.digest).toBeDefined();
    expect(openMsg.digest).toBe(hashContent(content));
    client.close();
  });

  test('client FSM preserves local content on reconnect with matching digest', () => {
    // Client was connected, received content with digest, then made local edits
    const originalContent = '# Hello World\n';
    const localEdits = '# Hello World\n\nLocal edits here\n';
    const digest = hashContent(originalContent);

    const state: ClientState = {
      fileConfig: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      currentPath: '/tmp/test.md',
      content: localEdits,
      unsaved: true,
      lastDigest: digest,
      connectionStatus: 'connected',
    };

    // Server sends file:open on reconnect with same digest (file unchanged on disk)
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: originalContent, // server sends original content
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: digest, // same digest -- file unchanged
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
    const { reconcileOnServer } = require('../../src/protocol/reconcile.ts');
    const result = reconcileOnServer(serverDoc, clientSV, clientUpdate, 'hello');

    // After merge, content should be "hello world" (client's edit applied)
    expect(result.newContent).toBe('hello world');

    // The update sent back to client should NOT contain anything that would
    // overwrite the client's local edits. Since the client already has its own
    // edits, the diff update relative to clientStateVector should be null
    // or contain only server-side changes (none in this case).
    //
    // If result.update is non-null, the client receives a reconcile:complete
    // with an update that gets applied via apply-yjs-update. If this update
    // encodes the server's original state, it could overwrite client edits.
    // In the digest-match case with no server changes, update SHOULD be null.

    // NOTE: This test may fail if the update is non-null but harmless.
    // The real question is whether applying the update to the client doc
    // would change the client's content.
    if (result.update !== null) {
      // If there IS an update, applying it to the client doc should NOT change content
      const testDoc = new Y.Doc();
      Y.applyUpdate(testDoc, Y.encodeStateAsUpdate(clientDoc));
      const beforeContent = testDoc.getText('content').toString();
      Y.applyUpdate(testDoc, result.update);
      const afterContent = testDoc.getText('content').toString();
      expect(afterContent).toBe(beforeContent);
    }
  });

  test('full reconnect flow: offline edits survive when file unchanged on disk', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Hello World\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });

    await rt.sleep(150);

    // --- Phase 1: Initial connect, get file:open with digest ---
    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const digest = openMsg.digest!;
    expect(digest).toBe(hashContent(originalContent));

    // Build a client-side Yjs doc from the server's state
    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }
    expect(clientDoc.getText('content').toString()).toBe(originalContent);

    // --- Phase 2: Simulate offline edits ---
    // Close the first connection (simulates disconnect)
    client1.close();
    await rt.sleep(50);

    // Make local edits to the client Yjs doc (user typed while offline)
    clientDoc.getText('content').insert(originalContent.length, '\nOffline edit: user typed this\n');
    const localContent = clientDoc.getText('content').toString();
    expect(localContent).toContain('Offline edit');

    // File on disk has NOT changed -- still originalContent

    // --- Phase 3: Reconnect ---
    const client2 = await connectWS(port);
    const reconnectOpenMsg = await client2.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    // Server sends file:open with digest -- should match our last known digest
    expect(reconnectOpenMsg.digest).toBe(digest);

    // Simulate what the client FSM does: detect digest match, send reconcile
    const clientState: ClientState = {
      fileConfig: reconnectOpenMsg.config,
      currentPath: reconnectOpenMsg.path,
      content: localContent,
      unsaved: true,
      lastDigest: digest,
      connectionStatus: 'connected',
    };

    const fsmResult = clientTransition(clientState, reconnectOpenMsg);

    // FSM should preserve local content
    expect(fsmResult.state.content).toBe(localContent);

    // FSM should emit send-reconcile-request
    const reconcileEffect = fsmResult.effects.find(e => e.type === 'send-reconcile-request');
    expect(reconcileEffect).toBeDefined();

    // Send the actual reconcile request
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    }));

    // Wait for reconcile:complete
    const reconcileComplete = await client2.waitForMessage(
      (m) => m.type === 'reconcile:complete'
    ) as ReconcileCompleteMessage;

    expect(reconcileComplete.type).toBe('reconcile:complete');

    // If reconcile:complete has an update, apply it to the client doc
    if (reconcileComplete.update) {
      const updateBytes = Uint8Array.from(
        atob(reconcileComplete.update), c => c.charCodeAt(0)
      );
      Y.applyUpdate(clientDoc, updateBytes);
    }

    // CRITICAL: After reconciliation, the client doc must still contain the offline edits
    const finalContent = clientDoc.getText('content').toString();
    expect(finalContent).toContain('Offline edit');
    expect(finalContent).toContain('# Hello World');

    client2.close();
  });

  test('REAL BUG: offline edits survive server restart (fresh Yjs doc)', async () => {
    // This test reproduces the ACTUAL bug: server restarts, creating a fresh
    // Yjs doc with no shared history. The fresh doc's operations conflict with
    // the client's Yjs doc, causing content corruption on reconcile.
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Hello World\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();

    // --- Phase 1: Start server, connect, get Yjs state ---
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    await rt.sleep(150);

    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const digest = openMsg.digest!;

    // Build client Yjs doc from server's state (shared lineage)
    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    client1.close();

    // --- Phase 2: STOP the server (simulates crash/Ctrl+C) ---
    serverHandle.stop();
    await rt.sleep(100);

    // --- Phase 3: Make offline edits ---
    clientDoc.getText('content').insert(originalContent.length, '\nOffline edit\n');
    const localContent = clientDoc.getText('content').toString();
    expect(localContent).toContain('Offline edit');

    // File on disk has NOT changed
    const diskContent = await rt.readFile(mdFile);
    expect(diskContent).toBe(originalContent);

    // --- Phase 4: RESTART the server (fresh Yjs doc, no shared history) ---
    serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });
    await rt.sleep(150);

    // --- Phase 5: Reconnect to the RESTARTED server ---
    const client2 = await connectWS(port);
    const reconnectOpenMsg = await client2.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    // Digest should still match (file unchanged on disk)
    expect(reconnectOpenMsg.digest).toBe(digest);

    // Send reconcile request with client's full Yjs state
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    }));

    // Wait for reconcile:complete
    const reconcileComplete = await client2.waitForMessage(
      (m) => m.type === 'reconcile:complete'
    ) as ReconcileCompleteMessage;

    // If reconcile:complete has an update, apply it to the client doc
    // (this is what the client does in practice)
    const contentBeforeUpdate = clientDoc.getText('content').toString();
    if (reconcileComplete.update) {
      const updateBytes = Uint8Array.from(
        atob(reconcileComplete.update), c => c.charCodeAt(0)
      );
      Y.applyUpdate(clientDoc, updateBytes);
    }

    // CRITICAL: Client doc must still contain the offline edits
    // AND must not have duplicated/corrupted content
    const finalContent = clientDoc.getText('content').toString();
    expect(finalContent).toContain('Offline edit');
    expect(finalContent).toContain('# Hello World');
    // Content should not be duplicated or mangled
    expect(finalContent).toBe(localContent);

    client2.close();
  });

  test('digest mismatch: file changed on disk during disconnect triggers "file updated" flow', async () => {
    // Scenario: client connects, server stops, file is edited externally,
    // server restarts with new content, client reconnects.
    // Expected: reconcile:complete includes a Yjs update so client shows "File updated".
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Original\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();

    // --- Phase 1: Start server, connect, get digest ---
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    await rt.sleep(150);

    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const originalDigest = openMsg.digest!;

    // Build client Yjs doc from server state
    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    client1.close();

    // --- Phase 2: Stop server, change file on disk ---
    serverHandle.stop();
    await rt.sleep(100);

    const newFileContent = '# Changed externally\n\nNew paragraph added by another editor.\n';
    await rt.writeFile(mdFile, newFileContent);

    // --- Phase 3: Restart server (fresh Yjs doc with new content) ---
    serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });
    await rt.sleep(150);

    // --- Phase 4: Reconnect ---
    const client2 = await connectWS(port);
    const reconnectOpenMsg = await client2.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    // Digest should NOT match (file changed on disk)
    expect(reconnectOpenMsg.digest).not.toBe(originalDigest);

    // Send reconcile request with client's old state + baseContent
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: originalDigest,
      baseContent: originalContent, // content matching the old digest
    }));

    // Wait for reconcile:complete
    const reconcileComplete = await client2.waitForMessage(
      (m) => m.type === 'reconcile:complete'
    ) as ReconcileCompleteMessage;

    // Server should send an update (baseContent → newFileContent diff)
    expect(reconcileComplete.update).toBeDefined();
    expect(typeof reconcileComplete.update).toBe('string');
    expect(reconcileComplete.update!.length).toBeGreaterThan(0);

    // Apply the update to the client doc
    const updateBytes = Uint8Array.from(
      atob(reconcileComplete.update!), c => c.charCodeAt(0)
    );
    Y.applyUpdate(clientDoc, updateBytes);
    const contentAfter = clientDoc.getText('content').toString();

    // The update should change the client's content to reflect the new file
    expect(contentAfter).toContain('Changed externally');
    expect(contentAfter).toContain('New paragraph');
    // No duplication
    expect(contentAfter.split('Changed externally').length - 1).toBe(1);
    // No old content mixed in (no user edits in this test, so exact match)
    expect(contentAfter).toBe(newFileContent);

    client2.close();
  });

  test('exact user scenario: edit while connected, server restart, reconnect — file must NOT be written', async () => {
    // Reproduces: start serve → client edits (no save) → stop serve →
    // start serve (no file change) → client reconnects → file on disk
    // must be UNCHANGED. Any implicit write is a violation.
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Hello\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();

    // Step 1: Start serve
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    await rt.sleep(150);

    // Step 2: Client connects
    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const digest = openMsg.digest!;

    // Build client Yjs doc from server state (simulates what app.ts does)
    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    // Step 2: Client edits (NO save) — simulates user typing in editor
    // These edits are local only, never sent to server via file:write
    clientDoc.getText('content').insert(originalContent.length, '\nUnsaved user typing\n');
    const editedContent = clientDoc.getText('content').toString();
    expect(editedContent).toContain('Unsaved user typing');

    // Verify file on disk is still original
    expect(await rt.readFile(mdFile)).toBe(originalContent);

    // Step 3: Stop serve
    client1.close();
    serverHandle.stop();
    await rt.sleep(100);

    // Step 4: Start serve again (no file change on disk)
    expect(await rt.readFile(mdFile)).toBe(originalContent);
    serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });
    await rt.sleep(150);

    // Step 5: Client reconnects (WS auto-reconnect with lastDigest set)
    const client2 = await connectWS(port);
    const reconnectMsg = await client2.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    // Digest matches — file unchanged on disk
    expect(reconnectMsg.digest).toBe(digest);

    // Client FSM would detect reconnect (lastDigest set), send reconcile:request
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    }));

    // Wait for reconcile:complete
    await client2.waitForMessage((m) => m.type === 'reconcile:complete');

    // Give time for any async disk writes to complete
    await rt.sleep(300);

    // Step 6: VIOLATION CHECK — file must NOT have been written
    const finalDiskContent = await rt.readFile(mdFile);
    expect(finalDiskContent).toBe(originalContent);
    expect(finalDiskContent).not.toContain('Unsaved user typing');

    client2.close();
  });

  test('client has unsaved edits + file changed on disk → must show file updated on reconnect', async () => {
    // Reproduces: start serve → client edits (no save) → stop serve →
    // file changed on fs → start serve → client reconnects →
    // reconcile:complete MUST have an update so client shows "File updated"
    //
    // KEY: simulates the REAL app.ts flow where setLastDigest() is called
    // BEFORE effects are processed. The reconcile:request must use the
    // OLD digest (from before reconnect), not the new one from file:open.
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Original\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();

    // Step 1: Start serve
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    await rt.sleep(150);

    // Step 2: Client connects and edits (no save)
    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const originalDigest = openMsg.digest!;

    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    // Client edits locally — NOT saved
    clientDoc.getText('content').insert(originalContent.length, '\nUnsaved client edit\n');

    // Step 3: Stop serve
    client1.close();
    serverHandle.stop();
    await rt.sleep(100);

    // Step 4: File changed on fs (external editor)
    const newFileContent = '# Changed by external editor\n\nNew content here.\n';
    await rt.writeFile(mdFile, newFileContent);

    // Step 5: Start serve
    serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });
    await rt.sleep(150);

    // Step 6: Client reconnects
    const client2 = await connectWS(port);
    const reconnectMsg = await client2.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const newDigest = reconnectMsg.digest!;

    // Digest should NOT match (file changed on disk)
    expect(newDigest).not.toBe(originalDigest);

    // Simulate REAL app.ts flow. The FSM's send-reconcile-request effect
    // carries the OLD digest (state.lastDigest before the transition).
    // app.ts must use effect.digest, NOT getLastDigest() (which would be
    // the new digest from the server's file:open, causing the server to
    // see a digest match and skip the update).
    const clientState: ClientState = {
      fileConfig: reconnectMsg.config,
      currentPath: reconnectMsg.path,
      content: clientDoc.getText('content').toString(),
      unsaved: true,
      lastDigest: originalDigest,
      connectionStatus: 'connected',
    };
    const fsmResult = clientTransition(clientState, reconnectMsg);

    // Verify FSM updates state.lastDigest to new digest (this is correct)
    expect(fsmResult.state.lastDigest).toBe(newDigest);

    // But the send-reconcile-request EFFECT must carry the OLD digest
    const reconcileEffect = fsmResult.effects.find(
      (e) => e.type === 'send-reconcile-request'
    ) as { type: 'send-reconcile-request'; digest: string } | undefined;
    expect(reconcileEffect).toBeDefined();
    expect(reconcileEffect!.digest).toBe(originalDigest); // OLD digest in effect

    // Send reconcile:request with OLD digest + baseContent (original content,
    // matching the old digest — no user edits included)
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: originalDigest,
      baseContent: originalContent, // content matching old digest, NO user edits
    }));

    // Wait for reconcile:complete
    const reconcileComplete = await client2.waitForMessage(
      (m) => m.type === 'reconcile:complete'
    ) as ReconcileCompleteMessage;

    // Server should send incremental diff (baseContent → newFileContent)
    expect(reconcileComplete.update).toBeDefined();
    expect(typeof reconcileComplete.update).toBe('string');
    expect(reconcileComplete.update!.length).toBeGreaterThan(0);

    // Apply update to client doc
    const updateBytes = Uint8Array.from(
      atob(reconcileComplete.update!), c => c.charCodeAt(0)
    );
    Y.applyUpdate(clientDoc, updateBytes);
    const finalContent = clientDoc.getText('content').toString();

    // Must contain server changes
    expect(finalContent).toContain('Changed by external editor');
    expect(finalContent).toContain('New content here');
    // CRITICAL: Must ALSO contain client's unsaved edits (preserved by incremental diff)
    expect(finalContent).toContain('Unsaved client edit');
    // No duplication
    expect(finalContent.split('Changed by external editor').length - 1).toBe(1);
    expect(finalContent.split('Unsaved client edit').length - 1).toBe(1);

    // File on disk must NOT have been overwritten
    const diskContent = await rt.readFile(mdFile);
    expect(diskContent).toBe(newFileContent);

    client2.close();
  });

  test('reconcile NEVER writes to disk — only explicit Ctrl+S (file:write) saves', async () => {
    // Reconnect reconciliation must NEVER overwrite the file on disk.
    // The user's unsaved offline edits stay in memory/editor only.
    // Only an explicit file:write (Ctrl+S) triggers a disk write.
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Preserved\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();

    // Start server, connect, get state
    let serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    await rt.sleep(150);

    const client1 = await connectWS(port);
    const openMsg = await client1.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;
    const digest = openMsg.digest!;

    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      clientDoc.getText('content').insert(0, originalContent);
    }

    client1.close();

    // Stop server, make offline edits
    serverHandle.stop();
    await rt.sleep(100);
    clientDoc.getText('content').insert(originalContent.length, '\nUnsaved offline typing\n');

    // Restart server
    serverHandle = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(() => {
      try { serverHandle.stop(); } catch {}
      return rm(tmpDir, { recursive: true });
    });
    await rt.sleep(150);

    // Reconnect and reconcile
    const client2 = await connectWS(port);
    await client2.waitForMessage((m) => m.type === 'file:open');
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: digest,
    }));
    await client2.waitForMessage((m) => m.type === 'reconcile:complete');
    await rt.sleep(100);

    // CRITICAL: File on disk must NOT have been overwritten
    const diskContent = await rt.readFile(mdFile);
    expect(diskContent).toBe(originalContent);
    expect(diskContent).not.toContain('Unsaved offline typing');

    client2.close();
  });

  test('server does not broadcast file:changed on reconnect when digest matches and no new edits', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-reconnect-'));
    const mdFile = join(tmpDir, 'test.md');
    const originalContent = '# Test\n';
    await rt.writeFile(mdFile, originalContent);

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanups.push(stop, () => rm(tmpDir, { recursive: true }));

    await rt.sleep(150);

    // Connect first client (observer)
    const observer = await connectWS(port);
    await observer.waitForMessage((m) => m.type === 'file:open');

    // Connect second client, get digest and Yjs state, disconnect, reconnect
    const client = await connectWS(port);
    const openMsg = await client.waitForMessage((m) => m.type === 'file:open') as FileOpenMessage;

    // Build client Yjs doc FROM the server's state (realistic scenario)
    const clientDoc = new Y.Doc();
    if (openMsg.yjsState) {
      const stateBytes = Uint8Array.from(atob(openMsg.yjsState), c => c.charCodeAt(0));
      Y.applyUpdate(clientDoc, stateBytes);
    } else {
      // Fallback: should not happen in practice
      clientDoc.getText('content').insert(0, originalContent);
    }
    expect(clientDoc.getText('content').toString()).toBe(originalContent);

    // Clear observer messages from the second client connecting
    const preReconnectMsgCount = observer.messages.length;

    client.close();
    await rt.sleep(50);

    // Reconnect (no edits made offline)
    const client2 = await connectWS(port);
    await client2.waitForMessage((m) => m.type === 'file:open');

    // Send reconcile with matching digest and the client doc derived from server
    const payload = computeReconciliationPayload(clientDoc);
    client2.ws.send(JSON.stringify({
      type: 'reconcile:request',
      stateVector: payload.stateVector,
      update: payload.update,
      digest: openMsg.digest,
    }));

    // Wait for reconcile:complete
    await client2.waitForMessage((m) => m.type === 'reconcile:complete');

    // Wait briefly, then check observer did NOT receive file:changed after the reconnect
    await rt.sleep(200);
    const postReconnectMessages = observer.messages.slice(preReconnectMsgCount);
    const changedMessages = postReconnectMessages.filter(m => m.type === 'file:changed');
    expect(changedMessages.length).toBe(0);

    observer.close();
    client2.close();
  });
});
