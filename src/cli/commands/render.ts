/**
 * Unified render command: bmd render [options] <file> | -
 * Replaces the old ascii/utf8 subcommands with a single command + -a flag.
 */

import { defineCommand } from 'citty';
import type { ArgsDef } from 'citty';
import { sharedArgs } from '../flags.ts';
import { BmdError, ExitCode } from '../../diagnostics/formatter.ts';
import { readStdin, readTextFile, fileExists } from '../io.ts';
import { writeDiagnostic, Severity } from '../../diagnostics/formatter.ts';
import {
  runTerminalRenderFromMarkdown,
  exitRenderFailure,
} from '../run-terminal-render.ts';

/** @internal Exported for `--help` (same object as `defineCommand` args). */
export const renderCommandMeta = {
  name: 'render' as const,
  description: 'Render Markdown to terminal',
};

/** @internal Legal CLI args + descriptions (single source of truth). */
export const renderCommandArgs: ArgsDef = {
  input: {
    type: 'positional',
    valueHint: 'file | -',
    description: 'File path or - for stdin',
    required: true,
  },
  ascii: {
    type: 'boolean',
    alias: 'a',
    description: 'Use ASCII charset (default: UTF-8)',
  },
  ...sharedArgs,
};

const renderCommand = defineCommand({
  meta: renderCommandMeta,
  args: renderCommandArgs,
  async run({ args }) {
    let source: string | undefined;
    const input = (args as unknown as { input: string }).input;
    try {
      if (input === '-') {
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

      const configFilePath = input !== '-' ? input : undefined;
      const diagnosticFile = input === '-' ? '<stdin>' : input;

      await runTerminalRenderFromMarkdown({
        source,
        args: args as Record<string, unknown>,
        configFilePath,
        diagnosticFile,
      });
    } catch (err) {
      exitRenderFailure(err, source, input || '<unknown>');
    }
  },
});

export default renderCommand;
