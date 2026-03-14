import { createMarkdownExit, type Token } from "markdown-exit";

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
export function parse(source: string): ParseResult {
  const env: Record<string, any> = {};
  const tokens = md.parse(expandInlineMermaid(source), env);
  return { tokens, env };
}
