/**
 * Pure reconciliation functions for the reconnect protocol.
 * Uses Yjs APIs for state vector sync and content merging.
 * Uses MD5 for content digest (same algorithm as file-watcher.ts).
 */

import * as Y from 'yjs';
import { createHash } from 'node:crypto';

/**
 * Compute the reconciliation payload from a client Y.Doc.
 * Returns state vector and full state as base64-encoded strings
 * for transmission over WebSocket.
 */
export function computeReconciliationPayload(doc: Y.Doc): {
  stateVector: string;
  update: string;
} {
  const sv = Y.encodeStateVector(doc);
  const update = Y.encodeStateAsUpdate(doc);
  return {
    stateVector: btoa(String.fromCharCode(...sv)),
    update: btoa(String.fromCharCode(...update)),
  };
}

/**
 * Reconcile client state with server state.
 * Applies client update to a clone of the server doc, then compares
 * merged content with the current filesystem content.
 *
 * Returns the diff update the client needs (or null if no diff).
 * Throws on invalid client update to prevent server doc corruption.
 */
export function reconcileOnServer(
  serverDoc: Y.Doc,
  clientStateVector: Uint8Array,
  clientUpdate: Uint8Array,
  currentFileContent: string,
): { update: Uint8Array | null; newContent: string } {
  // Clone the server doc so a failed merge doesn't corrupt it
  const mergeDoc = new Y.Doc();
  Y.applyUpdate(mergeDoc, Y.encodeStateAsUpdate(serverDoc));

  // Apply client's changes -- this will throw on invalid data
  Y.applyUpdate(mergeDoc, clientUpdate);

  const mergedContent = mergeDoc.getText('content').toString();

  if (mergedContent === currentFileContent) {
    return { update: null, newContent: mergedContent };
  }

  // Compute what the client is missing relative to the merged doc
  const diffUpdate = Y.encodeStateAsUpdate(mergeDoc, clientStateVector);
  return { update: diffUpdate, newContent: mergedContent };
}

/**
 * Compute MD5 hex digest of content string.
 * Same algorithm as file-watcher.ts for consistency.
 */
export function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}
