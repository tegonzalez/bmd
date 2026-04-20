/**
 * Template engine types and constants.
 *
 * This file is the contract for all other template modules.
 * Types and constants only -- no implementation logic.
 */

/** Byte-offset range in source text (end exclusive). */
export interface SkipRegion {
  start: number;
  end: number;
}

/** Location and raw text of a `{{...}}` match in source. */
export interface ExpressionRange {
  start: number;
  end: number;
  /** Text between {{ and }} (exclusive of delimiters). */
  raw: string;
}

/** Parsed expression: field name, optional default, operator chain. */
export interface ParsedExpression {
  field: string;
  defaultValue?: string;
  operators: ParsedOperator[];
}

/** A single operator in an expression's operator chain. */
export interface ParsedOperator {
  name: string;
  args: string[];
}

/**
 * Structured warning emitted during template expansion.
 * Compatible with Diagnostic conversion in the CLI layer.
 */
export interface TemplateWarning {
  offset: number;
  length: number;
  message: string;
  hint?: string;
}

/** Operator function signature. Returns null to signal error (keep expression as literal). */
export type OperatorFn = (
  value: string | string[],
  args: string[],
  context: OperatorContext,
) => string | string[] | null;

/** Context passed to operator functions during expansion. */
export interface OperatorContext {
  offset: number;
  source: string;
  warnings: TemplateWarning[];
}

/** Result of template expansion. */
export interface ExpandResult {
  output: string;
  warnings: TemplateWarning[];
}

/** Type alias for the values map passed to template expansion. */
export type TemplateValues = Record<string, unknown>;

/**
 * Sentinel value distinguishing "field not in map" from null/empty values.
 * Critical for TMPL-06 (missing field) vs TMPL-07 (empty value) distinction.
 */
export const MISSING = Symbol('MISSING');
