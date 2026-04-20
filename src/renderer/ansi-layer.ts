import { Chalk } from 'chalk';
import type { ThemeConfig } from '../types/theme.ts';

// Re-export themed layer for callers that use the new MdTheme-based API
export { createThemedAnsiLayer } from '../theme/adapt/ansi.ts';

export interface AnsiLayer {
  heading(text: string, level: number): string;
  bold(text: string): string;
  italic(text: string): string;
  strikethrough(text: string): string;
  code(text: string): string;
  codeBlock(text: string): string;
  link(text: string, url: string): string;
  blockquoteBar(text: string): string;
}

/**
 * Create an ANSI styling layer that applies colors and formatting.
 * Uses a forced chalk instance (level 1) so ANSI escapes are always generated
 * when the layer is active -- the caller decides whether to use the layer.
 */
export function createAnsiLayer(theme: ThemeConfig): AnsiLayer {
  // Force color output -- the caller controls whether this layer is used
  const c = new Chalk({ level: 1 });

  const levelColors: Record<number, (text: string) => string> = {
    1: c.cyan,
    2: c.green,
    3: c.yellow,
    4: c.blue,
    5: c.magenta,
    6: c.white,
  };

  return {
    heading(text: string, level: number): string {
      const colorFn = levelColors[level]! || levelColors[6]!;
      const style = theme.headings[level]!;
      if (style?.bold) {
        return c.bold(colorFn(text));
      }
      return colorFn(text);
    },

    bold(text: string): string {
      return c.bold(text);
    },

    italic(text: string): string {
      return c.italic(text);
    },

    strikethrough(text: string): string {
      return c.strikethrough(text);
    },

    code(text: string): string {
      return c.gray(text);
    },

    codeBlock(text: string): string {
      return c.dim(text);
    },

    link(text: string, url: string): string {
      // OSC 8 hyperlink: \x1b]8;;url\x07text\x1b]8;;\x07
      const styledText = c.underline.blue(text);
      return `\x1b]8;;${url}\x07${styledText}\x1b]8;;\x07`;
    },

    blockquoteBar(text: string): string {
      return c.dim(text);
    },
  };
}
