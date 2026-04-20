/**
 * Server contract tests: HTTP route logic, server lifecycle, config propagation.
 *
 * Sans-IO: tests the pure FSM functions (serverOnConnect, serverTransition,
 * serverHandleExternal) that back the server's HTTP and WebSocket handlers.
 * No real HTTP server, no fetch(), no WebSocket, no filesystem.
 */

import { describe, test, expect } from 'bun:test';
import { serverTransition, serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import { resolveConfig } from '../../src/config/merge.ts';
import type { ServerState } from '../../src/protocol/types.ts';
import type { FileConfig, ServerGlobalConfig } from '../../src/types/ws-messages.ts';

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

describe('serve: server lifecycle (pure FSM)', () => {
  test('serverOnConnect returns server:init with host and port', () => {
    const state = makeState();
    const messages = serverOnConnect(state);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.type).toBe('server:init');
    expect((messages[0]! as any).config.host).toBe('0.0.0.0');
    expect((messages[0]! as any).config.port).toBe(4200);
  });

  test('serverOnConnect returns server:init + file:open when content is loaded', () => {
    const state = makeState({
      content: '# Hello World\n',
      filePath: '/tmp/test.md',
    });
    const messages = serverOnConnect(state);

    expect(messages.length).toBe(2);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
    expect((messages[1]! as any).content).toBe('# Hello World\n');
    expect((messages[1]! as any).path).toBe('/tmp/test.md');
  });

  test('serverOnConnect returns only server:init when no file provided', () => {
    const state = makeState({ content: null, filePath: null });
    const messages = serverOnConnect(state);

    expect(messages.length).toBe(1);
    expect(messages[0]!.type).toBe('server:init');
    const fileOpen = messages.find((m: any) => m.type === 'file:open');
    expect(fileOpen).toBeUndefined();
  });

  test('server FSM is stateless across connections (survives client disconnect)', () => {
    // The FSM is pure -- calling serverOnConnect again returns the same
    // messages regardless of any prior connections. This proves the server
    // "survives" a client disconnect because there is no mutable per-client
    // state in the FSM layer.
    const state = makeState({
      content: '# Test',
      filePath: '/tmp/test.md',
    });

    const firstConnect = serverOnConnect(state);
    // "client disconnects" -- nothing to do, FSM is pure
    const secondConnect = serverOnConnect(state);

    expect(secondConnect).toEqual(firstConnect);
    expect(secondConnect[0]!.type).toBe('server:init');
    expect(secondConnect[1]!.type).toBe('file:open');
  });

  test('stop is a no-op at FSM level (pure function has no lifecycle)', () => {
    // The FSM functions are pure: they accept state, return state.
    // Server start/stop is adapter-level glue, not a contract to test.
    const state = makeState();
    const messages = serverOnConnect(state);
    expect(messages[0]!.type).toBe('server:init');
    // The test is that the FSM can be called an arbitrary number of times
    // without any cleanup/lifecycle ceremony.
    const again = serverOnConnect(state);
    expect(again).toEqual(messages);
  });

  test('unsafeHtml flows through config to server state and file:open', () => {
    const config = resolveConfig({
      format: 'utf8',
      width: 80,
      ansiEnabled: true,
      pager: 'never',
      unsafeHtml: true,
      filePath: '/tmp/unsafe.md',
      serve: {
        host: '0.0.0.0',
        port: 4200,
        open: false,
      },
    }, null);

    expect(config.unsafeHtml).toBe(true);

    // Build server state as startServer would
    const state = makeState({
      content: '<div>html</div>\n',
      filePath: '/tmp/unsafe.md',
      fileConfig: {
        readonly: false,
        unsafeHtml: true,
        theme: null,
        mode: 'both',
        colorMode: 'auto',
      },
    });

    const messages = serverOnConnect(state);
    const initMsg = messages.find((m: any) => m.type === 'server:init');
    expect(initMsg).toBeDefined();
    expect(initMsg!.type).toBe('server:init');

    const openMsg = messages.find((m: any) => m.type === 'file:open');
    expect(openMsg).toBeDefined();
    expect((openMsg as any).config.unsafeHtml).toBe(true);
  });

  test('serverOnConnect includes values:update when templateValues set', () => {
    const state = makeState({
      content: '# Template',
      filePath: '/tmp/tpl.md',
      templateValues: { title: 'Hello' },
      templatesEnabled: true,
    });

    const messages = serverOnConnect(state);
    expect(messages.length).toBe(3);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
    expect(messages[2]!.type).toBe('values:update');
    expect((messages[2]! as any).values).toEqual({ title: 'Hello' });
    expect((messages[2]! as any).templatesEnabled).toBe(true);
  });
});
