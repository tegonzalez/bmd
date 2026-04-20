/** Shared ANSI fragments for help text (definitions may compose rows). */

export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const CYAN = '\x1b[36m';
export const RESET = '\x1b[0m';

export function dim(s: string): string {
  return `${DIM}${s}${RESET}`;
}

export function cyan(s: string): string {
  return `${CYAN}${s}${RESET}`;
}
