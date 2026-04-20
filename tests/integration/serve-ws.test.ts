/**
 * WebSocket protocol v2 contract tests.
 *
 * Sans-IO: tests the pure FSM functions and WS protocol parsing/serialization
 * directly. No real WebSocket, no HTTP server, no filesystem.
 *
 * What was previously tested through real WS connections is now verified by:
 * - serverOnConnect() for init/file:open message sequence
 * - serverTransition() for file:write -> file:saved broadcast
 * - serverHandleExternal() for file-watcher -> file:changed broadcast
 * - YjsDocumentManager for Yjs update generation/validation
 * - parseClientMessage/createServerMessage for serialization round-trips
 */

import { describe, test, expect } from 'bun:test';
import { serverTransition, serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import { parseClientMessage, createServerMessage } from '../../src/server/ws-protocol.ts';
import { YjsDocumentManager } from '../../src/server/yjs-doc.ts';
import * as Y from 'yjs';
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

describe('serve-ws: WebSocket protocol v2 (pure FSM)', () => {
  test('sends server:init as first message with host and port', () => {
    const state = makeState();
    const messages = serverOnConnect(state);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.type).toBe('server:init');
    expect((messages[0]! as any).config.host).toBe('0.0.0.0');
    expect((messages[0]! as any).config.port).toBe(4200);
  });

  test('sends file:open as second message with content, path, and config', () => {
    const state = makeState({
      content: '# Test Content\n',
      filePath: '/tmp/test.md',
    });
    const messages = serverOnConnect(state);

    expect(messages.length).toBe(2);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
    expect((messages[1]! as any).content).toBe('# Test Content\n');
    expect((messages[1]! as any).path).toBe('/tmp/test.md');
    expect((messages[1]! as any).config).toBeDefined();
    expect((messages[1]! as any).config.mode).toBe('both');
    expect((messages[1]! as any).config.colorMode).toBe('auto');
  });

  test('file:open config includes unsafeHtml field', () => {
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

    const openMsg = messages.find((m: any) => m.type === 'file:open');
    expect(openMsg).toBeDefined();
    expect((openMsg as any).config.unsafeHtml).toBe(true);
  });

  test('external file edit triggers file:changed broadcast with base64 Yjs update', () => {
    const state = makeState({
      content: 'initial',
      filePath: '/tmp/watch-test.md',
    });

    // Simulate what the server adapter does: create Yjs doc, apply external change
    const yjsManager = new YjsDocumentManager();
    yjsManager.createDoc('/tmp/watch-test.md', 'initial');

    const update = yjsManager.applyExternalChange('/tmp/watch-test.md', 'externally changed');
    expect(update).not.toBeNull();

    // Convert to base64 as the adapter does
    const base64Update = Buffer.from(update!).toString('base64');
    expect(typeof base64Update).toBe('string');
    expect(base64Update).not.toBe('externally changed');

    // Feed through the FSM
    const result = serverHandleExternal(state, {
      type: 'file-watcher:changed',
      content: 'externally changed',
      base64Update,
      digest: 'mock-digest',
    });

    expect(result.state.content).toBe('externally changed');
    expect(result.broadcast.length).toBe(1);
    expect(result.broadcast[0]!.type).toBe('file:changed');
    expect((result.broadcast[0]! as any).update).toBe(base64Update);

    yjsManager.cleanup('/tmp/watch-test.md');
  });

  test('base64-decoded Yjs update from external change is valid binary data', () => {
    const yjsManager = new YjsDocumentManager();
    yjsManager.createDoc('/tmp/yjs-test.md', 'initial');

    const update = yjsManager.applyExternalChange('/tmp/yjs-test.md', 'updated content');
    expect(update).not.toBeNull();

    // Base64 encode then decode (mimics WS transport round-trip)
    const base64 = Buffer.from(update!).toString('base64');
    const decoded = new Uint8Array(
      atob(base64).split('').map(c => c.charCodeAt(0))
    );
    expect(decoded.length).toBeGreaterThan(0);

    // Apply to a fresh empty doc -- should not throw
    const freshDoc = new Y.Doc();
    expect(() => Y.applyUpdate(freshDoc, decoded)).not.toThrow();

    yjsManager.cleanup('/tmp/yjs-test.md');
  });

  test('file:write transition produces file:saved broadcast and write-file side effect', () => {
    const state = makeState({
      content: 'original',
      filePath: '/tmp/write-test.md',
    });

    // Parse a client file:write message
    const parsed = parseClientMessage(JSON.stringify({
      type: 'file:write',
      content: 'updated content',
    }));
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('file:write');

    // Feed through FSM
    const result = serverTransition(state, parsed!);

    // State content updated
    expect(result.state.content).toBe('updated content');

    // Broadcast file:saved
    expect(result.broadcast.length).toBe(1);
    expect(result.broadcast[0]!.type).toBe('file:saved');
    expect((result.broadcast[0]! as any).path).toBe('/tmp/write-test.md');

    // Side effects include write-file
    const writeEffect = result.sideEffects.find(e => e.type === 'write-file');
    expect(writeEffect).toBeDefined();
    expect((writeEffect as any).content).toBe('updated content');
    expect((writeEffect as any).path).toBe('/tmp/write-test.md');

    // Side effects include update-yjs
    const yjsEffect = result.sideEffects.find(e => e.type === 'update-yjs');
    expect(yjsEffect).toBeDefined();

    // Side effects include set-last-written-content (echo suppression)
    const echoEffect = result.sideEffects.find(e => e.type === 'set-last-written-content');
    expect(echoEffect).toBeDefined();
  });

  test('file:write on readonly file produces file:error reply, no write', () => {
    const state = makeState({
      content: 'original',
      filePath: '/tmp/readonly.md',
      isReadonly: true,
    });

    const result = serverTransition(state, { type: 'file:write', content: 'attempt' });

    expect(result.reply.length).toBe(1);
    expect(result.reply[0]!.type).toBe('file:error');
    expect((result.reply[0]! as any).message).toContain('readonly');
    expect(result.sideEffects.length).toBe(0);
    expect(result.broadcast.length).toBe(0);
    // State unchanged
    expect(result.state.content).toBe('original');
  });

  test('createServerMessage / parseClientMessage round-trip serialization', () => {
    // Server message serialization
    const serverMsg: ServerMessage = {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello\n',
      config: {
        readonly: false,
        unsafeHtml: false,
        theme: null,
        mode: 'both',
        colorMode: 'auto',
      },
    };
    const serialized = createServerMessage(serverMsg);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe('file:open');
    expect(parsed.content).toBe('# Hello\n');
    expect(parsed.path).toBe('/tmp/test.md');

    // Client message parsing
    const clientRaw = JSON.stringify({ type: 'file:write', content: 'new' });
    const clientParsed = parseClientMessage(clientRaw);
    expect(clientParsed).not.toBeNull();
    expect(clientParsed!.type).toBe('file:write');
    expect((clientParsed as any).content).toBe('new');
  });
});
