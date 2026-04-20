import { test, expect, describe } from "bun:test";
import { extractVarArgs, inflateDotPaths } from "../../../src/cli/var-parser.ts";
import { BmdError } from "../../../src/diagnostics/formatter.ts";

describe("extractVarArgs", () => {
  test("collects single --var from argv", () => {
    const result = extractVarArgs(["bun", "bmd", "--var", "name=Alice"]);
    expect(result).toEqual([{ key: "name", value: "Alice" }]);
  });

  test("collects multiple --var from argv", () => {
    const result = extractVarArgs([
      "bun", "bmd", "--var", "a=1", "--var", "b=2",
    ]);
    expect(result).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
  });

  test("splits on first = only (equation=E=mc2)", () => {
    const result = extractVarArgs(["--var", "equation=E=mc2"]);
    expect(result).toEqual([{ key: "equation", value: "E=mc2" }]);
  });

  test("--var KEY (no =) sets value to empty string", () => {
    const result = extractVarArgs(["--var", "flag"]);
    expect(result).toEqual([{ key: "flag", value: "" }]);
  });

  test("VALUE parsed as YAML: number", () => {
    const result = extractVarArgs(["--var", "count=42"]);
    expect(result).toEqual([{ key: "count", value: 42 }]);
  });

  test("VALUE parsed as YAML: boolean true", () => {
    const result = extractVarArgs(["--var", "flag=true"]);
    expect(result).toEqual([{ key: "flag", value: true }]);
  });

  test("VALUE parsed as YAML: boolean false", () => {
    const result = extractVarArgs(["--var", "flag=false"]);
    expect(result).toEqual([{ key: "flag", value: false }]);
  });

  test("empty key (bare =) throws BmdError", () => {
    expect(() => extractVarArgs(["--var", "=value"])).toThrow(BmdError);
  });

  test("empty string throws BmdError", () => {
    expect(() => extractVarArgs(["--var", ""])).toThrow(BmdError);
  });

  test("ignores non --var args", () => {
    const result = extractVarArgs(["bun", "bmd", "--width", "120", "file.md"]);
    expect(result).toEqual([]);
  });

  test("--var at end of argv without value is skipped", () => {
    const result = extractVarArgs(["--var"]);
    expect(result).toEqual([]);
  });
});

describe("inflateDotPaths", () => {
  test("simple key stays flat", () => {
    const result = inflateDotPaths([{ key: "name", value: "Alice" }]);
    expect(result).toEqual({ name: "Alice" });
  });

  test("dot-path creates nested object", () => {
    const result = inflateDotPaths([{ key: "user.name", value: "Bob" }]);
    expect(result).toEqual({ user: { name: "Bob" } });
  });

  test("deep dot-path creates multi-level nesting", () => {
    const result = inflateDotPaths([{ key: "a.b.c", value: 42 }]);
    expect(result).toEqual({ a: { b: { c: 42 } } });
  });

  test("multiple vars merge correctly", () => {
    const result = inflateDotPaths([
      { key: "user.name", value: "Bob" },
      { key: "user.age", value: 30 },
    ]);
    expect(result).toEqual({ user: { name: "Bob", age: 30 } });
  });

  test("later --var with same key overwrites earlier", () => {
    const result = inflateDotPaths([
      { key: "name", value: "Alice" },
      { key: "name", value: "Bob" },
    ]);
    expect(result).toEqual({ name: "Bob" });
  });

  test("mixed flat and nested keys", () => {
    const result = inflateDotPaths([
      { key: "title", value: "Hello" },
      { key: "author.name", value: "Bob" },
    ]);
    expect(result).toEqual({ title: "Hello", author: { name: "Bob" } });
  });
});
