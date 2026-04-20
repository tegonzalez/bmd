/**
 * Transform Stage (S5) - Operates on DocTree fence nodes.
 *
 * Walks the DocTree, finds fence nodes, and applies transforms:
 * - Mermaid diagrams: renders both ASCII text art and SVG
 * - Syntax highlighting: Shiki codeToTokens
 * - Plain code: normalization only
 *
 * Results are cached by content hash (content + lang + theme) via TransformCache.
 * Replaces the old runTransforms() which operated on flat Token[].
 */

import type { DocNode } from './types.js';
import type { TransformCache, CacheEntry } from './cache.js';
import type { BmdConfig } from '../config/schema.ts';
import { normalizeCodeBlock } from '../transform/code-normalize.ts';
import { getHighlighter } from '../transform/syntax-highlight.ts';
import { getShikiThemeName, getShikiDefaultColor } from '../theme/adapt/shiki.ts';
import type { HighlighterCore } from 'shiki/core';
import { renderMermaidSVG } from 'beautiful-mermaid';
import type { AsciiRenderOptions } from 'beautiful-mermaid';
import { toMermaidTheme } from '../theme/adapt/mermaid.ts';
import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';
import { renderMermaidASCIIWidthBounded } from '../transform/mermaid-width.ts';

/**
 * Diagram types not yet supported by beautiful-mermaid's ASCII renderer.
 */
const UNSUPPORTED_TYPES = [
  'gantt', 'pie', 'journey', 'mindmap', 'timeline',
  'quadrantchart', 'sankey', 'requirement', 'gitgraph',
  'c4context', 'block',
] as const;

/**
 * Walk DocTree, find fence nodes, apply transforms (highlight, mermaid, normalize).
 * Mutates node.meta in-place with transform outputs.
 * Uses cache to avoid redundant computation.
 */
export async function transformTree(
  tree: DocNode,
  config: BmdConfig,
  cache: TransformCache,
  highlighter?: HighlighterCore,
): Promise<void> {
  const fenceNodes: DocNode[] = [];
  collectFences(tree, fenceNodes);

  for (const node of fenceNodes) {
    await transformFence(node, config, cache, highlighter);
  }
}

/**
 * Transform only fence nodes within dirty top-level blocks.
 * Non-dirty blocks are skipped entirely (their fence nodes already have
 * transform results from the previous render cycle).
 *
 * @param dirtyIndices - Indices of top-level children that changed
 */
export async function transformTreeDirty(
  tree: DocNode,
  config: BmdConfig,
  cache: TransformCache,
  dirtyIndices: number[],
  highlighter?: HighlighterCore,
): Promise<void> {
  const dirtySet = new Set(dirtyIndices);
  const fenceNodes: DocNode[] = [];

  for (let i = 0; i < tree.children.length; i++) {
    if (dirtySet.has(i)) {
      collectFences(tree.children[i]!, fenceNodes);
    }
  }

  for (const node of fenceNodes) {
    await transformFence(node, config, cache, highlighter);
  }
}

/** Recursively collect all fence/code_block nodes from the tree. */
function collectFences(node: DocNode, out: DocNode[]): void {
  if (node.type === 'fence' || node.type === 'code_block') {
    out.push(node);
  }
  for (const child of node.children) {
    collectFences(child, out);
  }
}

/**
 * Transform a single fence node:
 * 1. Code normalization (trim, indent removal)
 * 2. Cache lookup by hash(content + lang + theme)
 * 3. On miss: Mermaid rendering or Shiki highlighting
 * 4. Store result in cache
 */
async function transformFence(
  node: DocNode,
  config: BmdConfig,
  cache: TransformCache,
  highlighter?: HighlighterCore,
): Promise<void> {
  const content = node.content || '';
  const langInfo = ((node.meta.info as string) || '').trim();
  const lang = langInfo.toLowerCase();

  // Code normalization: apply to content in-place
  // (Mirrors normalizeCodeBlock but on DocNode instead of Token)
  const normalized = normalizeContent(content);
  node.content = normalized;

  // Determine theme for cache key
  const synThemeName = config.theme ? getShikiThemeName(config.theme.syn) : 'github-dark';

  // Check cache
  const cached = cache.get(normalized, lang, synThemeName);
  if (cached) {
    applyCacheEntry(node, cached);
    return;
  }

  const entry: CacheEntry = {};

  if (lang === 'mermaid') {
    // Mermaid rendering: produce both text art and SVG
    await transformMermaid(node, normalized, config, entry);
  } else if (langInfo) {
    // Syntax highlighting via Shiki
    await transformHighlight(node, normalized, langInfo, config, entry, highlighter);
  }
  // else: plain code, no extra transforms needed

  // Store in cache
  cache.set(normalized, lang, synThemeName, entry);

  // Apply to node
  applyCacheEntry(node, entry);
}

/** Apply cached transform outputs to a fence node. */
function applyCacheEntry(node: DocNode, entry: CacheEntry): void {
  if (entry.highlightTokens) node.meta.highlightTokens = entry.highlightTokens;
  if (entry.mermaidText !== undefined) node.meta.mermaidRendered = entry.mermaidText;
  if (entry.mermaidSvg !== undefined) node.meta.mermaidSvg = entry.mermaidSvg;
  if (entry.isMermaid) node.meta.isMermaid = true;
  if (entry.mermaidUnsupported) node.meta.mermaidUnsupported = entry.mermaidUnsupported;
}

/** Normalize code content (mirrors normalizeCodeBlock but returns string). */
function normalizeContent(content: string): string {
  let lines = content.split('\n');

  // Trim leading blank lines
  while (lines.length > 0 && lines[0]!.trim() === '') {
    lines.shift();
  }

  // Trim trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) return '';

  // Expand tabs
  const tabSpaces = '    ';
  lines = lines.map((line) => line.replace(/\t/g, tabSpaces));

  // Remove incidental indent
  const nonEmptyLines = lines.filter((l) => l.trim() !== '');
  if (nonEmptyLines.length > 0) {
    const minIndent = Math.min(
      ...nonEmptyLines.map((l) => {
        const match = l.match(/^(\s*)/);
        return match![1]!.length;
      }),
    );
    if (minIndent > 0) {
      lines = lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l));
    }
  }

  return lines.join('\n');
}

/** Transform a mermaid fence node. */
async function transformMermaid(
  node: DocNode,
  content: string,
  config: BmdConfig,
  entry: CacheEntry,
): Promise<void> {
  entry.isMermaid = true;
  const firstLine = content.trim().split('\n')[0]!?.trim().toLowerCase() ?? '';

  // Check for unsupported diagram types
  for (const unsupportedType of UNSUPPORTED_TYPES) {
    if (firstLine.startsWith(unsupportedType)) {
      entry.mermaidUnsupported = unsupportedType;
      writeDiagnostic({
        file: config.filePath || '<stdin>',
        line: 1,
        col: 1,
        span: unsupportedType.length,
        message: `Unsupported Mermaid diagram type: ${unsupportedType}`,
        severity: Severity.DiagWarn,
        context: content,
      });
      return;
    }
  }

  // Build rendering options
  const mermaidColors = config.theme?.mer
    ? toMermaidTheme(config.theme.mer)
    : { fg: '#e4e4e7', border: '#a1a1aa', line: '#a1a1aa', arrow: '#d4d4d8' };

  const options: AsciiRenderOptions = {
    useAscii: config.format === 'ascii',
    colorMode: config.ansiEnabled ? 'truecolor' : 'none',
    paddingX: 2,
    paddingY: 2,
    boxBorderPadding: 1,
    maxWidth: config.width,
    theme: config.ansiEnabled ? mermaidColors : undefined,
  };

  try {
    entry.mermaidText = renderMermaidASCIIWidthBounded(content, options, config.width);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeDiagnostic({
      file: config.filePath || '<stdin>',
      line: 1,
      col: 1,
      span: content.trim().split('\n')[0]!?.length ?? 1,
      message: `Mermaid render error: ${message}`,
      severity: Severity.DiagError,
      context: content,
    });
    // No mermaidText set -- visitor will use plain code block fallback
  }

  // SVG rendering for browser preview (always produce both per CONTEXT.md)
  try {
    entry.mermaidSvg = renderMermaidSVG(content, { transparent: true });
  } catch (err) {
    writeDiagnostic({
      file: config.filePath || '<stdin>',
      line: 1, col: 1, span: 1,
      message: `Mermaid SVG render failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: Severity.DiagError,
      context: content,
    });
  }
}

/** Transform a fence node with syntax highlighting. */
async function transformHighlight(
  _node: DocNode,
  content: string,
  lang: string,
  config: BmdConfig,
  entry: CacheEntry,
  externalHighlighter?: HighlighterCore,
): Promise<void> {
  const synThemeName = config.theme ? getShikiThemeName(config.theme.syn) : 'github-dark';
  const defaultColor = config.theme ? getShikiDefaultColor(config.theme.syn) : '#e1e4e8';

  // WASM guard: skip Oniguruma-based highlighting in browser when no external
  // highlighter is provided. The browser preview passes its own JS-regex-engine
  // highlighter via externalHighlighter; this guard only fires if that's missing.
  if (!externalHighlighter && (globalThis as any).__BMD_BROWSER__) {
    writeDiagnostic({ file: 'src/pipeline/transform.ts', line: 275, col: 5, span: 0, message: 'Skipping WASM highlighter in browser context', severity: Severity.Info });
    return;
  }

  try {
    const highlighter = externalHighlighter ?? await getHighlighter(synThemeName);

    // Load language on demand — shiki plaintext aliases are built-in and need no loading
    const SHIKI_PLAINTEXT = new Set(['text', 'plaintext', 'plain', 'txt']);
    const loaded = highlighter.getLoadedLanguages();
    if (!loaded.includes(lang) && !SHIKI_PLAINTEXT.has(lang)) {
      await highlighter.loadLanguage(
        import(`@shikijs/langs/${lang}`) as any,
      );
    }

    const loadedThemes = highlighter.getLoadedThemes();
    const themeName = loadedThemes.includes(synThemeName) ? synThemeName : 'github-dark';

    const { tokens: highlighted } = highlighter.codeToTokens(content, {
      lang,
      theme: themeName,
    });

    // Map to HighlightToken[][]
    entry.highlightTokens = highlighted.map((line: any[]) =>
      line.map((t: any) => ({
        content: t.content,
        color: normalizeColor(t.color, defaultColor),
        fontStyle: t.fontStyle ?? 0,
      })),
    );
  } catch (err) {
    writeDiagnostic({
      file: config.filePath || '<stdin>',
      line: 1, col: 1, span: 1,
      message: `Syntax highlight failed for lang="${lang}": ${err instanceof Error ? err.message : String(err)}`,
      severity: Severity.DiagWarn,
      context: content,
    });
  }
}

/** Strip alpha from 9-char hex colors. */
function normalizeColor(color: string | undefined, defaultColor: string): string {
  if (!color) return defaultColor;
  if (color.length === 9) return color.slice(0, 7);
  return color;
}

