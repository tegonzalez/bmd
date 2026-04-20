/**
 * meval subcommand: bmd meval PIPELINE
 *
 * Reads all stdin, YAML-parses as single value,
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
export const mevalCommandMeta = {
  name: "meval" as const,
  description: "Test pipelines with multi-line YAML input",
};

/** @internal */
export const mevalCommandArgs: ArgsDef = {
  pipeline: {
    type: "positional",
    valueHint: "pipeline",
    description: "Operator pipeline (e.g. upper, join/-/, upper|tr/ /_/)",
    required: true,
  },
};

const mevalCommand = defineCommand({
  meta: mevalCommandMeta,
  args: mevalCommandArgs,
  async run({ args }) {
    const pipeline = String(args.pipeline ?? "");
    // Validate pipeline parses before reading stdin
    const operators = parseOperatorPipeline(pipeline);
    if (!operators) {
      writeDiagnostic({
        file: "<meval>",
        line: 1,
        col: 1,
        span: 1,
        message: `Invalid operator pipeline: ${pipeline}`,
        severity: Severity.DiagError,
      });
      process.exit(1);
    }

    const input = await readStdin();
    const parsed = parseYaml(input);
    const value = coerceYamlValue(parsed);
    const result = applyPipelineAndFormat(value, pipeline);

    if (result === null) {
      writeDiagnostic({
        file: "<meval>",
        line: 1,
        col: 1,
        span: 1,
        message: "Operator pipeline returned null",
        severity: Severity.DiagWarn,
      });
      process.exit(1);
    }

    process.stdout.write(result + "\n");
  },
});

export default mevalCommand;
