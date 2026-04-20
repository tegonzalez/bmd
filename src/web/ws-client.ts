/**
 * WebSocket client with auto-reconnect for bmd web app.
 * Never gives up reconnecting. Backoff capped at ~60 seconds.
 *
 * State machine:
 *   connected (green) → disconnected → reconnecting (yellow) → connected
 *                                    ↘ timeout → disconnected (red, backoff)
 *                                                ↘ backoff expires → reconnecting (yellow)
 *
 * On disconnect: immediate reconnect attempt (yellow).
 * If that fails: backoff wait (red), then retry (yellow), repeat.
 */

import { writeDiagnostic, defaultLogger, Severity } from '../diagnostics/formatter.ts';
import type { ClientMessage, ServerMessage } from '../types/ws-messages.ts';

export interface WebSocketClientOptions {
  onMessage: (msg: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
}

export interface WebSocketClient {
  send: (msg: ClientMessage) => void;
  close: () => void;
  retryNow: () => void;
}

export const INITIAL_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 60000;

/**
 * Derive the WebSocket URL from the current page location
 */
function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Create a WebSocket client with auto-reconnect (no polling fallback).
 * Never gives up. Exponential backoff capped at MAX_BACKOFF_MS.
 */
export function createWebSocketClient(options: WebSocketClientOptions): WebSocketClient {
  const { onMessage, onConnect, onDisconnect, onStatusChange } = options;

  let ws: WebSocket | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let deferTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let immediateRetryAvailable = false; // first retry after disconnect is immediate
  let reconnectingAt = 0; // timestamp when 'reconnecting' was last emitted

  /** Minimum time yellow dot must be visible (CSS transition is 500ms) */
  const MIN_YELLOW_MS = 800;

  function connect() {
    if (closed) return;

    reconnectingAt = Date.now();
    onStatusChange?.('reconnecting'); // yellow — actively attempting

    const wsUrl = getWsUrl();
    defaultLogger.log(Severity.Debug, `connecting to ${wsUrl}`);
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      writeDiagnostic({ file: 'src/web/ws-client.ts', line: 68, col: 7, span: 0, message: `WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
      deferBackoff();
      return;
    }

    ws.onopen = () => {
      defaultLogger.log(Severity.Debug, 'ws.onopen fired');
      backoffMs = INITIAL_BACKOFF_MS;
      immediateRetryAvailable = true; // next disconnect gets an immediate retry
      onStatusChange?.('connected');
      onConnect?.();
    };

    ws.onmessage = (event) => {
      defaultLogger.log(Severity.Debug, `ws.onmessage raw: ${String(event.data).slice(0, 80)}`);
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // malformed JSON from server -- skip
      }
      onMessage(msg);
    };

    ws.onclose = (ev) => {
      defaultLogger.log(Severity.Debug, `ws.onclose code=${ev.code} reason=${ev.reason || '(none)'} wasClean=${ev.wasClean}`);
      ws = null;
      if (!closed) {
        onDisconnect?.();
        if (immediateRetryAvailable) {
          // First failure after a successful connection: immediate retry (yellow)
          immediateRetryAvailable = false;
          connect();
        } else {
          // Subsequent failures: enter backoff (red) after yellow is visible
          deferBackoff();
        }
      }
    };

    ws.onerror = (err) => {
      writeDiagnostic({ file: 'src/web/ws-client.ts', line: 106, col: 7, span: 0, message: `WebSocket error: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
      // onclose will fire after onerror, triggering reconnect
    };
  }

  /**
   * Ensure yellow dot is visible for MIN_YELLOW_MS before transitioning to red.
   * If the reconnect attempt fails faster than the CSS transition, delay the
   * 'disconnected' emission so the user actually sees yellow.
   */
  function deferBackoff() {
    const elapsed = Date.now() - reconnectingAt;
    const remaining = MIN_YELLOW_MS - elapsed;
    if (remaining > 0) {
      deferTimer = setTimeout(() => {
        deferTimer = null;
        enterBackoff();
      }, remaining);
    } else {
      enterBackoff();
    }
  }

  function enterBackoff() {
    if (closed) return;
    onStatusChange?.('disconnected'); // red — waiting in backoff
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(); // will emit 'reconnecting' (yellow)
    }, backoffMs);

    // Exponential backoff
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  function retryNow() {
    if (closed) return;

    // Clear pending timers (both defer and reconnect)
    if (deferTimer) {
      clearTimeout(deferTimer);
      deferTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Reset backoff and allow immediate retry
    backoffMs = INITIAL_BACKOFF_MS;
    immediateRetryAvailable = true;

    // Immediately attempt reconnection
    connect(); // emits 'reconnecting' (yellow)
  }

  function send(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function close() {
    closed = true;
    if (deferTimer) {
      clearTimeout(deferTimer);
      deferTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  // Initial connection
  connect();

  return { send, close, retryNow };
}
