/**
 * Unicode detection facet Zod schema.
 * Controls per-category styling and aggregation behavior for invisible Unicode glyph substitutions.
 *
 * Each category has:
 *   - Style fields (fg, bg, bold, underline) for rendering
 *   - Aggregation fields (mode, threshold, closer, glyphs) for controlling how consecutive findings collapse
 *
 * Three aggregation modes:
 *   - 'region': Paired open/close markers (e.g., bidi overrides). Never aggregated.
 *   - 'aggregate': Consecutive findings collapse with count notation (e.g., "glyph x5") when run meets threshold.
 *   - 'none': Every finding passes through individually. No aggregation.
 */
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (e.g., #e06c75)");

/** Aggregation mode enum */
export const aggregationModeSchema = z.enum(['region', 'aggregate', 'none']);
export type AggregationMode = z.infer<typeof aggregationModeSchema>;

/**
 * Per-category config schema: style + aggregation.
 * All aggregation fields are optional with sensible defaults for backward compatibility.
 */
const categoryConfigSchema = z.object({
  /** Foreground color (required) */
  fg: hexColor,
  /** Background color (optional) */
  bg: hexColor.optional(),
  /** Bold (optional) */
  bold: z.boolean().optional(),
  /** Underline (optional) */
  underline: z.boolean().optional(),
  /** Aggregation mode: region (never collapse), aggregate (threshold-based), none (pass-through) */
  mode: aggregationModeSchema.optional(),
  /** Minimum consecutive count to trigger aggregation (only for mode='aggregate') */
  threshold: z.number().int().min(1).optional(),
  /** Codepoint of closer character for region mode pairs */
  closer: z.number().int().optional(),
  /** Per-codepoint glyph overrides: hex codepoint string -> glyph string */
  glyphs: z.record(z.string(), z.string()).optional(),
});

export const unicThemeSchema = z.object({
  'zero-width': categoryConfigSchema,
  'bidi': categoryConfigSchema,
  'template-region': categoryConfigSchema,
  /** Styling for unresolved / literal {{...}} template spans (same markers as resolved) */
  'template-unresolved': categoryConfigSchema,
  'tag': categoryConfigSchema,
  'c0-control': categoryConfigSchema,
  'c1-control': categoryConfigSchema,
  'ansi-escape': categoryConfigSchema,
  'whitespace': categoryConfigSchema,
  'pua': categoryConfigSchema,
  'ai-watermark': categoryConfigSchema,
  'variation-sel': categoryConfigSchema,
  'annotation': categoryConfigSchema,
  'deprecated': categoryConfigSchema,
  'noncharacter': categoryConfigSchema,
  'separator': categoryConfigSchema,
  'combining-flood': categoryConfigSchema,
  'unclassified': categoryConfigSchema,
}).strict();

export type UnicTheme = z.infer<typeof unicThemeSchema>;
