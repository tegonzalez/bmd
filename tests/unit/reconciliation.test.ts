/**
 * Reconciliation protocol unit tests.
 * Tests message types, pure reconciliation functions, and digest logic.
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import { computeReconciliationPayload, reconcileOnServer, hashContent } from '../../src/protocol/reconcile.ts';
import type { ReconcileRequestMessage, ReconcileCompleteMessage, FileOpenMessage, FileChangedMessage } from '../../src/types/ws-messages.ts';
import type { ClientState, ClientEffect } from '../../src/protocol/types.ts';
import { PROTOCOL_VERSION } from '../../src/protocol/types.ts';
import { buildReconcileRequest } from '../../src/web/client-adapter.ts';

// --- Message type tests ---

describe('message types', () => {
  test('FileOpenMessage accepts optional digest field', () => {
    const msg: FileOpenMessage = {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
      digest: 'abc123',
    };
    expect(msg.digest).toBe('abc123');
  });

  test('FileOpenMessage works without digest field', () => {
    const msg: FileOpenMessage = {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: { readonly: false, unsafeHtml: false, theme: null, mode: 'both', colorMode: 'auto' },
    };
    expect(msg.digest).toBeUndefined();
  });

  test('FileChangedMessage accepts optional digest field', () => {
    const msg: FileChangedMessage = {
      type: 'file:changed',
      update: 'base64data',
      digest: 'def456',
    };
    expect(msg.digest).toBe('def456');
  });

  test('ReconcileRequestMessage has correct shape', () => {
    const msg: ReconcileRequestMessage = {
      type: 'reconcile:request',
      stateVector: 'sv-base64',
      update: 'update-base64',
      digest: 'abc123',
    };
    expect(msg.type).toBe('reconcile:request');
    expect(msg.stateVector).toBe('sv-base64');
    expect(msg.update).toBe('update-base64');
    expect(msg.digest).toBe('abc123');
  });

  test('ReconcileRequestMessage accepts optional protocolVersion', () => {
    const msg: ReconcileRequestMessage = {
      type: 'reconcile:request',
      stateVector: 'sv-base64',
      update: 'update-base64',
      digest: 'abc123',
      protocolVersion: 2,
    };
    expect(msg.protocolVersion).toBe(2);
  });

  test('ReconcileCompleteMessage has correct shape', () => {
    const msg: ReconcileCompleteMessage = {
      type: 'reconcile:complete',
      digest: 'abc123',
    };
    expect(msg.type).toBe('reconcile:complete');
    expect(msg.digest).toBe('abc123');
    expect(msg.update).toBeUndefined();
  });

  test('ReconcileCompleteMessage accepts optional update and protocolVersion', () => {
    const msg: ReconcileCompleteMessage = {
      type: 'reconcile:complete',
      digest: 'abc123',
      update: 'base64-update',
      protocolVersion: 2,
    };
    expect(msg.update).toBe('base64-update');
    expect(msg.protocolVersion).toBe(2);
  });
});

// --- ClientState extension tests ---

describe('ClientState extensions', () => {
  test('ClientState has lastDigest field', () => {
    const state: ClientState = {
      fileConfig: null,
      currentPath: null,
      content: null,
      unsaved: false,
      lastDigest: null,
      connectionStatus: 'connected',
    };
    expect(state.lastDigest).toBeNull();
  });

  test('ClientState has connectionStatus field', () => {
    const state: ClientState = {
      fileConfig: null,
      currentPath: null,
      content: null,
      unsaved: false,
      lastDigest: 'abc123',
      connectionStatus: 'reconnecting',
    };
    expect(state.connectionStatus).toBe('reconnecting');
  });

  test('connectionStatus accepts all valid values', () => {
    const states: Array<ClientState['connectionStatus']> = ['connected', 'reconnecting', 'disconnected'];
    for (const status of states) {
      const state: ClientState = {
        fileConfig: null,
        currentPath: null,
        content: null,
        unsaved: false,
        lastDigest: null,
        connectionStatus: status,
      };
      expect(state.connectionStatus).toBe(status);
    }
  });
});

// --- PROTOCOL_VERSION constant ---

describe('PROTOCOL_VERSION', () => {
  test('PROTOCOL_VERSION is 2', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });
});

// --- computeReconciliationPayload tests ---

describe('computeReconciliationPayload', () => {
  test('returns stateVector and update as base64 strings from a Y.Doc', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'hello world');

    const payload = computeReconciliationPayload(doc);
    expect(typeof payload.stateVector).toBe('string');
    expect(typeof payload.update).toBe('string');

    // Verify they are valid base64 by decoding
    const svBytes = Uint8Array.from(atob(payload.stateVector), c => c.charCodeAt(0));
    const updateBytes = Uint8Array.from(atob(payload.update), c => c.charCodeAt(0));
    expect(svBytes.length).toBeGreaterThan(0);
    expect(updateBytes.length).toBeGreaterThan(0);
  });

  test('state vector can be used to compute missing updates', () => {
    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'hello');

    const payload = computeReconciliationPayload(doc1);

    // Create doc2 that knows about doc1's state
    const doc2 = new Y.Doc();
    const updateBytes = Uint8Array.from(atob(payload.update), c => c.charCodeAt(0));
    Y.applyUpdate(doc2, updateBytes);

    expect(doc2.getText('content').toString()).toBe('hello');
  });
});

// --- reconcileOnServer tests ---

describe('reconcileOnServer', () => {
  test('matching content returns null update (no diff needed)', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'hello world');

    const clientDoc = new Y.Doc();
    // Sync client from server
    const serverUpdate = Y.encodeStateAsUpdate(serverDoc);
    Y.applyUpdate(clientDoc, serverUpdate);

    const clientSV = Y.encodeStateVector(clientDoc);
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc);
    const currentFileContent = 'hello world';

    const result = reconcileOnServer(serverDoc, clientSV, clientUpdate, currentFileContent);
    expect(result.update).toBeNull();
    expect(result.newContent).toBe('hello world');
  });

  test('divergent content returns Uint8Array update', () => {
    // Server has content "hello"
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'hello');

    // Client forked from server, then added " world"
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(serverDoc));
    clientDoc.getText('content').insert(5, ' world');

    // Meanwhile, file on disk changed to "hello earth" (external edit)
    // Server doc updated to reflect disk
    const serverDoc2 = new Y.Doc();
    serverDoc2.getText('content').insert(0, 'hello earth');

    const clientSV = Y.encodeStateVector(clientDoc);
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc);

    const result = reconcileOnServer(serverDoc2, clientSV, clientUpdate, 'hello earth');
    // After applying client update to server doc, content may differ from disk
    // So we need an update
    expect(result.update).not.toBeNull();
    expect(result.update).toBeInstanceOf(Uint8Array);
  });

  test('applies client update to server doc before comparing', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'server text');

    const clientDoc = new Y.Doc();
    clientDoc.getText('content').insert(0, 'client text');

    const clientSV = Y.encodeStateVector(clientDoc);
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc);

    // After merge, server doc should contain client's text merged in
    const result = reconcileOnServer(serverDoc, clientSV, clientUpdate, 'server text');
    // The merged content will differ from "server text" since client had different text
    expect(result.update).not.toBeNull();
  });

  test('protocol failure (invalid client update) does not corrupt server doc', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'hello');
    const originalContent = serverDoc.getText('content').toString();

    const invalidUpdate = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const clientSV = new Uint8Array([0]);

    expect(() => {
      reconcileOnServer(serverDoc, clientSV, invalidUpdate, 'hello');
    }).toThrow();

    // Server doc should still be intact
    expect(serverDoc.getText('content').toString()).toBe(originalContent);
  });
});

// --- hashContent tests ---

describe('hashContent', () => {
  test('returns MD5 hex digest', () => {
    const digest = hashContent('hello world');
    // MD5 of "hello world" is well-known
    expect(digest).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
  });

  test('different content produces different digest', () => {
    const d1 = hashContent('hello');
    const d2 = hashContent('world');
    expect(d1).not.toBe(d2);
  });

  test('same content produces same digest', () => {
    const d1 = hashContent('test content');
    const d2 = hashContent('test content');
    expect(d1).toBe(d2);
  });
});

// --- buildReconcileRequest wire format ---

describe('buildReconcileRequest', () => {
  test('returns protocolVersion matching PROTOCOL_VERSION', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'test content');

    const result = buildReconcileRequest(doc, 'digest123', null);
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  test('protocolVersion is 2', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'test');

    const result = buildReconcileRequest(doc, 'abc', 'base');
    expect(result.protocolVersion).toBe(2);
  });
});

// --- Version mismatch detection ---

describe('version mismatch detection', () => {
  test('PROTOCOL_VERSION exists for version comparison', () => {
    expect(typeof PROTOCOL_VERSION).toBe('number');
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
