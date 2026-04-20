/**
 * Unit tests for WebSocket protocol types, parsing, and file watcher.
 */
import { test, expect, describe } from 'bun:test';
import { getRuntime } from '../../src/runtime/index.ts';
import { parseClientMessage, createServerMessage } from '../../src/server/ws-protocol.ts';
import type { ServerMessage } from '../../src/types/ws-messages.ts';

describe('parseClientMessage', () => {
  test('parses file:read message', () => {
    const result = parseClientMessage('{"type":"file:read"}');
    expect(result).toEqual({ type: 'file:read' });
  });

  test('parses file:write message with content', () => {
    const result = parseClientMessage('{"type":"file:write","content":"hello"}');
    expect(result).toEqual({ type: 'file:write', content: 'hello' });
  });

  test('parses file:unlock message', () => {
    const result = parseClientMessage('{"type":"file:unlock"}');
    expect(result).toEqual({ type: 'file:unlock' });
  });

  test('returns null for invalid JSON', () => {
    const result = parseClientMessage('invalid json');
    expect(result).toBeNull();
  });

  test('returns null for unknown message type', () => {
    const result = parseClientMessage('{"type":"unknown"}');
    expect(result).toBeNull();
  });

  test('returns null for missing type field', () => {
    const result = parseClientMessage('{"content":"hello"}');
    expect(result).toBeNull();
  });

  test('returns null for file:write without content', () => {
    const result = parseClientMessage('{"type":"file:write"}');
    expect(result).toBeNull();
  });
});

describe('Phase 2 TODO: mutating client messages carry capabilities', () => {
  test.skip('Phase 2 TODO: parses file:write token shape', () => {
    const result = parseClientMessage('{"type":"file:write","content":"hello","token":"valid-phase-2-token"}');
    expect(result as unknown).toEqual({
      type: 'file:write',
      content: 'hello',
      token: 'valid-phase-2-token',
    });
  });

  test.skip('Phase 2 TODO: parses file:unlock token shape', () => {
    const result = parseClientMessage('{"type":"file:unlock","token":"valid-phase-2-token"}');
    expect(result as unknown).toEqual({
      type: 'file:unlock',
      token: 'valid-phase-2-token',
    });
  });
});

describe('createServerMessage', () => {
  test('creates valid JSON for server:init message', () => {
    const msg: ServerMessage = {
      type: 'server:init',
      config: { host: 'localhost', port: 3000 },
    };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('creates valid JSON for file:open message', () => {
    const msg: ServerMessage = {
      type: 'file:open',
      path: 'test.md',
      content: 'hello',
      config: {
        readonly: false,
        unsafeHtml: false,
        theme: null,
        mode: 'both',
        colorMode: 'auto',
      },
    };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('creates valid JSON for file:changed message', () => {
    const msg: ServerMessage = { type: 'file:changed', update: 'base64encodeddata' };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('creates valid JSON for config:changed message', () => {
    const msg: ServerMessage = {
      type: 'config:changed',
      delta: { readonly: true },
    };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('creates valid JSON for file:saved message', () => {
    const msg: ServerMessage = { type: 'file:saved', path: 'test.md' };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('creates valid JSON for file:error message', () => {
    const msg: ServerMessage = { type: 'file:error', message: 'something went wrong' };
    const json = createServerMessage(msg);
    expect(JSON.parse(json)).toEqual(msg);
  });

  test('round-trips: parse(create(msg)) deep-equals original', () => {
    const msg: ServerMessage = {
      type: 'file:open',
      path: 'test.md',
      content: 'hello',
      config: {
        readonly: false,
        unsafeHtml: false,
        theme: null,
        mode: 'both',
        colorMode: 'auto',
      },
    };
    const json = createServerMessage(msg);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(msg);
  });
});

describe('file watcher', () => {
  const rt = getRuntime();

  test('watchFile returns a cleanup function', async () => {
    const { watchFile } = await import('../../src/server/file-watcher.ts');
    const tmpPath = `/tmp/bmd-test-${Date.now()}.md`;
    await rt.writeFile(tmpPath, 'initial');
    const cleanup = watchFile(tmpPath, () => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
    const { unlinkSync } = await import('node:fs');
    unlinkSync(tmpPath);
  });

  test('setLastWrittenContent is exported as a function', async () => {
    const { setLastWrittenContent } = await import('../../src/server/file-watcher.ts');
    expect(typeof setLastWrittenContent).toBe('function');
  });
});
