/**
 * Operator registry and pipeline executor.
 *
 * All 8 built-in operators for the template engine:
 * String: upper, lower, camel, proper, tr
 * List: join, lines, subst
 */

import type {
  OperatorFn,
  OperatorContext,
  ParsedOperator,
} from "./types";

// ---------------------------------------------------------------------------
// Helper: apply a string->string transform element-wise over arrays
// ---------------------------------------------------------------------------

function mapStringOp(
  value: string | string[],
  fn: (s: string) => string,
): string | string[] {
  if (Array.isArray(value)) return value.map(fn);
  return fn(value);
}

// ---------------------------------------------------------------------------
// String operators
// ---------------------------------------------------------------------------

const opUpper: OperatorFn = (value) => mapStringOp(value, (s) => s.toUpperCase());

const opLower: OperatorFn = (value) => mapStringOp(value, (s) => s.toLowerCase());

function camelCase(s: string): string {
  const words = s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  return (
    words[0]!.toLowerCase() +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("")
  );
}

const opCamel: OperatorFn = (value) => mapStringOp(value, camelCase);

function properCase(s: string): string {
  return s.replace(/\S+/g, (word) => {
    // Preserve all-caps acronyms (length > 1)
    if (word === word.toUpperCase() && word.length > 1) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

const opProper: OperatorFn = (value) => mapStringOp(value, properCase);

function trTranslate(s: string, from: string, to: string): string {
  let result = "";
  for (const ch of s) {
    const idx = from.indexOf(ch);
    result += idx >= 0 ? to[idx]! : ch;
  }
  return result;
}

const opTr: OperatorFn = (value, args, context) => {
  if (args.length !== 2) {
    context.warnings.push({
      offset: context.offset,
      length: 0,
      message: `tr: expected 2 arguments (FROM, TO), got ${args.length}`,
      hint: args.length === 2 ? undefined : "tr/FROM/TO/ requires exactly 2 arguments",
    });
    return null;
  }
  const from = args[0]!;
  const to = args[1]!;
  if (from.length !== to.length) {
    context.warnings.push({
      offset: context.offset,
      length: 0,
      message: `tr: FROM length (${from.length}) differs from TO length (${to.length})`,
      hint: "tr: FROM and TO must have same length",
    });
    return null;
  }
  return mapStringOp(value, (s) => trTranslate(s, from, to));
};

// ---------------------------------------------------------------------------
// List operators (stubs for Task 2 -- registered but not yet implemented)
// ---------------------------------------------------------------------------

const opJoin: OperatorFn = (value, args, context) => {
  if (args.length !== 1 && args.length !== 3) {
    context.warnings.push({
      offset: context.offset,
      length: 0,
      message: `join: expected 1 or 3 arguments, got ${args.length}`,
    });
    return null;
  }
  const arr = Array.isArray(value) ? value : [value];
  if (args.length === 1) {
    return arr.join(args[0]!);
  }
  // 3-arg form: prefix/delim/suffix
  const [prefix, delim, suffix] = args;
  if (arr.length === 0) return "";
  return prefix + arr.join(delim) + suffix;
};

const opLines: OperatorFn = (value, args, context) => {
  if (args.length > 2) {
    context.warnings.push({
      offset: context.offset,
      length: 0,
      message: `lines: expected 0-2 arguments, got ${args.length}`,
    });
    return null;
  }
  const prefix = args[0]! ?? "";
  const suffix = args[1]! ?? "";
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((item) => prefix + item + suffix).join("\n");
};

const opSubst: OperatorFn = (value, args, context) => {
  const validCounts = [1, 2, 4];
  if (!validCounts.includes(args.length)) {
    context.warnings.push({
      offset: context.offset,
      length: 0,
      message: `subst: expected 1, 2, or 4 arguments, got ${args.length}`,
    });
    return null;
  }
  const arr = Array.isArray(value) ? value : [value];
  const prefix = args[0]!;
  const suffix = args[1]! ?? "";
  const lastPrefix = args.length === 4 ? args[2]! : prefix;
  const lastSuffix = args.length === 4 ? args[3]! : suffix;

  return arr.map((item, i) => {
    if (i === arr.length - 1) {
      return lastPrefix + item + lastSuffix;
    }
    return prefix + item + suffix;
  });
};

// ---------------------------------------------------------------------------
// Operator registry
// ---------------------------------------------------------------------------

export const OPERATORS = new Map<string, OperatorFn>([
  ["upper", opUpper],
  ["lower", opLower],
  ["camel", opCamel],
  ["proper", opProper],
  ["tr", opTr],
  ["join", opJoin],
  ["lines", opLines],
  ["subst", opSubst],
]);

// ---------------------------------------------------------------------------
// Pipeline executor
// ---------------------------------------------------------------------------

/**
 * Apply a chain of operators to a value.
 * Returns null if any operator is unknown or returns null (error).
 */
export function applyOperators(
  value: string | string[],
  operators: ParsedOperator[],
  context: OperatorContext,
): string | string[] | null {
  let current: string | string[] = value;

  for (const op of operators) {
    const fn = OPERATORS.get(op.name);
    if (!fn) return null;

    const result = fn(current, op.args, context);
    if (result === null) return null;
    current = result;
  }

  return current;
}
