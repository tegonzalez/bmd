import { defineConfig } from "vitest/config";

/**
 * Scope to this repo's `tests/` tree only. CLI filters like `./tests` or `tests/`
 * can match unrelated path segments named `tests` when symlinked fixtures exist.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Test files use Bun’s API; Vitest provides the same surface for describe/test/expect.
      "bun:test": "vitest",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./tests/setup.ts"],
  },
});
