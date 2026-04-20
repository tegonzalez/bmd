/**
 * table subcommand: bmd table <file | ->
 *
 * Parses structured input (JSON / JSON Lines by default), builds a GFM table as Markdown,
 * then runs the same terminal pipeline as `bmd render` (theme, width, pager, etc.).
 * `-t` / `--type` selects the input decoder; `--theme` sets the render theme (no `-t` for theme here).
 */

import { defineCommand } from "citty";
import type { ArgsDef } from "citty";
import { sharedArgs } from "../flags.ts";
import { readStdin, readTextFile, fileExists } from "../io.ts";
import {
  parseTableInput,
  normalizeRows,
  normalizedTableToMarkdown,
  isTableInputFormatId,
  TABLE_INPUT_FORMAT_IDS,
} from "../../table/index.ts";
import {
  BmdError,
  ExitCode,
  Severity,
  writeDiagnostic,
} from "../../diagnostics/formatter.ts";
import {
  runTerminalRenderFromMarkdown,
  exitRenderFailure,
} from "../run-terminal-render.ts";

/** Theme is listed without `-t` short — `-t` is reserved for `--type` on this command. */
const { theme: _sharedTheme, ...sharedWithoutTheme } = sharedArgs;

/** @internal */
export const tableCommandMeta = {
  name: "table" as const,
  description:
    "Render structured data as a table in the terminal (same pipeline as bmd render)",
};

/** @internal */
export const tableCommandArgs: ArgsDef = {
  input: {
    type: "positional",
    valueHint: "file | -",
    description: "Structured input file path or - for stdin",
    required: true,
  },
  type: {
    type: "string" as const,
    alias: "t",
    description: `Input format: ${TABLE_INPUT_FORMAT_IDS.join(", ")} (default: auto)`,
    default: "auto",
  },
  ascii: {
    type: "boolean",
    alias: "a",
    description: "Use ASCII charset (default: UTF-8)",
  },
  ...sharedWithoutTheme,
  theme: {
    type: "string",
    description: `${sharedArgs.theme.description} (use --theme; -t is --type here)`,
  },
};

const tableCommand = defineCommand({
  meta: tableCommandMeta,
  args: tableCommandArgs,
  async run({ args }) {
    const typeArg = (args as { type?: string }).type ?? "auto";
    if (!isTableInputFormatId(typeArg)) {
      writeDiagnostic({
        file: "<table>",
        line: 1,
        col: 1,
        span: 1,
        message: `Invalid --type: ${typeArg}. Expected one of: ${TABLE_INPUT_FORMAT_IDS.join(", ")}`,
        severity: Severity.DiagError,
      });
      process.exit(ExitCode.USAGE);
    }

    let raw: string;
    let md: string | undefined;
    const inputPath = (args as unknown as { input: string }).input;
    try {
      if (inputPath === "-") {
        raw = await readStdin();
      } else {
        if (!(await fileExists(inputPath))) {
          writeDiagnostic({
            file: inputPath,
            line: 1,
            col: 1,
            span: 1,
            message: `File not found: ${inputPath}`,
            severity: Severity.DiagError,
          });
          throw new BmdError(`File not found: ${inputPath}`, ExitCode.USAGE);
        }
        raw = await readTextFile(inputPath);
      }

      const parsed = parseTableInput(raw, typeArg);
      if (!parsed.ok) {
        writeDiagnostic({
          file: inputPath === "-" ? "<stdin>" : inputPath,
          line: 1,
          col: 1,
          span: 1,
          message: parsed.message,
          severity: Severity.DiagError,
        });
        throw new BmdError(parsed.message, ExitCode.USAGE);
      }

      const normalized = normalizeRows(parsed.rows);
      md = normalizedTableToMarkdown(normalized);

      const configFilePath = inputPath !== "-" ? inputPath : undefined;

      await runTerminalRenderFromMarkdown({
        source: md,
        args: args as Record<string, unknown>,
        configFilePath,
        diagnosticFile: "<table>",
      });
    } catch (err) {
      exitRenderFailure(err, md, inputPath === "-" ? "<stdin>" : inputPath);
    }
  },
});

export default tableCommand;
