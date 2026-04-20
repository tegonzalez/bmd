/**
 * Test setup — initializes the runtime adapter before any test file loads.
 * Used by both vitest (via vitest.config.ts setupFiles) and bun test (via bunfig.toml preload).
 */
import { initRuntime } from '../src/runtime/index.ts';

await initRuntime();
