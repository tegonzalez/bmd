/**
 * bmd - Beautiful Markdown renderer
 * Main CLI entry point with subcommand routing.
 */

import { defineCommand, runMain } from 'citty';

const main = defineCommand({
  meta: {
    name: 'bmd',
    version: '0.1.0',
    description: 'Beautiful Markdown renderer',
  },
  subCommands: {
    ascii: () => import('./commands/ascii.ts').then(m => m.default),
    utf8: () => import('./commands/utf8.ts').then(m => m.default),
  },
});

runMain(main);
