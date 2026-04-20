/**
 * ANSI theme adaptation layer.
 * Converts MdTheme facet to a themed AnsiLayer using chalk.hex() for hex color support.
 *
 * KEY CHANGE from original createAnsiLayer:
 * - Uses Chalk level 3 (truecolor) for hex color support via chalk.hex()
 * - Falls back to level 2 (ansi256) when truecolor is not available
 * - chalk.hex() automatically downgrades hex to ansi256/ansi16 based on chalk level (THME-05)
 */

import { Chalk } from "chalk";
import type { AnsiLayer } from "../../renderer/ansi-layer.ts";
import type { MdTheme } from "../schema/md.ts";

/**
 * Detect the best chalk level for the current terminal.
 * Prefers truecolor (level 3), falls back to ansi256 (level 2).
 */
function detectChalkLevel(): 0 | 1 | 2 | 3 {
  const colorterm = process.env.COLORTERM;
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return 3;
  }
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === "iTerm.app" || termProgram === "WezTerm" || termProgram === "Hyper") {
    return 3;
  }
  // Default to level 2 (ansi256) for hex color support with graceful downgrade
  return 2;
}

/**
 * Create a theme-driven AnsiLayer from a resolved MdTheme.
 * Uses chalk.hex() for all color application, enabling full hex color support.
 *
 * The AnsiLayer interface is unchanged -- only the implementation is theme-driven.
 */
export function createThemedAnsiLayer(md: MdTheme, overrideLevel?: 0 | 1 | 2 | 3): AnsiLayer {
  const level = overrideLevel ?? detectChalkLevel();
  const c = new Chalk({ level });

  return {
    heading(text: string, lvl: number): string {
      const key = String(lvl);
      const style = md.headings[key]!;
      if (!style) {
        // Fallback for unknown levels
        return c.bold(text);
      }
      const colored = c.hex(style.color)(text);
      return style.bold ? c.bold(colored) : colored;
    },

    bold(text: string): string {
      if (md.boldColor) {
        return c.bold(c.hex(md.boldColor)(text));
      }
      return c.bold(text);
    },

    italic(text: string): string {
      if (md.italicColor) {
        return c.italic(c.hex(md.italicColor)(text));
      }
      return c.italic(text);
    },

    strikethrough(text: string): string {
      return c.strikethrough(text);
    },

    code(text: string): string {
      if (md.codeColor) {
        return c.hex(md.codeColor)(text);
      }
      return c.gray(text);
    },

    codeBlock(text: string): string {
      if (md.codeBlockBgColor) {
        return c.hex(md.codeBlockBgColor)(text);
      }
      return c.dim(text);
    },

    link(text: string, url: string): string {
      const colorFn = md.linkColor ? c.hex(md.linkColor) : c.blue;
      const styledText = c.underline(colorFn(text));
      return `\x1b]8;;${url}\x07${styledText}\x1b]8;;\x07`;
    },

    blockquoteBar(text: string): string {
      if (md.blockquoteBarColor) {
        return c.hex(md.blockquoteBarColor)(text);
      }
      return c.dim(text);
    },
  };
}
