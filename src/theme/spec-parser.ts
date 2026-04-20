/**
 * Theme spec string parser.
 * Parses composable spec strings like "syn:dracula+md:dark" into facet selections.
 */

export const FACETS = ["syn", "md", "mer", "web"] as const;
export type Facet = (typeof FACETS)[number];

export interface ThemeSpec {
  syn?: string;
  md?: string;
  mer?: string;
  web?: string;
}

/**
 * Parse a theme-spec string into facet selections.
 *
 * Format: "facet:name[+facet:name...]"
 * Example: "syn:dracula+md:dark" -> { syn: "dracula", md: "dark" }
 *
 * Omitted facets are undefined (will use defaults).
 */
export function parseThemeSpec(spec: string): ThemeSpec {
  if (!spec || spec.trim().length === 0) {
    throw new Error("Empty theme spec");
  }

  const result: ThemeSpec = {};
  const parts = spec.split("+");

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(
        `Missing theme name for "${part}". Expected format: facet:name (e.g., syn:dracula)`
      );
    }

    const facet = part.slice(0, colonIdx);
    const name = part.slice(colonIdx + 1);

    if (!FACETS.includes(facet as Facet)) {
      throw new Error(
        `Unknown theme facet: "${facet}". Valid facets: ${FACETS.join(", ")}`
      );
    }

    if (!name || name.trim().length === 0) {
      throw new Error(
        `Missing theme name for facet: ${facet}`
      );
    }

    result[facet as Facet] = name;
  }

  return result;
}
