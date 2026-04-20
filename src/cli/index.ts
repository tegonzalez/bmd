/**
 * bmd - Beautiful Markdown renderer
 * Main CLI entry point with subcommand routing.
 */

import { defineCommand, runMain } from 'citty';
import { setBmdGlobalPrefix } from './global-context.ts';
import { parseLeadingGlobalArgv } from './global-options.ts';
import { showUsage } from './help.ts';

/** Known subcommands for default-command injection. */
const SUBCOMMANDS = new Set([
  'render',
  'eval',
  'meval',
  'info',
  'map',
  'serve',
  'themes',
  'table',
]);

/**
 * Index of the first argv token that is not an option flag, accounting for flags that
 * consume the following token (e.g. `-t spec`, `-m map.yaml`). Without this, `bmd -t x file.md`
 * would treat `x` as the subcommand/file token and mis-inject `render`.
 */
function indexOfFirstPositional(argv: string[]): number {
  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === '--') {
      return i + 1 < argv.length ? i + 1 : argv.length;
    }
    if (!a.startsWith('-')) {
      return i;
    }
    if (a.includes('=')) {
      i += 1;
      continue;
    }
    const takesNext =
      a === '-t' ||
      a === '--theme' ||
      a === '--type' ||
      a === '-m' ||
      a === '--map' ||
      a === '-c' ||
      a === '--config' ||
      a === '-w' ||
      a === '--width' ||
      a === '--var' ||
      a === '-p' ||
      a === '--port' ||
      a === '--host' ||
      a === '--mode' ||
      a === '--color-mode';
    if (takesNext && i + 1 < argv.length) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Inject 'render' as default subcommand when no known subcommand is present.
 * This allows `bmd file.md` to work as `bmd render file.md`.
 */
function resolveDefaultCommand(argv: string[]): string[] {
  const firstPosIdx = indexOfFirstPositional(argv);
  if (firstPosIdx === -1) return argv;
  if (!SUBCOMMANDS.has(argv[firstPosIdx]!)) {
    // Prepend `render` so the root router sees a real subcommand first; inserting only
    // before the file token would leave `-t value` parsed as the command name.
    return ['render', ...argv];
  }
  return argv;
}

// Strip leading global flags (-c/-t/--unsafe-html) before routing; merge via getBmdGlobalPrefix() in commands.
const userArgs = process.argv.slice(2);
const { prefix, rest } = parseLeadingGlobalArgv(userArgs);
setBmdGlobalPrefix(prefix);
const resolved = resolveDefaultCommand(rest);
process.argv = [...process.argv.slice(0, 2), ...resolved];

const main = defineCommand({
  meta: {
    name: 'bmd',
    version: '0.1.0',
    description: 'Beautiful Markdown renderer',
  },
  subCommands: {
    render: () => import('./commands/render.ts').then(m => m.default),
    eval: () => import('./commands/eval.ts').then(m => m.default),
    meval: () => import('./commands/meval.ts').then(m => m.default),
    info: () => import('./commands/info.ts').then(m => m.default),
    map: () => import('./commands/map.ts').then(m => m.default),
    serve: () => import('./commands/serve.ts').then(m => m.default),
    themes: () => import('./commands/themes.ts').then(m => m.default),
    table: () => import('./commands/table.ts').then(m => m.default),
  },
});

runMain(main, { showUsage });
