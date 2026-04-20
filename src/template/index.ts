/**
 * Public API for the template engine.
 *
 * Wires together scanner, parser, resolver, operators, and compression
 * into the public expandTemplate() and extractFields() functions.
 */

import { findSkipRegions, findExpressionRanges } from "./scanner";
import { parseExpression } from "./parser";
import { resolveValue } from "./resolver";
import { applyOperators } from "./operators";
import { compressWhitespace } from "./compress";
import type { ExpansionMark } from "./compress";
import { applyListSpec } from "./list-spec";
import { MISSING } from "./types";
import type {
  ExpandResult,
  TemplateValues,
  TemplateWarning,
  ExpressionRange,
} from "./types";

// Re-export public types
export type { ExpandResult, TemplateWarning, TemplateValues } from "./types";

/** Options for expandTemplate. */
export interface ExpandOptions {
  /** list_spec string for auto-converting unterminated array results. */
  listSpec?: string;
}

/**
 * One template substitution after resolution, in source order.
 * Used by expandTemplate() and expandTemplateWithRegions() so both paths
 * share identical semantics (including TMPL-07 whitespace compression).
 */
export interface TemplateSubstitution {
  range: ExpressionRange;
  /** Text that replaces the {{...}} span in the expanded document. */
  replacement: string;
  /** True when the field resolved to empty/null and TMPL-07 may compress spaces. */
  isEmpty: boolean;
  /**
   * True when a value was substituted (including default).
   * False when the literal {{...}} is preserved (missing field, malformed, operator error).
   */
  templateResolved: boolean;
}

/**
 * Build the ordered substitution list for a source string.
 * Shared by expandTemplate and the pipeline region marker pass.
 */
export function buildTemplateSubstitutions(
  source: string,
  values: TemplateValues | undefined,
  options: ExpandOptions | undefined,
  warnings: TemplateWarning[],
): TemplateSubstitution[] {
  const safeValues: TemplateValues = values ?? {};
  const skipRegions = findSkipRegions(source);
  const expressions = findExpressionRanges(source, skipRegions);
  const substitutions: TemplateSubstitution[] = [];

  for (const expr of expressions) {
    const parsed = parseExpression(expr.raw);

    if (parsed === null) {
      substitutions.push({
        range: expr,
        replacement: `{{${expr.raw}}}`,
        isEmpty: false,
        templateResolved: false,
      });
      continue;
    }

    let resolved = resolveValue(safeValues, parsed.field);

    if (resolved === MISSING) {
      if (parsed.defaultValue !== undefined) {
        resolved = parsed.defaultValue;
      } else {
        substitutions.push({
          range: expr,
          replacement: `{{${expr.raw}}}`,
          isEmpty: false,
          templateResolved: false,
        });
        continue;
      }
    }

    const isEmptyValue =
      resolved === null || resolved === "" || resolved === undefined;

    let stringValue: string | string[];
    if (Array.isArray(resolved)) {
      stringValue = resolved.map(String);
    } else if (isEmptyValue) {
      stringValue = "";
    } else {
      stringValue = String(resolved);
    }

    if (parsed.operators.length > 0) {
      const context = {
        offset: expr.start,
        source,
        warnings,
      };
      const result = applyOperators(stringValue, parsed.operators, context);
      if (result === null) {
        substitutions.push({
          range: expr,
          replacement: `{{${expr.raw}}}`,
          isEmpty: false,
          templateResolved: false,
        });
        continue;
      }
      if (Array.isArray(result)) {
        substitutions.push({
          range: expr,
          replacement: applyListSpec(result, options?.listSpec, warnings),
          isEmpty: false,
          templateResolved: true,
        });
      } else {
        const opEmpty = result === "";
        substitutions.push({
          range: expr,
          replacement: result,
          isEmpty: opEmpty,
          templateResolved: true,
        });
      }
    } else {
      if (Array.isArray(stringValue)) {
        substitutions.push({
          range: expr,
          replacement: applyListSpec(stringValue, options?.listSpec, warnings),
          isEmpty: false,
          templateResolved: true,
        });
      } else {
        substitutions.push({
          range: expr,
          replacement: stringValue,
          isEmpty: isEmptyValue,
          templateResolved: true,
        });
      }
    }
  }

  return substitutions;
}

/**
 * Assemble expanded plain text from substitutions and apply TMPL-07 compression.
 * Must match expandTemplate() output byte-for-byte for the same substitution list.
 */
export function expandPlainFromSubstitutions(
  source: string,
  substitutions: TemplateSubstitution[],
): string {
  let output = "";
  let lastEnd = 0;
  const expansionMarks: Array<{
    outputStart: number;
    outputEnd: number;
    isEmpty: boolean;
  }> = [];

  for (const sub of substitutions) {
    output += source.slice(lastEnd, sub.range.start);

    const outputStart = output.length;
    output += sub.replacement;
    const outputEnd = output.length;

    expansionMarks.push({
      outputStart,
      outputEnd,
      isEmpty: sub.isEmpty,
    });

    lastEnd = sub.range.end;
  }
  output += source.slice(lastEnd);

  const hasEmpties = expansionMarks.some((m) => m.isEmpty);
  if (hasEmpties) {
    output = compressPerLine(output, expansionMarks);
  }

  return output;
}

/**
 * Expand template expressions in the source string.
 *
 * - Substitutes {{FIELD}} with values from the map (TMPL-01)
 * - Supports default values via {{FIELD:-default}} (TMPL-02)
 * - Supports operator pipelines via {{FIELD|op}} (TMPL-03)
 * - Missing fields with no default are kept as literal text (TMPL-06)
 * - Empty/null substitutions compress surrounding whitespace (TMPL-07)
 * - Expressions inside code blocks are never expanded
 */
export function expandTemplate(
  source: string,
  values?: TemplateValues,
  options?: ExpandOptions,
): ExpandResult {
  const skipRegions = findSkipRegions(source);
  const expressions = findExpressionRanges(source, skipRegions);

  if (expressions.length === 0) {
    return { output: source, warnings: [] };
  }

  const warnings: TemplateWarning[] = [];
  const substitutions = buildTemplateSubstitutions(source, values, options, warnings);

  return {
    output: expandPlainFromSubstitutions(source, substitutions),
    warnings,
  };
}

/**
 * Extract field names from a template string.
 *
 * Returns sorted, unique field names excluding code-block regions.
 * Malformed expressions are ignored.
 */
export function extractFields(source: string): string[] {
  const skipRegions = findSkipRegions(source);
  const expressions = findExpressionRanges(source, skipRegions);

  const fields = new Set<string>();
  for (const expr of expressions) {
    const parsed = parseExpression(expr.raw);
    if (parsed !== null) {
      fields.add(parsed.field);
    }
  }

  return Array.from(fields).sort();
}

// ---------------------------------------------------------------------------
// Internal: per-line whitespace compression
// ---------------------------------------------------------------------------

function compressPerLine(
  text: string,
  marks: Array<{ outputStart: number; outputEnd: number; isEmpty: boolean }>,
): string {
  const lines = text.split("\n");
  let lineStart = 0;
  const result: string[] = [];

  for (const line of lines) {
    const lineEnd = lineStart + line.length;

    const lineMarks: ExpansionMark[] = [];
    for (const m of marks) {
      if (m.outputStart >= lineStart && m.outputStart <= lineEnd) {
        lineMarks.push({
          start: m.outputStart - lineStart,
          end: m.outputEnd - lineStart,
          isEmpty: m.isEmpty,
        });
      }
    }

    if (lineMarks.some((m) => m.isEmpty)) {
      result.push(compressWhitespace(line, lineMarks));
    } else {
      result.push(line);
    }

    lineStart = lineEnd + 1;
  }

  return result.join("\n");
}
