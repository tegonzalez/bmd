/**
 * Locate the package `themes/` directory when running from source or from bundled `dist/cli.js`.
 */

import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Walk upward from `importMetaUrl` until a `themes/` directory is found that looks like
 * the bmd bundle (has at least one facet folder). Returns the path to `themes/`, or null.
 */
export function findBundledThemesRoot(importMetaUrl: string): string | null {
  let dir = dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < 14; i++) {
    const themesRoot = join(dir, "themes");
    if (
      existsSync(join(themesRoot, "syn")) ||
      existsSync(join(themesRoot, "md"))
    ) {
      return themesRoot;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
