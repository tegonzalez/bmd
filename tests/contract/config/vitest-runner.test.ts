import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const PRECONDITION =
  "BMD Vitest compatibility requires a real Node.js executable; put Node.js 18+ on PATH or set BMD_NODE to a real node binary.";

const readText = (path: string): string => readFileSync(path, "utf8");

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readText(path)) as Record<string, unknown>;

describe("Vitest compatibility runner", () => {
  test("wires bun run test through the non-hanging runner", () => {
    const pkg = readJson("package.json");
    const scripts = pkg.scripts as Record<string, string>;

    expect(scripts.test).toBe("node scripts/run-vitest.mjs");
  });

  test("documents the real Node precondition and handoff path", () => {
    const runner = readText("scripts/run-vitest.mjs");

    expect(runner).toContain(PRECONDITION);
    expect(runner).toContain("BMD_NODE");
    expect(runner).toContain("vitest.mjs");
  });
});
