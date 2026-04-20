/**
 * Build `--help` text only from citty-style `ArgsDef` + `meta.description`
 * (single source of truth with command modules). No duplicated flag lists.
 */

import type { ArgDef, ArgsDef, CommandMeta } from 'citty';
import { SERVE_DEFAULTS } from '../../config/bmd-defaults.ts';
import {
  BMD_GLOBAL_ARGS,
  BMD_GLOBAL_ARG_KEYS,
  omitArgKeys,
} from '../global-options.ts';
import { BOLD, DIM, RESET } from './ansi.ts';
import type { HelpExtras } from './extras.ts';

const OPT_PAD = 24;

function toArray<T>(v: T | readonly T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? [...(v as readonly T[])] : [v as T];
}

/** Flags column: `-a, --name` / `--no-x` style from arg key + alias. */
export function formatOptionFlags(name: string, def: ArgDef): string {
  // Boolean `templates` defaults on; only document citty's negated form (matches `templates.enabled: false`).
  if (
    name === 'templates' &&
    def.type === 'boolean' &&
    def.default === true
  ) {
    return '--no-templates';
  }
  const aliasValue = 'alias' in def ? def.alias : undefined;
  const aliases = toArray(aliasValue as string | string[] | undefined).filter(Boolean);
  const short = aliases.map((a) => `-${a}`);
  const kebab = name;
  const long = `--${kebab}`;
  const parts = [...short, long];
  return parts.join(', ');
}

/** When citty `default` is omitted (so merge can use file + DTO defaults), still show canonical hint for `serve`. */
function serveHelpFallback(kebab: string): string | number | boolean | undefined {
  switch (kebab) {
    case 'host':
      return SERVE_DEFAULTS.host;
    case 'port':
      return SERVE_DEFAULTS.port;
    case 'open':
      return SERVE_DEFAULTS.open;
    case 'mode':
      return SERVE_DEFAULTS.mode;
    case 'color-mode':
      return SERVE_DEFAULTS.colorMode;
    case 'readonly':
      return SERVE_DEFAULTS.readonly;
    default:
      return undefined;
  }
}

function optionDetail(def: ArgDef, name: string, commandName?: string): string {
  let d = def.description ?? '';
  const fallback =
    commandName === 'serve' && def.default === undefined
      ? serveHelpFallback(name)
      : undefined;

  if (def.type === 'string' || def.type === 'enum') {
    const eff =
      def.default !== undefined && def.default !== ''
        ? def.default
        : fallback !== undefined && fallback !== ''
          ? String(fallback)
          : undefined;
    if (eff !== undefined && eff !== '') {
      d += `${d ? ' ' : ''}${DIM}(default: ${String(eff)})${RESET}`;
    }
  }
  if (def.type === 'boolean') {
    const eff = def.default !== undefined ? def.default : fallback;
    if (eff === true) {
      d += `${d ? ' ' : ''}${DIM}(default: on)${RESET}`;
    }
  }
  return d;
}

function collectArgParts(args: ArgsDef): {
  positionals: [string, ArgDef][];
  options: [string, ArgDef][];
} {
  const positionals: [string, ArgDef][] = [];
  const options: [string, ArgDef][] = [];
  for (const [name, def] of Object.entries(args)) {
    if (def.type === 'positional') positionals.push([name, def]);
    else options.push([name, def]);
  }
  return { positionals, options };
}

/** Usage: `bmd <name> [options] <pos>…` from legal args only. */
export function buildUsageLine(commandName: string, args: ArgsDef): string {
  const { positionals, options } = collectArgParts(args);
  const hasOpts = options.length > 0;
  const parts: string[] = [`bmd ${commandName}`];
  if (hasOpts) parts.push('[options]');
  for (const [name, def] of positionals) {
    const hint = (def as { valueHint?: string }).valueHint ?? name.toUpperCase();
    const tok = def.required === false ? `[${hint}]` : `<${hint}>`;
    parts.push(tok);
  }
  return parts.join(' ');
}

function formatArgRows(positionals: [string, ArgDef][]): string {
  if (!positionals.length) return '';
  const rows = positionals.map(([name, def]) => {
    const hint = (def as { valueHint?: string }).valueHint ?? name.toUpperCase();
    const label = def.required === false ? `[${hint}]` : `<${hint}>`;
    return { label, desc: def.description ?? '' };
  });
  const w = Math.max(...rows.map((r) => r.label.length), 0);
  return rows.map((r) => `  ${r.label.padEnd(w)}  ${r.desc}`).join('\n');
}

function formatOptionRows(
  options: [string, ArgDef][],
  commandName?: string,
): string {
  const lines = options.map(([name, def]) => ({
    flags: formatOptionFlags(name, def),
    detail: optionDetail(def, name, commandName),
  }));
  const fw = Math.max(...lines.map((l) => l.flags.length), OPT_PAD);
  return lines.map((l) => `  ${l.flags.padEnd(fw)}${l.detail}`).join('\n');
}

/** Format global options table (same option rules; used for `bmd --help`). */
export function formatOptionsOnly(args: ArgsDef): string {
  const { options } = collectArgParts(args);
  return formatOptionRows(options, undefined);
}

export function formatHelpFromArgs(
  meta: CommandMeta,
  args: ArgsDef,
  extras?: HelpExtras,
): string {
  const name = meta.name || 'command';
  const { positionals } = collectArgParts(args);
  const commandOptions = collectArgParts(omitArgKeys(args, BMD_GLOBAL_ARG_KEYS)).options;
  const parts: string[] = [];

  parts.push(`${BOLD}bmd ${name}${RESET} -- ${meta.description ?? ''}`, '');
  parts.push(`${BOLD}Usage:${RESET}  ${buildUsageLine(name, args)}`, '');
  parts.push(
    `${DIM}Global options may appear before the subcommand (e.g. ${BOLD}bmd -c cfg.yaml serve${RESET}${DIM}).${RESET}`,
    '',
  );

  parts.push(`${BOLD}Global options:${RESET}`);
  parts.push(formatOptionsOnly(BMD_GLOBAL_ARGS));
  parts.push('');

  if (positionals.length) {
    parts.push(`${BOLD}Arguments:${RESET}`);
    parts.push(formatArgRows(positionals));
    parts.push('');
  }

  if (commandOptions.length) {
    parts.push(`${BOLD}Command options:${RESET}`);
    parts.push(formatOptionRows(commandOptions, name));
    parts.push('');
  }

  if (extras?.output) {
    parts.push(`${BOLD}Output:${RESET}`);
    parts.push(
      extras.output
        .split('\n')
        .map((l) => (l.trim() ? `  ${l}` : ''))
        .join('\n'),
    );
    parts.push('');
  }

  if (extras?.examples?.length) {
    parts.push(`${BOLD}Examples:${RESET}`);
    for (const ex of extras.examples) {
      parts.push(`${DIM}  ${ex}${RESET}`);
    }
    parts.push('');
  }

  if (extras?.seeAlso) {
    parts.push(`${BOLD}See also:${RESET} ${extras.seeAlso}`, '');
  }

  if (extras?.notes?.length) {
    for (const n of extras.notes) {
      parts.push(`${DIM}${n}${RESET}`);
    }
    parts.push('');
  }

  return parts.join('\n').replace(/\n+$/, '\n');
}

/** Build main `bmd --help` from registry command metas + global vs default-render command options. */
export function formatMainHelpPage(opts: {
  tagline: string;
  version: string;
  usageLine: string;
  commandRows: { name: string; summary: string }[];
  /** Same `ArgsDef` as `bmd render` — default when you omit a subcommand. */
  defaultRenderArgs: ArgsDef;
  footerLines?: string[];
}): string {
  const cmdW = Math.max(...opts.commandRows.map((c) => c.name.length), 7);
  const renderCommandOnly = omitArgKeys(opts.defaultRenderArgs, BMD_GLOBAL_ARG_KEYS);
  const renderOpts = collectArgParts(renderCommandOnly).options;
  const lines: string[] = [];
  lines.push(
    `${BOLD}bmd${RESET} -- ${opts.tagline} ${DIM}v${opts.version}${RESET}`,
    '',
    `${BOLD}Usage:${RESET}  ${opts.usageLine}`,
    '',
    `${BOLD}Commands:${RESET}`,
  );
  for (const c of opts.commandRows) {
    lines.push(`  ${c.name.padEnd(cmdW)}  ${c.summary}`);
  }
  lines.push('');
  lines.push(`${DIM}Place global flags before the subcommand (they apply to every command that reads config/theme).${RESET}`, '');
  lines.push(`${BOLD}Global options:${RESET}`);
  lines.push(formatOptionsOnly(BMD_GLOBAL_ARGS));
  lines.push('');
  lines.push(`${BOLD}Render command options:${RESET}`);
  lines.push(`${DIM}(default when you omit a subcommand; same flags after ${BOLD}bmd render${RESET}${DIM})${RESET}`);
  lines.push(formatOptionRows(renderOpts, 'render'));
  lines.push('');
  if (opts.footerLines?.length) {
    for (const f of opts.footerLines) lines.push(f);
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}
