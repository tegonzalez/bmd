import type { RuntimeAdapter } from './types.ts';

export type { RuntimeAdapter, SpawnOptions, SpawnHandle } from './types.ts';

let instance: RuntimeAdapter | undefined;

/**
 * Initialize the runtime adapter. Must be called once before getRuntime().
 * Uses dynamic import so Node never parses bun.ts (which references Bun globals).
 */
export async function initRuntime(): Promise<RuntimeAdapter> {
  if (!instance) {
    if (typeof globalThis.Bun !== 'undefined') {
      const mod = await import('./bun.ts');
      instance = mod.createBunRuntime();
    } else {
      const mod = await import('./node.ts');
      instance = mod.createNodeRuntime();
    }
  }
  return instance;
}

export function getRuntime(): RuntimeAdapter {
  if (!instance) {
    throw new Error('Runtime not initialized — call initRuntime() at startup');
  }
  return instance;
}
