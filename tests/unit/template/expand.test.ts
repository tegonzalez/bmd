import { test, expect, describe } from "bun:test";
import { expandTemplate, extractFields } from "../../../src/template/index";

// TMPL-01: Basic substitution
describe("TMPL-01: basic substitution", () => {
  test("substitutes {{FIELD}} with value from map", () => {
    const result = expandTemplate("Hello {{NAME}}", { NAME: "World" });
    expect(result.output).toBe("Hello World");
    expect(result.warnings).toEqual([]);
  });

  test("multiple expressions in one template", () => {
    const result = expandTemplate("{{A}} and {{B}}", { A: "x", B: "y" });
    expect(result.output).toBe("x and y");
  });

  test("numeric value is stringified", () => {
    const result = expandTemplate("Count: {{n}}", { n: 42 });
    expect(result.output).toBe("Count: 42");
  });

  test("boolean value is stringified", () => {
    const result = expandTemplate("Flag: {{f}}", { f: true });
    expect(result.output).toBe("Flag: true");
  });

  test("dot-path resolves nested values", () => {
    const result = expandTemplate("{{user.name}}", {
      user: { name: "Alice" },
    });
    expect(result.output).toBe("Alice");
  });
});

// TMPL-02: Default values
describe("TMPL-02: default values", () => {
  test("missing field with default uses default", () => {
    const result = expandTemplate("Hello {{NAME:-World}}", {});
    expect(result.output).toBe("Hello World");
  });

  test("present field ignores default", () => {
    const result = expandTemplate("Hello {{NAME:-World}}", { NAME: "Alice" });
    expect(result.output).toBe("Hello Alice");
  });

  test("default with operator pipeline", () => {
    const result = expandTemplate("{{NAME:-world|upper}}", {});
    expect(result.output).toBe("WORLD");
  });
});

// TMPL-03: Operator pipelines
describe("TMPL-03: operator pipelines", () => {
  test("single operator", () => {
    const result = expandTemplate("{{NAME|upper}}", { NAME: "hello" });
    expect(result.output).toBe("HELLO");
  });

  test("chained operators", () => {
    const result = expandTemplate("{{NAME|upper|tr/ /_/}}", {
      NAME: "hello world",
    });
    expect(result.output).toBe("HELLO_WORLD");
  });

  test("list value with join operator", () => {
    const result = expandTemplate("{{items|join/, /}}", {
      items: ["a", "b", "c"],
    });
    expect(result.output).toBe("a, b, c");
  });

  test("unknown operator keeps expression as literal", () => {
    const result = expandTemplate("{{X|bogus}}", { X: "hi" });
    expect(result.output).toBe("{{X|bogus}}");
  });
});

// TMPL-06: Missing fields kept as literal
describe("TMPL-06: missing fields", () => {
  test("missing field with no default kept as literal", () => {
    const result = expandTemplate("Hello {{NAME}}", {});
    expect(result.output).toBe("Hello {{NAME}}");
  });

  test("no values argument keeps all expressions as literal", () => {
    const result = expandTemplate("Hello {{NAME}}");
    expect(result.output).toBe("Hello {{NAME}}");
  });

  test("malformed expression passes through unchanged", () => {
    const result = expandTemplate("{{123bad}}", {});
    expect(result.output).toBe("{{123bad}}");
  });
});

// TMPL-07: Empty value compression
describe("TMPL-07: empty value compression", () => {
  test("empty string value compresses surrounding whitespace", () => {
    const result = expandTemplate("A {{X}} B", { X: "" });
    expect(result.output).toBe("A B");
  });

  test("null value compresses surrounding whitespace", () => {
    const result = expandTemplate("A {{X}} B", { X: null });
    expect(result.output).toBe("A B");
  });
});

// Code block protection
describe("code block protection", () => {
  test("inline code block protects expression", () => {
    const result = expandTemplate("`{{NAME}}`", { NAME: "test" });
    expect(result.output).toBe("`{{NAME}}`");
  });

  test("fenced code block protects expression", () => {
    const template = "before\n```\n{{NAME}}\n```\nafter {{NAME}}";
    const result = expandTemplate(template, { NAME: "test" });
    expect(result.output).toBe("before\n```\n{{NAME}}\n```\nafter test");
  });
});

// Array/list handling
describe("array handling", () => {
  test("array without join uses comma-space default", () => {
    const result = expandTemplate("{{items}}", { items: ["a", "b", "c"] });
    expect(result.output).toBe("a, b, c");
  });
});

// extractFields
describe("extractFields", () => {
  test("returns sorted unique field names", () => {
    const fields = extractFields("Hello {{NAME}} and {{user.email}}");
    expect(fields).toEqual(["NAME", "user.email"]);
  });

  test("deduplicates repeated fields", () => {
    const fields = extractFields("{{A}} and {{B}} and {{A}}");
    expect(fields).toEqual(["A", "B"]);
  });

  test("ignores fields inside code blocks", () => {
    const fields = extractFields("{{A}} and `{{B}}`");
    expect(fields).toEqual(["A"]);
  });

  test("ignores malformed expressions", () => {
    const fields = extractFields("{{A}} and {{123bad}}");
    expect(fields).toEqual(["A"]);
  });

  test("returns empty array for no expressions", () => {
    const fields = extractFields("Hello world");
    expect(fields).toEqual([]);
  });
});
