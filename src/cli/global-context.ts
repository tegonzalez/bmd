/**
 * Global CLI prefix parsed before subcommand routing (see `parseLeadingGlobalArgv`).
 */

import type { BmdGlobalPrefix } from './global-options.ts';

let stored: BmdGlobalPrefix = {};

export function setBmdGlobalPrefix(p: BmdGlobalPrefix): void {
  stored = { ...p };
}

export function getBmdGlobalPrefix(): BmdGlobalPrefix {
  return stored;
}
