import { test, expect, describe } from "vitest";
import { parseJsonTableInput } from "../../../src/table/formats/json.ts";
import { parseTableInput } from "../../../src/table/parse-input.ts";
import { normalizeRows } from "../../../src/table/normalize.ts";
import { normalizedTableToMarkdown } from "../../../src/table/to-markdown.ts";

describe("parseJsonTableInput", () => {
  test("parses JSON array of objects", () => {
    const r = parseJsonTableInput(`[{"a":1,"b":2}]`);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fail");
    expect(r.rows).toEqual([{ a: 1, b: 2 }]);
  });

  test("wraps single object in array", () => {
    const r = parseJsonTableInput(`{"x":"y"}`);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fail");
    expect(r.rows).toEqual([{ x: "y" }]);
  });

  test("parses JSON Lines", () => {
    const r = parseJsonTableInput(`{"a":1}\n{"a":2}\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fail");
    expect(r.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  test("rejects non-object rows in array", () => {
    const r = parseJsonTableInput(`[1,2,3]`);
    expect(r.ok).toBe(false);
  });

  test("empty array yields empty rows", () => {
    const r = parseJsonTableInput(`[]`);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fail");
    expect(r.rows).toEqual([]);
  });
});

describe("normalizeRows + markdown", () => {
  test("column order is first-seen across rows", () => {
    const r = parseJsonTableInput(
      `[{"b":1,"a":2},{"a":3,"c":4}]`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("fail");
    const n = normalizeRows(r.rows);
    expect(n.columns).toEqual(["b", "a", "c"]);
    const md = normalizedTableToMarkdown(n);
    expect(md).toContain("| b | a | c |");
  });

  test("auto format matches json for now", () => {
    const a = parseTableInput(`[{"k":"v"}]`, "auto");
    const j = parseTableInput(`[{"k":"v"}]`, "json");
    expect(a).toEqual(j);
  });
});
