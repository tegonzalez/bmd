/**
 * Shared CLI flag definitions and resolution functions.
 */

import { DEFAULT_CONFIG_FILENAME } from '../config/bmd-defaults.ts';

export const sharedArgs = {
  width: {
    type: 'string' as const,
    alias: 'w',
    description: 'Override terminal width',
  },
  ansi: {
    type: 'boolean' as const,
    description: 'Force ANSI styling on',
  },
  'no-ansi': {
    type: 'boolean' as const,
    description: 'Force ANSI styling off',
  },
  pager: {
    type: 'boolean' as const,
    description: 'Force pager on',
  },
  'no-pager': {
    type: 'boolean' as const,
    description: 'Disable pager',
  },
  theme: {
    type: 'string' as const,
    alias: 't' as const,
    description: 'Theme spec (e.g. syn:dracula+md:dark)',
  },
  'unsafe-html': {
    type: 'boolean' as const,
    description: 'Allow raw HTML in output',
  },
  config: {
    type: 'string' as const,
    alias: 'c',
    description: `Path to config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  },
  map: {
    type: 'string' as const,
    alias: 'm',
    description: 'Path to YAML map file for template values',
  },
  var: {
    type: 'string' as const,
    description: 'Override template value (KEY=VALUE, repeatable)',
  },
  /**
   * Matches `templates.enabled` in bmd.config.yaml. Default true; citty exposes
   * disabling as `--no-templates` (same as negating boolean `templates`).
   */
  templates: {
    type: 'boolean' as const,
    default: true,
    description: 'Expand {{…}} from -m / config (default: on)',
    negativeDescription: 'Disable {{…}} template expansion',
  },
  'no-unicode': {
    type: 'boolean' as const,
    description: 'Disable invisible Unicode detection',
  },
} as const;

/**
 * Resolve whether ANSI output should be enabled.
 *
 * Priority: --ansi flag > --no-ansi flag > NO_COLOR env > TTY detection
 */
export function resolveAnsiMode(
  args: { ansi?: boolean; 'no-ansi'?: boolean; noAnsi?: boolean },
  isTTY: boolean = !!process.stdout.isTTY,
): boolean {
  if (args.ansi) return true;
  if (args['no-ansi']! || args.noAnsi) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  return isTTY;
}

/**
 * Resolve the output width.
 *
 * Priority: --width flag > process.stdout.columns > fallback 80
 */
export function resolveWidth(
  args: { width?: string },
): number {
  if (args.width !== undefined) {
    return parseInt(args.width, 10);
  }
  return process.stdout.columns || 80;
}
