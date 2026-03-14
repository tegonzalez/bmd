/**
 * Mermaid diagram detection and rendering transform.
 *
 * Detects fenced code blocks with language "mermaid", renders them to
 * ASCII/Unicode text art via beautiful-mermaid, and stores the result
 * in token.meta for the renderer to output.
 *
 * Errors are isolated per-block: a syntax error in one Mermaid block
 * does not affect rendering of the rest of the document (MERM-03).
 * No browser DOM is required (MERM-04).
 */

import { renderMermaidASCII } from "beautiful-mermaid";
import type { AsciiRenderOptions } from "beautiful-mermaid";
import { writeDiagnostic } from "../diagnostics/formatter.ts";
import type { Token } from "../parser/index.ts";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";

export interface TransformContext {
  format: "ascii" | "utf8";
  ansiEnabled: boolean;
  width: number;
  filePath?: string;
}

/**
 * Diagram types not yet supported by beautiful-mermaid's ASCII renderer.
 * These get a labeled placeholder box instead of a rendering attempt.
 */
const UNSUPPORTED_TYPES = [
  "gantt",
  "pie",
  "journey",
  "mindmap",
  "timeline",
  "quadrantchart",
  "sankey",
  "requirement",
  "gitgraph",
  "c4context",
  "block",
] as const;

/**
 * Truncate a single line to fit within maxWidth visible characters.
 * ANSI-aware: uses string-width for accurate measurement when ANSI escapes present.
 */
function truncateLine(line: string, maxWidth: number, hasAnsi: boolean): string {
  if (maxWidth <= 0) return "";

  if (!hasAnsi) {
    // Fast path: no ANSI escapes, simple slice
    if (line.length <= maxWidth) return line;
    return line.slice(0, maxWidth);
  }

  // ANSI-aware truncation: measure visible width and truncate
  const visibleWidth = stringWidth(line);
  if (visibleWidth <= maxWidth) return line;

  // Strip ANSI, truncate, and accept some styling loss at the boundary
  // For better accuracy, walk character by character
  const stripped = stripAnsi(line);
  if (stripped.length <= maxWidth) return line;

  // Build truncated version by walking the original and tracking visible width
  let result = "";
  let visible = 0;
  let inEscape = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (ch === "\x1b") {
      inEscape = true;
      result += ch;
      continue;
    }

    if (inEscape) {
      result += ch;
      // End of escape sequence at a letter
      if (/[a-zA-Z]/.test(ch)) {
        inEscape = false;
      }
      continue;
    }

    if (visible >= maxWidth) break;
    result += ch;
    visible++;
  }

  // Close any open ANSI sequences with a reset
  if (result.includes("\x1b[")) {
    result += "\x1b[0m";
  }

  return result;
}

/**
 * Render a Mermaid fence block to text art.
 *
 * Mutates token.meta in-place:
 * - isMermaid: always true for detected mermaid blocks
 * - mermaidRendered: the rendered diagram text (on success)
 * - mermaidUnsupported: the unsupported diagram type name (if applicable)
 *
 * On rendering error, token.content is left as-is for fallback display
 * as a plain code block. A diagnostic is emitted to stderr.
 */
export function renderMermaidBlock(token: Token, ctx: TransformContext): void {
  const source = token.content || "";
  const meta = token.meta as any;

  // Ensure meta is an object
  if (!token.meta) {
    (token as any).meta = {};
  }

  const firstLine = source.trim().split("\n")[0]?.trim().toLowerCase() ?? "";

  // Check for unsupported diagram types
  for (const unsupportedType of UNSUPPORTED_TYPES) {
    if (firstLine.startsWith(unsupportedType)) {
      const m = (token.meta as any);
      m.isMermaid = true;
      m.mermaidUnsupported = unsupportedType;
      writeDiagnostic({
        file: ctx.filePath || "<stdin>",
        line: 1,
        col: 1,
        span: unsupportedType.length,
        message: `Unsupported Mermaid diagram type: ${unsupportedType}`,
        severity: "warning",
      });
      return;
    }
  }

  // Build rendering options — use light colors readable on dark backgrounds
  const options: AsciiRenderOptions = {
    useAscii: ctx.format === "ascii",
    colorMode: ctx.ansiEnabled ? "truecolor" : "none",
    paddingX: 2,
    paddingY: 2,
    boxBorderPadding: 1,
    theme: ctx.ansiEnabled ? {
      fg: "#e4e4e7",
      border: "#a1a1aa",
      line: "#a1a1aa",
      arrow: "#d4d4d8",
    } : undefined,
  };

  try {
    const result = renderMermaidASCII(source, options);
    const m = (token.meta as any);
    m.isMermaid = true;

    // Post-process: truncate lines to ctx.width
    const hasAnsi = ctx.ansiEnabled && result.includes("\x1b[");
    const truncated = result
      .split("\n")
      .map((line) => truncateLine(line, ctx.width, hasAnsi))
      .join("\n");

    m.mermaidRendered = truncated;
  } catch (err) {
    const m = (token.meta as any);
    m.isMermaid = true;
    // Leave token.content as-is for fallback rendering
    // Do NOT set mermaidRendered -- renderer will use plain code block fallback
    const message = err instanceof Error ? err.message : String(err);
    writeDiagnostic({
      file: ctx.filePath || "<stdin>",
      line: 1,
      col: 1,
      span: 1,
      message: `Mermaid render error: ${message}`,
      severity: "error",
    });
  }
}
