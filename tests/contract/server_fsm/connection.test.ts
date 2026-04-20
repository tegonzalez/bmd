import { describe, test, expect } from 'bun:test';
import { serverOnConnect, serverTransition } from '../../../src/protocol/server-fsm.ts';
import { makeServerState } from '../helpers.ts';

describe('server_fsm contract: connection (serverOnConnect)', () => {
  test('with content + filePath returns [server:init, file:open]', () => {
    const state = makeServerState({ content: '# Hello', filePath: '/test.md' });
    const messages = serverOnConnect(state);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
  });

  test('server:init contains globalConfig', () => {
    const state = makeServerState();
    const messages = serverOnConnect(state);
    const initMsg = messages[0]!;

    expect(initMsg.type).toBe('server:init');
    if (initMsg.type === 'server:init') {
      expect(initMsg.config).toEqual(state.globalConfig);
    }
  });

  test('file:open contains correct path, content, config', () => {
    const state = makeServerState({ content: '# Doc', filePath: '/doc.md' });
    const messages = serverOnConnect(state);
    const openMsg = messages[1]!;

    expect(openMsg.type).toBe('file:open');
    if (openMsg.type === 'file:open') {
      expect(openMsg.path).toBe('/doc.md');
      expect(openMsg.content).toBe('# Doc');
      expect(openMsg.config).toEqual(state.fileConfig);
    }
  });

  test('without content (null) returns [server:init] only', () => {
    const state = makeServerState({ content: null });
    const messages = serverOnConnect(state);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe('server:init');
  });

  test('without filePath (null) returns [server:init] only', () => {
    const state = makeServerState({ filePath: null });
    const messages = serverOnConnect(state);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe('server:init');
  });

  test('REGRESSION CT-08: serverOnConnect file:open has same shape as serverTransition file:read reply', () => {
    const state = makeServerState({ content: '# Test', filePath: '/test.md' });

    const connectMessages = serverOnConnect(state);
    const transitionResult = serverTransition(state, { type: 'file:read' });

    // Both should produce a file:open message
    const connectOpen = connectMessages.find(m => m.type === 'file:open');
    const transitionOpen = transitionResult.reply.find(m => m.type === 'file:open');

    expect(connectOpen).toBeDefined();
    expect(transitionOpen).toBeDefined();
    // Same shape proves both code paths use consistent message construction
    expect(connectOpen).toEqual(transitionOpen);
  });

  test('anti-false-positive: serverOnConnect returns non-empty array', () => {
    const state = makeServerState();
    const messages = serverOnConnect(state);

    // Stub returning [] would fail this
    expect(messages.length).toBeGreaterThan(0);
  });
});
