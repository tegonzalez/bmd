/**
 * Pure client FSM transition function.
 * No DOM, WS, Yjs, or browser-specific imports.
 */

import type { ServerMessage } from '../types/ws-messages.ts';
import type { ClientState, ClientTransitionResult, ClientEffect } from './types.ts';
import { PROTOCOL_VERSION } from './types.ts';
import { defaultLogger, Severity } from '../diagnostics/formatter.ts';

/**
 * Pure client FSM. Given current state and a server message,
 * returns new state + UI effects list.
 */
export function clientTransition(
  state: ClientState,
  event: ServerMessage,
): ClientTransitionResult {
  const d = (msg: string) => defaultLogger.log(Severity.Debug, msg);

  switch (event.type) {
    case 'server:init': {
      const effects: ClientEffect[] = [];
      if (event.config.logLevel !== undefined) {
        effects.push({ type: 'set-log-level', level: event.config.logLevel });
      }
      d(`server:init → ${effects.length ? 'set-log-level=' + event.config.logLevel : 'no-op'}`);
      return { state, effects };
    }

    case 'file:open': {
      const isReconnect = state.lastDigest !== null;
      const digestMismatch =
        event.digest !== undefined &&
        isReconnect &&
        event.digest !== state.lastDigest;
      const digestMatch =
        event.digest !== undefined &&
        isReconnect &&
        event.digest === state.lastDigest;

      const newState: ClientState = {
        fileConfig: event.config,
        currentPath: event.path,
        content: digestMatch ? state.content : event.content,
        unsaved: digestMatch ? state.unsaved : false,
        lastDigest: event.digest ?? state.lastDigest,
        connectionStatus: digestMismatch ? 'reconnecting' : 'connected',
      };

      if (digestMismatch) {
        d(`file:open → reconcile (digestMismatch, path=${event.path})`);
        // Request reconciliation to merge local edits with server state.
        // Do NOT replace editor content or Yjs state -- preserve offline edits.
        const effects: ClientEffect[] = [
          { type: 'set-view-mode', mode: event.config.mode },
          { type: 'init-color-mode', colorMode: event.config.colorMode },
          { type: 'init-lock-badge', readonly: event.config.readonly },
          { type: 'update-filename', path: event.path, modified: false },
          { type: 'set-unsaved', unsaved: false },
          { type: 'set-connection-status', status: 'reconnecting' },
          { type: 'send-reconcile-request', stateVector: '', update: '', digest: state.lastDigest! },
        ];

        if (event.config.readonly) {
          effects.push({ type: 'set-editor-editable', editable: false });
        }

        return { state: newState, effects };
      }

      if (digestMatch) {
        d(`file:open → reconnect-match (path=${event.path})`);
        // Preserve local editor content and Yjs state (offline edits survive).
        // Send reconcile request so server gets any local changes we made offline.
        const effects: ClientEffect[] = [
          { type: 'set-view-mode', mode: event.config.mode },
          { type: 'init-color-mode', colorMode: event.config.colorMode },
          { type: 'init-lock-badge', readonly: event.config.readonly },
          { type: 'update-filename', path: event.path, modified: state.unsaved },
          { type: 'set-connection-status', status: 'connected' },
          { type: 'send-reconcile-request', stateVector: '', update: '', digest: state.lastDigest! },
        ];

        if (event.config.readonly) {
          effects.push({ type: 'set-editor-editable', editable: false });
        }

        return { state: newState, effects };
      }

      d(`file:open → firstConnect (path=${event.path}, content=${event.content.length}b)`);
      const effects: ClientEffect[] = [
        { type: 'set-view-mode', mode: event.config.mode },
        { type: 'init-color-mode', colorMode: event.config.colorMode },
        { type: 'init-lock-badge', readonly: event.config.readonly },
        { type: 'set-editor-content', content: event.content },
        { type: 'render-preview', content: event.content, unsafeHtml: event.config.unsafeHtml },
        event.yjsState
          ? { type: 'sync-yjs-state', base64State: event.yjsState }
          : { type: 'reset-yjs', content: event.content },
        { type: 'update-filename', path: event.path, modified: false },
        { type: 'set-unsaved', unsaved: false },
      ];

      // Readonly files disable editor
      if (event.config.readonly) {
        effects.push({ type: 'set-editor-editable', editable: false });
      }

      return { state: newState, effects };
    }

    case 'file:changed': {
      d(`file:changed → apply-yjs-update${event.digest ? ` (digest=${event.digest.slice(0, 8)})` : ''}`);
      const newState: ClientState = event.digest
        ? { ...state, lastDigest: event.digest }
        : state;

      // Apply Yjs update immediately (keeps CRDT in sync), but do NOT touch editor
      const effects: ClientEffect[] = [
        { type: 'apply-yjs-update', base64Update: event.update },
        { type: 'stash-pending-update', base64Update: event.update },
        { type: 'show-banner', text: 'File updated' },
      ];
      return { state: newState, effects };
    }

    case 'reconcile:complete': {
      d(`reconcile:complete (digest=${event.digest.slice(0, 8)}, hasUpdate=${!!event.update})`);
      if (event.protocolVersion !== undefined && event.protocolVersion !== PROTOCOL_VERSION) {
        const effects: ClientEffect[] = [
          { type: 'notify-version-mismatch', clientVersion: PROTOCOL_VERSION, serverVersion: event.protocolVersion },
        ];
        return { state, effects };
      }

      const newState: ClientState = {
        ...state,
        lastDigest: event.digest,
        connectionStatus: 'connected',
      };

      const effects: ClientEffect[] = [
        { type: 'set-connection-status', status: 'connected' },
      ];

      if (event.update) {
        // Divergent content -- apply like a normal file:changed flow
        effects.push(
          { type: 'apply-yjs-update', base64Update: event.update },
          { type: 'stash-pending-update', base64Update: event.update },
          { type: 'show-banner', text: 'File updated' },
        );
      }

      return { state: newState, effects };
    }

    case 'file:saved': {
      d(`file:saved (path=${event.path})`);
      const newState: ClientState = { ...state, unsaved: false };
      const effects: ClientEffect[] = [
        { type: 'update-filename', path: event.path, modified: false },
        { type: 'set-unsaved', unsaved: false },
      ];
      return { state: newState, effects };
    }

    case 'file:error': {
      d(`file:error → show-banner (${event.message})`);
      const effects: ClientEffect[] = [
        { type: 'show-banner', text: `Error: ${event.message}` },
      ];
      return { state, effects };
    }

    case 'values:update': {
      d(`values:update (${Object.keys(event.values).length} keys, templates=${event.templatesEnabled})`);
      const effects: ClientEffect[] = [
        { type: 'store-values', values: event.values, templatesEnabled: event.templatesEnabled },
      ];
      return { state, effects };
    }

    default:
      return { state, effects: [] };
  }
}
