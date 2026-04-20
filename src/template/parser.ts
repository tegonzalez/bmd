/**
 * Expression parser and escape interpreter for the template engine.
 *
 * Parses raw expression text (between {{ and }}) into structured
 * ParsedExpression objects with field name, optional default value,
 * and operator pipeline.
 */

import type { ParsedExpression, ParsedOperator } from "./types";

/**
 * Interpret escape sequences in a string.
 *
 * Supported: \n \t \r \\ \/ \|
 * Unknown escapes keep the backslash (e.g. \x -> \x).
 */
export function interpretEscapes(s: string): string {
  const len = s.length;
  let out = "";
  let i = 0;
  while (i < len) {
    if (s[i]! === "\\" && i + 1 < len) {
      const next = s[i + 1]!;
      switch (next) {
        case "n":
          out += "\n";
          i += 2;
          break;
        case "t":
          out += "\t";
          i += 2;
          break;
        case "r":
          out += "\r";
          i += 2;
          break;
        case "\\":
          out += "\\";
          i += 2;
          break;
        case "/":
          out += "/";
          i += 2;
          break;
        case "|":
          out += "|";
          i += 2;
          break;
        default:
          // Unknown escape: keep backslash
          out += "\\";
          out += next;
          i += 2;
          break;
      }
    } else {
      out += s[i]!;
      i++;
    }
  }
  return out;
}

/**
 * Check if a character is valid as the start of a field name.
 */
function isFieldStart(ch: string): boolean {
  return /^[a-zA-Z_]$/.test(ch);
}

/**
 * Check if a character is valid within a field name (after the start).
 */
function isFieldChar(ch: string): boolean {
  return /^[a-zA-Z0-9_.\-]$/.test(ch);
}

/**
 * Parse a raw expression string into a structured ParsedExpression.
 *
 * Grammar:
 *   expression = field [ ":-" default ] [ "|" operator ( "|" operator )* ]
 *   field      = [a-zA-Z_][a-zA-Z0-9_.-]*
 *   default    = ( escaped-char | [^|] )*
 *   operator   = name [ "/" arg ( "/" arg )* "/" ]
 *   name       = [a-z]+
 *   arg        = ( escaped-char | [^/|] )*
 *
 * Returns null for malformed expressions (empty, invalid field start, etc.).
 */
export function parseExpression(raw: string): ParsedExpression | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let i = 0;
  const len = trimmed.length;

  // Parse field name
  if (!isFieldStart(trimmed[i]!)) return null;

  let field = trimmed[i]!;
  i++;
  while (i < len && isFieldChar(trimmed[i]!)) {
    field += trimmed[i]!;
    i++;
  }

  let defaultValue: string | undefined;
  const operators: ParsedOperator[] = [];

  // Check for default value marker ":-"
  if (i < len - 1 && trimmed[i]! === ":" && trimmed[i + 1]! === "-") {
    i += 2; // skip :-
    // Collect default value until unescaped | or end of string
    let rawDefault = "";
    while (i < len) {
      if (trimmed[i]! === "\\" && i + 1 < len) {
        // Escaped character -- include both chars in raw, interpretEscapes handles later
        rawDefault += trimmed[i]!;
        rawDefault += trimmed[i + 1]!;
        i += 2;
      } else if (trimmed[i]! === "|") {
        break;
      } else {
        rawDefault += trimmed[i]!;
        i++;
      }
    }
    defaultValue = interpretEscapes(rawDefault);
  }

  // Parse operator pipeline
  while (i < len && trimmed[i]! === "|") {
    i++; // skip |

    // Parse operator name: [a-z]+
    let name = "";
    while (i < len && /^[a-z]$/.test(trimmed[i]!)) {
      name += trimmed[i]!;
      i++;
    }
    if (name.length === 0) return null; // malformed

    const args: string[] = [];

    // Check for args delimited by /
    if (i < len && trimmed[i]! === "/") {
      // Parse slash-delimited args
      while (i < len && trimmed[i]! === "/") {
        i++; // skip /
        let arg = "";
        while (i < len && trimmed[i]! !== "/" && trimmed[i]! !== "|") {
          if (trimmed[i]! === "\\" && i + 1 < len) {
            arg += trimmed[i]!;
            arg += trimmed[i + 1]!;
            i += 2;
          } else {
            arg += trimmed[i]!;
            i++;
          }
        }
        args.push(interpretEscapes(arg));
        // If we hit | or end, stop collecting args for this operator
        if (i >= len || trimmed[i]! === "|") break;
        // Otherwise we're at /, check if next char is | or end (trailing slash)
        // Peek: if this / is followed by | or end, it's the closing slash
        if (i < len && trimmed[i]! === "/") {
          // Check if this is a trailing slash (next is | or end or another operator)
          if (i + 1 >= len || trimmed[i + 1]! === "|") {
            i++; // skip trailing /
            break;
          }
          // Otherwise, more args to parse
        }
      }
    }

    operators.push({ name, args });
  }

  const result: ParsedExpression = { field, operators };
  if (defaultValue !== undefined) {
    result.defaultValue = defaultValue;
  }
  return result;
}
