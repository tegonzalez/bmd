/**
 * Resolved configuration: CLI args override config file over built-in defaults.
 * Uses ?? so an omitted CLI value does not mask the file layer.
 */

import { parseThemeSpec } from "../theme/spec-parser.ts";
import type { ThemeSpec, ResolvedTheme } from "../theme/types.ts";
import type { PagerMode } from "../pager/index.ts";
import type { BmdConfig, RawFileConfig } from "./schema.ts";
import { SERVE_DEFAULTS, UNDO_DEFAULTS } from "./bmd-defaults.ts";
import { writeDiagnostic, Severity } from '../diagnostics/formatter.ts';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** CLI args -- all values are pre-resolved by the caller. */
export interface CliArgs {
  format?: 'ascii' | 'utf8';
  width?: number;
  ansiEnabled?: boolean;
  pager?: PagerMode;
  filePath?: string;
  theme?: string;
  resolvedTheme?: ResolvedTheme;
  unsafeHtml?: boolean;
  unicode?: boolean;
  serve?: Partial<BmdConfig['serve']>;
  map?: string;
  /** When `false`, forces `templates.enabled` off (`--no-templates`). When `true`, file + defaults apply. */
  templates?: boolean;
  listSpec?: string;
}

/** Resolved DTO defaults (see `bmd-defaults.ts` for primitives). */
const DEFAULTS: BmdConfig = {
  format: 'utf8',
  width: 80,
  ansiEnabled: true,
  pager: 'auto',
  unsafeHtml: false,
  unicode: true,
  filePath: undefined,
  theme: undefined,
  templates: {
    enabled: true,
    map: undefined,
    auto_map: false,
    list_spec: undefined,
  },
  undo: {
    groupDelay: UNDO_DEFAULTS.groupDelay,
    depth: UNDO_DEFAULTS.depth,
  },
  serve: {
    host: SERVE_DEFAULTS.host,
    port: SERVE_DEFAULTS.port,
    open: SERVE_DEFAULTS.open,
    mode: SERVE_DEFAULTS.mode,
    colorMode: SERVE_DEFAULTS.colorMode,
    readonly: SERVE_DEFAULTS.readonly,
  },
};

/**
 * Map config file pager boolean to PagerMode.
 * false -> 'never', true -> 'auto'
 */
function mapPagerBoolean(value: boolean | undefined): PagerMode | undefined {
  if (value === undefined) return undefined;
  return value ? 'auto' : 'never';
}

/**
 * Map config file ansi tri-state to boolean.
 * "on" -> true, "off" -> false, "auto" -> undefined (use default)
 */
function mapAnsiTriState(value: "auto" | "on" | "off" | undefined): boolean | undefined {
  if (value === undefined || value === "auto") return undefined;
  return value === "on";
}

/**
 * Map config file width to number.
 * "auto" -> undefined (use default), number -> number
 */
function mapConfigWidth(value: number | "auto" | undefined): number | undefined {
  if (value === undefined || value === "auto") return undefined;
  return value;
}

/**
 * Merge: defaults → config file → CLI (each layer overrides when defined).
 */
export function resolveConfig(
  cli: CliArgs,
  config: DeepPartial<RawFileConfig> | null | undefined,
): BmdConfig {
  const cfg = config ?? {};

  // Parse theme spec strings from config and CLI, merge per-facet
  let configThemeSpec: ThemeSpec = {};
  if (cfg.theme && cfg.theme.length > 0) {
    try {
      configThemeSpec = parseThemeSpec(cfg.theme);
    } catch (err) {
      writeDiagnostic({
        file: 'bmd.config.yaml',
        line: 1, col: 1, span: 1,
        message: `Invalid theme spec in config: ${err instanceof Error ? err.message : String(err)}`,
        severity: Severity.DiagWarn,
      });
    }
  }

  let cliThemeSpec: ThemeSpec = {};
  if (cli.theme && cli.theme.length > 0) {
    try {
      cliThemeSpec = parseThemeSpec(cli.theme);
    } catch (err) {
      writeDiagnostic({
        file: '(cli)',
        line: 1, col: 1, span: 1,
        message: `Invalid theme spec from --theme flag: ${err instanceof Error ? err.message : String(err)}`,
        severity: Severity.DiagWarn,
      });
    }
  }

  // Merge theme specs per-facet: config < CLI
  const mergedThemeSpec: ThemeSpec = {
    ...configThemeSpec,
    ...cliThemeSpec,
  };

  // Theme: use pre-resolved theme from CLI if provided, otherwise undefined
  // Theme spec is retained for callers who resolve themes externally
  const theme = cli.resolvedTheme ?? DEFAULTS.theme;

  // Map config file values to resolved types
  const cfgWidth = mapConfigWidth(cfg.width);
  const cfgAnsi = mapAnsiTriState(cfg.ansi);
  const cfgPager = mapPagerBoolean(cfg.pager);

  return {
    format: cli.format ?? DEFAULTS.format,
    width: cli.width ?? cfgWidth ?? DEFAULTS.width,
    ansiEnabled: cli.ansiEnabled ?? cfgAnsi ?? DEFAULTS.ansiEnabled,
    pager: cli.pager ?? cfgPager ?? DEFAULTS.pager,
    unsafeHtml: cli.unsafeHtml ?? cfg.unsafe_html ?? DEFAULTS.unsafeHtml,
    unicode: cli.unicode ?? cfg.unicode ?? DEFAULTS.unicode,
    filePath: cli.filePath ?? DEFAULTS.filePath,
    theme,
    templates: {
      enabled:
        cli.templates === false
          ? false
          : cfg.templates?.enabled ?? DEFAULTS.templates.enabled,
      map: cli.map ?? cfg.templates?.map ?? DEFAULTS.templates.map,
      auto_map: cfg.templates?.auto_map ?? DEFAULTS.templates.auto_map,
      list_spec: cli.listSpec ?? cfg.templates?.list_spec ?? DEFAULTS.templates.list_spec,
    },
    undo: {
      groupDelay: cfg.undo?.group_delay ?? DEFAULTS.undo.groupDelay,
      depth: cfg.undo?.depth ?? DEFAULTS.undo.depth,
    },
    serve: {
      host: cli.serve?.host ?? cfg.serve?.host ?? DEFAULTS.serve.host,
      port: cli.serve?.port ?? cfg.serve?.port ?? DEFAULTS.serve.port,
      open: cli.serve?.open ?? cfg.serve?.open ?? DEFAULTS.serve.open,
      mode: cli.serve?.mode ?? (cfg.serve?.mode as BmdConfig["serve"]["mode"]) ?? DEFAULTS.serve.mode,
      colorMode: cli.serve?.colorMode ?? (cfg.serve?.color_mode as BmdConfig["serve"]["colorMode"]) ?? DEFAULTS.serve.colorMode,
      readonly: cli.serve?.readonly ?? cfg.serve?.readonly ?? DEFAULTS.serve.readonly,
    },
  };
}
