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

import type { AsciiRenderOptions } from "beautiful-mermaid";
import { writeDiagnostic, Severity } from "../diagnostics/formatter.ts";
import type { Token } from "../parser/index.ts";
import type { BmdConfig } from "../config/schema.ts";
import { toMermaidTheme } from "../theme/adapt/mermaid.ts";
import { renderMermaidASCIIWidthBounded } from "./mermaid-width.ts";

type MermaidRenderConfig = Pick<BmdConfig, "format" | "ansiEnabled" | "width"> &
  Partial<Pick<BmdConfig, "filePath" | "theme">>;

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
export function renderMermaidBlock(token: Token, config: MermaidRenderConfig): void {
  const source = token.content || "";
  const meta = token.meta as any;

  // Ensure meta is an object
  if (!token.meta) {
    (token as any).meta = {};
  }

  const firstLine = source.trim().split("\n")[0]!?.trim().toLowerCase() ?? "";

  // Check for unsupported diagram types
  for (const unsupportedType of UNSUPPORTED_TYPES) {
    if (firstLine.startsWith(unsupportedType)) {
      const m = (token.meta as any);
      m.isMermaid = true;
      m.mermaidUnsupported = unsupportedType;
      writeDiagnostic({
        file: config.filePath || "<stdin>",
        line: 1,
        col: 1,
        span: unsupportedType.length,
        message: `Unsupported Mermaid diagram type: ${unsupportedType}`,
        severity: Severity.DiagWarn,
        context: source,
      });
      return;
    }
  }

  // Build rendering options — use theme-driven colors when available
  const mermaidColors = config.theme?.mer
    ? toMermaidTheme(config.theme.mer)
    : { fg: "#e4e4e7", border: "#a1a1aa", line: "#a1a1aa", arrow: "#d4d4d8" };

  const options: AsciiRenderOptions = {
    useAscii: config.format === "ascii",
    colorMode: config.ansiEnabled ? "truecolor" : "none",
    paddingX: 2,
    paddingY: 2,
    boxBorderPadding: 1,
    maxWidth: config.width,
    theme: config.ansiEnabled ? mermaidColors : undefined,
  };

  try {
    const m = (token.meta as any);
    m.isMermaid = true;
    m.mermaidRendered = renderMermaidASCIIWidthBounded(source, options, config.width);
  } catch (err) {
    const m = (token.meta as any);
    m.isMermaid = true;
    // Leave token.content as-is for fallback rendering
    // Do NOT set mermaidRendered -- renderer will use plain code block fallback
    const message = err instanceof Error ? err.message : String(err);
    writeDiagnostic({
      file: config.filePath || "<stdin>",
      line: 1,
      col: 1,
      span: source.trim().split("\n")[0]!?.length ?? 1,
      message: `Mermaid render error: ${message}`,
      severity: Severity.DiagError,
      context: source,
    });
  }
}
