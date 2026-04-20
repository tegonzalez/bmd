/**
 * CSS theme adaptation layer.
 * Converts WebTheme facet to CSS custom property declarations.
 * Used by browser preview to inject theme-driven CSS variables.
 */

import type { WebTheme } from "../schema/web.ts";

/**
 * Convert a WebTheme to CSS custom property declarations.
 * Returns a string containing `:root { ... }` with all theme variables.
 *
 * Maps WebTheme fields to CSS variable names used by src/web/styles.css.
 */
export function toCssVariables(web: WebTheme): string {
  const lines: string[] = [":root {"];

  // Font families
  lines.push(`  --font-family: ${web.fontFamily};`);
  lines.push(`  --mono-font-family: ${web.monoFontFamily};`);

  // Layout
  lines.push(`  --max-width: ${web.maxWidth};`);
  lines.push(`  --spacing: ${web.spacing}px;`);
  lines.push(`  --font-size: ${web.fontSize}px;`);

  // Day palette
  lines.push(`  --day-bg: ${web.day.bg};`);
  lines.push(`  --day-fg: ${web.day.fg};`);
  lines.push(`  --day-accent: ${web.day.accent};`);
  lines.push(`  --day-border: ${web.day.border};`);
  lines.push(`  --day-code-bg: ${web.day.codeBg};`);
  lines.push(`  --day-code-fg: ${web.day.codeFg};`);

  // Night palette
  lines.push(`  --night-bg: ${web.night.bg};`);
  lines.push(`  --night-fg: ${web.night.fg};`);
  lines.push(`  --night-accent: ${web.night.accent};`);
  lines.push(`  --night-border: ${web.night.border};`);
  lines.push(`  --night-code-bg: ${web.night.codeBg};`);
  lines.push(`  --night-code-fg: ${web.night.codeFg};`);

  lines.push("}");

  return lines.join("\n");
}
