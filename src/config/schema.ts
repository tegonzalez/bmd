/**
 * Zod schema for bmd.config.yaml configuration file.
 * All fields optional -- config files are sparse (user uncomments what they want).
 *
 * BmdConfig is the unified resolved configuration DTO.
 * RawFileConfig is the inferred type from Zod (internal, for config file parsing).
 */

import { z } from "zod";
import type { PagerMode } from "../pager/index.ts";
import type { ResolvedTheme } from "../theme/types.ts";
import {
  FILE_ROOT_DEFAULTS,
  SERVE_FILE_DEFAULTS,
  TEMPLATE_FILE_DEFAULTS,
  UNDO_FILE_DEFAULTS,
} from "./bmd-defaults.ts";

const templatesSchema = z.object({
  enabled: z.boolean().default(TEMPLATE_FILE_DEFAULTS.enabled),
  map: z.string().optional(),
  auto_map: z.boolean().default(TEMPLATE_FILE_DEFAULTS.auto_map),
  list_spec: z.string().optional(),
}).strict().default(TEMPLATE_FILE_DEFAULTS);

const serveSchema = z.object({
  host: z.string().default(SERVE_FILE_DEFAULTS.host),
  port: z.number().int().min(0).max(65535).default(SERVE_FILE_DEFAULTS.port),
  open: z.boolean().default(SERVE_FILE_DEFAULTS.open),
  mode: z.enum(["editor", "preview", "both"]).default(SERVE_FILE_DEFAULTS.mode),
  color_mode: z.enum(["day", "night", "auto"]).default(SERVE_FILE_DEFAULTS.color_mode),
  readonly: z.boolean().default(SERVE_FILE_DEFAULTS.readonly),
}).strict().default(SERVE_FILE_DEFAULTS);

const undoSchema = z.object({
  group_delay: z.number().int().positive().default(UNDO_FILE_DEFAULTS.group_delay),
  depth: z.number().int().positive().default(UNDO_FILE_DEFAULTS.depth),
}).strict().default(UNDO_FILE_DEFAULTS);

export const configSchema = z.object({
  width: z.union([z.literal("auto"), z.number().int().positive()]).default(FILE_ROOT_DEFAULTS.width),
  ansi: z.enum(["auto", "on", "off"]).default(FILE_ROOT_DEFAULTS.ansi),
  pager: z.boolean().default(FILE_ROOT_DEFAULTS.pager),
  theme: z.string().default(FILE_ROOT_DEFAULTS.theme),
  unsafe_html: z.boolean().default(FILE_ROOT_DEFAULTS.unsafe_html),
  serve: serveSchema,
  templates: templatesSchema,
  unicode: z.boolean().default(FILE_ROOT_DEFAULTS.unicode),
  undo: undoSchema,
}).strict();

/** Raw config file type (snake_case, unresolved values). Internal use only. */
export type RawFileConfig = z.infer<typeof configSchema>;

/** Unified resolved configuration DTO. Single source of truth for all consumers. */
export interface BmdConfig {
  /** Rendering charset: 'ascii' or 'utf8'. Set by CLI subcommand, not in config file. */
  format: 'ascii' | 'utf8';
  /** Resolved terminal width in columns. Never "auto" -- resolved before construction. */
  width: number;
  /** Whether ANSI escape codes are enabled. Resolved from tri-state + TTY detection. */
  ansiEnabled: boolean;
  /** Pager behavior mode. */
  pager: PagerMode;
  /** Whether raw HTML in markdown is rendered (unsafe) or stripped. */
  unsafeHtml: boolean;
  /** Whether invisible Unicode detection is enabled. */
  unicode: boolean;
  /** Source file path, if rendering a file (undefined for stdin). */
  filePath: string | undefined;
  /** Fully resolved theme, if any. undefined means use defaults. */
  theme: ResolvedTheme | undefined;
  /** Template engine configuration. */
  templates: {
    enabled: boolean;
    map: string | undefined;
    auto_map: boolean;
    list_spec: string | undefined;
  };
  /** Undo/redo configuration for the editor. */
  undo: {
    groupDelay: number;
    depth: number;
  };
  /** Server configuration. */
  serve: {
    host: string;
    port: number;
    open: boolean;
    mode: 'editor' | 'preview' | 'both';
    colorMode: 'day' | 'night' | 'auto';
    readonly: boolean;
  };
}
