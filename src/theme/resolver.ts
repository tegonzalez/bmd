/**
 * Theme file resolution with project-local -> bundled fallback.
 */

import { join } from "path";
import { existsSync } from "node:fs";
import { BmdError, ExitCode } from "../diagnostics/formatter";
import { loadAndValidateTheme } from "./loader";
import { getDefaults } from "./defaults";
import { findBundledThemesRoot } from "./bundled-root";
import type { Facet, ThemeSpec, ResolvedTheme } from "./types";

/**
 * Resolve a theme file path for a facet and name.
 * Checks project-local (.bmd/themes/<facet>/<name>.yaml) first,
 * then bundled (themes/<facet>/<name>.yaml next to package root).
 *
 * @throws BmdError with ExitCode.THEME if not found in either location
 */
export async function resolveThemeFile(
  facet: Facet,
  name: string
): Promise<string> {
  // 1. Check project-local
  const localPath = join(process.cwd(), ".bmd", "themes", facet, `${name}.yaml`);
  if (existsSync(localPath)) {
    return localPath;
  }

  // 2. Bundled themes (package root), works from src/ or dist/cli.js
  const themesRoot = findBundledThemesRoot(import.meta.url);
  const bundledPath = themesRoot
    ? join(themesRoot, facet, `${name}.yaml`)
    : null;
  if (bundledPath && existsSync(bundledPath)) {
    return bundledPath;
  }

  throw new BmdError(
    `Theme not found: ${facet}:${name}. Searched:\n  - ${localPath}\n  - ${bundledPath ?? "(bundled themes dir not found)"}`,
    ExitCode.THEME
  );
}

/**
 * Resolve a full theme spec into a ResolvedTheme.
 * For each facet in spec, resolve and load the file.
 * For omitted facets, use defaults.
 */
export async function resolveThemeSpec(spec: ThemeSpec): Promise<ResolvedTheme> {
  const defaults = getDefaults();
  const result: ResolvedTheme = { ...defaults };

  const facets = ["syn", "md", "mer", "web", "unic"] as const;

  for (const facet of facets) {
    const themeName = spec[facet]!;
    if (themeName) {
      const filePath = await resolveThemeFile(facet, themeName);
      const theme = await loadAndValidateTheme(facet, filePath);
      (result as unknown as Record<string, unknown>)[facet] = theme;
    }
  }

  return result;
}
