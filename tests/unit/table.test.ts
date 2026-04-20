import { test, expect, describe } from "bun:test";
import { layoutTable, type TableRow } from "../../src/renderer/table.ts";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { displayWidth } from "../../src/renderer/wrap.ts";

describe("layoutTable", () => {
  const asciiChars = new AsciiAdapter().tableChars();
  const utf8Chars = new Utf8Adapter().tableChars();

  test("calculates column widths proportionally", () => {
    const rows: TableRow[] = [
      { cells: ["Name", "Age"], isHeader: true },
      { cells: ["Alice", "30"], isHeader: false },
      { cells: ["Bob", "25"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left", "left"], 40, asciiChars, null);
    expect(result).toContain("Name");
    expect(result).toContain("Alice");
    expect(result).toContain("30");
  });

  test("uses string-width for display width, not .length", () => {
    const rows: TableRow[] = [
      { cells: ["Header", "Col2"], isHeader: true },
      { cells: ["\x1b[1mBold\x1b[22m", "Normal"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left", "left"], 40, asciiChars, null);
    // The bold cell should be aligned properly (not wider due to ANSI)
    const lines = result.split("\n").filter(l => l.length > 0);
    // All content lines should have same visual width
    const widths = lines.map(l => displayWidth(l));
    const firstWidth = widths[0]!;
    for (const w of widths) {
      expect(w).toBe(firstWidth);
    }
  });

  test("renders with correct ASCII border characters", () => {
    const rows: TableRow[] = [
      { cells: ["A", "B"], isHeader: true },
      { cells: ["1", "2"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left", "left"], 40, asciiChars, null);
    expect(result).toContain("+");
    expect(result).toContain("-");
    expect(result).toContain("|");
  });

  test("renders with correct UTF-8 border characters", () => {
    const rows: TableRow[] = [
      { cells: ["A", "B"], isHeader: true },
      { cells: ["1", "2"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left", "left"], 40, utf8Chars, null);
    expect(result).toContain("\u250C"); // topLeft
    expect(result).toContain("\u2500"); // horizontal
    expect(result).toContain("\u2502"); // vertical
  });

  test("handles left alignment", () => {
    const rows: TableRow[] = [
      { cells: ["H"], isHeader: true },
      { cells: ["X"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left"], 20, asciiChars, null);
    // Left-aligned: content padded on right
    const bodyLine = result.split("\n").find(l => l.includes("X"));
    expect(bodyLine).toBeDefined();
    // X should be at the left of the cell
    const idx = bodyLine!.indexOf("X");
    expect(idx).toBe(2); // after "| "
  });

  test("handles center alignment", () => {
    const rows: TableRow[] = [
      { cells: ["Head"], isHeader: true },
      { cells: ["X"], isHeader: false },
    ];
    const result = layoutTable(rows, ["center"], 20, asciiChars, null);
    const bodyLine = result.split("\n").find(l => l.includes("X"));
    expect(bodyLine).toBeDefined();
  });

  test("handles right alignment", () => {
    const rows: TableRow[] = [
      { cells: ["Head"], isHeader: true },
      { cells: ["X"], isHeader: false },
    ];
    const result = layoutTable(rows, ["right"], 20, asciiChars, null);
    const bodyLine = result.split("\n").find(l => l.includes("X"));
    expect(bodyLine).toBeDefined();
    // X should be padded on the left
    const idx = bodyLine!.indexOf("X");
    expect(idx).toBeGreaterThan(2);
  });

  test("handles tables wider than maxWidth by proportional shrinking", () => {
    const rows: TableRow[] = [
      { cells: ["A very long header", "Another long header"], isHeader: true },
      { cells: ["content", "more content"], isHeader: false },
    ];
    const result = layoutTable(rows, ["left", "left"], 30, asciiChars, null);
    const lines = result.split("\n").filter(l => l.length > 0);
    for (const line of lines) {
      expect(displayWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  test("wraps long cell content instead of truncating it", () => {
    const rows: TableRow[] = [
      { cells: ["Key", "Description"], isHeader: true },
      {
        cells: [
          "foo",
          "alpha beta gamma delta epsilon zeta eta theta omega",
        ],
        isHeader: false,
      },
    ];

    const result = layoutTable(rows, ["left", "left"], 36, asciiChars, null);
    const lines = result.split("\n").filter(l => l.length > 0);

    for (const line of lines) {
      expect(displayWidth(line)).toBeLessThanOrEqual(36);
    }
    expect(result).toContain("Key");
    expect(result).toContain("foo");
    expect(result).toContain("alpha");
    expect(result).toContain("theta");
    expect(result).toContain("omega");
  });
});
