import { test, expect, describe } from "bun:test";
import { resolveValue } from "../../../src/template/resolver";
import { MISSING } from "../../../src/template/types";

describe("resolveValue", () => {
  describe("simple keys", () => {
    test("resolves top-level string value", () => {
      expect(resolveValue({ name: "Alice" }, "name")).toBe("Alice");
    });

    test("resolves numeric value", () => {
      expect(resolveValue({ count: 42 }, "count")).toBe(42);
    });

    test("resolves boolean value", () => {
      expect(resolveValue({ flag: true }, "flag")).toBe(true);
    });

    test("resolves null value (not MISSING)", () => {
      expect(resolveValue({ name: null }, "name")).toBeNull();
    });

    test("resolves empty string (not MISSING)", () => {
      expect(resolveValue({ name: "" }, "name")).toBe("");
    });

    test("resolves array value", () => {
      expect(resolveValue({ items: ["a", "b"] }, "items")).toEqual(["a", "b"]);
    });
  });

  describe("dot-path traversal", () => {
    test("resolves nested key", () => {
      expect(resolveValue({ user: { name: "Alice" } }, "user.name")).toBe("Alice");
    });

    test("resolves deeply nested key", () => {
      expect(resolveValue({ a: { b: { c: "deep" } } }, "a.b.c")).toBe("deep");
    });

    test("resolves four levels deep", () => {
      expect(resolveValue({ a: { b: { c: { d: "four" } } } }, "a.b.c.d")).toBe("four");
    });

    test("resolves nested object (not leaf)", () => {
      const nested = { name: "Alice" };
      expect(resolveValue({ user: nested }, "user")).toEqual(nested);
    });
  });

  describe("MISSING sentinel", () => {
    test("missing top-level key returns MISSING", () => {
      expect(resolveValue({}, "name")).toBe(MISSING);
    });

    test("missing nested key returns MISSING", () => {
      expect(resolveValue({ user: {} }, "user.name")).toBe(MISSING);
    });

    test("non-object traversal returns MISSING", () => {
      expect(resolveValue({ user: "string" }, "user.name")).toBe(MISSING);
    });

    test("null traversal returns MISSING", () => {
      expect(resolveValue({ user: null }, "user.name")).toBe(MISSING);
    });

    test("array traversal returns MISSING", () => {
      expect(resolveValue({ items: ["a", "b"] }, "items.0")).toBe(MISSING);
    });

    test("deeply missing path returns MISSING", () => {
      expect(resolveValue({ a: { b: {} } }, "a.b.c.d")).toBe(MISSING);
    });

    test("completely unrelated key returns MISSING", () => {
      expect(resolveValue({ foo: "bar" }, "baz")).toBe(MISSING);
    });
  });

  describe("edge cases", () => {
    test("zero value is not MISSING", () => {
      expect(resolveValue({ val: 0 }, "val")).toBe(0);
    });

    test("false value is not MISSING", () => {
      expect(resolveValue({ val: false }, "val")).toBe(false);
    });

    test("undefined value returns MISSING", () => {
      expect(resolveValue({ val: undefined }, "val")).toBe(MISSING);
    });
  });
});
