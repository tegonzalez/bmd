/**
 * Bundle src/cli/index.ts → dist/cli.js using esbuild.
 * Works on both Node and Bun.
 *
 * Also links dist/cli.js → node_modules/.bin/bmd for local installs,
 * since package managers only create bin links for dependencies, not
 * the root package.
 */
import { build } from 'esbuild';
import { mkdirSync, chmodSync, symlinkSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = process.cwd();
const outfile = resolve(root, 'dist', 'cli.js');

mkdirSync(resolve(root, 'dist'), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/cli/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  conditions: ['bun', 'import', 'default'],
});

chmodSync(outfile, 0o755);

// Link into node_modules/.bin for local installs
const binDir = resolve(root, 'node_modules', '.bin');
const binLink = resolve(binDir, 'bmd');
if (existsSync(binDir)) {
  try {
    if (existsSync(binLink)) unlinkSync(binLink);
    symlinkSync(relative(binDir, outfile), binLink);
  } catch {}
}
