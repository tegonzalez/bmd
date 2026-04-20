/**
 * eval subcommand: bmd eval PIPELINE
 *
 * Reads stdin line-by-line, YAML-parses each line,
 * applies the operator pipeline, prints result.
 */

import { defineCommand } from "citty";
import type { ArgsDef } from "citty";
import { parse as parseYaml } from "yaml";
import { readStdin } from "../io.ts";
import { writeDiagnostic, Severity } from "../../diagnostics/formatter.ts";
import {
  coerceYamlValue,
  parseOperatorPipeline,
  applyPipelineAndFormat,
} from "./eval-shared.ts";

/** @internal */
export const evalCommandMeta = {
  name: "eval" as const,
  description: "Test operator pipelines on stdin (line-by-line)",
};

/** @internal */
export const evalCommandArgs: ArgsDef = {
  pipeline: {
    type: "positional",
    valueHint: "pipeline",
    description: "Operator pipeline (e.g. upper, join/-/, upper|tr/ /_/)",
    required: true,
  },
};

const evalCommand = defineCommand({
  meta: evalCommandMeta,
  args: evalCommandArgs,
  async run({ args }) {
    const pipeline = String(args.pipeline ?? "");
    // Validate pipeline parses before reading stdin
    const operators = parseOperatorPipeline(pipeline);
    if (!operators) {
      writeDiagnostic({
        file: "<eval>",
        line: 1,
        col: 1,
        span: 1,
        message: `Invalid operator pipeline: ${pipeline}`,
        severity: Severity.DiagError,
      });
      process.exit(1);
    }

    const input = await readStdin();
    // Split on newline, drop trailing empty line from EOF
    const lines = input.endsWith("\n")
      ? input.slice(0, -1).split("\n")
      : input.split("\n");

    for (const line of lines) {
      if (line === "") {
        process.stdout.write("\n");
        continue;
      }

      const parsed = parseYaml(line);
      const value = coerceYamlValue(parsed);
      const result = applyPipelineAndFormat(value, pipeline);

      if (result === null) {
        writeDiagnostic({
          file: "<eval>",
          line: 1,
          col: 1,
          span: 1,
          message: `Operator pipeline returned null for input: ${line}`,
          severity: Severity.DiagWarn,
        });
        process.stdout.write("\n");
        continue;
      }

      process.stdout.write(result + "\n");
    }
  },
});

export default evalCommand;
