import { test, expect, describe } from "bun:test";
import { parseExpression, interpretEscapes } from "../../../src/template/parser";
import type { ParsedExpression } from "../../../src/template/types";

describe("interpretEscapes", () => {
  test("converts \\n to newline", () => {
    expect(interpretEscapes("hello\\nworld")).toBe("hello\nworld");
  });

  test("converts \\t to tab", () => {
    expect(interpretEscapes("col1\\tcol2")).toBe("col1\tcol2");
  });

  test("converts \\r to carriage return", () => {
    expect(interpretEscapes("line\\rend")).toBe("line\rend");
  });

  test("converts \\\\ to backslash", () => {
    expect(interpretEscapes("path\\\\file")).toBe("path\\file");
  });

  test("converts \\/ to slash", () => {
    expect(interpretEscapes("a\\/b")).toBe("a/b");
  });

  test("converts \\| to pipe", () => {
    expect(interpretEscapes("a\\|b")).toBe("a|b");
  });

  test("unknown escape keeps backslash", () => {
    expect(interpretEscapes("\\x")).toBe("\\x");
  });

  test("multiple escapes in one string", () => {
    expect(interpretEscapes("a\\nb\\tc")).toBe("a\nb\tc");
  });

  test("trailing backslash kept as-is", () => {
    expect(interpretEscapes("hello\\")).toBe("hello\\");
  });

  test("no escapes returns unchanged", () => {
    expect(interpretEscapes("hello")).toBe("hello");
  });

  test("empty string returns empty", () => {
    expect(interpretEscapes("")).toBe("");
  });
});

describe("parseExpression", () => {
  describe("simple fields", () => {
    test("simple field name", () => {
      expect(parseExpression("NAME")).toEqual({
        field: "NAME",
        operators: [],
      });
    });

    test("lowercase field name", () => {
      expect(parseExpression("name")).toEqual({
        field: "name",
        operators: [],
      });
    });

    test("field with underscores", () => {
      expect(parseExpression("my_field")).toEqual({
        field: "my_field",
        operators: [],
      });
    });

    test("field starting with underscore", () => {
      expect(parseExpression("_private")).toEqual({
        field: "_private",
        operators: [],
      });
    });

    test("dotted field (dot-path)", () => {
      expect(parseExpression("user.name")).toEqual({
        field: "user.name",
        operators: [],
      });
    });

    test("deeply dotted path", () => {
      expect(parseExpression("a.b.c.d")).toEqual({
        field: "a.b.c.d",
        operators: [],
      });
    });

    test("field with digits", () => {
      expect(parseExpression("field2")).toEqual({
        field: "field2",
        operators: [],
      });
    });

    test("field with hyphens", () => {
      expect(parseExpression("my-field")).toEqual({
        field: "my-field",
        operators: [],
      });
    });
  });

  describe("whitespace handling", () => {
    test("trims leading/trailing whitespace", () => {
      expect(parseExpression(" NAME ")).toEqual({
        field: "NAME",
        operators: [],
      });
    });

    test("trims tabs and mixed whitespace", () => {
      expect(parseExpression("\t NAME \t")).toEqual({
        field: "NAME",
        operators: [],
      });
    });
  });

  describe("default values", () => {
    test("simple default value", () => {
      expect(parseExpression("NAME:-World")).toEqual({
        field: "NAME",
        defaultValue: "World",
        operators: [],
      });
    });

    test("empty default value", () => {
      expect(parseExpression("NAME:-")).toEqual({
        field: "NAME",
        defaultValue: "",
        operators: [],
      });
    });

    test("default with escape sequences", () => {
      const result = parseExpression("NAME:-hello\\nworld");
      expect(result).not.toBeNull();
      expect(result!.field).toBe("NAME");
      expect(result!.defaultValue).toBe("hello\nworld");
    });

    test("default with multiple escapes", () => {
      const result = parseExpression("NAME:-col1\\tcol2\\nrow2");
      expect(result).not.toBeNull();
      expect(result!.defaultValue).toBe("col1\tcol2\nrow2");
    });

    test("default followed by operator", () => {
      expect(parseExpression("NAME:-default|upper")).toEqual({
        field: "NAME",
        defaultValue: "default",
        operators: [{ name: "upper", args: [] }],
      });
    });

    test("default with escaped pipe (not operator boundary)", () => {
      const result = parseExpression("NAME:-a\\|b");
      expect(result).not.toBeNull();
      expect(result!.defaultValue).toBe("a|b");
      expect(result!.operators).toEqual([]);
    });
  });

  describe("operators", () => {
    test("single operator no args", () => {
      expect(parseExpression("NAME|upper")).toEqual({
        field: "NAME",
        operators: [{ name: "upper", args: [] }],
      });
    });

    test("operator with one arg", () => {
      expect(parseExpression("NAME|pad/10/")).toEqual({
        field: "NAME",
        operators: [{ name: "pad", args: ["10"] }],
      });
    });

    test("operator with two args (tr)", () => {
      expect(parseExpression("NAME|tr/ /_/")).toEqual({
        field: "NAME",
        operators: [{ name: "tr", args: [" ", "_"] }],
      });
    });

    test("operator chain", () => {
      expect(parseExpression("NAME|upper|tr/ /_/")).toEqual({
        field: "NAME",
        operators: [
          { name: "upper", args: [] },
          { name: "tr", args: [" ", "_"] },
        ],
      });
    });

    test("escaped pipe in operator args", () => {
      const result = parseExpression("NAME|tr/\\|/X/");
      expect(result).not.toBeNull();
      expect(result!.operators[0]!.args).toEqual(["|", "X"]);
    });

    test("escaped slash in operator args", () => {
      const result = parseExpression("NAME|tr/a\\/b/c/");
      expect(result).not.toBeNull();
      expect(result!.operators[0]!.args).toEqual(["a/b", "c"]);
    });

    test("operator with three args", () => {
      expect(parseExpression("NAME|sub/a/b/g/")).toEqual({
        field: "NAME",
        operators: [{ name: "sub", args: ["a", "b", "g"] }],
      });
    });

    test("dotted field with operators", () => {
      expect(parseExpression("user.name|upper")).toEqual({
        field: "user.name",
        operators: [{ name: "upper", args: [] }],
      });
    });
  });

  describe("malformed expressions", () => {
    test("empty string returns null", () => {
      expect(parseExpression("")).toBeNull();
    });

    test("whitespace-only returns null", () => {
      expect(parseExpression("   ")).toBeNull();
    });

    test("starts with digit returns null", () => {
      expect(parseExpression("123bad")).toBeNull();
    });

    test("starts with special char returns null", () => {
      expect(parseExpression("@field")).toBeNull();
    });
  });

  describe("combined features", () => {
    test("field + default + operator chain", () => {
      expect(parseExpression("NAME:-fallback|upper|tr/ /_/")).toEqual({
        field: "NAME",
        defaultValue: "fallback",
        operators: [
          { name: "upper", args: [] },
          { name: "tr", args: [" ", "_"] },
        ],
      });
    });

    test("dotted field + default + operator", () => {
      expect(parseExpression("user.email:-none|lower")).toEqual({
        field: "user.email",
        defaultValue: "none",
        operators: [{ name: "lower", args: [] }],
      });
    });
  });
});
