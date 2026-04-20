/**
 * Shared terminal render path: config → pipeline → pager.
 * Used by `bmd render` and `bmd table` (generated Markdown).
 */

import type { PagerMode } from "../pager/index.ts";
import { outputWithPager } from "../pager/index.ts";
import { loadConfig } from "../config/loader.ts";
import { resolveConfig } from "../config/merge.ts";
import { checkHtmlContent } from "../parser/index.ts";
import { resolveThemeSpec } from "../theme/resolver.ts";
import { parseThemeSpec } from "../theme/spec-parser.ts";
import type { ResolvedTheme } from "../theme/types.ts";
import { runPipeline } from "../pipeline/index.ts";
import { resolveTemplateValues } from "../config/map-loader.ts";
import { getBmdGlobalPrefix } from "./global-context.ts";
import { extractVarArgs } from "./var-parser.ts";
import { resolveAnsiMode, resolveWidth } from "./flags.ts";
import {
  BmdError,
  ExitCode,
  writeDiagnostic,
  offsetToLineCol,
  Severity,
} from "../diagnostics/formatter.ts";
import { validateWidth, warnInvalidTheme } from "./validate.ts";

export interface RunTerminalRenderParams {
  /** Markdown source (file contents or generated). */
  source: string;
  /** Citty args aligned with `bmd render` (width, theme, map, templates, …). */
  args: Record<string, unknown>;
  /** Passed to resolveConfig as `filePath` (template map / auto-map resolution). */
  configFilePath: string | undefined;
  /**
   * File label for template-warning diagnostics (offsets refer to `source`).
   * Use a real path for normal files, `<stdin>`, or `<table>` for generated table MD.
   */
  diagnosticFile: string;
  /** argv tail for `--var` parsing (default `process.argv.slice(2)`). */
  argv?: string[];
}

export async function runTerminalRenderFromMarkdown(
  params: RunTerminalRenderParams,
): Promise<void> {
  const { source, args, configFilePath, diagnosticFile, argv } = params;
  const argvTail = argv ?? process.argv.slice(2);

  if (args.width !== undefined) validateWidth(args.width as string);

  const gp = getBmdGlobalPrefix();

  const configFile = await loadConfig(
    (args as { config?: string }).config || gp.config || undefined,
  );
  const width = resolveWidth(args as { width?: string });
  const ansiEnabled = resolveAnsiMode(
    args as { ansi?: boolean; "no-ansi"?: boolean; noAnsi?: boolean },
    process.stdout.isTTY ?? false,
  );
  const pager: PagerMode =
    (args as { "no-pager"?: boolean; noPager?: boolean })["no-pager"]! ||
    (args as { noPager?: boolean }).noPager
      ? "never"
      : (args as { pager?: boolean }).pager
        ? "always"
        : "auto";

  let resolvedTheme: ResolvedTheme | undefined;
  const themeArg =
    (args as { theme?: string }).theme || gp.theme || undefined;
  const configThemeStr = configFile?.theme;
  let mergedSpec: Record<string, string> = {};
  if (configThemeStr && configThemeStr.length > 0) {
    try {
      mergedSpec = { ...mergedSpec, ...parseThemeSpec(configThemeStr) };
    } catch {
      /* ignore */
    }
  }
  if (themeArg && themeArg.length > 0) {
    try {
      mergedSpec = { ...mergedSpec, ...parseThemeSpec(themeArg) };
    } catch {
      warnInvalidTheme(themeArg);
    }
  }
  if (Object.keys(mergedSpec).length > 0) {
    try {
      resolvedTheme = await resolveThemeSpec(mergedSpec);
    } catch {
      warnInvalidTheme(themeArg || configThemeStr || "unknown");
    }
  }

  let unsafeHtmlCli: boolean | undefined;
  if (
    (args as { "unsafe-html"?: boolean; unsafeHtml?: boolean })["unsafe-html"]! !==
      undefined ||
    (args as { unsafeHtml?: boolean }).unsafeHtml !== undefined
  ) {
    unsafeHtmlCli = !!(
      (args as { "unsafe-html"?: boolean })["unsafe-html"]! ||
      (args as { unsafeHtml?: boolean }).unsafeHtml
    );
  } else if (gp.unsafeHtml !== undefined) {
    unsafeHtmlCli = gp.unsafeHtml;
  }

  const config = resolveConfig(
    {
      format: (args as { ascii?: boolean }).ascii ? "ascii" : "utf8",
      width,
      ansiEnabled,
      pager,
      unsafeHtml: unsafeHtmlCli,
      filePath: configFilePath,
      theme: themeArg,
      resolvedTheme,
      map: (args as { map?: string }).map || undefined,
      templates: (args as { templates?: boolean }).templates,
      unicode:
        (args as { "no-unicode"?: boolean; noUnicode?: boolean })[
          "no-unicode"
        ]! || (args as { noUnicode?: boolean }).noUnicode
          ? false
          : undefined,
    },
    configFile,
  );

  if (!config.unsafeHtml) {
    checkHtmlContent(source, configFilePath);
  }

  const cliVars = extractVarArgs(argvTail);
  const values = config.templates.enabled
    ? await resolveTemplateValues(
        (args as { map?: string }).map || undefined,
        cliVars,
        config.templates,
        config.filePath,
      )
    : {};

  const result = await runPipeline({ source, config, values });

  for (const w of result.warnings) {
    const pos = offsetToLineCol(source, w.offset ?? 0);
    writeDiagnostic({
      file: diagnosticFile,
      line: pos.line,
      col: pos.col,
      span: w.length || 1,
      message: w.message,
      severity: Severity.DiagWarn,
      context: source,
    });
  }

  await outputWithPager(result.rendered, { pager: config.pager });
}

export function exitRenderFailure(
  err: unknown,
  source: string | undefined,
  contextFile: string,
): never {
  if (err instanceof BmdError) {
    process.exit(err.exitCode);
  }
  writeDiagnostic({
    file: contextFile,
    line: 1,
    col: 1,
    span: 1,
    message: err instanceof Error ? err.message : String(err),
    severity: Severity.DiagError,
    context: source,
  });
  process.exit(ExitCode.OUTPUT);
}
