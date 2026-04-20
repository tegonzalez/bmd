import { test, expect, describe } from "bun:test";
import { deepMerge } from "../../../src/cli/var-parser.ts";

describe("deepMerge", () => {
  test("nested objects merge recursively", () => {
    const base = { user: { name: "Alice", age: 30 } };
    const override = { user: { name: "Bob" } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ user: { name: "Bob", age: 30 } });
  });

  test("arrays are replaced, not merged", () => {
    const base = { items: [1, 2, 3] };
    const override = { items: [4, 5] };
    const result = deepMerge(base, override);
    expect(result).toEqual({ items: [4, 5] });
  });

  test("override scalar replaces base scalar", () => {
    const base = { count: 10 };
    const override = { count: 20 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ count: 20 });
  });

  test("override nested merges into base nested without destroying siblings", () => {
    const base = { db: { host: "localhost", port: 5432, name: "mydb" } };
    const override = { db: { port: 3306 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ db: { host: "localhost", port: 3306, name: "mydb" } });
  });

  test("new keys from override are added", () => {
    const base = { a: 1 };
    const override = { b: 2 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("null override replaces value", () => {
    const base = { a: { b: 1 } };
    const override = { a: null };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: null });
  });

  test("empty base merges with override", () => {
    const base = {};
    const override = { a: 1, b: { c: 2 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  test("does not mutate base or override", () => {
    const base = { a: { b: 1 } };
    const override = { a: { c: 2 } };
    deepMerge(base, override);
    expect(base).toEqual({ a: { b: 1 } });
    expect(override).toEqual({ a: { c: 2 } });
  });
});
