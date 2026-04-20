/**
 * Template values map file loader and auto-map discovery.
 *
 * loadMapFile: Reads a YAML mapping file into a TemplateValues object.
 * discoverAutoMap: Finds paired .yaml/.yml files for .t template files.
 */

import { resolve, parse as pathParse, join } from "path";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { BmdError, ExitCode, writeDiagnostic, Severity } from "../diagnostics/formatter.ts";
import type { TemplateValues } from "../template/types.ts";
import { inflateDotPaths, deepMerge } from "../cli/var-parser.ts";

export type { TemplateValues };

/**
 * Load a YAML map file and return its contents as TemplateValues.
 * Throws BmdError with diagnostics on missing file, invalid YAML, or non-mapping root.
 *
 * NOTE: Does NOT apply SAFE-03 URL checking -- map files legitimately contain URLs as values.
 */
export async function loadMapFile(mapPath: string): Promise<TemplateValues> {
  const resolvedPath = resolve(mapPath);

  if (!existsSync(resolvedPath)) {
    writeDiagnostic({
      file: resolvedPath,
      line: 1,
      col: 1,
      span: 1,
      message: `Map file not found: ${resolvedPath}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`Map file not found: ${resolvedPath}`, ExitCode.USAGE);
  }

  const source = readFileSync(resolvedPath, "utf-8");

  // Empty/null document returns empty object
  if (source.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeDiagnostic({
      file: resolvedPath,
      line: 1,
      col: 1,
      span: 1,
      message: `YAML syntax error: ${message}`,
      severity: Severity.DiagError,
      context: source,
    });
    throw new BmdError(`Invalid YAML in map file: ${resolvedPath}`, ExitCode.USAGE);
  }

  // null result from valid YAML (e.g., just comments or `---`)
  if (parsed == null) {
    return {};
  }

  // Reject non-mapping roots (scalars, arrays)
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    writeDiagnostic({
      file: resolvedPath,
      line: 1,
      col: 1,
      span: 1,
      message: `Map file root is not a YAML mapping: ${resolvedPath}`,
      severity: Severity.DiagError,
      context: source,
    });
    throw new BmdError(
      `Map file root is not a YAML mapping: ${resolvedPath}`,
      ExitCode.USAGE,
    );
  }

  return parsed as TemplateValues;
}

/**
 * Discover a paired .yaml or .yml map file for a .t template file.
 * Returns the path to the map file if found, null otherwise.
 *
 * Convention: README.t looks for README.yaml, then README.yml.
 * Non-.t files always return null.
 */
export async function discoverAutoMap(filePath: string): Promise<string | null> {
  const resolved = resolve(filePath);
  const { dir, name, ext } = pathParse(resolved);

  if (ext !== ".t") {
    return null;
  }

  const yamlPath = join(dir, name + ".yaml");
  if (existsSync(yamlPath)) {
    return yamlPath;
  }

  const ymlPath = join(dir, name + ".yml");
  if (existsSync(ymlPath)) {
    return ymlPath;
  }

  return null;
}

/**
 * Resolve template values from all sources with correct precedence.
 *
 * Precedence (highest wins): --var > --map > config.map > auto-map
 *
 * - Layer 1: auto-map (only if auto_map !== false AND enabled !== false AND filePath exists)
 * - Layer 2: config.map (only if no cliMap)
 * - Layer 3: cliMap (overrides config.map entirely -- fresh load, not merge)
 * - Layer 4: cliVars deep-merged on top
 *
 * enabled: false disables auto-map but explicit --map still works (CLI intent wins).
 */
export async function resolveTemplateValues(
  cliMap: string | undefined,
  cliVars: Array<{ key: string; value: unknown }>,
  config: { enabled?: boolean; map?: string; auto_map?: boolean },
  filePath: string | undefined,
): Promise<TemplateValues> {
  let values: TemplateValues = {};

  // Layer 1: auto-map (lowest precedence)
  if (config.auto_map !== false && config.enabled !== false && filePath) {
    const autoMapPath = await discoverAutoMap(filePath);
    if (autoMapPath) {
      values = await loadMapFile(autoMapPath);
    }
  }

  // Layer 2: config templates.map (only when no CLI --map)
  if (!cliMap && config.map) {
    values = await loadMapFile(config.map);
  }

  // Layer 3: CLI --map (overrides config map entirely)
  if (cliMap) {
    values = await loadMapFile(cliMap);
  }

  // Layer 4: --var overrides (deep-merged on top)
  if (cliVars.length > 0) {
    const varValues = inflateDotPaths(cliVars);
    values = deepMerge(values, varValues);
  }

  return values;
}
