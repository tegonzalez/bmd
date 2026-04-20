/**
 * Finding Aggregator
 *
 * Post-processes raw findings using per-category aggregation config.
 *
 * Three modes:
 *   - 'region': Never collapse (paired open/close markers)
 *   - 'aggregate': Collapse consecutive same-category runs into flood notation (e.g., "glyph x5")
 *   - 'none': Pass through individually, no aggregation
 *
 * When no config is provided, falls back to hardcoded legacy behavior
 * for backward compatibility.
 */

import type { Finding, UnicodeCategory } from './types';

/** Per-category aggregation config */
export interface CategoryAggregationConfig {
  mode: 'region' | 'aggregate' | 'none';
  threshold: number;
}

/** Map of category name to aggregation config */
export type AggregationConfig = Partial<Record<UnicodeCategory, CategoryAggregationConfig>>;

// --- Legacy fallback constants (used when config is undefined) ---

/** Legacy aggregation thresholds per category */
const LEGACY_THRESHOLDS: Partial<Record<UnicodeCategory, number>> = {
  'tag': 2,
  'variation-sel': 2,
  'pua': 2,
  'whitespace': 2,
  'ai-watermark': 2,
  'combining-flood': 3,
};

/** Legacy categories eligible for aggregation */
const LEGACY_AGGREGATABLE: Set<UnicodeCategory> = new Set(
  Object.keys(LEGACY_THRESHOLDS) as UnicodeCategory[],
);

/**
 * Aggregate consecutive same-category findings based on per-category config.
 *
 * When config is provided, each category's mode determines behavior:
 *   - 'region' or 'none': finding passes through unchanged
 *   - 'aggregate': consecutive runs meeting threshold are collapsed
 *
 * When config is undefined, uses legacy hardcoded behavior for backward compat.
 */
export function aggregateFindings(
  findings: Finding[],
  config?: AggregationConfig,
): Finding[] {
  if (findings.length === 0) return findings;

  const result: Finding[] = [];
  let i = 0;

  while (i < findings.length) {
    const current = findings[i]!;
    const catConfig = config?.[current.category]!;

    // Determine if this category should aggregate
    const shouldAggregate = config !== undefined
      ? catConfig?.mode === 'aggregate'
      : LEGACY_AGGREGATABLE.has(current.category);

    if (!shouldAggregate) {
      result.push(current);
      i++;
      continue;
    }

    // Find the end of consecutive same-category run
    let runEnd = i + 1;
    while (
      runEnd < findings.length &&
      findings[runEnd]!.category === current.category &&
      isConsecutive(findings[runEnd - 1]!, findings[runEnd]!)
    ) {
      runEnd++;
    }

    const runLength = runEnd - i;

    // Determine threshold from config or legacy fallback
    const threshold = config !== undefined
      ? (catConfig?.threshold ?? 2)
      : (LEGACY_THRESHOLDS[current.category]! ?? 2);

    if (runLength >= threshold) {
      // Collapse run into single aggregated finding
      const last = findings[runEnd - 1]!;
      const totalLength = (last.offset + last.length) - current.offset;

      // Use ASCII-style aggregation (e.g. [TAG]xN) when glyph starts with [
      const sep = current.glyph.startsWith('[') ? '' : ' ';
      result.push({
        offset: current.offset,
        length: totalLength,
        codepoint: current.codepoint,
        category: current.category,
        glyph: `${current.glyph}${sep}x${runLength}`,
        tooltip: `${runLength} consecutive ${current.category} characters`,
        isAtomic: true,
        atomicGroupId: current.atomicGroupId,
      });
    } else {
      // Below threshold: pass through individually
      for (let j = i; j < runEnd; j++) {
        result.push(findings[j]!);
      }
    }

    i = runEnd;
  }

  return result;
}

/**
 * Check if two findings are consecutive (adjacent in source with no gap).
 */
function isConsecutive(a: Finding, b: Finding): boolean {
  return a.offset + a.length === b.offset;
}
