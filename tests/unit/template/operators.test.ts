import { describe, test, expect } from "bun:test";
import type { OperatorContext, TemplateWarning } from "../../../src/template/types";

// Will be implemented in src/template/operators.ts
import { OPERATORS, applyOperators } from "../../../src/template/operators";

function makeContext(): OperatorContext {
  return { offset: 0, source: "", warnings: [] };
}

describe("upper operator", () => {
  const op = OPERATORS.get("upper")!;

  test("converts string to uppercase", () => {
    expect(op("hello", [], makeContext())).toBe("HELLO");
  });

  test("handles already uppercase", () => {
    expect(op("HELLO", [], makeContext())).toBe("HELLO");
  });

  test("handles empty string", () => {
    expect(op("", [], makeContext())).toBe("");
  });

  test("maps element-wise over arrays", () => {
    expect(op(["a", "b", "c"], [], makeContext())).toEqual(["A", "B", "C"]);
  });

  test("handles unicode", () => {
    expect(op("cafe\u0301", [], makeContext())).toBe("CAFE\u0301");
  });
});

describe("lower operator", () => {
  const op = OPERATORS.get("lower")!;

  test("converts string to lowercase", () => {
    expect(op("HELLO", [], makeContext())).toBe("hello");
  });

  test("handles already lowercase", () => {
    expect(op("hello", [], makeContext())).toBe("hello");
  });

  test("handles empty string", () => {
    expect(op("", [], makeContext())).toBe("");
  });

  test("maps element-wise over arrays", () => {
    expect(op(["A", "B"], [], makeContext())).toEqual(["a", "b"]);
  });
});

describe("camel operator", () => {
  const op = OPERATORS.get("camel")!;

  test("converts space-separated words", () => {
    expect(op("hello world", [], makeContext())).toBe("helloWorld");
  });

  test("converts hyphen-separated words", () => {
    expect(op("foo-bar-baz", [], makeContext())).toBe("fooBarBaz");
  });

  test("converts all-caps input", () => {
    expect(op("HELLO WORLD", [], makeContext())).toBe("helloWorld");
  });

  test("handles empty string", () => {
    expect(op("", [], makeContext())).toBe("");
  });

  test("handles single word", () => {
    expect(op("hello", [], makeContext())).toBe("hello");
  });

  test("handles mixed separators", () => {
    expect(op("foo_bar-baz qux", [], makeContext())).toBe("fooBarBazQux");
  });

  test("maps element-wise over arrays", () => {
    expect(op(["hello world", "foo-bar"], [], makeContext())).toEqual([
      "helloWorld",
      "fooBar",
    ]);
  });
});

describe("proper operator", () => {
  const op = OPERATORS.get("proper")!;

  test("title-cases words", () => {
    expect(op("hello world", [], makeContext())).toBe("Hello World");
  });

  test("preserves all-caps acronyms", () => {
    expect(op("hello API world", [], makeContext())).toBe("Hello API World");
  });

  test("handles single character", () => {
    expect(op("a", [], makeContext())).toBe("A");
  });

  test("handles single all-caps letter (length 1 is not treated as acronym)", () => {
    // Single char is length 1, not > 1, so it gets title-cased normally
    expect(op("a B c", [], makeContext())).toBe("A B C");
  });

  test("handles empty string", () => {
    expect(op("", [], makeContext())).toBe("");
  });

  test("maps element-wise over arrays", () => {
    expect(op(["hello world", "foo bar"], [], makeContext())).toEqual([
      "Hello World",
      "Foo Bar",
    ]);
  });

  test("preserves multi-char acronyms in arrays", () => {
    expect(op(["hello API", "the URL"], [], makeContext())).toEqual([
      "Hello API",
      "The URL",
    ]);
  });
});

describe("tr operator", () => {
  const op = OPERATORS.get("tr")!;

  test("translates characters", () => {
    expect(op("hello world", [" ", "_"], makeContext())).toBe("hello_world");
  });

  test("translates multiple characters", () => {
    expect(op("a-b_c", ["-_", "._"], makeContext())).toBe("a.b_c");
  });

  test("passes through characters not in FROM", () => {
    expect(op("hello", ["l", "r"], makeContext())).toBe("herro");
  });

  test("maps element-wise over arrays", () => {
    expect(op(["a b", "c d"], [" ", "_"], makeContext())).toEqual([
      "a_b",
      "c_d",
    ]);
  });

  test("returns null and warns on mismatched FROM/TO lengths", () => {
    const ctx = makeContext();
    expect(op("hello", ["ab", "x"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
    expect(ctx.warnings[0]!.hint).toBe("tr: FROM and TO must have same length");
  });

  test("returns null and warns on 0 args", () => {
    const ctx = makeContext();
    expect(op("hello", [], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });

  test("returns null and warns on 1 arg", () => {
    const ctx = makeContext();
    expect(op("hello", ["a"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });

  test("returns null and warns on 3+ args", () => {
    const ctx = makeContext();
    expect(op("hello", ["a", "b", "c"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });
});

describe("applyOperators", () => {
  test("chains operators in order", () => {
    const result = applyOperators("hello world", [
      { name: "upper", args: [] },
    ], makeContext());
    expect(result).toBe("HELLO WORLD");
  });

  test("chains multiple operators", () => {
    const result = applyOperators("hello world", [
      { name: "upper", args: [] },
      { name: "tr", args: [" ", "_"] },
    ], makeContext());
    expect(result).toBe("HELLO_WORLD");
  });

  test("returns null for unknown operator", () => {
    const result = applyOperators("hello", [
      { name: "nonexistent", args: [] },
    ], makeContext());
    expect(result).toBeNull();
  });

  test("returns null when operator returns null (error)", () => {
    const result = applyOperators("hello", [
      { name: "tr", args: [] }, // wrong arg count -> null
    ], makeContext());
    expect(result).toBeNull();
  });

  test("returns value unchanged with empty operator list", () => {
    const result = applyOperators("hello", [], makeContext());
    expect(result).toBe("hello");
  });
});

// =========================================================================
// List operators
// =========================================================================

describe("join operator", () => {
  const op = OPERATORS.get("join")!;

  test("joins array with delimiter", () => {
    expect(op(["a", "b", "c"], [","], makeContext())).toBe("a,b,c");
  });

  test("joins with space-containing delimiter", () => {
    expect(op(["a", "b"], [" and "], makeContext())).toBe("a and b");
  });

  test("joins with newline delimiter", () => {
    expect(op(["a", "b"], ["\n"], makeContext())).toBe("a\nb");
  });

  test("treats scalar as single-element list", () => {
    expect(op("hello", [","], makeContext())).toBe("hello");
  });

  test("3-arg form: prefix/delim/suffix with list", () => {
    expect(op(["a", "b", "c"], ["[", ",", "]"], makeContext())).toBe("[a,b,c]");
  });

  test("3-arg form: single item has no delimiter", () => {
    expect(op(["x"], ["(", ";", ")"], makeContext())).toBe("(x)");
  });

  test("3-arg form: empty list returns empty string", () => {
    expect(op([], ["[", ",", "]"], makeContext())).toBe("");
  });

  test("returns null and warns on 2 args", () => {
    const ctx = makeContext();
    expect(op(["a", "b"], [",", ";"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });

  test("returns null and warns on 0 args", () => {
    const ctx = makeContext();
    expect(op(["a", "b"], [], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });
});

describe("lines operator", () => {
  const op = OPERATORS.get("lines")!;

  test("wraps with prefix and suffix", () => {
    expect(op(["a", "b"], ["- ", "!"], makeContext())).toBe("- a!\n- b!");
  });

  test("0 args: just newline-separated", () => {
    expect(op(["a", "b"], [], makeContext())).toBe("a\nb");
  });

  test("1 arg: prefix only", () => {
    expect(op(["a", "b"], ["- "], makeContext())).toBe("- a\n- b");
  });

  test("treats scalar as single-element list", () => {
    expect(op("hello", ["- "], makeContext())).toBe("- hello");
  });

  test("returns null and warns on 3+ args", () => {
    const ctx = makeContext();
    expect(op(["a", "b"], ["x", "y", "z"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });
});

describe("subst operator", () => {
  const op = OPERATORS.get("subst")!;

  test("1-arg: prefix each", () => {
    expect(op(["a", "b"], ["- "], makeContext())).toEqual(["- a", "- b"]);
  });

  test("2-arg: prefix + suffix", () => {
    expect(op(["a", "b"], ["- ", ";"], makeContext())).toEqual(["- a;", "- b;"]);
  });

  test("4-arg: prefix+suffix + lastPrefix+lastSuffix", () => {
    expect(op(["a", "b", "c"], ["- ", ", ", "- ", "."], makeContext())).toEqual([
      "- a, ",
      "- b, ",
      "- c.",
    ]);
  });

  test("4-arg with single item uses last prefix+suffix", () => {
    expect(op(["only"], ["- ", ", ", "* ", "."], makeContext())).toEqual(["* only."]);
  });

  test("treats scalar as single-element list", () => {
    expect(op("hello", ["- "], makeContext())).toEqual(["- hello"]);
  });

  test("returns array for downstream chaining", () => {
    const result = op(["a", "b"], ["- "], makeContext());
    expect(Array.isArray(result)).toBe(true);
  });

  test("returns null and warns on 0 args", () => {
    const ctx = makeContext();
    expect(op(["a"], [], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });

  test("returns null and warns on 3 args", () => {
    const ctx = makeContext();
    expect(op(["a"], ["x", "y", "z"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });

  test("returns null and warns on 5+ args", () => {
    const ctx = makeContext();
    expect(op(["a"], ["a", "b", "c", "d", "e"], ctx)).toBeNull();
    expect(ctx.warnings.length).toBe(1);
  });
});

describe("applyOperators pipeline chains", () => {
  test("subst then join", () => {
    const result = applyOperators(
      ["a", "b"],
      [
        { name: "subst", args: ["- ", ";"] },
        { name: "join", args: ["\n"] },
      ],
      makeContext(),
    );
    expect(result).toBe("- a;\n- b;");
  });

  test("upper then tr", () => {
    const result = applyOperators(
      "hello world",
      [
        { name: "upper", args: [] },
        { name: "tr", args: [" ", "_"] },
      ],
      makeContext(),
    );
    expect(result).toBe("HELLO_WORLD");
  });
});

// =========================================================================
// applyListSpec
// =========================================================================

import { applyListSpec } from "../../../src/template/list-spec";

describe("applyListSpec", () => {
  test("default spec joins with comma-space", () => {
    expect(applyListSpec(["a", "b"], undefined, [])).toBe("a, b");
  });

  test("explicit join spec", () => {
    expect(applyListSpec(["a", "b"], "join/, /", [])).toBe("a, b");
  });

  test("lines spec with prefix", () => {
    expect(applyListSpec(["a", "b"], "lines/- //", [])).toBe("- a\n- b");
  });

  test("string value returns unchanged", () => {
    expect(applyListSpec("hello", "join/, /", [])).toBe("hello");
  });

  test("empty array returns empty string", () => {
    expect(applyListSpec([], undefined, [])).toBe("");
  });
});
