/**
 * Mermaid theme adaptation layer.
 * Converts MerTheme facet to beautiful-mermaid AsciiRenderOptions theme shape.
 */

import type { MerTheme } from "../schema/mer.ts";

/**
 * Convert a MerTheme to the beautiful-mermaid DiagramColors shape.
 * Direct mapping since MerTheme mirrors the expected interface.
 */
export function toMermaidTheme(mer: MerTheme): { fg: string; border: string; line: string; arrow: string } {
  return {
    fg: mer.fg,
    border: mer.border,
    line: mer.line,
    arrow: mer.arrow,
  };
}
