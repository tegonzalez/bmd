/**
 * Shared helpers for eval and meval commands.
 *
 * Provides YAML coercion, operator pipeline parsing,
 * and pipeline application with list_spec formatting.
 */

import { parseExpression } from "../../template/parser.ts";
import { applyOperators } from "../../template/operators.ts";
import { applyListSpec } from "../../template/list-spec.ts";
import type { ParsedOperator, TemplateWarning } from "../../template/types.ts";

/**
 * Coerce a YAML-parsed value into the operator-compatible form.
 * Arrays become string[], everything else becomes a string.
 */
export function coerceYamlValue(parsed: unknown): string | string[] {
  if (Array.isArray(parsed)) return parsed.map(String);
  return String(parsed ?? "");
}

/**
 * Parse a pipeline string (e.g. "upper|tr/ /_/") into operators.
 * Uses the dummy-field trick: parses "_|PIPELINE" and extracts operators.
 * Returns null if the pipeline string is empty or malformed.
 */
export function parseOperatorPipeline(pipelineStr: string): ParsedOperator[] | null {
  if (!pipelineStr) return null;
  const parsed = parseExpression(`_|${pipelineStr}`);
  if (!parsed || parsed.operators.length === 0) return null;
  return parsed.operators;
}

/**
 * Apply an operator pipeline to a value and format the result.
 * Returns the formatted string, or null if the pipeline is invalid.
 *
 * Unterminated list results get list_spec applied (default: "join/, /").
 */
export function applyPipelineAndFormat(
  value: string | string[],
  pipelineStr: string,
  listSpec?: string,
): string | null {
  const operators = parseOperatorPipeline(pipelineStr);
  if (!operators) return null;

  const warnings: TemplateWarning[] = [];
  const context = { offset: 0, source: "", warnings };
  const result = applyOperators(value, operators, context);

  if (result === null) return null;

  // If result is an unterminated list, apply list_spec
  if (Array.isArray(result)) {
    return applyListSpec(result, listSpec, warnings);
  }

  return result;
}
