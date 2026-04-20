/**
 * `--help` entry: structured help from registered `meta`+`args`, else citty fallback.
 */

import { renderUsage, type CommandDef, type ArgsDef } from 'citty';
import { formatHelpFromArgs, formatMainHelpPage } from './from-args.ts';
import { commandHelpByName, commandHelpSpecs } from './registry.ts';
import { CYAN, DIM, RESET } from './ansi.ts';

export async function showUsage<T extends ArgsDef>(
  cmd: CommandDef<T>,
  parent?: CommandDef<T>,
): Promise<void> {
  const meta = await Promise.resolve(typeof cmd.meta === 'function' ? cmd.meta() : cmd.meta);
  const name = meta?.name || '';

  if (!name || name === 'bmd') {
    const renderSpec = commandHelpSpecs.find((s) => s.meta.name === 'render');
    console.log(
      formatMainHelpPage({
        tagline: 'Beautiful Markdown renderer',
        version: '0.1.0',
        usageLine:
          'bmd [global options] [command] [command options] [args]',
        commandRows: commandHelpSpecs.map((s) => ({
          name: s.meta.name as string,
          summary: s.meta.description ?? '',
        })),
        defaultRenderArgs: renderSpec?.args ?? {},
        footerLines: [
          `${DIM}Omitting a subcommand defaults to ${CYAN}render${RESET}${DIM}; use ${CYAN}<file | ->${RESET}${DIM} as the file argument.${RESET}`,
          `Run ${CYAN}bmd <command> --help${RESET} for each subcommand.`,
        ],
      }),
    );
    return;
  }

  const spec = commandHelpByName[name]!;
  if (spec) {
    console.log(formatHelpFromArgs(spec.meta, spec.args, spec.extras));
    return;
  }

  console.log(await renderUsage(cmd, parent));
}
