/**
 * bmd serve - Start a local HTTP + WebSocket server for browser preview.
 */

import { defineCommand } from 'citty';
import type { ArgsDef } from 'citty';
import { BmdError, writeDiagnostic, Severity } from '../../diagnostics/formatter.ts';
import { validatePort, validateMode, validateFile, warnInvalidTheme } from '../validate.ts';
import { sharedArgs } from '../flags.ts';
import { DEFAULT_CONFIG_FILENAME } from '../../config/bmd-defaults.ts';
import { getBmdGlobalPrefix } from '../global-context.ts';

/** @internal */
export const serveCommandMeta = {
  name: 'serve' as const,
  description: 'Browser preview with live reload',
};

/** @internal */
export const serveCommandArgs: ArgsDef = {
  input: {
    type: 'positional',
    valueHint: 'file',
    description: 'Markdown file to preview',
    required: false,
  },
  host: {
    type: 'string',
    description: 'Host to bind to',
  },
  port: {
    type: 'string',
    alias: 'p',
    description: 'Port to listen on',
  },
  open: {
    type: 'boolean',
    description: 'Open browser automatically',
  },
  mode: {
    type: 'string',
    description: 'View mode: editor, preview, or both',
  },
  'color-mode': {
    type: 'string',
    description: 'Color mode: day, night, or auto',
  },
  readonly: {
    type: 'boolean',
    description: 'Disable file editing',
  },
  theme: { ...sharedArgs.theme },
  'unsafe-html': {
    type: 'boolean',
    description: 'Allow raw HTML in output',
  },
  config: {
    type: 'string',
    alias: 'c',
    description: `Path to config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  },
  map: sharedArgs.map,
  var: sharedArgs.var,
  templates: sharedArgs.templates,
};

const serveCommand = defineCommand({
  meta: serveCommandMeta,
  args: serveCommandArgs,
  async run({ args }) {
    const { startServer } = await import('../../server/index.ts');
    const { loadConfig } = await import('../../config/loader.ts');
    const { resolveConfig } = await import('../../config/merge.ts');
    const { getDefaults } = await import('../../theme/defaults.ts');
    const { resolveThemeSpec } = await import('../../theme/resolver.ts');
    const { parseThemeSpec } = await import('../../theme/spec-parser.ts');

    const filePath = args.input || undefined;
    const gp = getBmdGlobalPrefix();

    // Validate CLI args at the boundary
    try {
      if (args.port !== undefined && String(args.port).length > 0) {
        validatePort(String(args.port));
      }
      if (args.mode) validateMode(args.mode);
      if (filePath) await validateFile(filePath);
    } catch (err) {
      if (err instanceof BmdError) process.exit(err.exitCode);
      throw err;
    }

    // Load config file
    const configFile = await loadConfig(args.config || gp.config || undefined);

    // Resolve theme before config construction
    let resolvedTheme = getDefaults();
    const themeArg = args.theme || gp.theme || undefined;
    const configThemeStr = configFile?.theme;
    // Build merged theme spec: config < CLI
    let mergedSpec: Record<string, string> = {};
    if (configThemeStr && configThemeStr.length > 0) {
      try { mergedSpec = { ...mergedSpec, ...parseThemeSpec(configThemeStr) }; } catch (err) { warnInvalidTheme(configThemeStr!); }
    }
    if (themeArg && themeArg.length > 0) {
      try { mergedSpec = { ...mergedSpec, ...parseThemeSpec(themeArg) }; } catch (err) { warnInvalidTheme(themeArg); }
    }
    if (Object.keys(mergedSpec).length > 0) {
      try {
        resolvedTheme = await resolveThemeSpec(mergedSpec);
      } catch (err) {
        warnInvalidTheme(themeArg || configThemeStr || 'unknown');
      }
    }

    let unsafeHtmlCli: boolean | undefined;
    if (args['unsafe-html']! !== undefined) {
      unsafeHtmlCli = !!args['unsafe-html'];
    } else if (gp.unsafeHtml !== undefined) {
      unsafeHtmlCli = gp.unsafeHtml;
    }

    const config = resolveConfig({
      format: 'utf8',  // serve doesn't render terminal, but format is required
      width: 80,        // not used by serve, but required field
      ansiEnabled: true, // not used by serve
      pager: 'never',   // not used by serve
      unsafeHtml: unsafeHtmlCli,
      filePath,
      theme: themeArg,
      resolvedTheme,
      map: args.map || undefined,
      templates: args.templates,
      serve: {
        host: args.host,
        port:
          args.port !== undefined && String(args.port).length > 0
            ? parseInt(String(args.port), 10)
            : undefined,
        open: args.open,
        mode: args.mode as 'editor' | 'preview' | 'both' | undefined,
        colorMode: args['color-mode']! as 'day' | 'night' | 'auto' | undefined,
        readonly: args.readonly,
      },
    }, configFile);

    // Resolve template values at startup
    const { resolveTemplateValues, discoverAutoMap } = await import('../../config/map-loader.ts');
    const { extractVarArgs } = await import('../var-parser.ts');

    const cliVars = extractVarArgs(process.argv.slice(2));
    const values = await resolveTemplateValues(
      args.map || undefined,
      cliVars,
      config.templates,
      filePath,
    );

    // Determine effective map file path for watching
    let mapFilePath: string | null = null;
    if (args.map) {
      const { resolve: pathResolve } = await import('node:path');
      mapFilePath = pathResolve(args.map);
    } else if (config.templates.map) {
      const { resolve: pathResolve } = await import('node:path');
      mapFilePath = pathResolve(config.templates.map);
    } else if (config.templates.auto_map && config.templates.enabled && filePath) {
      mapFilePath = await discoverAutoMap(filePath);
    }

    try {
      const { server } = startServer(config, {
        values,
        cliVars,
        templatesConfig: config.templates,
        mapFilePath,
      });

      const url = `http://${config.serve.host}:${config.serve.port}`;
      console.log(`bmd serve running at ${url}`);

      if (config.serve.open) {
        try {
          const { platform } = await import('node:os');
          const { execFile } = await import('node:child_process');
          const plat = platform();
          const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'start' : 'xdg-open';
          execFile(cmd, [url], { timeout: 5000 }, () => {});
        } catch (err) { writeDiagnostic({ file: 'src/cli/commands/serve.ts', line: 176, col: 9, span: 0, message: `Browser open failed: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.Info }); }
      }

      // Keep process alive -- server runs until SIGINT
      await new Promise(() => {});
    } catch (err) {
      const { writeDiagnostic: wd, ExitCode, Severity: S } = await import('../../diagnostics/formatter.ts');
      wd({
        file: 'src/cli/commands/serve.ts', line: 182, col: 7, span: 0,
        message: `serve failed${filePath ? ` (${filePath})` : ''}: ${err instanceof Error ? err.message : String(err)}`,
        severity: S.DiagError,
      });
      process.exit(ExitCode.SERVE);
    }
  },
});

export default serveCommand;
