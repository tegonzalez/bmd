/**
 * Server FSM unit tests.
 * Tests serverTransition, serverOnConnect, serverHandleExternal as pure functions.
 */
import { test, expect, describe } from 'bun:test';
import { getRuntime } from '../../src/runtime/index.ts';
import { serverTransition, serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import type { ServerState } from '../../src/protocol/types.ts';
import type { FileConfig, ServerGlobalConfig } from '../../src/types/ws-messages.ts';

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

describe('serverTransition', () => {
  test('file:read with content available -> reply contains file:open', () => {
    const state = makeState();
    const result = serverTransition(state, { type: 'file:read' });
    expect(result.reply).toHaveLength(1);
    expect(result.reply[0]!).toEqual({
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: state.fileConfig,
    });
    expect(result.broadcast).toHaveLength(0);
    expect(result.sideEffects).toHaveLength(0);
    // State unchanged
    expect(result.state).toEqual(state);
  });

  test('file:read with null content -> reply is empty', () => {
    const state = makeState({ content: null });
    const result = serverTransition(state, { type: 'file:read' });
    expect(result.reply).toHaveLength(0);
    expect(result.state).toEqual(state);
  });

  test('file:write when not readonly -> state updated, sideEffects, broadcast', () => {
    const state = makeState();
    const result = serverTransition(state, { type: 'file:write', content: 'new content' });

    // State content updated
    expect(result.state.content).toBe('new content');

    // Side effects
    expect(result.sideEffects).toHaveLength(3);
    expect(result.sideEffects).toContainEqual({ type: 'write-file', path: '/tmp/test.md', content: 'new content' });
    expect(result.sideEffects).toContainEqual({ type: 'update-yjs', path: '/tmp/test.md', content: 'new content' });
    expect(result.sideEffects).toContainEqual({ type: 'set-last-written-content', content: 'new content' });

    // Broadcast file:saved
    expect(result.broadcast).toHaveLength(1);
    expect(result.broadcast[0]!).toEqual({ type: 'file:saved', path: '/tmp/test.md' });

    // No reply to sender
    expect(result.reply).toHaveLength(0);
  });

  test('file:write when readonly -> reply contains file:error, no sideEffects', () => {
    const state = makeState({ isReadonly: true });
    const result = serverTransition(state, { type: 'file:write', content: 'new' });

    expect(result.reply).toHaveLength(1);
    expect(result.reply[0]!).toEqual({ type: 'file:error', message: 'File is readonly' });
    expect(result.sideEffects).toHaveLength(0);
    expect(result.broadcast).toHaveLength(0);
    // State unchanged
    expect(result.state.content).toBe('# Hello');
  });

  test('file:write when no filePath -> reply contains file:error', () => {
    const state = makeState({ filePath: null });
    const result = serverTransition(state, { type: 'file:write', content: 'new' });

    expect(result.reply).toHaveLength(1);
    expect(result.reply[0]!).toEqual({ type: 'file:error', message: 'No file path configured' });
    expect(result.sideEffects).toHaveLength(0);
    expect(result.broadcast).toHaveLength(0);
  });

  test('file:unlock when readonly -> reply contains file:error', () => {
    const state = makeState({ isReadonly: true });
    const result = serverTransition(state, { type: 'file:unlock' });

    expect(result.reply).toHaveLength(1);
    expect(result.reply[0]!).toEqual({
      type: 'file:error',
      message: 'Cannot unlock: server started with --readonly',
    });
    expect(result.sideEffects).toHaveLength(0);
  });

  test('file:unlock when not readonly -> no reply, no effects', () => {
    const state = makeState({ isReadonly: false });
    const result = serverTransition(state, { type: 'file:unlock' });

    expect(result.reply).toHaveLength(0);
    expect(result.broadcast).toHaveLength(0);
    expect(result.sideEffects).toHaveLength(0);
    expect(result.state).toEqual(state);
  });
});

describe('serverOnConnect', () => {
  test('with content -> returns [server:init, file:open]', () => {
    const state = makeState();
    const messages = serverOnConnect(state);

    expect(messages).toHaveLength(2);
    expect(messages[0]!).toEqual({ type: 'server:init', config: state.globalConfig });
    expect(messages[1]!).toEqual({
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: state.fileConfig,
    });
  });

  test('without content -> returns [server:init] only', () => {
    const state = makeState({ content: null });
    const messages = serverOnConnect(state);

    expect(messages).toHaveLength(1);
    expect(messages[0]!).toEqual({ type: 'server:init', config: state.globalConfig });
  });
});

describe('serverHandleExternal', () => {
  test('file-watcher:changed -> state.content updated, broadcast file:changed with digest', () => {
    const state = makeState();
    const result = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'updated externally',
      base64Update: 'base64data',
      digest: 'abc123',
    });

    expect(result.state.content).toBe('updated externally');
    expect(result.broadcast).toHaveLength(1);
    expect(result.broadcast[0]!).toEqual({ type: 'file:changed', update: 'base64data', digest: 'abc123' });
  });

  test('client:connected -> returns serverOnConnect messages as broadcast', () => {
    const state = makeState();
    const result = serverHandleExternal(state, { type: 'client:connected' });

    expect(result.broadcast).toHaveLength(2);
    expect(result.broadcast[0]!).toEqual({ type: 'server:init', config: state.globalConfig });
    expect(result.broadcast[1]!).toEqual({
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: state.fileConfig,
    });
  });
});

describe('reconciliation transitions', () => {
  test('reconcile:request -> returns reconcile side effect', () => {
    const state = makeState();
    const result = serverTransition(state, {
      type: 'reconcile:request',
      stateVector: btoa('state-vector-data'),
      update: btoa('update-data'),
      digest: 'abc123',
    });

    expect(result.sideEffects).toHaveLength(1);
    expect(result.sideEffects[0]!.type).toBe('reconcile');
    const effect = result.sideEffects[0]! as { type: 'reconcile'; clientStateVector: Uint8Array; clientUpdate: Uint8Array; digest: string };
    expect(effect.digest).toBe('abc123');
    expect(effect.clientStateVector).toBeInstanceOf(Uint8Array);
    expect(effect.clientUpdate).toBeInstanceOf(Uint8Array);
    // No state mutation
    expect(result.state).toEqual(state);
    // No reply or broadcast from FSM (adapter handles response)
    expect(result.reply).toHaveLength(0);
    expect(result.broadcast).toHaveLength(0);
  });

  test('file-watcher:changed includes digest in broadcast', () => {
    const state = makeState();
    const result = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'new content',
      base64Update: 'base64data',
      digest: 'digest-xyz',
    });

    const changedMsg = result.broadcast[0]!;
    expect(changedMsg.type).toBe('file:changed');
    expect((changedMsg as any).digest).toBe('digest-xyz');
  });
});

describe('purity constraints', () => {
  const rt = getRuntime();

  test('no I/O imports in server-fsm.ts', async () => {
    const source = await rt.readFile('src/protocol/server-fsm.ts');
    expect(source).not.toMatch(/import.*from.*['"]bun['"]/);
    expect(source).not.toMatch(/import.*from.*['"]node:fs['"]/);
    expect(source).not.toMatch(/import.*from.*['"]\.\.\/server\//);
    expect(source).not.toMatch(/Bun\./);
  });
});
