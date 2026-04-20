import type { Token } from "../parser/index.ts";
import type { BmdConfig } from "../config/schema.ts";
import { normalizeCodeBlock } from "./code-normalize.ts";
import { highlightCodeBlock } from "./syntax-highlight.ts";
import { renderMermaidBlock } from "./mermaid-render.ts";
import { getShikiThemeName, getShikiDefaultColor } from "../theme/adapt/shiki.ts";

/**
 * Run all transform passes on the token array (mutates tokens in-place).
 *
 * Applies:
 * - Code normalization (indent removal, tab expansion, blank trimming)
 * - Syntax highlighting via Shiki (fence tokens with language info)
 * - Mermaid diagram rendering via beautiful-mermaid (fence tokens with info "mermaid")
 *
 * Transforms run BEFORE rendering, as per the pipeline architecture:
 * parse -> transform -> render
 */
export async function runTransforms(
  tokens: Token[],
  config?: BmdConfig,
): Promise<void> {
  // Pass 1: Code normalization
  for (const token of tokens) {
    if (token.type === "fence" || token.type === "code_block") {
      normalizeCodeBlock(token);
    }
  }

  // Pass 2: Syntax highlighting (async -- Shiki lazy-loads grammars)
  const synThemeName = config?.theme ? getShikiThemeName(config.theme.syn) : undefined;
  const synDefaultColor = config?.theme ? getShikiDefaultColor(config.theme.syn) : undefined;
  for (const token of tokens) {
    if (token.type === "fence" && token.info && token.info.trim() !== "mermaid") {
      await highlightCodeBlock(token, synThemeName, synDefaultColor);
    }
  }

  // Pass 3: Mermaid diagram rendering
  if (config) {
    for (const token of tokens) {
      if (
        token.type === "fence" &&
        token.info?.trim().toLowerCase() === "mermaid"
      ) {
        renderMermaidBlock(token, config);
      }
    }
  }
}
