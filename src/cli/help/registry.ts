/**
 * Registers each subcommand’s legal `meta` + `args` (imported from command modules) with
 * optional non-flag fragments (`HelpExtras`). `--help` renders from args only; extras add
 * examples/output without duplicating option lines.
 */

import type { ArgsDef, CommandMeta } from 'citty';
import { CYAN, DIM, RESET } from './ansi.ts';
import type { HelpExtras } from './extras.ts';
import { evalCommandArgs, evalCommandMeta } from '../commands/eval.ts';
import { infoCommandArgs, infoCommandMeta } from '../commands/info.ts';
import { mapCommandArgs, mapCommandMeta } from '../commands/map.ts';
import { mevalCommandArgs, mevalCommandMeta } from '../commands/meval.ts';
import { renderCommandArgs, renderCommandMeta } from '../commands/render.ts';
import { serveCommandArgs, serveCommandMeta } from '../commands/serve.ts';
import { themesCommandArgs, themesCommandMeta } from '../commands/themes.ts';
import { tableCommandArgs, tableCommandMeta } from '../commands/table.ts';

export interface CommandHelpSpec {
  meta: CommandMeta;
  args: ArgsDef;
  extras?: HelpExtras;
}

/** README § Commands order: render → serve → eval → meval → info → map → themes */
export const commandHelpSpecs: CommandHelpSpec[] = [
  {
    meta: renderCommandMeta,
    args: renderCommandArgs,
    extras: {
      examples: [
        'bmd README.md',
        'bmd -a -w 100 notes.md',
        "printf '# Hi' | bmd -m values.yaml -",
      ],
    },
  },
  {
    meta: serveCommandMeta,
    args: serveCommandArgs,
    extras: {
      examples: [
        'bmd serve README.md',
        'bmd serve --port 8080 --mode preview --readonly notes.md',
      ],
    },
  },
  {
    meta: evalCommandMeta,
    args: evalCommandArgs,
    extras: {
      examples: [
        'echo hello | bmd eval upper',
        `echo '[1,2,3]' | bmd eval 'join/, /'`,
        `printf '42\\ntrue\\n' | bmd eval upper`,
      ],
      seeAlso: 'bmd meval --help — multi-line YAML',
    },
  },
  {
    meta: mevalCommandMeta,
    args: mevalCommandArgs,
    extras: {
      examples: [
        `bmd meval 'join/, /' <<<'["a","b","c"]'`,
        `bmd meval upper <<<'hello world'`,
      ],
      seeAlso: 'bmd eval --help — line-by-line',
    },
  },
  {
    meta: infoCommandMeta,
    args: infoCommandArgs,
    extras: {
      output: `Sorted YAML map of template fields; values default ${DIM}""${RESET}. Use with ${CYAN}bmd render -m${RESET} / ${CYAN}bmd map -m${RESET}.`,
      examples: [
        'bmd info README.md > fields.yaml',
        'cat draft.md | bmd info - > fields.yaml',
      ],
    },
  },
  {
    meta: mapCommandMeta,
    args: mapCommandArgs,
    extras: {
      examples: [
        'bmd map -m values.yaml README.md',
        'bmd map -m values.yaml --var TITLE=Draft - < notes.md',
      ],
    },
  },
  {
    meta: themesCommandMeta,
    args: themesCommandArgs,
    extras: {
      examples: ['bmd themes', 'bmd themes -a', 'bmd themes syn'],
    },
  },
  {
    meta: tableCommandMeta,
    args: tableCommandArgs,
    extras: {
      examples: [
        'cat data.json | bmd table -',
        'bmd table -t json report.json',
        'bmd table --theme "syn:dark+md:dark" - < data.json',
        'jq -c "[.[] | {id, name}]" api.json | bmd table -',
      ],
    },
  },
];

export const commandHelpByName: Record<string, CommandHelpSpec> = Object.fromEntries(
  commandHelpSpecs.map((s) => [s.meta.name as string, s]),
);
