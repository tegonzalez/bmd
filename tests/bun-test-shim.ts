/**
 * Cross-runtime shim: re-exports vitest with bun:test-compatible names.
 * vitest.config.ts aliases 'bun:test' to this file.
 */
export { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach, it } from 'vitest';
export { vi as mock, vi } from 'vitest';

import { vi } from 'vitest';
export const spyOn = vi.spyOn.bind(vi);
