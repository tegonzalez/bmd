/**
 * Mermaid diagram facet Zod schema.
 * Compatible with beautiful-mermaid's DiagramColors and AsciiTheme interfaces.
 */
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color");

export const merThemeSchema = z
  .object({
    /** Foreground/text color */
    fg: hexColor,
    /** Box border color */
    border: hexColor,
    /** Connecting line color */
    line: hexColor,
    /** Arrow/edge color */
    arrow: hexColor,
    /** Box corner character (optional, for ASCII rendering) */
    corner: z.string().optional(),
    /** Line junction character (optional, for ASCII rendering) */
    junction: z.string().optional(),
    /** Node fill color override (optional) */
    nodeFill: hexColor.optional(),
    /** Edge color override (optional) */
    edgeColor: hexColor.optional(),
    /** Label color override (optional) */
    labelColor: hexColor.optional(),
  })
  .strict();

export type MerTheme = z.infer<typeof merThemeSchema>;
