/**
 * Shared types for the bmd theme system.
 * Five facets compose into a single resolved theme.
 */

import type { SynTheme } from "./schema/syn";
import type { MdTheme } from "./schema/md";
import type { MerTheme } from "./schema/mer";
import type { WebTheme } from "./schema/web";
import type { UnicTheme } from "./schema/unic";

/** The five theme facets */
export const FACETS = ["syn", "md", "mer", "web", "unic"] as const;
export type Facet = (typeof FACETS)[number];

/** Partial theme spec from parsing "syn:dracula+md:dark" */
export interface ThemeSpec {
  syn?: string;
  md?: string;
  mer?: string;
  web?: string;
  unic?: string;
}

/** Fully resolved theme with all five facets populated */
export interface ResolvedTheme {
  syn: SynTheme;
  md: MdTheme;
  mer: MerTheme;
  web: WebTheme;
  unic: UnicTheme;
}
