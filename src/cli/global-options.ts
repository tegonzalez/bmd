/**
 * Flags that may appear before the subcommand and are stripped for routing.
 * Documented as "Global options" in `--help`; values are merged into commands
 * (subcommand flags override the same key when both are set).
 */

import type { ArgsDef } from 'citty';
import { DEFAULT_CONFIG_FILENAME } from '../config/bmd-defaults.ts';

export const BMD_GLOBAL_ARGS = {
  help: {
    type: 'boolean' as const,
    alias: 'h',
    description: 'Show help',
  },
  config: {
    type: 'string' as const,
    alias: 'c',
    description: `Config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  },
  theme: {
    type: 'string' as const,
    alias: 't',
    description: 'Theme spec (e.g. syn:dracula+md:dark)',
  },
  'unsafe-html': {
    type: 'boolean' as const,
    description: 'Allow raw HTML in output',
  },
} satisfies ArgsDef;

/** Keys omitted from per-command "Options" tables (shown under Global options). */
export const BMD_GLOBAL_ARG_KEYS = new Set<string>(Object.keys(BMD_GLOBAL_ARGS));

/** Values parsed from argv before the first non-global token (not including -h/--help). */
export interface BmdGlobalPrefix {
  config?: string;
  theme?: string;
  unsafeHtml?: boolean;
}

/**
 * Strip leading global flags so routing sees the subcommand / file token next.
 * Does not consume `-h` / `--help` — `runMain` still handles those on the full tail.
 */
export function parseLeadingGlobalArgv(argv: string[]): {
  prefix: BmdGlobalPrefix;
  rest: string[];
} {
  const prefix: BmdGlobalPrefix = {};
  const rest = [...argv];

  while (rest.length > 0) {
    const a = rest[0]!;
    if (a === '--') break;

    if (a === '-c' || a === '--config') {
      if (rest.length < 2) break;
      prefix.config = rest[1]!;
      rest.splice(0, 2);
      continue;
    }
    if (a.startsWith('--config=')) {
      prefix.config = a.slice('--config='.length);
      rest.shift();
      continue;
    }

    if (a === '-t' || a === '--theme') {
      if (rest.length < 2) break;
      prefix.theme = rest[1]!;
      rest.splice(0, 2);
      continue;
    }
    if (a.startsWith('--theme=')) {
      prefix.theme = a.slice('--theme='.length);
      rest.shift();
      continue;
    }

    if (a === '--unsafe-html') {
      prefix.unsafeHtml = true;
      rest.shift();
      continue;
    }

    break;
  }

  return { prefix, rest };
}

export function omitArgKeys(args: ArgsDef, keys: Set<string>): ArgsDef {
  const out: ArgsDef = {};
  for (const [k, v] of Object.entries(args)) {
    if (!keys.has(k)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
