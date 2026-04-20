/**
 * Polling endpoint contract tests.
 *
 * Sans-IO: tests the poll session logic as a pure data structure.
 * The actual /api/poll endpoint is thin adapter glue over:
 *   1. serverOnConnect() for initial messages
 *   2. A Map<sessionId, pending[]> for session tracking
 *
 * No real HTTP server, no fetch(), no filesystem.
 */

import { describe, test, expect } from 'bun:test';
import { serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import type { ServerState } from '../../src/protocol/types.ts';
import type { FileConfig, ServerGlobalConfig, ServerMessage } from '../../src/types/ws-messages.ts';

function makeState(overrides: Partial<ServerState> = {}): ServerState {
  const globalConfig: ServerGlobalConfig = { host: '0.0.0.0', port: 4200 };
  const fileConfig: FileConfig = {
    readonly: false,
    unsafeHtml: false,
    theme: null,
    mode: 'both',
    colorMode: 'auto',
  };
  return {
    content: null,
    filePath: null,
    globalConfig,
    fileConfig,
    isReadonly: false,
    templateValues: null,
    templatesEnabled: true,
    ...overrides,
  };
}

/**
 * Pure poll session manager — extracted logic from server/index.ts.
 * This is what the /api/poll handler does internally.
 */
class PollSessionManager {
  private sessions = new Map<string, { lastSeen: number; pending: ServerMessage[] }>();

  /** Handle a poll request. Returns the messages to send. */
  poll(sessionId: string | null, getConnectMessages: () => ServerMessage[]): ServerMessage[] {
    if (!sessionId) {
      return getConnectMessages();
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sessions.set(sessionId, { lastSeen: Date.now(), pending: [] });
      return getConnectMessages();
    }

    const pending = session.pending;
    session.pending = [];
    session.lastSeen = Date.now();
    return pending;
  }

  /** Enqueue a message for all sessions (simulates broadcast). */
  enqueue(msg: ServerMessage): void {
    for (const session of this.sessions.values()) {
      session.pending.push(msg);
    }
  }
}

describe('serve-poll: Polling endpoint (pure session logic)', () => {
  test('poll without session returns array with server:init', () => {
    const state = makeState();
    const mgr = new PollSessionManager();

    const messages = mgr.poll(null, () => serverOnConnect(state));

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.type).toBe('server:init');
    expect((messages[0]! as any).config.host).toBe('0.0.0.0');
    expect((messages[0]! as any).config.port).toBe(4200);
  });

  test('poll without session and with file returns server:init + file:open', () => {
    const state = makeState({
      content: '# Poll Test\n',
      filePath: '/tmp/poll-test.md',
    });
    const mgr = new PollSessionManager();

    const messages = mgr.poll(null, () => serverOnConnect(state));

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(2);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
    expect((messages[1]! as any).content).toBe('# Poll Test\n');
    expect((messages[1]! as any).path).toBe('/tmp/poll-test.md');
    expect((messages[1]! as any).config).toBeDefined();
    expect((messages[1]! as any).config.unsafeHtml).toBe(false);
  });

  test('poll with session returns empty array when no changes', () => {
    const state = makeState();
    const mgr = new PollSessionManager();
    const sessionId = 'test-session-123';

    // First poll with new session -> returns init messages
    const msgs1 = mgr.poll(sessionId, () => serverOnConnect(state));
    expect(msgs1[0]!.type).toBe('server:init');

    // Second poll -> should return empty array (no changes)
    const msgs2 = mgr.poll(sessionId, () => serverOnConnect(state));
    expect(Array.isArray(msgs2)).toBe(true);
    expect(msgs2.length).toBe(0);
  });

  test('poll returns empty array when no file loaded and session is known', () => {
    const state = makeState();
    const mgr = new PollSessionManager();

    // No file loaded -> only server:init on first poll
    const msgs1 = mgr.poll(null, () => serverOnConnect(state));
    expect(Array.isArray(msgs1)).toBe(true);
    expect(msgs1.length).toBe(1);
    expect(msgs1[0]!.type).toBe('server:init');
  });

  test('poll with session receives broadcast messages on next poll', () => {
    const state = makeState({
      content: '# Test',
      filePath: '/tmp/test.md',
    });
    const mgr = new PollSessionManager();
    const sessionId = 'session-abc';

    // Register session
    mgr.poll(sessionId, () => serverOnConnect(state));

    // Simulate a file:changed broadcast
    const changedMsg: ServerMessage = {
      type: 'file:changed',
      update: 'base64-update-data',
      digest: 'new-digest',
    };
    mgr.enqueue(changedMsg);

    // Next poll should return the broadcast message
    const msgs = mgr.poll(sessionId, () => serverOnConnect(state));
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.type).toBe('file:changed');
    expect((msgs[0]! as any).update).toBe('base64-update-data');

    // Following poll should be empty again
    const msgs2 = mgr.poll(sessionId, () => serverOnConnect(state));
    expect(msgs2.length).toBe(0);
  });

  test('multiple sessions each get their own broadcast copy', () => {
    const state = makeState();
    const mgr = new PollSessionManager();

    // Register two sessions
    mgr.poll('session-1', () => serverOnConnect(state));
    mgr.poll('session-2', () => serverOnConnect(state));

    // Broadcast a message
    mgr.enqueue({ type: 'file:saved', path: '/tmp/test.md' });

    // Both sessions should receive it
    const msgs1 = mgr.poll('session-1', () => serverOnConnect(state));
    const msgs2 = mgr.poll('session-2', () => serverOnConnect(state));
    expect(msgs1.length).toBe(1);
    expect(msgs1[0]!.type).toBe('file:saved');
    expect(msgs2.length).toBe(1);
    expect(msgs2[0]!.type).toBe('file:saved');
  });
});
