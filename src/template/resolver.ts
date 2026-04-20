/**
 * Value resolver for the template engine.
 *
 * Resolves field values from nested maps using dot-path traversal.
 * Returns the MISSING sentinel when a path cannot be resolved,
 * distinguishing "not found" from null/empty values.
 */

import { MISSING } from "./types";
import type { TemplateValues } from "./types";

/**
 * Resolve a dot-separated path against a values map.
 *
 * - Splits path on `.` and walks the map
 * - At each step, current must be a non-null, non-array object with the key present
 * - Returns MISSING if any step fails
 * - Returns the final value (string, number, boolean, null, array, or object)
 *
 * Note: `undefined` values are treated as MISSING since they indicate
 * a key that exists but has no meaningful value.
 */
export function resolveValue(
  values: TemplateValues,
  path: string,
): unknown | typeof MISSING {
  const parts = path.split(".");
  let current: unknown = values;

  for (const part of parts) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return MISSING;
    }
    if (!(part in (current as Record<string, unknown>))) {
      return MISSING;
    }
    current = (current as Record<string, unknown>)[part]!;
  }

  // Treat undefined as MISSING
  if (current === undefined) return MISSING;

  return current;
}
