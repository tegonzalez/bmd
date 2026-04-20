/**
 * Markdown preview rendering pipeline.
 *
 * Uses HtmlVisitor on a shared DocTree instead of md.render().
 * Shares the same sanitize -> parse -> tree-build -> transform -> render
 * pipeline stages as the terminal path. DOMPurify provides defense-in-depth
 * as PostRender (S7).
 *
 * Incremental rendering: retains previous DocTree and source between calls.
 * On subsequent renders, diffs old vs new source to find dirty blocks,
 * merges the trees, and only re-transforms fence nodes within dirty blocks.
 * Falls back to full pipeline on first render or structural changes.
 */

import DOMPurify from 'dompurify';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { parse } from '../parser/index';
import { annotateByteRanges } from '../pipeline/byte-range';
import { sanitize } from '../pipeline/sanitize';
import { expandTemplateWithRegions } from '../pipeline/template-regions';
import { decodeRegions } from '../pipeline/region-marker';
import { buildTree } from '../pipeline/tree-build';
import { transformTree, transformTreeDirty } from '../pipeline/transform';
import { findDirtyBlocks, incrementalUpdate } from '../pipeline/incremental';
import { sharedTransformCache, extractAggregationConfig } from '../pipeline/index';
import { SERVE_DEFAULTS } from '../config/bmd-defaults.ts';
import { DEFAULT_UNIC } from '../theme/defaults';
import { HtmlVisitor } from '../pipeline/html-visitor';
import type { DocNode } from '../pipeline/types';
import type { Finding } from '../unicode/types';
import type { RegionMap } from '../pipeline/types';
import type { TemplateValues } from '../template/types';

let highlighter: HighlighterCore | null = null;

/** Retained state for incremental rendering between calls */
let prevTree: DocNode | null = null;
let prevTemplatedSource: string | null = null;

/** DOMPurify config that preserves SVG elements and unicode glyph spans */
export const SANITIZE_CONFIG = {
  ADD_TAGS: [
    'svg', 'path', 'g', 'rect', 'text', 'line', 'polyline',
    'polygon', 'circle', 'ellipse', 'defs', 'marker',
    'style', 'tspan', 'foreignObject',
    'span', // unicode glyph spans
  ],
  ADD_ATTR: [
    'viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width',
    'transform', 'x', 'y', 'width', 'height', 'cx', 'cy',
    'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points',
    'marker-end', 'marker-start', 'text-anchor',
    'dominant-baseline', 'font-family', 'font-size',
    'font-weight', 'class', 'style', 'dx', 'dy',
    'refX', 'refY', 'orient', 'markerWidth', 'markerHeight',
    'title', // glyph span tooltips
    'data-region-id', // template region identifiers
  ],
};

// Transform cache removed -- uses sharedTransformCache from pipeline/index.ts

/**
 * Initialize the Shiki highlighter (async, call once at startup).
 * Uses JavaScript RegExp engine to avoid WASM loading issues in browser bundles.
 */
export async function initPreviewRenderer(): Promise<void> {
  highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/github-dark'),
      import('@shikijs/themes/github-light'),
    ],
    langs: [
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/python'),
      import('@shikijs/langs/css'),
      import('@shikijs/langs/html'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/bash'),
      import('@shikijs/langs/markdown'),
    ],
    engine: createJavaScriptRegexEngine(),
  });
}

/**
 * Preview pipeline config -- minimal BmdConfig for browser context.
 */
const previewConfig = {
  format: 'utf8' as const,
  width: 120,
  ansiEnabled: false,
  pager: 'never' as const,
  unsafeHtml: false,
  unicode: true,
  filePath: undefined,
  theme: undefined,
  templates: {
    enabled: false,
    map: undefined,
    auto_map: false,
    list_spec: undefined,
  },
  undo: {
    groupDelay: 500,
    depth: 100,
  },
  serve: { ...SERVE_DEFAULTS },
};

/**
 * Render Markdown source to sanitized HTML and inject into the target element.
 * Uses the unified pipeline: Sanitize -> Template -> Parse -> TreeBuild -> Transform -> HtmlVisitor -> DOMPurify.
 *
 * Incremental path: on subsequent renders, diffs against previous source to
 * find dirty blocks, patches the tree via incrementalUpdate, and only
 * re-transforms fence nodes within dirty top-level blocks. Falls back to
 * full pipeline on first render or when block count changes (structural edit).
 *
 * Returns findings and regions for the editor decoration pipeline to consume
 * (detect once, render everywhere).
 *
 * @param source - Raw markdown source (unexpanded -- template expansion happens at S2)
 * @param targetEl - DOM element to inject rendered HTML into
 * @param unsafeHtml - Whether to allow unsafe HTML passthrough
 * @param templateValues - Template values for S2 expansion (optional)
 * @param templatesEnabled - Whether template expansion is active (default false)
 */
export async function renderPreview(
  source: string,
  targetEl: HTMLElement,
  unsafeHtml?: boolean,
  templateValues?: TemplateValues,
  templatesEnabled?: boolean,
): Promise<{ findings: Finding[]; regions: RegionMap[] }> {
  // S1: Template expansion with region markers
  let templated = source;
  let regions: RegionMap[] = [];

  if (templatesEnabled) {
    const result = expandTemplateWithRegions(source, templateValues, {
      listSpec: previewConfig.templates?.list_spec,
    });
    const decoded = decodeRegions(result.output);
    templated = decoded.cleanSource;
    regions = result.regions;
  }

  // S2: Sanitize -- detect dangerous content on templated source
  const ucConfig = extractAggregationConfig(DEFAULT_UNIC);
  const findings = sanitize(templated, 'utf8', ucConfig);

  // Incremental path: if we have a previous tree and source, try to
  // diff and only re-transform dirty blocks
  if (prevTree && prevTemplatedSource !== null) {
    const { dirtyIndices } = findDirtyBlocks(prevTemplatedSource, templated, prevTree);

    if (dirtyIndices.length === 0 && prevTemplatedSource === templated) {
      // No changes at all -- reuse previous render entirely
      return { findings, regions };
    }

    // Use incrementalUpdate to get the merged tree
    const mergedTree = incrementalUpdate(prevTree, prevTemplatedSource, templated, findings, regions);

    // S5: Transform only dirty fence nodes (non-dirty already have meta from previous cycle)
    // If structural change occurred (different block count), incrementalUpdate returns a
    // fresh tree from full re-parse, so transformTreeDirty would miss fence nodes.
    // Detect structural change by checking if block count changed.
    const structuralChange = prevTree.children.length !== mergedTree.children.length;

    if (structuralChange) {
      // Full transform -- structural change means all blocks are new
      await transformTree(mergedTree, previewConfig, sharedTransformCache, highlighter ?? undefined);
    } else {
      // Selective transform -- only dirty blocks
      await transformTreeDirty(mergedTree, previewConfig, sharedTransformCache, dirtyIndices, highlighter ?? undefined);
    }

    // S6: Render via HtmlVisitor
    const html = new HtmlVisitor().render(mergedTree);

    // S7: PostRender -- DOMPurify sanitize before DOM injection
    targetEl.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);

    // Retain state for next incremental render
    prevTree = mergedTree;
    prevTemplatedSource = templated;

    return { findings, regions };
  }

  // Full pipeline path (first render or no previous state)

  // S3: Parse + byte range annotation
  const { tokens } = parse(templated, false);
  annotateByteRanges(tokens, templated);

  // S4: TreeBuild -- regions flow through from S2
  const tree = buildTree(tokens, regions, findings);

  // S5: Transform (Shiki, Mermaid on fence nodes) -- shared cache
  await transformTree(tree, previewConfig, sharedTransformCache, highlighter ?? undefined);

  // S6: Render via HtmlVisitor
  const html = new HtmlVisitor().render(tree);

  // S7: PostRender -- DOMPurify sanitize before DOM injection
  targetEl.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);

  // Retain state for next incremental render
  prevTree = tree;
  prevTemplatedSource = templated;

  // Return findings and regions for editor pipeline consumption
  return { findings, regions };
}

/**
 * Reset incremental rendering state.
 * Called when the document is replaced entirely (e.g., file switch).
 */
export function resetIncrementalState(): void {
  prevTree = null;
  prevTemplatedSource = null;
}
