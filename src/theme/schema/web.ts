/**
 * Browser preview facet Zod schema.
 * Maps to CSS custom properties in the web preview.
 */
import { z } from "zod";

const colorPaletteSchema = z
  .object({
    /** Background color */
    bg: z.string(),
    /** Foreground/text color */
    fg: z.string(),
    /** Accent color (links, active elements) */
    accent: z.string(),
    /** Border color */
    border: z.string(),
    /** Code block background */
    codeBg: z.string(),
    /** Code block foreground */
    codeFg: z.string(),
  })
  .strict();

export const webThemeSchema = z
  .object({
    /** Primary font family */
    fontFamily: z.string(),
    /** Monospace font family */
    monoFontFamily: z.string(),
    /** Max content width (CSS value) */
    maxWidth: z.string(),
    /** Spacing unit in pixels */
    spacing: z.number().int().min(0),
    /** Base font size in pixels */
    fontSize: z.number().int().min(8).max(72),
    /** Day mode color palette */
    day: colorPaletteSchema,
    /** Night mode color palette */
    night: colorPaletteSchema,
  })
  .strict();

export type WebTheme = z.infer<typeof webThemeSchema>;
