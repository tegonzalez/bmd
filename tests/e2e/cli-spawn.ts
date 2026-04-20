import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(e2eDir, "../..");

/**
 * Subprocess CLI for e2e only.
 * - Bun: `bun <src/cli/index.ts>` (direct TypeScript entry).
 * - Node (e.g. Vitest): `node <dist/cli.js>` — requires a built CLI (`npm run build` / postinstall).
 */
export function bmdCliEntry(): [string, string] {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
    return ["bun", resolve(root, "src/cli/index.ts")];
  }
  return ["node", resolve(root, "dist/cli.js")];
}

/** Spread into `rt.spawn([...bmdCliPrefix(), "render", ...])`. */
export function bmdCliPrefix(): string[] {
  const [runner, entry] = bmdCliEntry();
  return [runner, entry];
}
