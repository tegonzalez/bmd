/**
 * WebSocket message parsing and handling for bmd server.
 */

import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import type { ClientMessage, ServerMessage } from '../types/ws-messages.ts';

const VALID_CLIENT_TYPES = new Set(['file:read', 'file:write', 'file:unlock', 'client:error', 'client:diagnostic', 'reconcile:request']);
/** Valid Severity enum values (numeric) */
const MAX_SEVERITY = Severity.Debug3;

/**
 * Parse a raw WebSocket message string into a typed ClientMessage.
 * Returns null for invalid JSON, unknown types, or malformed messages.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    writeDiagnostic({ file: 'src/server/ws-protocol.ts', line: 20, col: 5, span: 0, message: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.type !== 'string' || !VALID_CLIENT_TYPES.has(obj.type)) return null;

  // file:write requires content string
  if (obj.type === 'file:write') {
    if (typeof obj.content !== 'string') return null;
    return { type: 'file:write', content: obj.content };
  }

  // reconcile:request requires stateVector, update, digest strings
  if (obj.type === 'reconcile:request') {
    if (typeof obj.stateVector !== 'string') return null;
    if (typeof obj.update !== 'string') return null;
    if (typeof obj.digest !== 'string') return null;
    return {
      type: 'reconcile:request',
      stateVector: obj.stateVector,
      update: obj.update,
      digest: obj.digest,
      baseContent: typeof obj.baseContent === 'string' ? obj.baseContent : undefined,
      protocolVersion: typeof obj.protocolVersion === 'number' ? obj.protocolVersion : undefined,
    };
  }

  // client:error requires message string
  if (obj.type === 'client:error') {
    if (typeof obj.message !== 'string') return null;
    return {
      type: 'client:error',
      message: obj.message,
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
    };
  }

  // client:diagnostic requires diagnostic object with file, message, severity (numeric)
  if (obj.type === 'client:diagnostic') {
    const d = obj.diagnostic as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return null;
    if (typeof d.message !== 'string') return null;
    const severity = typeof d.severity === 'number' && d.severity >= 0 && d.severity <= MAX_SEVERITY
      ? d.severity as Severity
      : Severity.DiagError;
    return {
      type: 'client:diagnostic',
      diagnostic: {
        file: typeof d.file === 'string' ? d.file : '<browser>',
        line: typeof d.line === 'number' ? d.line : 0,
        col: typeof d.col === 'number' ? d.col : 0,
        span: typeof d.span === 'number' ? d.span : 0,
        message: d.message,
        severity,
        context: typeof d.context === 'string' ? d.context : undefined,
      },
    };
  }

  return { type: obj.type } as ClientMessage;
}

/**
 * Serialize a ServerMessage to a JSON string for sending over WebSocket.
 */
export function createServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
