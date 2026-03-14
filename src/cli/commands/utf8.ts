/**
 * UTF-8 subcommand: bmd utf8 <file|->
 */

import { defineCommand } from 'citty';
import { sharedArgs, resolveAnsiMode, resolveWidth } from '../flags.ts';
import { BmdError, ExitCode, writeDiagnostic } from '../../diagnostics/formatter.ts';
import { renderDocument } from '../../output/index.ts';
import { readStdin, readTextFile, fileExists } from '../io.ts';
import type { PagerMode } from '../../pager/index.ts';

const utf8Command = defineCommand({
  meta: {
    name: 'utf8',
    description: 'Render Markdown with UTF-8 charset',
  },
  args: {
    input: {
      type: 'positional',
      description: 'File path or - for stdin',
      required: true,
    },
    ...sharedArgs,
  },
  async run({ args }) {
    try {
      // Read input source
      let source: string;
      if (args.input === '-') {
        source = await readStdin();
      } else {
        if (!(await fileExists(args.input))) {
          writeDiagnostic({
            file: args.input,
            line: 1,
            col: 1,
            span: 1,
            message: `File not found: ${args.input}`,
            severity: 'error',
          });
          throw new BmdError(`File not found: ${args.input}`, ExitCode.OUTPUT);
        }
        source = await readTextFile(args.input);
      }

      // Resolve options
      const width = resolveWidth(args);
      const ansiEnabled = resolveAnsiMode(args, process.stdout.isTTY ?? false);
      const pager: PagerMode = (args as any)['no-pager'] || (args as any).noPager
        ? 'never'
        : (args as any).pager
          ? 'always'
          : 'auto';

      await renderDocument(source, {
        format: 'utf8',
        width,
        ansiEnabled,
        pager,
        filePath: args.input !== '-' ? args.input : undefined,
      });
    } catch (err) {
      if (err instanceof BmdError) {
        process.exit(err.exitCode);
      }
      writeDiagnostic({
        file: args.input || '<unknown>',
        line: 1,
        col: 1,
        span: 1,
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
      process.exit(ExitCode.OUTPUT);
    }
  },
});

export default utf8Command;
