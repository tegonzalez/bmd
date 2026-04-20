/**
 * map subcommand: bmd map <file> | -
 *
 * Applies template mapping only and outputs expanded Markdown text.
 * No Markdown parse/render stages are run.
 */

import { defineCommand } from "citty";
import type { ArgsDef } from "citty";
import { DEFAULT_CONFIG_FILENAME } from "../../config/bmd-defaults.ts";
import { sharedArgs } from "../flags.ts";
import { getBmdGlobalPrefix } from "../global-context.ts";
import { loadConfig } from "../../config/loader.ts";
import { resolveConfig } from "../../config/merge.ts";
import { resolveTemplateValues } from "../../config/map-loader.ts";
import { expandTemplate } from "../../template/index.ts";
import { readStdin, readTextFile, fileExists } from "../io.ts";
import { extractVarArgs } from "../var-parser.ts";
import {
  BmdError,
  ExitCode,
  Severity,
  offsetToLineCol,
  writeDiagnostic,
} from "../../diagnostics/formatter.ts";

/** @internal */
export const mapCommandMeta = {
  name: "map" as const,
  description: "Apply template mapping and output Markdown",
};

/** @internal */
export const mapCommandArgs: ArgsDef = {
  input: {
    type: "positional",
    valueHint: "file | -",
    description: "File path or - for stdin",
    required: true,
  },
  config: {
    type: "string",
    alias: "c",
    description: `Path to config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  },
  map: {
    type: "string",
    alias: "m",
    description: "Path to YAML map file for template values",
  },
  var: {
    type: "string",
    description: "Override template value (KEY=VALUE, repeatable)",
  },
  templates: sharedArgs.templates,
};

const mapCommand = defineCommand({
  meta: mapCommandMeta,
  args: mapCommandArgs,
  async run({ args }) {
    const input = String(args.input ?? "");
    let source: string | undefined;
    try {
      if (input === "-") {
        source = await readStdin();
      } else {
        if (!(await fileExists(input))) {
          writeDiagnostic({
            file: input,
            line: 1,
            col: 1,
            span: 1,
            message: `File not found: ${input}`,
            severity: Severity.DiagError,
          });
          throw new BmdError(`File not found: ${input}`, ExitCode.OUTPUT);
        }
        source = await readTextFile(input);
      }

      const gp = getBmdGlobalPrefix();
      const configFile = await loadConfig(
        (args as any).config || gp.config || undefined,
      );
      const config = resolveConfig({
        format: "utf8",
        width: 80,
        ansiEnabled: false,
        pager: "never",
        filePath: input !== "-" ? input : undefined,
        map: (args as any).map || undefined,
        templates: (args as any).templates,
      }, configFile);

      let output = source;
      if (config.templates.enabled) {
        const cliVars = extractVarArgs(process.argv.slice(2));
        const values = await resolveTemplateValues(
          (args as any).map || undefined,
          cliVars,
          config.templates,
          config.filePath,
        );
        const result = expandTemplate(source, values, { listSpec: config.templates.list_spec });
        output = result.output;

        for (const w of result.warnings) {
          const pos = offsetToLineCol(source, w.offset ?? 0);
          writeDiagnostic({
            file: config.filePath || "<stdin>",
            line: pos.line,
            col: pos.col,
            span: w.length || 1,
            message: w.message,
            severity: Severity.DiagWarn,
            context: source,
          });
        }
      }

      process.stdout.write(output);
    } catch (err) {
      if (err instanceof BmdError) {
        process.exit(err.exitCode);
      }
      writeDiagnostic({
        file: args.input || "<unknown>",
        line: 1,
        col: 1,
        span: 1,
        message: err instanceof Error ? err.message : String(err),
        severity: Severity.DiagError,
        context: source,
      });
      process.exit(ExitCode.OUTPUT);
    }
  },
});

export default mapCommand;
