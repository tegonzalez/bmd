/**
 * Template expansion with region markers for terminal / theme decoration.
 *
 * Uses the same substitution list and canonical plain output as expandTemplate()
 * (via buildTemplateSubstitutions + expandPlainFromSubstitutions), then wraps
 * each substitution in binary region markers. Mapped and unmapped fields use the
 * same wire format; RegionMap.templateResolved distinguishes them for theming.
 */

import {
  buildTemplateSubstitutions,
  expandPlainFromSubstitutions,
} from "../template/index.js";
import type { ExpandOptions } from "../template/index.js";
import type { TemplateValues, TemplateWarning } from "../template/types.js";
import { encodeRegion } from "./region-marker.js";
import type { RegionMap, ByteRange } from "./types.js";
import { findSkipRegions, findExpressionRanges } from "../template/scanner.js";
import { decodeRegions } from "./region-marker.js";

export type { TemplateWarning } from "../template/types.js";

/**
 * Expand template expressions with region markers on every substitution span.
 *
 * Invariant: decodeRegions(output).cleanSource === expandTemplate(...).output
 * for the same source, values, and options.
 */
export function expandTemplateWithRegions(
  source: string,
  values?: TemplateValues,
  options?: ExpandOptions,
): { output: string; warnings: TemplateWarning[]; regions: RegionMap[] } {
  const skipRegions = findSkipRegions(source);
  const expressions = findExpressionRanges(source, skipRegions);

  if (expressions.length === 0) {
    return { output: source, warnings: [], regions: [] };
  }

  const warnings: TemplateWarning[] = [];
  const substitutions = buildTemplateSubstitutions(source, values, options, warnings);
  const canonicalPlain = expandPlainFromSubstitutions(source, substitutions);

  let marked = "";
  let cursor = 0;
  const regions: RegionMap[] = [];

  for (let regionId = 0; regionId < substitutions.length; regionId++) {
    const sub = substitutions[regionId]!;
    const pos = canonicalPlain.indexOf(sub.replacement, cursor);
    if (pos === -1) {
      throw new Error(
        `Template region assembly failed: replacement not found (regionId=${regionId}, cursor=${cursor})`,
      );
    }
    marked += canonicalPlain.slice(cursor, pos);
    const wrapped = encodeRegion(sub.replacement, "T", regionId);
    marked += wrapped;

    regions.push({
      id: regionId,
      type: "T",
      templateResolved: sub.templateResolved,
      originalByteRange: [sub.range.start, sub.range.end] as ByteRange,
      expandedByteRange: [0, 0] as ByteRange,
      originalContent: `{{${sub.range.raw}}}`,
      expandedContent: sub.replacement,
    });

    cursor = pos + sub.replacement.length;
  }
  marked += canonicalPlain.slice(cursor);

  const decoded = decodeRegions(marked);
  if (decoded.cleanSource !== canonicalPlain) {
    throw new Error(
      "Template region invariant failed: decoded clean source does not match canonical expansion",
    );
  }

  const decodedById = new Map(decoded.regions.map((r) => [r.id, r]));
  const merged: RegionMap[] = regions.map((r) => {
    const dr = decodedById.get(r.id);
    if (!dr) {
      throw new Error(`Template region decode missing id=${r.id}`);
    }
    return {
      ...r,
      expandedByteRange: dr.originalByteRange as ByteRange,
    };
  });

  return { output: marked, warnings, regions: merged };
}
