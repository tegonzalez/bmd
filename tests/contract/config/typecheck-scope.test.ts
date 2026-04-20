import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("typecheck command and project scope", () => {
  test("exposes the maintainer typecheck command", () => {
    const pkg = readJson("package.json");
    const scripts = pkg.scripts as Record<string, string>;

    expect(scripts.typecheck).toBe("tsc --noEmit");
  });

  test("limits TypeScript to project source and tests", () => {
    const tsconfig = readJson("tsconfig.json");

    expect(tsconfig.include).toEqual(["src/**/*.ts", "tests/**/*.ts"]);
    expect(tsconfig.exclude).toEqual([
      "external",
      "dist",
      ".planning",
      "node_modules",
      ".generated",
      "generated",
      "scratch",
      "tmp",
      "coverage",
    ]);
  });
});
