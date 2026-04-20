/**
 * Serve values integration tests.
 * Tests FSM handling of map-file:changed events and values:update broadcasts.
 */
import { test, expect, describe } from 'bun:test';
import { serverHandleExternal, serverOnConnect } from '../../src/protocol/server-fsm.ts';
import type { ServerState } from '../../src/protocol/types.ts';
import type { ServerGlobalConfig, FileConfig } from '../../src/types/ws-messages.ts';

function makeState(overrides: Partial<ServerState> = {}): ServerState {
  const globalConfig: ServerGlobalConfig = { host: 'localhost', port: 3000 };
  const fileConfig: FileConfig = {
    readonly: false,
    unsafeHtml: false,
    theme: null,
    mode: 'both',
    colorMode: 'auto',
  };
  return {
    content: '# Hello',
    filePath: '/tmp/test.md',
    globalConfig,
    fileConfig,
    isReadonly: false,
    templateValues: null,
    templatesEnabled: true,
    ...overrides,
  };
}

describe('serverHandleExternal map-file:changed', () => {
  test('map-file:changed updates state.templateValues and broadcasts values:update', () => {
    const state = makeState({ templateValues: null });
    const result = serverHandleExternal(state, {
      type: 'map-file:changed',
      values: { name: 'World' },
      templatesEnabled: true,
    });

    expect(result.state.templateValues).toEqual({ name: 'World' });
    expect(result.broadcast).toHaveLength(1);
    expect(result.broadcast[0]!).toEqual({
      type: 'values:update',
      values: { name: 'World' },
      templatesEnabled: true,
    });
  });

  test('subsequent map-file:changed replaces previous templateValues', () => {
    const state = makeState({ templateValues: { old: 'data' } });
    const result = serverHandleExternal(state, {
      type: 'map-file:changed',
      values: { new: 'data' },
      templatesEnabled: true,
    });

    expect(result.state.templateValues).toEqual({ new: 'data' });
    expect((result.state.templateValues as any).old).toBeUndefined();
  });
});

describe('serverOnConnect with template values', () => {
  test('includes values:update as third message when templateValues present', () => {
    const state = makeState({
      templateValues: { title: 'Test' },
      templatesEnabled: true,
    });
    const messages = serverOnConnect(state);

    expect(messages.length).toBeGreaterThanOrEqual(3);
    const valuesMsg = messages.find((m: any) => m.type === 'values:update');
    expect(valuesMsg).toBeDefined();
    expect(valuesMsg).toEqual({
      type: 'values:update',
      values: { title: 'Test' },
      templatesEnabled: true,
    });
  });

  test('no values:update when templateValues is null', () => {
    const state = makeState({ templateValues: null });
    const messages = serverOnConnect(state);

    const valuesMsg = messages.find((m: any) => m.type === 'values:update');
    expect(valuesMsg).toBeUndefined();
  });
});
