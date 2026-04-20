import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  resolveStaticAssetPath,
  resolveWebAssetRoot,
} from '../../src/server/static-assets.ts';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bmd-static-assets-'));
  tempRoots.push(root);
  return root;
}

function makeRuntimeDir(): string {
  const root = makeTempRoot();
  const runtimeDir = join(root, 'src', 'server');
  mkdirSync(runtimeDir, { recursive: true });
  return runtimeDir;
}

function writeFixture(root: string, path: string, content = 'fixture'): string {
  const fullPath = join(root, path);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveWebAssetRoot', () => {
  test('chooses an override root before default candidates', () => {
    const runtimeDir = makeRuntimeDir();
    const overrideRoot = makeTempRoot();
    const devRoot = resolve(runtimeDir, '../../dist/web');
    const bundledRoot = resolve(runtimeDir, 'web');

    writeFixture(devRoot, 'index.html', 'dev');
    writeFixture(bundledRoot, 'index.html', 'bundle');
    writeFixture(overrideRoot, 'index.html', 'override');

    expect(resolveWebAssetRoot(runtimeDir, overrideRoot)).toBe(resolve(overrideRoot));
  });

  test('preserves default dev root before bundled root when no override is passed', () => {
    const runtimeDir = makeRuntimeDir();
    const devRoot = resolve(runtimeDir, '../../dist/web');
    const bundledRoot = resolve(runtimeDir, 'web');

    writeFixture(devRoot, 'index.html', 'dev');
    writeFixture(bundledRoot, 'index.html', 'bundle');

    expect(resolveWebAssetRoot(runtimeDir)).toBe(devRoot);
  });

  test('falls back to bundled root when the dev root has no index file', () => {
    const runtimeDir = makeRuntimeDir();
    const bundledRoot = resolve(runtimeDir, 'web');

    writeFixture(bundledRoot, 'index.html', 'bundle');

    expect(resolveWebAssetRoot(runtimeDir)).toBe(bundledRoot);
  });
});

describe('resolveStaticAssetPath', () => {
  test('maps root requests to index.html', () => {
    const webRoot = makeTempRoot();
    const indexPath = writeFixture(webRoot, 'index.html', 'fixture');

    expect(resolveStaticAssetPath(webRoot, '/')).toBe(indexPath);
  });

  test('resolves normal nested assets inside the selected root', () => {
    const webRoot = makeTempRoot();
    const assetPath = writeFixture(webRoot, 'assets/app.js', 'console.log("ok");');

    expect(resolveStaticAssetPath(webRoot, '/assets/app.js')).toBe(assetPath);
  });

  test('returns null for malformed URL encodings', () => {
    const webRoot = makeTempRoot();

    expect(resolveStaticAssetPath(webRoot, '/assets/%E0%A4%A')).toBeNull();
  });

  test.each([
    '/../package.json',
    '/%2e%2e/package.json',
    '/%2e%2e%2fpackage.json',
    '/%2e%2e%5cpackage.json',
    '/assets/%2e%2e/%2e%2e/package.json',
  ])('returns null for traversal request %s', (pathname) => {
    const webRoot = makeTempRoot();

    expect(resolveStaticAssetPath(webRoot, pathname)).toBeNull();
  });
});
