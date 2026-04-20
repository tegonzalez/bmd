/**
 * Pure server FSM transition functions.
 * No I/O imports -- only types from ws-messages and protocol/types.
 */

import type { ClientMessage, ServerMessage } from '../types/ws-messages.ts';
import type {
  ServerState,
  ServerTransitionResult,
  ServerExternalEvent,
  ServerExternalResult,
} from './types.ts';
import { defaultLogger, Severity } from '../diagnostics/formatter.ts';

/**
 * Decode base64 string to Uint8Array.
 * Pure utility -- no I/O.
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Pure server FSM. Given current state and a client message,
 * returns new state + reply/broadcast/sideEffects.
 */
export function serverTransition(
  state: ServerState,
  event: ClientMessage,
): ServerTransitionResult {
  const d = (msg: string) => defaultLogger.log(Severity.Debug, msg);

  switch (event.type) {
    case 'file:read': {
      d(`file:read → reply file:open (hasContent=${state.content !== null})`);
      if (state.content !== null && state.filePath) {
        return {
          state,
          reply: [
            {
              type: 'file:open',
              path: state.filePath,
              content: state.content,
              config: state.fileConfig,
            },
          ],
          broadcast: [],
          sideEffects: [],
        };
      }
      return { state, reply: [], broadcast: [], sideEffects: [] };
    }

    case 'file:write': {
      d(`file:write (${event.content.length}b, readonly=${state.isReadonly}, path=${state.filePath})`);
      if (state.isReadonly) {
        return {
          state,
          reply: [{ type: 'file:error', message: 'File is readonly' }],
          broadcast: [],
          sideEffects: [],
        };
      }
      if (!state.filePath) {
        return {
          state,
          reply: [{ type: 'file:error', message: 'No file path configured' }],
          broadcast: [],
          sideEffects: [],
        };
      }
      const newState: ServerState = { ...state, content: event.content };
      return {
        state: newState,
        reply: [],
        broadcast: [{ type: 'file:saved', path: state.filePath }],
        sideEffects: [
          { type: 'set-last-written-content', content: event.content },
          { type: 'update-yjs', path: state.filePath, content: event.content },
          { type: 'write-file', path: state.filePath, content: event.content },
        ],
      };
    }

    case 'file:unlock': {
      d(`file:unlock (readonly=${state.isReadonly})`);
      if (state.isReadonly) {
        return {
          state,
          reply: [
            {
              type: 'file:error',
              message: 'Cannot unlock: server started with --readonly',
            },
          ],
          broadcast: [],
          sideEffects: [],
        };
      }
      return { state, reply: [], broadcast: [], sideEffects: [] };
    }

    case 'reconcile:request': {
      d(`reconcile:request (digest=${event.digest.slice(0, 8)})`);
      // The adapter in server/index.ts handles the actual Yjs merge
      const clientStateVector = decodeBase64(event.stateVector);
      const clientUpdate = decodeBase64(event.update);
      return {
        state,
        reply: [],
        broadcast: [],
        sideEffects: [
          {
            type: 'reconcile',
            clientStateVector,
            clientUpdate,
            digest: event.digest,
            baseContent: event.baseContent,
          },
        ],
      };
    }

    default:
      return { state, reply: [], broadcast: [], sideEffects: [] };
  }
}

/**
 * Returns the init message sequence for a new connection.
 * Always server:init first, then file:open if content available.
 */
export function serverOnConnect(state: ServerState): ServerMessage[] {
  defaultLogger.log(Severity.Debug, `serverOnConnect (hasContent=${state.content !== null}, path=${state.filePath})`);
  const messages: ServerMessage[] = [
    { type: 'server:init', config: state.globalConfig },
  ];
  if (state.content !== null && state.filePath) {
    messages.push({
      type: 'file:open',
      path: state.filePath,
      content: state.content,
      config: state.fileConfig,
    });
  }
  if (state.templateValues !== null) {
    messages.push({
      type: 'values:update',
      values: state.templateValues,
      templatesEnabled: state.templatesEnabled,
    });
  }
  return messages;
}

/**
 * Handles file-watcher and connection events.
 * Returns new state + broadcast messages.
 */
export function serverHandleExternal(
  state: ServerState,
  event: ServerExternalEvent,
): ServerExternalResult {
  const dx = (msg: string) => defaultLogger.log(Severity.Debug, msg);

  switch (event.type) {
    case 'file-watcher:changed': {
      dx(`file-watcher:changed (${event.content.length}b, digest=${event.digest.slice(0, 8)})`);
      const newState: ServerState = { ...state, content: event.content };
      return {
        state: newState,
        broadcast: [{ type: 'file:changed', update: event.base64Update, digest: event.digest }],
      };
    }
    case 'map-file:changed': {
      dx(`map-file:changed (${Object.keys(event.values).length} keys)`);
      const newState: ServerState = {
        ...state,
        templateValues: event.values,
        templatesEnabled: event.templatesEnabled,
      };
      return {
        state: newState,
        broadcast: [{
          type: 'values:update',
          values: event.values,
          templatesEnabled: event.templatesEnabled,
        }],
      };
    }
    case 'client:connected': {
      dx('client:connected → init sequence');
      return {
        state,
        broadcast: serverOnConnect(state),
      };
    }
    default:
      return { state, broadcast: [] };
  }
}
