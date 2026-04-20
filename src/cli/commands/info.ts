/**
 * info subcommand: bmd info <file> | -
 *
 * Extracts template field names and emits a YAML map skeleton with
 * default empty-string values. Output is suitable for use with -m/--map.
 */

import { defineCommand } from "citty";
import type { ArgsDef } from "citty";
import { stringify as stringifyYaml } from "yaml";
import { BmdError, ExitCode, Severity, writeDiagnostic } from "../../diagnostics/formatter.ts";
import { fileExists, readStdin, readTextFile } from "../io.ts";
import { extractFields } from "../../template/index.ts";
import { inflateDotPaths } from "../var-parser.ts";

/** @internal */
export const infoCommandMeta = {
  name: "info" as const,
  description: "Extract template fields as -m YAML skeleton",
};

/** @internal */
export const infoCommandArgs: ArgsDef = {
  input: {
    type: "positional",
    valueHint: "file | -",
    description: "Template file path or - for stdin",
    required: true,
  },
};

const infoCommand = defineCommand({
  meta: infoCommandMeta,
  args: infoCommandArgs,
  async run({ args }) {
    const input = String(args.input ?? "");
    let source = "";
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

      const fields = extractFields(source).sort();
      const skeleton = inflateDotPaths(
        fields.map((key) => ({ key, value: "" })),
      );
      process.stdout.write(stringifyYaml(skeleton));
    } catch (err) {
      if (err instanceof BmdError) {
        process.exit(err.exitCode);
      }
      writeDiagnostic({
        file: input || "<unknown>",
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

export default infoCommand;
