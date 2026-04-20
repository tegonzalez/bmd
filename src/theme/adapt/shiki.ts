/**
 * Shiki theme adaptation layer.
 * Converts SynTheme facet to Shiki-compatible theme configuration.
 */

import type { SynTheme } from "../schema/syn.ts";

/**
 * Get the Shiki theme name from a SynTheme.
 * Used by syntax-highlight.ts to select the Shiki theme dynamically.
 */
export function getShikiThemeName(syn: SynTheme): string {
  return syn.shikiTheme;
}

/**
 * Get the default fallback color from a SynTheme.
 * Used by normalizeColor() when no token color is available.
 */
export function getShikiDefaultColor(syn: SynTheme): string {
  return syn.defaultColor;
}
