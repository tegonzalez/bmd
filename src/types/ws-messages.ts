/**
 * Shared WebSocket message types for bmd server and client.
 * Protocol v2: 4-event model with global/file config separation.
 */

import { type Severity } from '../diagnostics/formatter.ts';

// --- Client -> Server messages ---

export interface FileReadMessage {
  type: 'file:read';
}

export interface FileWriteMessage {
  type: 'file:write';
  content: string;
}

export interface FileUnlockMessage {
  type: 'file:unlock';
}

export interface ClientErrorMessage {
  type: 'client:error';
  message: string;
  stack?: string;
}

export interface ClientDiagnosticMessage {
  type: 'client:diagnostic';
  diagnostic: {
    file: string;
    line: number;
    col: number;
    span: number;
    message: string;
    severity: Severity;
    context?: string;
  };
}

/** Sent by client on reconnect when digest mismatch detected */
export interface ReconcileRequestMessage {
  type: 'reconcile:request';
  stateVector: string;   // base64 Yjs state vector
  update: string;        // base64 Yjs full state as update
  digest: string;        // last-observed content digest
  baseContent?: string;  // content matching digest (server's last known state from client's view)
  protocolVersion?: number;
}

export type ClientMessage = FileReadMessage | FileWriteMessage | FileUnlockMessage | ClientErrorMessage | ClientDiagnosticMessage | ReconcileRequestMessage;

// --- Config types ---

/** Server-level configuration sent once on connection */
export interface ServerGlobalConfig {
  host: string;
  port: number;
  logLevel?: Severity;
}

/** Per-file configuration sent with file:open */
export interface FileConfig {
  readonly: boolean;
  unsafeHtml: boolean;
  theme: string | null;
  mode: 'editor' | 'preview' | 'both';
  colorMode: 'day' | 'night' | 'auto';
}

// --- Server -> Client messages ---

/** Sent once on WebSocket connect with global server config */
export interface ServerInitMessage {
  type: 'server:init';
  config: ServerGlobalConfig;
}

export interface ConfigChangedMessage {
  type: 'config:changed';
  delta: Partial<FileConfig>;
}

/** Pushed from server when a file is opened, contains per-file config + initial content */
export interface FileOpenMessage {
  type: 'file:open';
  path: string;
  content: string;
  config: FileConfig;
  yjsState?: string;  // base64-encoded full Yjs state for CRDT sync
  digest?: string;     // MD5 content digest for reconnect reconciliation
}

/** Broadcast on external file change, contains base64-encoded Yjs binary update */
export interface FileChangedMessage {
  type: 'file:changed';
  update: string;
  digest?: string;  // MD5 content digest for reconnect reconciliation
}

export interface FileSavedMessage {
  type: 'file:saved';
  path: string;
}

export interface FileErrorMessage {
  type: 'file:error';
  message: string;
}

/** Sent on connect and on map file change with resolved template values */
export interface ValuesUpdateMessage {
  type: 'values:update';
  values: Record<string, unknown>;
  templatesEnabled: boolean;
}

/** Sent by server after reconciliation completes */
export interface ReconcileCompleteMessage {
  type: 'reconcile:complete';
  digest: string;         // current content digest after merge
  update?: string;        // base64 Yjs update (if content diverged)
  protocolVersion?: number;
}

export type ServerMessage =
  | ServerInitMessage
  | FileOpenMessage
  | FileChangedMessage
  | FileSavedMessage
  | FileErrorMessage
  | ValuesUpdateMessage
  | ReconcileCompleteMessage
  | ConfigChangedMessage;
