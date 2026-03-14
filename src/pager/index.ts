/**
 * Pager integration for bmd.
 * Detects whether output should be paged and spawns $PAGER when needed.
 */

import { spawn } from 'node:child_process';

export type PagerMode = 'auto' | 'always' | 'never';

/**
 * Pure function to determine whether output should be paged.
 *
 * @param lineCount - Number of lines in the rendered output
 * @param termHeight - Terminal height in rows
 * @param isTTY - Whether stdout is a TTY
 * @param mode - Pager mode from CLI flags
 */
export function shouldPage(
  lineCount: number,
  termHeight: number,
  isTTY: boolean,
  mode: PagerMode,
): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  // auto mode: page only if output exceeds terminal height AND we're in a TTY
  return isTTY && lineCount > termHeight;
}

/**
 * Output rendered content, optionally through a pager.
 *
 * @param rendered - The fully rendered string to output
 * @param opts - Options including pager mode
 */
export async function outputWithPager(
  rendered: string,
  opts: { pager: PagerMode },
): Promise<void> {
  const lineCount = rendered.split('\n').length;
  const termHeight = process.stdout.rows || 24;
  const isTTY = process.stdout.isTTY ?? false;

  if (!shouldPage(lineCount, termHeight, isTTY, opts.pager)) {
    process.stdout.write(rendered);
    return;
  }

  // Spawn pager
  const pagerCmd = process.env.PAGER || 'less -R';
  const parts = pagerCmd.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.on('error', () => {
      // Pager failed to spawn -- fall back to direct output
      process.stdout.write(rendered);
      resolve();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        // Pager exited non-zero -- fall back to direct output
        process.stdout.write(rendered);
      }
      resolve();
    });

    child.stdin?.write(rendered);
    child.stdin?.end();
  });
}
