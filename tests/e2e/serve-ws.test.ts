/**
 * Integration tests for bmd serve: WebSocket protocol v2.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { startServer } from '../../src/server/index.ts';
import { resolveConfig } from '../../src/config/merge.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as Y from 'yjs';
import type { ServerMessage } from '../../src/types/ws-messages.ts';
import { getRuntime } from '../../src/runtime/index.ts';

let cleanup: (() => void) | null = null;

const TEST_HOST = '127.0.0.1';
const FETCH_HOST = '127.0.0.1';

const rt = getRuntime();

function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

/** Helper to create a BmdConfig for testing with serve overrides */
function testConfig(overrides: {
  port?: number;
  host?: string;
  filePath?: string;
  readonly?: boolean;
  open?: boolean;
  unsafeHtml?: boolean;
} = {}) {
  return resolveConfig({
    format: 'utf8',
    width: 80,
    ansiEnabled: true,
    pager: 'never',
    unsafeHtml: overrides.unsafeHtml || undefined,
    filePath: overrides.filePath,
    serve: {
      host: overrides.host ?? TEST_HOST,
      port: overrides.port,
      open: overrides.open ?? false,
      readonly: overrides.readonly,
    },
  }, null);
}

/**
 * Connect a WebSocket and return helpers for collecting messages.
 */
function connectWS(port: number): Promise<{
  ws: WebSocket;
  messages: ServerMessage[];
  waitForMessage: (filter?: (msg: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${FETCH_HOST}:${port}/ws`);
    const messages: ServerMessage[] = [];
    const waiters: Array<{
      filter: (msg: ServerMessage) => boolean;
      resolve: (msg: ServerMessage) => void;
      reject: (err: Error) => void;
    }> = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      messages.push(msg);

      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i]!.filter(msg)) {
          waiters[i]!.resolve(msg);
          waiters.splice(i, 1);
        }
      }
    };

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage(filter = () => true, timeoutMs = 3000) {
          const existing = messages.find(filter);
          if (existing) return Promise.resolve(existing);

          return new Promise<ServerMessage>((res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error(`Timed out waiting for message (had ${messages.length} messages: ${JSON.stringify(messages.map(m => m.type))})`));
            }, timeoutMs);

            waiters.push({
              filter,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: rej,
            });
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = (e) => reject(e);
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 3000);
  });
}

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

describe('serve-ws: WebSocket protocol v2', () => {
  test('sends server:init as first message with host and port', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }));
    cleanup = stop;

    await rt.sleep(50);

    const client = await connectWS(port);
    const initMsg = await client.waitForMessage((m) => m.type === 'server:init');
    expect(initMsg.type).toBe('server:init');
    expect((initMsg as any).config.host).toBe(TEST_HOST);
    expect((initMsg as any).config.port).toBe(port);
    client.close();
  });

  test('sends file:open as second message with content, path, and config', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-'));
    const mdFile = join(tmpDir, 'test.md');
    await rt.writeFile(mdFile, '# Test Content\n');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);

    const openMsg = await client.waitForMessage((m) => m.type === 'file:open');
    expect(openMsg.type).toBe('file:open');
    expect((openMsg as any).content).toBe('# Test Content\n');
    expect((openMsg as any).path).toBe(mdFile);
    expect((openMsg as any).config).toBeDefined();
    expect((openMsg as any).config.mode).toBe('both');
    expect((openMsg as any).config.colorMode).toBe('auto');
    client.close();
  });

  test('file:open config includes unsafeHtml field', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-'));
    const mdFile = join(tmpDir, 'unsafe.md');
    await rt.writeFile(mdFile, '<div>html</div>\n');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile, unsafeHtml: true }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    const openMsg = await client.waitForMessage((m) => m.type === 'file:open');
    expect((openMsg as any).config.unsafeHtml).toBe(true);
    client.close();
  });

  test('external file edit triggers file:changed with base64 Yjs update', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-'));
    const mdFile = join(tmpDir, 'watch-test.md');
    await rt.writeFile(mdFile, 'initial');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    await client.waitForMessage((m) => m.type === 'server:init');

    // Write externally
    await rt.writeFile(mdFile, 'externally changed');

    // Should receive file:changed with base64 update string
    const changedMsg = await client.waitForMessage((m) => m.type === 'file:changed', 3000);
    expect(changedMsg.type).toBe('file:changed');
    const updateStr = (changedMsg as any).update;
    expect(typeof updateStr).toBe('string');
    // Should be base64 encoded, not raw content
    expect(updateStr).not.toBe('externally changed');
    client.close();
  });

  test('base64-decoded Yjs update is valid binary data', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-'));
    const mdFile = join(tmpDir, 'yjs-test.md');
    await rt.writeFile(mdFile, 'initial');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);

    // Wait for file:open to get initial content
    const openMsg = await client.waitForMessage((m) => m.type === 'file:open');
    expect((openMsg as any).content).toBe('initial');

    // Write externally
    await rt.writeFile(mdFile, 'updated content');

    const changedMsg = await client.waitForMessage((m) => m.type === 'file:changed', 3000);
    const base64Update = (changedMsg as any).update as string;

    // Decode base64 -- should produce valid Uint8Array
    const updateBytes = new Uint8Array(
      atob(base64Update).split('').map(c => c.charCodeAt(0))
    );
    expect(updateBytes.length).toBeGreaterThan(0);

    // Apply to a fresh empty doc -- the update from a delete-all+insert-all
    // transaction contains the full content when applied to a same-origin doc.
    // For cross-origin verification, we just confirm it's valid Yjs binary.
    const freshDoc = new Y.Doc();
    // This should not throw -- valid Yjs update
    expect(() => Y.applyUpdate(freshDoc, updateBytes)).not.toThrow();

    client.close();
  });

  test('file:write still works and broadcasts file:saved', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-'));
    const mdFile = join(tmpDir, 'write-test.md');
    await rt.writeFile(mdFile, 'original');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    await client.waitForMessage((m) => m.type === 'file:open');

    // Send file:write
    client.ws.send(JSON.stringify({ type: 'file:write', content: 'updated content' }));

    const savedMsg = await client.waitForMessage((m) => m.type === 'file:saved');
    expect(savedMsg.type).toBe('file:saved');
    expect((savedMsg as any).path).toBe(mdFile);

    // Verify file on disk
    await rt.sleep(100);
    const diskContent = await rt.readFile(mdFile);
    expect(diskContent).toBe('updated content');

    client.close();
  });
});

describe('Phase 2 TODO: mutating WebSocket capability guardrails', () => {
  test.skip('Phase 2 TODO: file:write without token returns file:error and leaves markdown unchanged', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-capability-'));
    const mdFile = join(tmpDir, 'missing-token.md');
    await rt.writeFile(mdFile, 'original');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    await client.waitForMessage((m) => m.type === 'file:open');

    client.ws.send(JSON.stringify({ type: 'file:write', content: 'attempt' }));

    const errorMsg = await client.waitForMessage(
      (m) => m.type === 'file:error' && /capability|token/i.test((m as any).message),
    );
    expect(errorMsg.type).toBe('file:error');
    expect((errorMsg as any).message).toMatch(/capability|token/i);

    await rt.sleep(100);
    expect(await rt.readFile(mdFile)).toBe('original');

    client.close();
  });

  test.skip('Phase 2 TODO: file:write with invalid token returns file:error and leaves markdown unchanged', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-capability-'));
    const mdFile = join(tmpDir, 'invalid-token.md');
    await rt.writeFile(mdFile, 'original');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    await client.waitForMessage((m) => m.type === 'file:open');

    client.ws.send(JSON.stringify({
      type: 'file:write',
      content: 'attempt',
      token: 'invalid-phase-2-token',
    }));

    const errorMsg = await client.waitForMessage(
      (m) => m.type === 'file:error' && /capability|token/i.test((m as any).message),
    );
    expect(errorMsg.type).toBe('file:error');
    expect((errorMsg as any).message).toMatch(/capability|token/i);

    await rt.sleep(100);
    expect(await rt.readFile(mdFile)).toBe('original');

    client.close();
  });

  test.skip('Phase 2 TODO: file:unlock without token returns file:error', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-ws-capability-'));
    const mdFile = join(tmpDir, 'unlock-token.md');
    await rt.writeFile(mdFile, 'original');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const client = await connectWS(port);
    await client.waitForMessage((m) => m.type === 'file:open');

    client.ws.send(JSON.stringify({ type: 'file:unlock' }));

    const errorMsg = await client.waitForMessage(
      (m) => m.type === 'file:error' && /capability|token/i.test((m as any).message),
    );
    expect(errorMsg.type).toBe('file:error');
    expect((errorMsg as any).message).toMatch(/capability|token/i);

    client.close();
  });
});
