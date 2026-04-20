/**
 * --var CLI flag extraction and dot-path inflation.
 *
 * extractVarArgs: Collects all --var occurrences from process.argv (citty does not support repeatable flags).
 * inflateDotPaths: Converts dot-path keys (e.g., "user.name") into nested objects.
 * deepMerge: Recursively merges template values with override semantics.
 */

import { parse as parseYaml } from "yaml";
import { BmdError, ExitCode } from "../diagnostics/formatter.ts";
import type { TemplateValues } from "../template/types.ts";

/**
 * Extract all --var KEY=VALUE pairs from an argv array.
 *
 * - Splits on first `=` only (so `equation=E=mc2` works)
 * - `--var KEY` (no `=`) sets value to empty string
 * - VALUE is parsed as YAML for type coercion (42 -> number, true -> boolean)
 * - Malformed input (empty key, bare `=`) throws BmdError with usage hint
 */
export function extractVarArgs(argv: string[]): Array<{ key: string; value: unknown }> {
  const vars: Array<{ key: string; value: unknown }> = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i]! === "--var" && i + 1 < argv.length) {
      const raw = argv[i + 1]!;
      const eqIdx = raw.indexOf("=");

      if (eqIdx === 0 || raw.length === 0) {
        throw new BmdError(
          `Invalid --var format: expected KEY=VALUE, got "${raw}"`,
          ExitCode.USAGE,
        );
      }

      const key = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
      const rawValue = eqIdx === -1 ? "" : raw.slice(eqIdx + 1);

      // Parse value as YAML for type coercion (numbers, booleans, etc.)
      const value = rawValue === "" ? "" : parseYaml(rawValue);

      vars.push({ key, value });
      i++; // skip the value arg
    }
  }

  return vars;
}

/**
 * Inflate dot-path keys into nested objects.
 *
 * Example: [{ key: "user.name", value: "Bob" }] -> { user: { name: "Bob" } }
 * Later entries with the same key overwrite earlier ones.
 */
export function inflateDotPaths(
  vars: Array<{ key: string; value: unknown }>,
): TemplateValues {
  const result: TemplateValues = {};

  for (const { key, value } of vars) {
    const parts = key.split(".");
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i]! in current) || typeof current[parts[i]!]! !== "object" || current[parts[i]!]! === null) {
        current[parts[i]!] = {};
      }
      current = current[parts[i]!]! as Record<string, unknown>;
    }

    current[parts[parts.length - 1]!] = value;
  }

  return result;
}

/**
 * Deep merge two TemplateValues objects.
 *
 * - Objects merge recursively (sibling keys preserved)
 * - Arrays are replaced, not concatenated
 * - Scalars and null are replaced
 */
export function deepMerge(base: TemplateValues, override: TemplateValues): TemplateValues {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === "object" && value !== null && !Array.isArray(value) &&
      typeof result[key]! === "object" && result[key]! !== null && !Array.isArray(result[key]!)
    ) {
      result[key] = deepMerge(
        result[key]! as TemplateValues,
        value as TemplateValues,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
