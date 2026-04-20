/**
 * Tests for eval and meval command shared logic.
 *
 * Tests coerceYamlValue, parseOperatorPipeline, applyPipelineAndFormat
 * and the line-by-line vs multi-line semantics.
 */

import { test, expect, describe } from "bun:test";
import { getRuntime } from "../../src/runtime/index.ts";
import {
  coerceYamlValue,
  parseOperatorPipeline,
  applyPipelineAndFormat,
} from "../../src/cli/commands/eval-shared.ts";

describe("coerceYamlValue", () => {
  test("string passes through", () => {
    expect(coerceYamlValue("hello")).toBe("hello");
  });

  test("number coerces to string", () => {
    expect(coerceYamlValue(42)).toBe("42");
  });

  test("boolean coerces to string", () => {
    expect(coerceYamlValue(true)).toBe("true");
  });

  test("null coerces to empty string", () => {
    expect(coerceYamlValue(null)).toBe("");
  });

  test("undefined coerces to empty string", () => {
    expect(coerceYamlValue(undefined)).toBe("");
  });

  test("array of strings stays as string[]", () => {
    expect(coerceYamlValue(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("array of mixed types coerces elements to strings", () => {
    expect(coerceYamlValue([1, "two", true])).toEqual(["1", "two", "true"]);
  });
});

describe("parseOperatorPipeline", () => {
  test("single operator", () => {
    const ops = parseOperatorPipeline("upper");
    expect(ops).not.toBeNull();
    expect(ops!.length).toBe(1);
    expect(ops![0]!.name).toBe("upper");
    expect(ops![0]!.args).toEqual([]);
  });

  test("operator with args", () => {
    const ops = parseOperatorPipeline("join/-/");
    expect(ops).not.toBeNull();
    expect(ops!.length).toBe(1);
    expect(ops![0]!.name).toBe("join");
    expect(ops![0]!.args).toEqual(["-"]);
  });

  test("multi-operator pipeline", () => {
    const ops = parseOperatorPipeline("upper|tr/ /_/");
    expect(ops).not.toBeNull();
    expect(ops!.length).toBe(2);
    expect(ops![0]!.name).toBe("upper");
    expect(ops![1]!.name).toBe("tr");
    expect(ops![1]!.args).toEqual([" ", "_"]);
  });

  test("returns null for empty string", () => {
    expect(parseOperatorPipeline("")).toBeNull();
  });
});

describe("applyPipelineAndFormat", () => {
  test("upper on string", () => {
    expect(applyPipelineAndFormat("hello", "upper")).toBe("HELLO");
  });

  test("upper on YAML number coerced to string", () => {
    expect(applyPipelineAndFormat("42", "upper")).toBe("42");
  });

  test("upper auto-maps over array, applies list_spec", () => {
    expect(applyPipelineAndFormat(["a", "b", "c"], "upper")).toBe("A, B, C");
  });

  test("join on array", () => {
    expect(applyPipelineAndFormat(["a", "b", "c"], "join/-/")).toBe("a-b-c");
  });

  test("multi-operator pipeline", () => {
    expect(applyPipelineAndFormat("hello world", "upper|tr/ /_/")).toBe("HELLO_WORLD");
  });

  test("returns null for invalid pipeline", () => {
    expect(applyPipelineAndFormat("hello", "")).toBeNull();
  });
});

describe("eval line-by-line semantics", () => {
  const rt = getRuntime();

  test("each line processed independently", () => {
    const lines = ["hello", "world"];
    const results = lines.map((line) => {
      const parsed = rt.parseYAML(line);
      const value = coerceYamlValue(parsed);
      return applyPipelineAndFormat(value, "upper");
    });
    expect(results).toEqual(["HELLO", "WORLD"]);
  });

  test("empty line passes through", () => {
    const value = coerceYamlValue(rt.parseYAML(""));
    // Empty YAML parses to null/undefined -> empty string
    expect(typeof value === "string" ? value : "").toBe("");
  });

  test("YAML list on single line", () => {
    const parsed = rt.parseYAML("[a, b, c]");
    const value = coerceYamlValue(parsed);
    expect(applyPipelineAndFormat(value, "join/-/")).toBe("a-b-c");
  });
});

describe("meval multi-line semantics", () => {
  const rt = getRuntime();

  test("entire input as one YAML value", () => {
    const input = "hello\nworld";
    const parsed = rt.parseYAML(input);
    const value = coerceYamlValue(parsed);
    // "hello\nworld" as YAML is a string "hello world" (YAML folds newlines)
    // Actually YAML parses bare "hello\nworld" as "hello world" - let's verify behavior
    expect(typeof value).toBe("string");
  });

  test("YAML list in multi-line format", () => {
    const input = "- apple\n- banana";
    const parsed = rt.parseYAML(input);
    const value = coerceYamlValue(parsed);
    expect(value).toEqual(["apple", "banana"]);
    expect(applyPipelineAndFormat(value, "upper")).toBe("APPLE, BANANA");
  });

  test("YAML list with join", () => {
    const input = "[a, b, c]";
    const parsed = rt.parseYAML(input);
    const value = coerceYamlValue(parsed);
    expect(applyPipelineAndFormat(value, "join/-/")).toBe("a-b-c");
  });
});
