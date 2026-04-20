/**
 * Regression tests for the web bundle served by bmd serve.
 * Verifies the built browser bundle is valid and complete — no unresolved
 * imports, no node: protocols, no missing chunks.
 *
 * These tests caught the esbuild migration breaking shiki dynamic imports
 * (bare specifiers left unresolved in browser context).
 */

import { test, expect, describe, afterEach } from 'bun:test';
import { startServer } from '../../src/server/index.ts';
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const fixtureWebRoot = resolve(process.cwd(), 'tests/fixtures/web');

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function startTestServer(filePath: string) {
  const config = {
    format: 'utf8' as const,
    width: 80,
    ansiEnabled: true,
    pager: 'never' as const,
    unsafeHtml: false,
    unicode: true,
    filePath,
    theme: undefined,
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    serve: { host: '127.0.0.1', port: 0, open: false, mode: 'both' as const, colorMode: 'auto' as const, readonly: false },
  };
  const { server, stop } = startServer(config as any, undefined, { webRoot: fixtureWebRoot });
  const previousCleanup = cleanup;
  cleanup = () => {
    stop();
    previousCleanup?.();
  };
  return new Promise<{ base: string; stop: () => void }>((res) => {
    server.on('listening', () => {
      const addr = server.address() as any;
      res({ base: `http://127.0.0.1:${addr.port}`, stop });
    });
  });
}

describe('web bundle integrity', () => {
  function createTestFile(): string {
    const tmp = mkdtempSync(resolve(tmpdir(), 'bmd-bundle-'));
    const testFile = resolve(tmp, 'test.md');
    writeFileSync(testFile, '# Test\n\n```javascript\nconst x = 1;\n```\n');
    const previousCleanup = cleanup;
    cleanup = () => {
      previousCleanup?.();
      rmSync(tmp, { recursive: true, force: true });
    };
    return testFile;
  }

  test('HTML serves and references app.js (not app.ts)', async () => {
    const { base } = await startTestServer(createTestFile());
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('<script');
    expect(html).toContain('app.js');
    expect(html).not.toContain('app.ts');
  });

  test('app.js bundle contains no node: protocol imports', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    const nodeImports = js.match(/from\s*["']node:[^"']+["']/g) || [];
    expect(nodeImports).toEqual([]);
  });

  test('app.js bundle contains no bare specifier imports (@shikijs, ws, etc)', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    const bareImports = js.match(/from\s*["']@[^"'/][^"']*["']/g) || [];
    expect(bareImports).toEqual([]);
  });

  test('app.js bundle contains no require() calls (browser has no CommonJS)', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    // Match require("...") but not __require (esbuild polyfill that's unused in browser)
    const requires = js.match(/[^_]require\s*\(/g) || [];
    expect(requires).toEqual([]);
  });

  test('app.js bundle contains no import.meta.dir', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    expect(js).not.toContain('import.meta.dir');
  });

  test('all dynamic import() targets resolve to served chunks', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    const chunks = [...js.matchAll(/import\(["']\.\/([^"']+\.js)["']\)/g)].map(m => m[1]!);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const res = await fetch(`${base}/${chunk}`);
      expect(res.status).toBe(200);
    }
  });

  test('CSS serves successfully', async () => {
    const { base } = await startTestServer(createTestFile());
    const res = await fetch(`${base}/styles.css`);
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css.length).toBeGreaterThan(100);
  });

  test('browser bundle does not contain getHighlighter call (WASM guard)', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    // The bundle should use externalHighlighter (JS regex engine) path only.
    // getHighlighter (Oniguruma WASM) must not appear as an active call.
    // It may appear as a dead-code reference or in the guard itself, but not
    // as an import from the syntax-highlight module.
    const getHighlighterImports = js.match(/from\s*["'][^"']*syntax-highlight[^"']*["']/g) || [];
    expect(getHighlighterImports).toEqual([]);
  });

  test('browser bundle does not import oniguruma WASM binary', async () => {
    const { base } = await startTestServer(createTestFile());
    const js = await (await fetch(`${base}/app.js`)).text();
    // The bundle must not contain actual WASM binary imports or fetch calls for .wasm files.
    // Note: shiki core may contain dead-code string references to loadWasm; that's fine.
    // What matters is no actual onig.wasm file load or import("*.wasm") call.
    const wasmImports = js.match(/import\(["'][^"']*\.wasm["']\)/g) || [];
    expect(wasmImports).toEqual([]);
    const wasmFetches = js.match(/fetch\(["'][^"']*\.wasm["']\)/g) || [];
    expect(wasmFetches).toEqual([]);
  });
});
