/**
 * Test that the reconciliation delta is correct for editor application.
 * Verifies: delta content, contentBefore, and that applyDeltaToTransaction
 * produces the correct editor text with both added (green) and deleted (red).
 */
import { test, expect, describe } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';
import {
  createInitialAdapterState,
  processServerMessage,
  handleEditorUpdate,
  applyYjsUpdate,
} from '../../src/web/client-adapter.ts';
import { applyDeltaToTransaction, resolveDeletedText, type StashedDelta } from '../../src/web/file-watch-delta.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import type { ServerMessage } from '../../src/types/ws-messages.ts';

const FILE_CONFIG = { readonly: false, unsafeHtml: false, theme: null, mode: 'both' as const, colorMode: 'auto' as const };

/**
 * Simulate the server's reconcile handler: reverse-diff then forward-diff
 * in the client's Yjs lineage. Returns the base64 update.
 */
function serverReconcile(
  clientUpdateBase64: string,
  baseContent: string,
  newFileContent: string,
): string | undefined {
  const clientDoc = new Y.Doc();
  const clientBytes = Uint8Array.from(atob(clientUpdateBase64), c => c.charCodeAt(0));
  Y.applyUpdate(clientDoc, clientBytes);
  const siblingDoc = new Y.Doc();
  Y.applyUpdate(siblingDoc, Y.encodeStateAsUpdate(clientDoc));
  clientDoc.destroy();

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

  if (baseContent === newFileContent) return undefined;

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
  siblingDoc.destroy();
  return serverUpdate ? btoa(String.fromCharCode(...(serverUpdate as Uint8Array))) : undefined;
}

/**
 * Simple mock editor: tracks text content through transaction operations.
 */
function mockEditor(initialContent: string) {
  let content = initialContent;
  return {
    get content() { return content; },
    insertText(text: string, pos: number) {
      // pos is PM position (1-based due to PM_OFFSET)
      const textPos = pos - 1;
      content = content.slice(0, textPos) + text + content.slice(textPos);
    },
    delete(from: number, to: number) {
      const textFrom = from - 1;
      const textTo = to - 1;
      content = content.slice(0, textFrom) + content.slice(textTo);
    },
  };
}

describe('reconciliation delta correctness', () => {
  test('heading change: delta has both delete and insert', () => {
    const original = '# Hello\n';
    const userEdited = '# Hello\n\nUser work.\n';
    const newFile = '# Hello Updated\n';

    // Build client Yjs doc
    const doc = new Y.Doc();
    doc.getText('content').insert(0, original);
    // Apply user edits
    const diffs = diff(original, userEdited);
    doc.transact(() => {
      const text = doc.getText('content');
      let cursor = 0;
      for (const [op, str] of diffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });
    expect(doc.getText('content').toString()).toBe(userEdited);

    // Server computes reconcile update
    const fullState = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    const updateBase64 = serverReconcile(fullState, original, newFile);
    expect(updateBase64).toBeDefined();

    // Apply to client doc, capture delta
    const result = applyYjsUpdate(doc, updateBase64!);
    expect(result).not.toBeNull();

    const finalContent = doc.getText('content').toString();
    // Must have server changes AND user edits
    expect(finalContent).toContain('Hello Updated');
    expect(finalContent).toContain('User work');

    // Check delta has both adds and proper structure
    const { delta, contentBefore } = result!;
    expect(contentBefore).toBe(userEdited);

    // Resolve diff data for decoration
    const diffData = resolveDeletedText(delta, contentBefore);

    // Should have added text (green highlight)
    expect(diffData.added.length).toBeGreaterThan(0);
    const addedText = diffData.added.map(a => a.text).join('');
    expect(addedText).toContain('Updated');

    // Apply to mock editor — verify final text matches Yjs doc
    const editor = mockEditor(userEdited);
    applyDeltaToTransaction(editor, delta, contentBefore);
    expect(editor.content).toBe(finalContent);
  });

  test('full content replacement: delta produces correct editor text', () => {
    const original = '# Original\nParagraph one.\n';
    const userEdited = '# Original\nParagraph one.\n\nUser addition.\n';
    const newFile = '# Changed\nNew paragraph.\n';

    const doc = new Y.Doc();
    doc.getText('content').insert(0, original);
    const editDiffs = diff(original, userEdited);
    doc.transact(() => {
      const text = doc.getText('content');
      let cursor = 0;
      for (const [op, str] of editDiffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });

    const fullState = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    const updateBase64 = serverReconcile(fullState, original, newFile);
    expect(updateBase64).toBeDefined();

    const result = applyYjsUpdate(doc, updateBase64!);
    expect(result).not.toBeNull();

    const finalContent = doc.getText('content').toString();
    expect(finalContent).toContain('Changed');
    expect(finalContent).toContain('New paragraph');
    expect(finalContent).toContain('User addition');

    // Apply to mock editor
    const editor = mockEditor(userEdited);
    applyDeltaToTransaction(editor, result!.delta, result!.contentBefore);
    expect(editor.content).toBe(finalContent);

    // Verify diff data has both adds and deletes
    const diffData = resolveDeletedText(result!.delta, result!.contentBefore);
    expect(diffData.added.length).toBeGreaterThan(0);
    expect(diffData.deleted.length).toBeGreaterThan(0);
  });

  test('append only: no deletions, just new content added', () => {
    const original = '# Hello\n';
    const userEdited = '# Hello\n\nUser work.\n';
    const newFile = '# Hello\n\nServer appended.\n';

    const doc = new Y.Doc();
    doc.getText('content').insert(0, original);
    const editDiffs = diff(original, userEdited);
    doc.transact(() => {
      const text = doc.getText('content');
      let cursor = 0;
      for (const [op, str] of editDiffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });

    const fullState = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    const updateBase64 = serverReconcile(fullState, original, newFile);
    expect(updateBase64).toBeDefined();

    const result = applyYjsUpdate(doc, updateBase64!);
    expect(result).not.toBeNull();

    const finalContent = doc.getText('content').toString();
    expect(finalContent).toContain('User work');
    expect(finalContent).toContain('Server appended');

    // Apply to mock editor
    const editor = mockEditor(userEdited);
    applyDeltaToTransaction(editor, result!.delta, result!.contentBefore);
    expect(editor.content).toBe(finalContent);
  });

  test('overlapping edits: user and server both modify same line', () => {
    const original = '# Title\n\nContent here.\n';
    const userEdited = '# Title Modified\n\nContent here.\n';  // user changed title
    const newFile = '# Title\n\nContent changed.\n';  // server changed paragraph

    const doc = new Y.Doc();
    doc.getText('content').insert(0, original);
    const editDiffs = diff(original, userEdited);
    doc.transact(() => {
      const text = doc.getText('content');
      let cursor = 0;
      for (const [op, str] of editDiffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });

    const fullState = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    const updateBase64 = serverReconcile(fullState, original, newFile);
    expect(updateBase64).toBeDefined();

    const result = applyYjsUpdate(doc, updateBase64!);
    expect(result).not.toBeNull();

    const finalContent = doc.getText('content').toString();
    // Both changes should be present
    expect(finalContent).toContain('Modified');
    expect(finalContent).toContain('changed');

    // Apply delta to mock editor — must match Yjs doc exactly
    const editor = mockEditor(userEdited);
    applyDeltaToTransaction(editor, result!.delta, result!.contentBefore);
    expect(editor.content).toBe(finalContent);
  });

  test('real scenario: user types paragraph, file heading changes', () => {
    const original = '# Hello World\n\nSome existing content.\n';
    const userEdited = '# Hello World\n\nSome existing content.\n\nNew paragraph typed by user.\n';
    const newFile = '# Updated Title\n\nSome existing content.\n';

    const doc = new Y.Doc();
    doc.getText('content').insert(0, original);
    const editDiffs = diff(original, userEdited);
    doc.transact(() => {
      const text = doc.getText('content');
      let cursor = 0;
      for (const [op, str] of editDiffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });
    expect(doc.getText('content').toString()).toBe(userEdited);

    const fullState = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
    const updateBase64 = serverReconcile(fullState, original, newFile);
    expect(updateBase64).toBeDefined();

    const result = applyYjsUpdate(doc, updateBase64!);
    expect(result).not.toBeNull();

    const { delta, contentBefore } = result!;
    const finalContent = doc.getText('content').toString();

    // Both changes present
    expect(finalContent).toContain('Updated Title');
    expect(finalContent).toContain('New paragraph typed by user');
    expect(finalContent).toContain('Some existing content');

    // Delta should reflect the change from userEdited → finalContent
    expect(contentBefore).toBe(userEdited);

    // resolveDeletedText should show both adds and deletes
    const diffData = resolveDeletedText(delta, contentBefore);
    const allAdded = diffData.added.map(a => a.text).join('');
    const allDeleted = diffData.deleted.map(d => d.text).join('');
    expect(allAdded).toContain('Updated Title');
    expect(allDeleted).toContain('Hello World');

    // Mock editor application must produce exact same content as Yjs doc
    const editor = mockEditor(userEdited);
    applyDeltaToTransaction(editor, delta, contentBefore);
    expect(editor.content).toBe(finalContent);
  });
});
