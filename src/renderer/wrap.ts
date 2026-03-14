import wrapAnsi from 'wrap-ansi';
import stringWidth from 'string-width';

/**
 * Get the display width of a string, accounting for ANSI escapes and CJK characters.
 */
export function displayWidth(text: string): number {
  return stringWidth(text);
}

/**
 * Wrap text at specified width, preserving ANSI escapes and maintaining indent.
 *
 * @param text - The text to wrap (may contain ANSI escapes)
 * @param width - The total available width
 * @param indent - Number of spaces to indent each line (including continuation)
 * @returns Wrapped text with indent applied to all lines
 */
export function wrapText(text: string, width: number, indent: number): string {
  if (!text) return '';

  const availableWidth = Math.max(1, width - indent);
  const wrapped = wrapAnsi(text, availableWidth, { hard: true, trim: false });

  if (indent === 0) return wrapped;

  const prefix = ' '.repeat(indent);
  return wrapped
    .split('\n')
    .map(line => prefix + line)
    .join('\n');
}
