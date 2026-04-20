/**
 * FSM state, effect, and external event types for the WS protocol contract.
 * Pure type definitions -- no runtime behavior.
 */

import type { ClientMessage, ServerMessage, ServerGlobalConfig, FileConfig } from '../types/ws-messages.ts';
import type { Severity } from '../diagnostics/formatter.ts';

/** Protocol version for version mismatch detection */
export const PROTOCOL_VERSION = 2;

// --- Server FSM types ---

export interface ServerState {
  content: string | null;
  filePath: string | null;
  globalConfig: ServerGlobalConfig;
  fileConfig: FileConfig;
  isReadonly: boolean;
  templateValues: Record<string, unknown> | null;
  templatesEnabled: boolean;
}

export interface ServerTransitionResult {
  state: ServerState;
  reply: ServerMessage[];
  broadcast: ServerMessage[];
  sideEffects: ServerSideEffect[];
}

export type ServerSideEffect =
  | { type: 'write-file'; path: string; content: string }
  | { type: 'update-yjs'; path: string; content: string }
  | { type: 'set-last-written-content'; content: string }
  | { type: 'reconcile'; clientStateVector: Uint8Array; clientUpdate: Uint8Array; digest: string; baseContent?: string }
  | { type: 'compute-digest'; content: string };

export type ServerExternalEvent =
  | { type: 'file-watcher:changed'; content: string; base64Update: string; digest: string }
  | { type: 'map-file:changed'; values: Record<string, unknown>; templatesEnabled: boolean }
  | { type: 'client:connected' };

export interface ServerExternalResult {
  state: ServerState;
  broadcast: ServerMessage[];
}

// --- Client FSM types ---

export interface ClientState {
  fileConfig: FileConfig | null;
  currentPath: string | null;
  content: string | null;
  unsaved: boolean;
  lastDigest: string | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
}

export interface ClientTransitionResult {
  state: ClientState;
  effects: ClientEffect[];
}

export type ClientEffect =
  | { type: 'set-editor-content'; content: string }
  | { type: 'render-preview'; content: string; unsafeHtml: boolean }
  | { type: 'set-view-mode'; mode: 'editor' | 'preview' | 'both' }
  | { type: 'init-color-mode'; colorMode: 'day' | 'night' | 'auto' }
  | { type: 'init-lock-badge'; readonly: boolean }
  | { type: 'set-editor-editable'; editable: boolean }
  | { type: 'update-filename'; path: string | null; modified: boolean }
  | { type: 'set-unsaved'; unsaved: boolean }
  | { type: 'show-banner'; text: string }
  | { type: 'show-timed-banner'; text: string; durationMs: number }
  | { type: 'apply-yjs-update'; base64Update: string }
  | { type: 'sync-yjs-state'; base64State: string }
  | { type: 'stash-pending-update'; base64Update: string }
  | { type: 'refresh-from-yjs' }
  | { type: 'reset-yjs'; content: string }
  | { type: 'store-values'; values: Record<string, unknown>; templatesEnabled: boolean }
  | { type: 'set-connection-status'; status: 'connected' | 'reconnecting' | 'disconnected' }
  | { type: 'send-reconcile-request'; stateVector: string; update: string; digest: string }
  | { type: 'notify-version-mismatch'; clientVersion: number; serverVersion: number }
  | { type: 'set-log-level'; level: Severity };
