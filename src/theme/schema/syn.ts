/**
 * Syntax highlighting facet Zod schema.
 * Controls Shiki theme selection and fallback colors.
 */
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (e.g., #e1e4e8)");

export const synThemeSchema = z
  .object({
    /** Shiki theme ID (e.g., "github-dark", "dracula") */
    shikiTheme: z.string().min(1),
    /** Fallback text color when no token color is available */
    defaultColor: hexColor,
  })
  .strict();

export type SynTheme = z.infer<typeof synThemeSchema>;
