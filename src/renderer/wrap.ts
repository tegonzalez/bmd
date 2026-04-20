import wrapAnsi from 'wrap-ansi';
import stringWidth from 'string-width';

/**
 * Get the display width of a string, accounting for ANSI escapes and CJK characters.
 */
export function displayWidth(text: string): number {
  return stringWidth(text);
}

/**
 * wrap-ansi with `trim: false` may place the inter-word space at the **start** of
 * the next line when the previous line is full (`\\nand` with a leading space).
 * When the previous line still has room under `maxLineWidth`, move that space to
 * the end of the previous line so editors do not show a stray `^ ` at column 0.
 */
function reflowLeadingSpacesToPreviousLine(
  wrapped: string,
  maxLineWidth: number,
): string {
  const lines = wrapped.split('\n');
  for (let i = 1; i < lines.length; i++) {
    while (lines[i]!.length > 0 && lines[i]![0]! === ' ') {
      const prev = lines[i - 1]!;
      if (prev.length === 0) break;
      const candidate = prev + ' ';
      if (displayWidth(candidate) > maxLineWidth) break;
      lines[i - 1] = candidate;
      lines[i] = lines[i]!.slice(1);
    }
  }
  return lines.join('\n');
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
  /**
   * `trim: true` strips trailing spaces per row and can remove the only space
   * between two tokens when the wrap falls right after it (`}},\\n{{`).
   * `trim: false` keeps that space; reflow moves a leading space onto the prior
   * line when it still fits within `availableWidth`.
   */
  const wrapped = wrapAnsi(text, availableWidth, { hard: true, trim: false });
  const reflowed = reflowLeadingSpacesToPreviousLine(wrapped, availableWidth);

  if (indent === 0) return reflowed;

  const prefix = ' '.repeat(indent);
  return reflowed
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}
