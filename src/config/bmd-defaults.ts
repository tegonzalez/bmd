/**
 * Single source of truth for built-in defaults (config file schema, resolved merge,
 * CLI help hints, and discovery paths). Mutations apply in order:
 * defaults → config file (if present) → CLI args.
 */

/** Default config file basename in the project directory (CONF-03). */
export const DEFAULT_CONFIG_FILENAME = "bmd.config.yaml";

/** Canonical `serve` section — used by Zod, `resolveConfig`, and serve CLI help. */
export const SERVE_DEFAULTS = {
  host: "localhost",
  port: 3000,
  open: true,
  mode: "both" as const,
  colorMode: "auto" as const,
  readonly: false,
} as const;

/** Snake_case mirror for `bmd.config.yaml` parsing only. */
export const SERVE_FILE_DEFAULTS = {
  host: SERVE_DEFAULTS.host,
  port: SERVE_DEFAULTS.port,
  open: SERVE_DEFAULTS.open,
  mode: SERVE_DEFAULTS.mode,
  color_mode: SERVE_DEFAULTS.colorMode,
  readonly: SERVE_DEFAULTS.readonly,
} as const;

export const UNDO_DEFAULTS = {
  groupDelay: 500,
  depth: 200,
} as const;

export const UNDO_FILE_DEFAULTS = {
  group_delay: UNDO_DEFAULTS.groupDelay,
  depth: UNDO_DEFAULTS.depth,
} as const;

export const TEMPLATE_FILE_DEFAULTS = {
  enabled: true,
  auto_map: false,
} as const;

/** Top-level file defaults (raw / Zod). */
export const FILE_ROOT_DEFAULTS = {
  width: "auto" as const,
  ansi: "auto" as const,
  pager: true,
  theme: "",
  unsafe_html: false,
  unicode: true,
} as const;
