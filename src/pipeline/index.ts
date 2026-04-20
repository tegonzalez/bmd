/**
 * Unified render pipeline: Sanitize -> Template -> Parse -> TreeBuild -> Transform -> Render.
 *
 * This is the canonical render path. The render CLI command calls this directly.
 * No side effects -- never writes to stderr, never invokes pager, never performs file I/O.
 *
 * All three rendering surfaces (terminal, browser preview, browser editor)
 * consume the same DocTree. Old code paths (renderTokens, md.render()) are removed.
 */

import { expandTemplateWithRegions } from './template-regions.ts';
import { decodeRegions } from './region-marker.ts';
import { parse } from '../parser/index.ts';
import { annotateByteRanges } from './byte-range.ts';
import { sanitize } from './sanitize.ts';
import { buildTree } from './tree-build.ts';
import { transformTree } from './transform.ts';
import { TransformCache } from './cache.ts';
import { TerminalVisitor } from './terminal-visitor.ts';
import { AsciiAdapter } from '../renderer/ascii-adapter.ts';
import { Utf8Adapter } from '../renderer/utf8-adapter.ts';
import { createAnsiLayer } from '../renderer/ansi-layer.ts';
import { createThemedAnsiLayer } from '../theme/adapt/ansi.ts';
import { DEFAULT_THEME } from '../types/theme.ts';
import { getDefaults } from '../theme/defaults.ts';
import type { Finding } from '../unicode/types.ts';
import type { UnicodeCategory } from '../unicode/types.ts';
import type { AggregationConfig } from '../unicode/aggregator.ts';
import type { BmdConfig } from '../config/schema.ts';
import type { TemplateValues, TemplateWarning } from '../template/types.ts';
import type { UnicTheme } from '../theme/schema/unic.ts';

export interface PipelineInput {
  source: string;
  config: BmdConfig;
  values?: TemplateValues;
}

export interface PipelineOutput {
  rendered: string;
  warnings: TemplateWarning[];
  findings: Finding[];
}

/** Module-level transform cache (singleton per process). Shared across terminal and preview surfaces. */
export const sharedTransformCache = new TransformCache();

/**
 * Run the unified seven-stage render pipeline.
 *
 * Stages in order:
 *   S1: Template -- expand {{expr}}
 *   S2: Sanitize -- detect dangerous content (unicode, HTML, ANSI) -> Finding[]
 *   S3: Parse -- markdown-exit .parse() + byte range annotation
 *   S4: TreeBuild -- flat Token[] + RegionMap[] + Finding[] -> DocTree
 *   S5: Transform -- Shiki highlighting, Mermaid rendering on fence nodes (cached)
 *   S6: Render -- TerminalVisitor renders DocTree to terminal string
 *   S7: PostRender -- (no post-render for terminal)
 *
 * Pure function -- no I/O, no side effects.
 * Async because Transform stage lazy-loads Shiki WASM grammars.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { source, config, values } = input;

  // Resolve theme early -- needed by S1 (uc config) and S6 (render context)
  const resolvedTheme = config.theme ?? getDefaults();

  // S1: Template expansion
  let templated = source;
  const warnings: TemplateWarning[] = [];
  let regions: import('./types.ts').RegionMap[] = [];

  if (config.templates?.enabled) {
    const result = expandTemplateWithRegions(source, values, {
      listSpec: config.templates?.list_spec,
    });
    warnings.push(...result.warnings);

    // Decode region markers before parse so marker bytes never leak to render output.
    // Keep region metadata by remapping each region's expanded range into decoded
    // (clean templated) coordinates using region id correlation.
    const decoded = decodeRegions(result.output);
    templated = decoded.cleanSource;
    // Region maps already carry clean-source expandedByteRange (see template-regions.ts)
    regions = result.regions;
  }

  // S2: Sanitize -- detect but never mutate templated source
  let findings: Finding[] = [];
  if (config.unicode !== false) {
    const ucConfig = extractAggregationConfig(resolvedTheme.unic);
    findings = sanitize(templated, config.format, ucConfig);
  }

  // S3: Parse + byte range annotation
  const { tokens } = parse(templated, false);
  annotateByteRanges(tokens, templated);

  // S4: TreeBuild -- construct DocTree from tokens + regions + findings
  const tree = buildTree(tokens, regions, findings);

  // S5: Transform -- Shiki/Mermaid on fence nodes (cached)
  await transformTree(tree, config, sharedTransformCache);

  // S6: Render -- TerminalVisitor
  const adapter = config.format === 'ascii' ? new AsciiAdapter() : new Utf8Adapter();
  const ansi = config.ansiEnabled
    ? (config.theme ? createThemedAnsiLayer(config.theme.md) : createAnsiLayer(DEFAULT_THEME))
    : null;
  const ctx = {
    width: config.width,
    format: config.format,
    ansiEnabled: config.ansiEnabled,
    theme: resolvedTheme,
    parsedSource: templated,
  };

  const visitor = new TerminalVisitor(adapter, ansi, ctx);
  const rendered = visitor.render(tree);

  // S7: PostRender -- no-op for terminal

  return { rendered, warnings, findings };
}

/**
 * Extract aggregation config from the resolved unic theme facet.
 * Transforms the per-category theme entries into the AggregationConfig
 * shape expected by the aggregator.
 */
export function extractAggregationConfig(unic: UnicTheme): AggregationConfig {
  const config: AggregationConfig = {};
  for (const [key, value] of Object.entries(unic)) {
    const cat = key as UnicodeCategory;
    if (value.mode) {
      config[cat] = {
        mode: value.mode,
        threshold: value.threshold ?? 2,
      };
    }
  }
  return config;
}
