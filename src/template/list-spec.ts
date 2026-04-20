/**
 * Auto-apply list_spec to unterminated list results.
 *
 * When a template expression resolves to a string[] and no
 * list-terminating operator (join/lines) was in the pipeline,
 * the list_spec config converts it to a string.
 */

import { parseExpression } from "./parser.ts";
import { applyOperators } from "./operators.ts";
import type { TemplateWarning } from "./types.ts";

const DEFAULT_LIST_SPEC = "join/, /";

/**
 * Apply list_spec to an unterminated list result.
 * If value is a string, returns it unchanged.
 * Parses the list_spec string as an operator expression and applies it.
 */
export function applyListSpec(
  value: string | string[],
  listSpec: string | undefined,
  warnings: TemplateWarning[],
): string {
  if (typeof value === "string") return value;
  if (value.length === 0) return "";

  const spec = listSpec ?? DEFAULT_LIST_SPEC;
  // Use dummy-field trick: parse "_|SPEC" to extract operator chain
  const parsed = parseExpression(`_|${spec}`);
  if (!parsed || parsed.operators.length === 0) {
    // Fallback: comma-space join
    return value.join(", ");
  }

  const context = { offset: 0, source: "", warnings };
  const result = applyOperators(value, parsed.operators, context);
  if (result === null || Array.isArray(result)) {
    return value.join(", ");
  }
  return result;
}
