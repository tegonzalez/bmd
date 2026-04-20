/**
 * Connection status dot component.
 * Renders a colored dot in the bottom bar reflecting WebSocket connection state.
 * Green = connected, yellow = reconnecting, red = disconnected (click to retry).
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
};

export interface StatusDot {
  element: HTMLElement;
  setStatus: (status: ConnectionStatus) => void;
}

/**
 * Create a connection status dot element.
 * When status is 'disconnected', clicking the dot calls onRetryClick.
 */
export function createStatusDot(onRetryClick: () => void): StatusDot {
  const el = document.createElement('span');
  el.className = 'connection-dot';
  el.title = 'Connected';

  let currentStatus: ConnectionStatus = 'connected';
  let clickHandler: (() => void) | null = null;

  function setStatus(status: ConnectionStatus) {
    currentStatus = status;
    el.className = `connection-dot connection-${status}`;
    el.title = STATUS_LABELS[status]!;

    // Wire/unwire click handler for disconnected state
    if (status === 'disconnected') {
      if (!clickHandler) {
        clickHandler = () => onRetryClick();
        el.addEventListener('click', clickHandler);
      }
    } else {
      if (clickHandler) {
        el.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
    }
  }

  return { element: el, setStatus };
}

/**
 * Initialize connection status dot in the DOM.
 * Finds the container by selector, appends the dot, and returns a setStatus function.
 */
export function initConnectionStatus(
  containerSelector: string,
  onRetryClick: () => void,
): (status: ConnectionStatus) => void {
  const container = document.querySelector(containerSelector);
  if (!container) {
    writeDiagnostic({ file: 'src/web/connection-status.ts', line: 66, col: 5, span: 0, message: `Container not found: ${containerSelector}`, severity: Severity.DiagError });
    return () => {};
  }

  const dot = createStatusDot(onRetryClick);
  container.prepend(dot.element);
  return dot.setStatus;
}
