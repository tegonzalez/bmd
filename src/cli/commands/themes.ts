/**
 * bmd themes — List bundled and project-local theme names by facet.
 *
 * `bmd themes` lists facet names; `bmd themes -a` prints the Facet/Themes table.
 */

import { defineCommand } from "citty";
import type { ArgsDef } from "citty";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { FACETS, type Facet } from "../../theme/types.ts";
import { findBundledThemesRoot } from "../../theme/bundled-root.ts";
import { writeDiagnostic, Severity, ExitCode } from "../../diagnostics/formatter.ts";

/**
 * Scan theme directories for available theme names.
 * Checks both bundled (themes/<facet>/) and project-local (.bmd/themes/<facet>/).
 * Returns deduplicated, sorted list.
 */
async function getThemeNames(facet: string): Promise<string[]> {
  const names = new Set<string>();

  const themesRoot = findBundledThemesRoot(import.meta.url);
  const bundledDir = themesRoot ? join(themesRoot, facet) : null;
  if (bundledDir) {
    try {
      const entries = await readdir(bundledDir);
      for (const entry of entries) {
        if (entry.endsWith(".yaml")) {
          names.add(entry.replace(/\.yaml$/, ""));
        }
      }
    } catch (err: any) {
      if (err?.code !== "ENOENT")
        writeDiagnostic({
          file: "src/cli/commands/themes.ts",
          line: 31,
          col: 5,
          span: 0,
          message: `Failed to read ${bundledDir}: ${err?.message ?? err}`,
          severity: Severity.DiagError,
        });
    }
  }

  const localDir = join(process.cwd(), ".bmd", "themes", facet);
  try {
    const entries = await readdir(localDir);
    for (const entry of entries) {
      if (entry.endsWith(".yaml")) {
        names.add(entry.replace(/\.yaml$/, ""));
      }
    }
  } catch (err: any) {
    if (err?.code !== "ENOENT")
      writeDiagnostic({
        file: "src/cli/commands/themes.ts",
        line: 42,
        col: 5,
        span: 0,
        message: `Failed to read ${localDir}: ${err?.message ?? err}`,
        severity: Severity.DiagError,
      });
  }

  return [...names].sort();
}

/** Two-column table matching docs/themes.md “Bundled Themes”. */
function printThemesTable(rows: Array<{ facet: string; themes: string[] }>): void {
  const themeCols = rows.map((r) => r.themes.join(", "));
  const facetW = Math.max(
    "Facet".length,
    ...rows.map((r) => r.facet.length),
  );
  const themesW = Math.max(
    "Themes".length,
    ...themeCols.map((s) => s.length),
  );
  console.log(
    `${"Facet".padEnd(facetW)}  ${"Themes".padEnd(themesW)}`,
  );
  console.log(
    `${"-".repeat(facetW)}  ${"-".repeat(themesW)}`,
  );
  for (let i = 0; i < rows.length; i++) {
    console.log(
      `${rows[i]!.facet.padEnd(facetW)}  ${themeCols[i]!}`,
    );
  }
}

/** @internal */
export const themesCommandMeta = {
  name: "themes" as const,
  description: "List theme facets (-a for Facet/Themes table)",
};

/** @internal */
export const themesCommandArgs: ArgsDef = {
  facet: {
    type: "positional",
    valueHint: "facet",
    description:
      "Optional facet (syn, md, mer, web, unic). Omit: print facet names. Set: list theme .yaml names for that facet",
    required: false,
  },
  all: {
    type: "boolean",
    alias: "a",
    description:
      "Print Facet/Themes table for every facet (bundled + .bmd/themes)",
    default: false,
  },
};

const themesCommand = defineCommand({
  meta: themesCommandMeta,
  args: themesCommandArgs,
  async run({ args }) {
    if (args.facet) {
      if (!FACETS.includes(args.facet as Facet)) {
        writeDiagnostic({
          file: "src/cli/commands/themes.ts",
          line: 115,
          col: 9,
          span: 0,
          message: `Unknown facet: ${args.facet}. Valid facets: ${FACETS.join(", ")}`,
          severity: Severity.DiagError,
        });
        process.exit(ExitCode.USAGE);
      }
      const names = await getThemeNames(args.facet);
      for (const name of names) {
        console.log(name);
      }
      return;
    }

    if (args.all) {
      const rows: Array<{ facet: string; themes: string[] }> = [];
      for (const facet of FACETS) {
        rows.push({ facet, themes: await getThemeNames(facet) });
      }
      printThemesTable(rows);
      return;
    }

    for (const facet of FACETS) {
      console.log(facet);
    }
  },
});

export default themesCommand;
