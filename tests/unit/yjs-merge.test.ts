/**
 * Tests that Yjs CRDT merge preserves concurrent edits from both
 * local (editor) and remote (file watcher) sources.
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';

/** Apply a text change to a Yjs doc using granular diff ops (same as server) */
function applyDiff(doc: Y.Doc, oldText: string, newText: string): Uint8Array | null {
  const text = doc.getText('content');
  const diffs = diff(oldText, newText);
  let update: Uint8Array | null = null;
  const handler = (u: Uint8Array) => { update = u; };
  doc.on('update', handler);
  doc.transact(() => {
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  doc.off('update', handler);
  return update;
}

describe('Yjs CRDT merge', () => {
  test('sync: client doc initialized from server state has same content', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, '# Hello World');
    const state = Y.encodeStateAsUpdate(serverDoc);

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, state);

    expect(clientDoc.getText('content').toString()).toBe('# Hello World');
  });

  test('merge: local edit preserved after applying remote update to different region', () => {
    // Setup: server and client start with same content
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'line one\nline two\nline three');
    const state = Y.encodeStateAsUpdate(serverDoc);

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, state);

    // Local edit: user changes "line one" → "LINE ONE" (beginning of doc)
    const clientOld = clientDoc.getText('content').toString();
    applyDiff(clientDoc, clientOld, 'LINE ONE\nline two\nline three');

    // Remote edit: external process changes "line three" → "line THREE" (end of doc)
    const serverOld = serverDoc.getText('content').toString();
    const remoteUpdate = applyDiff(serverDoc, serverOld, 'line one\nline two\nline THREE');
    expect(remoteUpdate).not.toBeNull();

    // Apply remote update to client — CRDT merge
    Y.applyUpdate(clientDoc, remoteUpdate!);

    const merged = clientDoc.getText('content').toString();
    // Both edits should be present
    expect(merged).toContain('LINE ONE');
    expect(merged).toContain('line THREE');
  });

  test('merge: local edit at same line as remote produces both changes', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'hello world');
    const state = Y.encodeStateAsUpdate(serverDoc);

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, state);

    // Local: "hello world" → "hello beautiful world" (insert in middle)
    const clientOld = clientDoc.getText('content').toString();
    applyDiff(clientDoc, clientOld, 'hello beautiful world');

    // Remote: "hello world" → "hello world!" (append)
    const serverOld = serverDoc.getText('content').toString();
    const remoteUpdate = applyDiff(serverDoc, serverOld, 'hello world!');
    expect(remoteUpdate).not.toBeNull();

    Y.applyUpdate(clientDoc, remoteUpdate!);
    const merged = clientDoc.getText('content').toString();

    // Both edits present
    expect(merged).toContain('beautiful');
    expect(merged).toContain('!');
  });

  test('no local edits: remote update applies cleanly', () => {
    const serverDoc = new Y.Doc();
    serverDoc.getText('content').insert(0, 'original');
    const state = Y.encodeStateAsUpdate(serverDoc);

    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, state);

    const serverOld = serverDoc.getText('content').toString();
    const remoteUpdate = applyDiff(serverDoc, serverOld, 'modified');
    Y.applyUpdate(clientDoc, remoteUpdate!);

    expect(clientDoc.getText('content').toString()).toBe('modified');
  });
});
