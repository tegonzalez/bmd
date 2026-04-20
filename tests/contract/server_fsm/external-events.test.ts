import { describe, test, expect } from 'bun:test';
import { serverHandleExternal, serverOnConnect } from '../../../src/protocol/server-fsm.ts';
import { makeServerState } from '../helpers.ts';

describe('server_fsm contract: external events (serverHandleExternal)', () => {
  test('file-watcher:changed updates state.content and broadcasts file:changed', () => {
    const state = makeServerState({ content: 'old content' });
    const result = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'new content',
      base64Update: 'base64data',
      digest: 'abc12345',
    });

    expect(result.state.content).toBe('new content');
    expect(result.broadcast).toHaveLength(1);
    expect(result.broadcast[0]!).toEqual({
      type: 'file:changed',
      update: 'base64data',
      digest: 'abc12345',
    });
  });

  test('client:connected returns same messages as serverOnConnect', () => {
    const state = makeServerState({ content: '# Test', filePath: '/test.md' });

    const externalResult = serverHandleExternal(state, { type: 'client:connected' });
    const connectMessages = serverOnConnect(state);

    expect(externalResult.broadcast).toEqual(connectMessages);
  });

  test('unknown event type: state unchanged, empty broadcast', () => {
    const state = makeServerState();
    const result = serverHandleExternal(state, { type: 'unknown:event' } as any);

    expect(result.state).toBe(state);
    expect(result.broadcast).toEqual([]);
  });

  test('map-file:changed updates state.templateValues and broadcasts values:update', () => {
    const state = makeServerState({ templateValues: null, templatesEnabled: true });
    const result = serverHandleExternal(state, {
      type: 'map-file:changed',
      values: { greeting: 'Hello' },
      templatesEnabled: true,
    });

    expect(result.state.templateValues).toEqual({ greeting: 'Hello' });
    expect(result.state.templatesEnabled).toBe(true);
    expect(result.broadcast).toHaveLength(1);
    expect(result.broadcast[0]!).toEqual({
      type: 'values:update',
      values: { greeting: 'Hello' },
      templatesEnabled: true,
    });
  });

  test('anti-false-positive: file-watcher:changed actually updates state.content', () => {
    const state = makeServerState({ content: 'before' });
    const result = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'after',
      base64Update: 'data',
      digest: 'def67890',
    });

    // Stub returning original state would fail this
    expect(result.state.content).not.toBe('before');
    expect(result.state.content).toBe('after');
  });
});
