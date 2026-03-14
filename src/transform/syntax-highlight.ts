/**
 * Shiki-powered syntax highlighting transform pass.
 *
 * Provides a singleton highlighter and a transform function that adds
 * HighlightToken[][] to fence tokens with recognized languages.
 *
 * Unknown languages fall back silently (SYNT-02).
 * The HighlightToken shared representation satisfies SYNT-03.
 */

import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import type { Token } from '../parser/index.ts';
import type { HighlightToken } from '../types/highlight.ts';

let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * Get or create the singleton Shiki highlighter.
 * Uses Oniguruma WASM engine with GitHub Dark theme.
 * Languages are loaded on demand.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark')],
      langs: [],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    }).catch((err) => {
      // If WASM fails (e.g., in some Bun versions), try JS engine
      highlighterPromise = null;
      return import('shiki/engine/javascript').then(({ createJavaScriptRegExpEngine }) =>
        createHighlighterCore({
          themes: [import('@shikijs/themes/github-dark')],
          langs: [],
          engine: createJavaScriptRegExpEngine(),
        })
      );
    });
  }
  return highlighterPromise;
}

/**
 * Strip alpha channel from 9-char hex colors (#RRGGBBAA -> #RRGGBB).
 */
function normalizeColor(color: string | undefined): string {
  if (!color) return '#e1e4e8'; // default text color for github-dark
  if (color.length === 9) return color.slice(0, 7);
  return color;
}

/**
 * Highlight a fence token using Shiki.
 *
 * - If no language info or language is "mermaid", returns early.
 * - If language is unknown, returns early (silent fallback per SYNT-02).
 * - On success, stores HighlightToken[][] in token.meta.highlightTokens.
 */
export async function highlightCodeBlock(token: Token): Promise<void> {
  const lang = (token.info || '').trim();
  if (!lang || lang === 'mermaid') return;

  const highlighter = await getHighlighter();

  // Try to load the language on demand
  try {
    const loaded = highlighter.getLoadedLanguages();
    if (!loaded.includes(lang)) {
      await highlighter.loadLanguage(
        import(`@shikijs/langs/${lang}`) as any
      );
    }
  } catch {
    // Unknown language: fall back silently to plain text (SYNT-02)
    return;
  }

  const { tokens: highlighted } = highlighter.codeToTokens(token.content || '', {
    lang,
    theme: 'github-dark',
  });

  // Map Shiki ThemedToken[][] to HighlightToken[][]
  const highlightTokens: HighlightToken[][] = highlighted.map(line =>
    line.map(t => ({
      content: t.content,
      color: normalizeColor(t.color),
      fontStyle: t.fontStyle ?? 0,
    }))
  );

  token.meta = token.meta || {};
  (token.meta as any).highlightTokens = highlightTokens;
}
