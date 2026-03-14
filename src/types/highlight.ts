/**
 * Shared highlight token types for syntax highlighting.
 *
 * HighlightToken is the shared representation consumed by both terminal (ANSI)
 * and browser (HTML) renderers, satisfying SYNT-03.
 */

/**
 * A single syntax highlight token with color and font style information.
 * fontStyle is a bitmask: 0=none, 1=italic, 2=bold, 4=underline.
 */
export interface HighlightToken {
  content: string;
  color: string;
  fontStyle: number;
}

/**
 * Extended metadata stored on fence/code_block tokens after transform passes.
 * Extends the base token.meta shape used by markdown-exit.
 */
export interface CodeBlockMeta {
  highlightTokens?: HighlightToken[][];
  originalContent?: string;
  isMermaid?: boolean;
  mermaidRendered?: string;
  mermaidUnsupported?: string;
}
