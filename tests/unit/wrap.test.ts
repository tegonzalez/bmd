import { test, expect, describe } from "bun:test";
import { wrapText, displayWidth } from "../../src/renderer/wrap.ts";

describe("wrapText", () => {
  test("wraps at specified width", () => {
    const text = "Hello world this is a long line that should wrap";
    const result = wrapText(text, 20, 0);
    const lines = result.split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  test("preserves ANSI escapes across line breaks", () => {
    const text = "\x1b[1mHello world this is bold text that wraps\x1b[22m";
    const result = wrapText(text, 20, 0);
    // Should not have broken ANSI escapes
    expect(result).not.toMatch(/\x1b$/m);
    expect(result).not.toMatch(/^\[/m);
  });

  test("counts CJK characters as 2 columns", () => {
    const width = displayWidth("Hello\u4e16\u754c");
    // "Hello" = 5, two CJK chars = 4
    expect(width).toBe(9);
  });

  test("does not break mid-ANSI-escape", () => {
    const text = "\x1b[31mred text here\x1b[0m";
    const result = wrapText(text, 10, 0);
    // Every line should have properly paired ANSI sequences
    expect(result).not.toContain("\x1b\n");
  });

  test("maintains indent on continuation lines", () => {
    const text = "Hello world this is a long line that should wrap with indent";
    const result = wrapText(text, 30, 4);
    const lines = result.split("\n");
    for (const line of lines) {
      expect(line.startsWith("    ")).toBe(true);
    }
  });

  test("handles empty string", () => {
    expect(wrapText("", 80, 0)).toBe("");
  });

  test("handles text shorter than width", () => {
    expect(wrapText("short", 80, 0)).toBe("short");
  });

  test("does not glue words when wrap falls after a space (trim: false preserves gap)", () => {
    const text =
      "one two three four five six seven eight nine ten eleven twelve";
    const result = wrapText(text, 14, 0);
    expect(result).not.toMatch(/[a-z]\n[a-z]/);
  });

  test("keeps comma-space across wrap (no }},\\n{{)", () => {
    const text =
      "prefix text {{CLIENT_ADDRESS}}, {{CLIENT_CSZ}}, suffix words here";
    const result = wrapText(text, 42, 0);
    expect(result).not.toMatch(/\}\}\s*,\n\{\{/);
    expect(result).toMatch(/\}\}\s*,\s+\n\{\{/);
  });
});

describe("displayWidth", () => {
  test("returns correct width for ASCII", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  test("ignores ANSI escapes in width calculation", () => {
    expect(displayWidth("\x1b[1mbold\x1b[22m")).toBe(4);
  });

  test("counts CJK as double width", () => {
    expect(displayWidth("\u4e16\u754c")).toBe(4);
  });
});
