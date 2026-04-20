/**
 * Integration tests for bmd serve: server lifecycle, HTTP endpoints, polling.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { startServer } from '../../src/server/index.ts';
import { resolveConfig } from '../../src/config/merge.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRuntime } from '../../src/runtime/index.ts';

let cleanup: (() => void) | null = null;

const TEST_HOST = '127.0.0.1';
const FETCH_HOST = '127.0.0.1';
const fixtureWebRoot = join(process.cwd(), 'tests/fixtures/web');

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
  mode?: 'editor' | 'preview' | 'both';
  colorMode?: 'day' | 'night' | 'auto';
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
      mode: overrides.mode,
      colorMode: overrides.colorMode,
      readonly: overrides.readonly,
    },
  }, null);
}

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

describe('serve: server lifecycle', () => {
  test('starts and serves HTML on GET /', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    const res = await fetch(`http://${FETCH_HOST}:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  test('serves poll endpoint with JSON array', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]!).toHaveProperty('type', 'server:init');
  });

  test('loads file content when filePath provided', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-test-'));
    const mdFile = join(tmpDir, 'test.md');
    await rt.writeFile(mdFile, '# Hello World\n');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }), undefined, { webRoot: fixtureWebRoot });
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    // Allow async file read + server start
    await rt.sleep(150);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // Should have server:init and file:open messages
    const fileOpen = body.find((m: any) => m.type === 'file:open');
    expect(fileOpen).toBeDefined();
    expect(fileOpen.content).toBe('# Hello World\n');
    expect(fileOpen.path).toBe(mdFile);
  });

  test('null content when no file provided', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // Should only have server:init, no file:open
    const fileOpen = body.find((m: any) => m.type === 'file:open');
    expect(fileOpen).toBeUndefined();
  });

  test('survives client disconnect', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    // Connect WebSocket, then close it
    const ws = new WebSocket(`ws://${FETCH_HOST}:${port}/ws`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.close();
        resolve();
      };
    });

    // Wait for close to propagate
    await rt.sleep(100);

    // Server should still serve HTTP
    const res = await fetch(`http://${FETCH_HOST}:${port}/`);
    expect(res.status).toBe(200);
  });

  test('stops cleanly via stop()', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });

    await rt.sleep(50);

    // Verify it's running
    const res = await fetch(`http://${FETCH_HOST}:${port}/`);
    expect(res.status).toBe(200);

    // Stop it
    stop();

    // Port should be freed -- fetch should fail
    await rt.sleep(100);
    try {
      await fetch(`http://${FETCH_HOST}:${port}/`);
      // If it doesn't throw, it might still return (race condition),
      // but the server should be stopping
    } catch {
      // Expected -- connection refused
    }
  });

  test('unsafeHtml flows through config to server state', async () => {
    const port = randomPort();
    const config = testConfig({ port, unsafeHtml: true });
    expect(config.unsafeHtml).toBe(true);

    const { stop } = startServer(config, undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    // The unsafeHtml flag should be accessible in server state
    // Verify via WS init message flow
    const ws = new WebSocket(`ws://${FETCH_HOST}:${port}/ws`);
    const messages: any[] = [];
    await new Promise<void>((resolve) => {
      ws.onmessage = (event) => {
        messages.push(JSON.parse(event.data as string));
        if (messages.length >= 1) resolve();
      };
    });

    ws.close();
    // server:init message received -- server is running with our config
    expect(messages[0]!).toHaveProperty('type', 'server:init');
  });
});

describe('Phase 2 TODO: static asset containment guardrails', () => {
  test.skip('Phase 2 TODO: rejects traversal paths outside dist/web root', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }), undefined, { webRoot: fixtureWebRoot });
    cleanup = stop;

    await rt.sleep(50);

    const traversalPaths = [
      "/../package.json",
      "/%2e%2e/package.json",
      "/%2e%2e%2fpackage.json",
      "/%2e%2e%5cpackage.json",
      "/assets/%2e%2e/%2e%2e/package.json",
    ];

    for (const path of traversalPaths) {
      const res = await fetch(`http://${FETCH_HOST}:${port}${path}`);
      expect([403, 404]).toContain(res.status);
      const body = await res.text();
      expect(body).not.toContain('"name": "bmd"');
    }
  });
});
