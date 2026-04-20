/**
 * Default theme values for each facet.
 * These match the existing hardcoded values across the codebase.
 */

import type { SynTheme } from "./schema/syn";
import type { MdTheme } from "./schema/md";
import type { MerTheme } from "./schema/mer";
import type { WebTheme } from "./schema/web";
import type { UnicTheme } from "./schema/unic";
import type { ResolvedTheme } from "./types";

/** Default syntax highlighting theme -- matches current hardcoded "github-dark" */
export const DEFAULT_SYN: SynTheme = {
  shikiTheme: "github-dark",
  defaultColor: "#e1e4e8",
};

/** Default markdown rendering theme -- matches existing DEFAULT_THEME from src/types/theme.ts */
export const DEFAULT_MD: MdTheme = {
  headings: {
    "1": { bold: true, color: "#00ffff" },
    "2": { bold: true, color: "#00ff00" },
    "3": { bold: true, color: "#ffff00" },
    "4": { bold: true, color: "#5f87ff" },
    "5": { bold: true, color: "#ff00ff" },
    "6": { bold: true, color: "#ffffff" },
  },
  codeBlockIndent: 4,
  blockquoteBarChar: "|",
  tableBorder: true,
  listBullets: ["*", "-", "+"],
  linkFormat: "inline",
  hrChar: "-",
  hrWidth: "full",
  elementSpacing: 1,
};

/** Default mermaid diagram theme -- matches hardcoded zinc-dark colors from renderMermaidBlock */
export const DEFAULT_MER: MerTheme = {
  fg: "#e4e4e7",
  border: "#a1a1aa",
  line: "#a1a1aa",
  arrow: "#d4d4d8",
};

/** Default web preview theme -- extracted from src/web/styles.css custom properties */
export const DEFAULT_WEB: WebTheme = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  monoFontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace",
  maxWidth: "900px",
  spacing: 24,
  fontSize: 15,
  day: {
    bg: "#ffffff",
    fg: "#1a1a2e",
    accent: "#2563eb",
    border: "#dddddd",
    codeBg: "#f4f4f4",
    codeFg: "#1a1a2e",
  },
  night: {
    bg: "#1a1a2e",
    fg: "#e0e0e0",
    accent: "#60a5fa",
    border: "#2a2a4a",
    codeBg: "#0d1117",
    codeFg: "#e0e0e0",
  },
};

/** Default unicode detection theme -- matches themes/unic/default.yaml
 *
 * Aggregation modes:
 *   - region: paired open/close markers, never aggregated (bidi, annotation)
 *   - aggregate: consecutive findings collapse with count notation (ai-watermark, tag, variation-sel, pua, whitespace, combining-flood)
 *   - none: every finding passes through individually (zero-width, c0-control, c1-control, ansi-escape, deprecated, noncharacter, separator)
 */
export const DEFAULT_UNIC: UnicTheme = {
  'zero-width': { fg: '#e06c75', mode: 'none' },
  'bidi': { fg: '#e5c07b', bg: '#3e3022', bold: true, mode: 'region' },
  'template-region': { fg: '#60a5fa', bg: '#1e293b', mode: 'none' },
  'template-unresolved': { fg: '#94a3b8', bg: '#1e293b', mode: 'none' },
  'tag': { fg: '#c678dd', mode: 'aggregate', threshold: 2 },
  'c0-control': { fg: '#e06c75', mode: 'none' },
  'c1-control': { fg: '#e06c75', mode: 'none' },
  'ansi-escape': { fg: '#e06c75', bg: '#2c1a1a', bold: true, mode: 'none' },
  'whitespace': { fg: '#7f848e', mode: 'aggregate', threshold: 2 },
  'pua': { fg: '#c678dd', mode: 'aggregate', threshold: 2 },
  'ai-watermark': { fg: '#61afef', mode: 'aggregate', threshold: 2 },
  'variation-sel': { fg: '#7f848e', mode: 'aggregate', threshold: 2 },
  'annotation': { fg: '#c678dd', mode: 'region' },
  'deprecated': { fg: '#7f848e', mode: 'none' },
  'noncharacter': { fg: '#e06c75', mode: 'none' },
  'separator': { fg: '#7f848e', mode: 'none' },
  'combining-flood': { fg: '#e5c07b', mode: 'aggregate', threshold: 3 },
  'unclassified': { fg: '#7f848e', mode: 'none' },
};

/** Get all default facet themes as a resolved theme */
export function getDefaults(): ResolvedTheme {
  return {
    syn: DEFAULT_SYN,
    md: DEFAULT_MD,
    mer: DEFAULT_MER,
    web: DEFAULT_WEB,
    unic: DEFAULT_UNIC,
  };
}
