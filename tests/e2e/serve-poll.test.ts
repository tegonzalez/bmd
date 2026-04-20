/**
 * Integration tests for bmd serve: Polling endpoint (/api/poll).
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { startServer } from '../../src/server/index.ts';
import { resolveConfig } from '../../src/config/merge.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

describe('serve-poll: Polling endpoint', () => {
  test('GET /api/poll without session returns array with server:init', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }));
    cleanup = stop;

    await rt.sleep(50);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    expect(res.status).toBe(200);

    const messages: ServerMessage[] = await res.json();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.type).toBe('server:init');
    expect((messages[0]! as any).config.host).toBe(TEST_HOST);
    expect((messages[0]! as any).config.port).toBe(port);
  });

  test('GET /api/poll without session and with file returns server:init + file:open', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'bmd-poll-'));
    const mdFile = join(tmpDir, 'poll-test.md');
    await rt.writeFile(mdFile, '# Poll Test\n');

    const port = randomPort();
    const { stop } = startServer(testConfig({ port, filePath: mdFile }));
    cleanup = () => {
      stop();
      rm(tmpDir, { recursive: true }).catch(() => {});
    };

    await rt.sleep(150);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    const messages: ServerMessage[] = await res.json();

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(2);
    expect(messages[0]!.type).toBe('server:init');
    expect(messages[1]!.type).toBe('file:open');
    expect((messages[1]! as any).content).toBe('# Poll Test\n');
    expect((messages[1]! as any).path).toBe(mdFile);
    expect((messages[1]! as any).config).toBeDefined();
    expect((messages[1]! as any).config.unsafeHtml).toBe(false);
  });

  test('GET /api/poll with session returns empty array when no changes', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }));
    cleanup = stop;

    await rt.sleep(50);

    // First poll with session to register it
    const sessionId = 'test-session-' + Date.now();
    const res1 = await fetch(`http://${TEST_HOST}:${port}/api/poll?session=${sessionId}`);
    const msgs1: ServerMessage[] = await res1.json();
    // First call with unknown session returns init messages
    expect(msgs1[0]!.type).toBe('server:init');

    // Second poll -- should return empty array (no changes)
    const res2 = await fetch(`http://${TEST_HOST}:${port}/api/poll?session=${sessionId}`);
    const msgs2: ServerMessage[] = await res2.json();
    expect(Array.isArray(msgs2)).toBe(true);
    expect(msgs2.length).toBe(0);
  });

  test('GET /api/poll returns empty array [] when no file loaded and no session', async () => {
    const port = randomPort();
    const { stop } = startServer(testConfig({ port }));
    cleanup = stop;

    await rt.sleep(50);

    const res = await fetch(`http://${FETCH_HOST}:${port}/api/poll`);
    const messages: ServerMessage[] = await res.json();

    // Should have server:init but no file:open since no file loaded
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(1);
    expect(messages[0]!.type).toBe('server:init');
  });
});
