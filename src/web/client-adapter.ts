/**
 * Client-side protocol adapter.
 * Pure functions and state management for Yjs, digest tracking,
 * reconciliation, and pending delta queue.
 *
 * Zero DOM dependencies. Fully testable with bun test.
 * app.ts calls these functions; this module never touches the DOM.
 */

import * as Y from 'yjs';
import diff from 'fast-diff';
import { clientTransition } from '../protocol/client-fsm.ts';
import { computeReconciliationPayload } from '../protocol/reconcile.ts';
import { PROTOCOL_VERSION } from '../protocol/types.ts';
import type { ClientState, ClientEffect, ClientTransitionResult } from '../protocol/types.ts';
import type { ServerMessage, ClientMessage, ReconcileRequestMessage } from '../types/ws-messages.ts';
import type { StashedDelta } from './file-watch-delta.ts';

// ---------------------------------------------------------------------------
// Adapter state — owned here, not in app.ts
// ---------------------------------------------------------------------------

export interface AdapterState {
  clientState: ClientState;
  yDoc: Y.Doc | null;
  lastYjsContent: string;
  /** Shadow Yjs doc tracking server-side content only (no user edits).
   *  file:changed updates are applied to both yDoc and syncDoc.
   *  User edits (handleEditorUpdate) are only applied to yDoc. */
  syncDoc: Y.Doc | null;
  pendingDeltas: StashedDelta[];
  isOnline: boolean;
  currentValues: Record<string, unknown>;
  templatesEnabled: boolean;
}

export function createInitialAdapterState(): AdapterState {
  return {
    clientState: {
      fileConfig: null,
      currentPath: null,
      content: null,
      unsaved: false,
      lastDigest: null,
      connectionStatus: 'connected',
    },
    yDoc: null,
    lastYjsContent: '',
    syncDoc: null,
    pendingDeltas: [],
    isOnline: true,
    currentValues: {},
    templatesEnabled: true,
  };
}

/** Read the server-synced content from the shadow doc. */
export function getLastSyncedContent(adapter: AdapterState): string | null {
  return adapter.syncDoc ? adapter.syncDoc.getText('content').toString() : null;
}

// ---------------------------------------------------------------------------
// Message processing — FSM + effect preparation in one testable call
// ---------------------------------------------------------------------------

/** Result of processing a server message through the FSM. */
export interface ProcessedMessage {
  state: AdapterState;
  effects: ClientEffect[];
  outgoing: ClientMessage[];
}

/**
 * Process a server message: run FSM transition, then resolve protocol
 * effects (Yjs, digest, reconcile) before returning to the UI layer.
 *
 * This is the single entry point for all server messages. The digest
 * is synced and reconcile payloads are built HERE, not in the UI layer,
 * eliminating ordering bugs.
 */
export function processServerMessage(
  adapter: AdapterState,
  msg: ServerMessage,
): ProcessedMessage {
  const result = clientTransition(adapter.clientState, msg);
  let state = { ...adapter, clientState: result.state };
  const outgoing: ClientMessage[] = [];

  // Process protocol effects (Yjs, reconcile) — extract outgoing messages
  const uiEffects: ClientEffect[] = [];

  for (const effect of result.effects) {
    switch (effect.type) {
      case 'apply-yjs-update': {
        const applied = applyYjsUpdate(state.yDoc, effect.base64Update);
        if (applied) {
          state = { ...state, pendingDeltas: [...state.pendingDeltas, applied] };
        }
        // Also apply to shadow doc (tracks server-side content without user edits)
        if (state.syncDoc) {
          applyYjsUpdate(state.syncDoc, effect.base64Update);
        }
        // Don't forward to UI — adapter handled it
        break;
      }
      case 'sync-yjs-state': {
        const newDoc = syncYjsState(state.yDoc, effect.base64State);
        // Shadow doc cloned from main doc — shared Yjs lineage
        const newSyncDoc = cloneYjsDoc(newDoc.doc);
        state = {
          ...state,
          yDoc: newDoc.doc,
          syncDoc: newSyncDoc,
          lastYjsContent: newDoc.content,
        };
        break;
      }
      case 'reset-yjs': {
        const newDoc = resetYjs(state.yDoc, effect.content);
        // Shadow doc cloned from main doc — shared Yjs lineage
        const newSyncDoc = cloneYjsDoc(newDoc.doc);
        state = {
          ...state,
          yDoc: newDoc.doc,
          syncDoc: newSyncDoc,
          lastYjsContent: newDoc.content,
        };
        break;
      }
      case 'refresh-from-yjs': {
        // Adapter reads merged content; UI layer uses it to set editor
        if (state.yDoc) {
          const merged = state.yDoc.getText('content').toString();
          state = {
            ...state,
            clientState: { ...state.clientState, content: merged },
          };
          // Forward to UI — it needs to set editor content
          uiEffects.push(effect);
        }
        break;
      }
      case 'send-reconcile-request': {
        if (state.syncDoc) {
          const baseContent = getLastSyncedContent(state);
          const msg = buildReconcileRequest(state.syncDoc, effect.digest, baseContent);
          outgoing.push(msg);
        }
        // Don't forward to UI — adapter handled it
        break;
      }
      case 'set-connection-status': {
        state = { ...state, isOnline: effect.status === 'connected' };
        uiEffects.push(effect); // UI needs to update dot
        break;
      }
      case 'store-values': {
        state = {
          ...state,
          currentValues: effect.values,
          templatesEnabled: effect.templatesEnabled,
        };
        uiEffects.push(effect); // UI needs to re-render preview
        break;
      }
      case 'show-banner': {
        // Enrich banner text with pending delta count
        if (effect.text === 'File updated' && state.pendingDeltas.length > 0) {
          const count = state.pendingDeltas.length;
          const text = count > 1 ? `File updated (${count} changes)` : 'File updated';
          uiEffects.push({ ...effect, text, _hasPendingDeltas: true } as any);
        } else {
          uiEffects.push(effect);
        }
        break;
      }
      case 'stash-pending-update':
        // No-op: deltas captured during apply-yjs-update
        break;
      default:
        uiEffects.push(effect);
        break;
    }
  }

  return { state, effects: uiEffects, outgoing };
}

// ---------------------------------------------------------------------------
// Yjs operations — pure, testable
// ---------------------------------------------------------------------------

/**
 * Sync editor text into the client Yjs doc using granular diff.
 * Returns the new lastYjsContent value.
 */
export function syncToYjs(
  yDoc: Y.Doc | null,
  lastYjsContent: string,
  newText: string,
): string {
  if (!yDoc) return lastYjsContent;
  const text = yDoc.getText('content');
  const diffs = diff(lastYjsContent, newText);
  yDoc.transact(() => {
    let cursor = 0;
    for (const [op, str] of diffs) {
      if (op === 0) cursor += str.length;
      else if (op === -1) text.delete(cursor, str.length);
      else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
    }
  });
  return newText;
}

/**
 * Apply a base64-encoded Yjs update, capturing the text delta.
 * Returns a StashedDelta if the text changed, null otherwise.
 */
export function applyYjsUpdate(
  yDoc: Y.Doc | null,
  base64Update: string,
): StashedDelta | null {
  if (!yDoc) return null;
  const text = yDoc.getText('content');
  const contentBefore = text.toString();
  let capturedDelta: StashedDelta['delta'] | null = null;
  const observer = (event: any) => { capturedDelta = event.delta; };
  text.observe(observer);
  const bytes = Uint8Array.from(atob(base64Update), (c) => c.charCodeAt(0));
  Y.applyUpdate(yDoc, bytes);
  text.unobserve(observer);
  return capturedDelta ? { delta: capturedDelta, contentBefore } : null;
}

/**
 * Initialize Yjs doc from a base64-encoded full state.
 * Destroys existing doc if present.
 */
export function syncYjsState(
  existingDoc: Y.Doc | null,
  base64State: string,
): { doc: Y.Doc; content: string } {
  if (existingDoc) existingDoc.destroy();
  const doc = new Y.Doc();
  const stateBytes = Uint8Array.from(atob(base64State), (c) => c.charCodeAt(0));
  Y.applyUpdate(doc, stateBytes);
  return { doc, content: doc.getText('content').toString() };
}

/**
 * Reset Yjs doc with plain text content.
 * Destroys existing doc if present.
 */
export function resetYjs(
  existingDoc: Y.Doc | null,
  content: string,
): { doc: Y.Doc; content: string } {
  if (existingDoc) existingDoc.destroy();
  const doc = new Y.Doc();
  doc.getText('content').insert(0, content);
  return { doc, content };
}

/**
 * Clone a Y.Doc preserving its full CRDT state (shared lineage).
 */
export function cloneYjsDoc(source: Y.Doc): Y.Doc {
  const clone = new Y.Doc();
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(source));
  return clone;
}

// ---------------------------------------------------------------------------
// Pending delta queue
// ---------------------------------------------------------------------------

/**
 * Drain pending deltas and return them. Resets the queue.
 */
export function drainPendingDeltas(adapter: AdapterState): {
  deltas: StashedDelta[];
  state: AdapterState;
} {
  const deltas = adapter.pendingDeltas;
  return {
    deltas,
    state: { ...adapter, pendingDeltas: [] },
  };
}

/**
 * After applying pending deltas, sync lastYjsContent from the Yjs doc.
 */
export function syncLastYjsContentAfterDeltaDrain(adapter: AdapterState): AdapterState {
  if (!adapter.yDoc) return adapter;
  return {
    ...adapter,
    lastYjsContent: adapter.yDoc.getText('content').toString(),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Build a reconcile:request message from the client's Yjs doc and digest.
 * The digest parameter is the client's LAST KNOWN digest (before reconnect).
 * baseContent is the content matching that digest — server's last known state
 * from the client's perspective (includes file:changed updates, excludes user edits).
 */
export function buildReconcileRequest(
  yDoc: Y.Doc,
  digest: string,
  baseContent: string | null = null,
): ReconcileRequestMessage {
  const payload = computeReconciliationPayload(yDoc);
  return {
    type: 'reconcile:request',
    protocolVersion: PROTOCOL_VERSION,
    stateVector: payload.stateVector,
    update: payload.update,
    digest,
    ...(baseContent !== null ? { baseContent } : {}),
  };
}

// ---------------------------------------------------------------------------
// Save logic
// ---------------------------------------------------------------------------

/** Result of a save action. */
export type SaveAction =
  | { type: 'write'; content: string }
  | { type: 'download'; content: string; filename: string };

/**
 * Determine save action based on connection state.
 * Returns the action to take — caller executes it.
 */
export function determineSaveAction(
  content: string,
  isOnline: boolean,
  currentPath: string | null,
): SaveAction {
  if (isOnline) {
    return { type: 'write', content };
  }
  const filename = currentPath?.split('/').pop() || 'untitled.md';
  return { type: 'download', content, filename };
}

// ---------------------------------------------------------------------------
// Editor text sync callback
// ---------------------------------------------------------------------------

/**
 * Handle editor text update: mark unsaved, sync to Yjs.
 * Returns updated adapter state.
 */
export function handleEditorUpdate(adapter: AdapterState, newText: string): AdapterState {
  const lastYjsContent = syncToYjs(adapter.yDoc, adapter.lastYjsContent, newText);
  return {
    ...adapter,
    lastYjsContent,
    clientState: { ...adapter.clientState, unsaved: true },
  };
}
