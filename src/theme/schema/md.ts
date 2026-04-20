/**
 * Markdown rendering facet Zod schema.
 * Superset of the existing ThemeConfig from src/types/theme.ts.
 */
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color");

const headingStyleSchema = z
  .object({
    bold: z.boolean(),
    color: hexColor,
  })
  .strict();

export const mdThemeSchema = z
  .object({
    /** Heading styles keyed by level (1-6) */
    headings: z.record(z.string(), headingStyleSchema),
    /** Indent width for code blocks */
    codeBlockIndent: z.number().int().min(0),
    /** Character used for blockquote bar */
    blockquoteBarChar: z.string().max(2),
    /** Whether to render table borders */
    tableBorder: z.boolean(),
    /** Bullet characters for nested lists */
    listBullets: z.array(z.string()),
    /** How to format links */
    linkFormat: z.enum(["inline", "reference", "osc8"]),
    /** Character used for horizontal rules */
    hrChar: z.string().max(2),
    /** Width of horizontal rules */
    hrWidth: z.union([z.literal("full"), z.number().int().positive()]),
    /** Spacing between elements */
    elementSpacing: z.number().int().min(0),
    /** ANSI color overrides (optional) */
    boldColor: hexColor.optional(),
    italicColor: hexColor.optional(),
    codeColor: hexColor.optional(),
    codeBlockBgColor: hexColor.optional(),
    blockquoteBarColor: hexColor.optional(),
    linkColor: hexColor.optional(),
  })
  .strict();

export type MdTheme = z.infer<typeof mdThemeSchema>;
