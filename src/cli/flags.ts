/**
 * Shared CLI flag definitions and resolution functions.
 */

export const sharedArgs = {
  width: {
    type: 'string' as const,
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
  if (args['no-ansi'] || args.noAnsi) return false;
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
