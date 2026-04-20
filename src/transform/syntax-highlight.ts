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
import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';

/** Cache highlighters by theme name to avoid re-creation */
const highlighterCache = new Map<string, Promise<HighlighterCore>>();

/**
 * Get or create a Shiki highlighter for the specified theme.
 * Uses Oniguruma WASM engine. Languages are loaded on demand.
 *
 * @param synThemeName - Shiki theme name (default: 'github-dark')
 */
export function getHighlighter(synThemeName: string = 'github-dark'): Promise<HighlighterCore> {
  const cached = highlighterCache.get(synThemeName);
  if (cached) return cached;

  const promise = createHighlighterCore({
    themes: [import(`@shikijs/themes/${synThemeName}`)],
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }).catch(() => {
    // If theme import or WASM fails, fall back to github-dark with JS engine
    highlighterCache.delete(synThemeName);
    if (synThemeName !== 'github-dark') {
      // Theme not found -- fall back to github-dark
      return getHighlighter('github-dark');
    }
    return import('shiki/engine/javascript').then(({ createJavaScriptRegexEngine }) =>
      createHighlighterCore({
        themes: [import('@shikijs/themes/github-dark')],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      })
    );
  });

  highlighterCache.set(synThemeName, promise);
  return promise;
}

/**
 * Strip alpha channel from 9-char hex colors (#RRGGBBAA -> #RRGGBB).
 *
 * @param color - The color string from Shiki
 * @param defaultColor - Fallback color (defaults to github-dark text color)
 */
function normalizeColor(color: string | undefined, defaultColor: string = '#e1e4e8'): string {
  if (!color) return defaultColor;
  if (color.length === 9) return color.slice(0, 7);
  return color;
}

/**
 * Highlight a fence token using Shiki.
 *
 * - If no language info or language is "mermaid", returns early.
 * - If language is unknown, returns early (silent fallback per SYNT-02).
 * - On success, stores HighlightToken[][] in token.meta.highlightTokens.
 *
 * @param token - The fence token to highlight
 * @param synThemeName - Shiki theme name (default: 'github-dark')
 * @param defaultColor - Fallback text color for the theme
 */
export async function highlightCodeBlock(
  token: Token,
  synThemeName: string = 'github-dark',
  defaultColor: string = '#e1e4e8',
): Promise<void> {
  const lang = (token.info || '').trim();
  if (!lang || lang === 'mermaid') return;

  const highlighter = await getHighlighter(synThemeName);

  // Try to load the language on demand — shiki plaintext aliases are built-in and need no loading
  const SHIKI_PLAINTEXT = new Set(['text', 'plaintext', 'plain', 'txt']);
  try {
    const loaded = highlighter.getLoadedLanguages();
    if (!loaded.includes(lang) && !SHIKI_PLAINTEXT.has(lang)) {
      await highlighter.loadLanguage(
        import(`@shikijs/langs/${lang}`) as any
      );
    }
  } catch (err) {
    writeDiagnostic({
      file: '<highlighter>',
      line: 1, col: 1, span: 0,
      message: `Syntax highlight failed for lang="${lang}": ${err instanceof Error ? err.message : String(err)}`,
      severity: Severity.DiagWarn,
    });
    return;
  }

  // Use the theme that was loaded into this highlighter
  const loadedThemes = highlighter.getLoadedThemes();
  const themeName = loadedThemes.includes(synThemeName) ? synThemeName : 'github-dark';

  const { tokens: highlighted } = highlighter.codeToTokens(token.content || '', {
    lang,
    theme: themeName,
  });

  // Map Shiki ThemedToken[][] to HighlightToken[][]
  const highlightTokens: HighlightToken[][] = highlighted.map(line =>
    line.map(t => ({
      content: t.content,
      color: normalizeColor(t.color, defaultColor),
      fontStyle: t.fontStyle ?? 0,
    }))
  );

  token.meta = token.meta || {};
  (token.meta as any).highlightTokens = highlightTokens;
}
