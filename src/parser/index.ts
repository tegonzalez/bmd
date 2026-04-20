import { createMarkdownExit, type Token } from "markdown-exit";
import { writeDiagnostic, offsetToLineCol, Severity } from "../diagnostics/formatter.ts";

export type { Token };

export interface ParseResult {
  tokens: Token[];
  env: Record<string, any>;
}

/**
 * Singleton markdown-exit instance configured for terminal rendering.
 * - html: false -- block raw HTML for safety
 * - linkify: true -- auto-convert URL-like text to links
 * - typographer: false -- keep quotes/dashes as-is for terminal
 */
const md = createMarkdownExit({
  html: false,
  linkify: true,
  typographer: false,
});

/** Unsafe parser instance with HTML enabled */
const unsafeMd = createMarkdownExit({
  html: true,
  linkify: true,
  typographer: false,
});

/**
 * Expand inline mermaid fences into proper multi-line fenced blocks.
 *
 * Detects patterns like:
 *   ```mermaid;graph LR; A --> B; B --> C```
 * and expands to:
 *   ```mermaid
 *   graph LR
 *   A --> B
 *   B --> C
 *   ```
 *
 * This lets users write one-liner mermaid in pipes/shell without
 * needing literal newlines. The first `;` after `mermaid` is the
 * delimiter between the fence info and the diagram body; subsequent
 * `;` are standard Mermaid line separators.
 */
function expandInlineMermaid(source: string): string {
  // Match ```mermaid followed by ; then body then closing ```.
  // The body may contain real newlines and/or semicolons — both become line breaks.
  // Optional whitespace allowed around the first ; delimiter.
  return source.replace(
    /^(`{3,})mermaid\s*;([\s\S]+?)\1\s*$/gm,
    (_match, fence: string, body: string) => {
      const lines = body
        .split(/[;\n]/)
        .map(s => s.trim())
        .filter(Boolean);
      return `${fence}mermaid\n${lines.join("\n")}\n${fence}`;
    },
  );
}

/**
 * Parse Markdown source into a token stream.
 *
 * Returns the flat token array and the env object which contains
 * reference definitions (env.references) populated during parsing.
 */
export function parse(source: string, unsafeHtml: boolean = false): ParseResult {
  const env: Record<string, any> = {};
  const parser = unsafeHtml ? unsafeMd : md;
  const tokens = parser.parse(expandInlineMermaid(source), env);
  return { tokens, env };
}

/**
 * Strip fenced code blocks and inline code spans from source
 * so HTML detection does not false-positive on code content.
 */
function stripCodeRegions(source: string): string {
  // Remove fenced code blocks (``` or ~~~)
  let result = source.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?\n\1\s*$/gm, (m) =>
    '\n'.repeat((m.match(/\n/g) || []).length),
  );
  // Remove inline code spans (preserve newlines for offset alignment)
  result = result.replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
  return result;
}

/**
 * Check if source contains raw HTML outside code regions and emit a diagnostic.
 * Only emits ONE aggregate diagnostic per call, not per occurrence.
 */
export function checkHtmlContent(source: string, filePath?: string): void {
  const stripped = stripCodeRegions(source);
  const htmlPattern = /<\/?[a-zA-Z][^>]*>/;
  const match = htmlPattern.exec(stripped);
  if (match) {
    const pos = offsetToLineCol(stripped, match.index);
    writeDiagnostic({
      file: filePath ?? "<stdin>",
      line: pos.line,
      col: pos.col,
      span: match[0]!.length,
      message: "Raw HTML was escaped as literal text. Use --unsafe-html to render.",
      severity: Severity.DiagWarn,
      context: source,
    });
  }
}
