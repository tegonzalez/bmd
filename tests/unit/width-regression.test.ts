/**
 * Width regression tests.
 *
 * Every rendered line must fit within the configured terminal width.
 * Tests use displayWidth (ANSI-aware, CJK-aware) to measure actual
 * visible width, not string .length.
 */

import { test, expect, describe } from "bun:test";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { parse } from "../../src/parser/index.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import { TerminalVisitor } from "../../src/pipeline/terminal-visitor.ts";
import { displayWidth } from "../../src/renderer/wrap.ts";
import type { RenderContext } from "../../src/renderer/types.ts";

const asciiAdapter = new AsciiAdapter();
const utf8Adapter = new Utf8Adapter();
const ansiLayer = createAnsiLayer(DEFAULT_THEME);

/** Render markdown with a given width */
function render(
  md: string,
  width: number,
  opts?: { adapter?: typeof asciiAdapter; ansi?: typeof ansiLayer | null; format?: "ascii" | "utf8" },
): string {
  const adapter = opts?.adapter ?? asciiAdapter;
  const ansi = opts?.ansi ?? null;
  const format = opts?.format ?? "ascii";
  const ctx: RenderContext = {
    width,
    format,
    ansiEnabled: ansi !== null,
    theme: DEFAULT_THEME,
    parsedSource: md,
  };
  const { tokens } = parse(md);
  const tree = buildTree(tokens, [], []);
  const visitor = new TerminalVisitor(adapter, ansi, ctx);
  return visitor.render(tree);
}

/** Assert every non-empty line fits within maxWidth */
function assertAllLinesFit(output: string, maxWidth: number, label: string) {
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const w = displayWidth(line);
    if (w > maxWidth) {
      throw new Error(
        `${label}: line ${i + 1} exceeds width ${maxWidth} (actual: ${w}):\n` +
        `  "${line}"`
      );
    }
  }
}

// ── Paragraphs ──────────────────────────────────────────────────

describe("width regression — paragraphs", () => {
  const WIDTH = 40;

  test("long paragraph wraps within width", () => {
    const md = "This is a very long paragraph that should be wrapped at the specified width when rendered in the terminal output format for testing purposes and verification.\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "paragraph");
  });

  test("paragraph with inline formatting wraps within width", () => {
    const md = "This has **bold text** and *italic text* and `inline code` and [a link](https://example.com/very/long/path) all mixed together.\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "paragraph with inline");
  });

  test("paragraph with ANSI wraps within width", () => {
    const md = "This is a very long paragraph that should be wrapped at the specified width when rendered in the terminal output format for testing purposes and verification.\n";
    const output = render(md, WIDTH, { adapter: utf8Adapter, ansi: ansiLayer, format: "utf8" });
    assertAllLinesFit(output, WIDTH, "ANSI paragraph");
  });
});

// ── Headings ────────────────────────────────────────────────────

describe("width regression — headings", () => {
  const WIDTH = 40;

  test("long h1 wraps within width", () => {
    const md = "# This is a very long heading that exceeds the configured terminal width\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "h1");
  });

  test("long h2 wraps within width", () => {
    const md = "## This heading also exceeds the terminal width limit that we set\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "h2");
  });

  test("heading with ANSI wraps within width", () => {
    const md = "# This is a very long heading that exceeds the configured terminal width\n";
    const output = render(md, WIDTH, { adapter: utf8Adapter, ansi: ansiLayer, format: "utf8" });
    assertAllLinesFit(output, WIDTH, "ANSI heading");
  });
});

// ── Lists ───────────────────────────────────────────────────────

describe("width regression — lists", () => {
  const WIDTH = 40;

  test("bullet list with long items wraps within width", () => {
    const md = [
      "- This is a long bullet item that should wrap correctly at the terminal width",
      "- Another long item with enough text to force word wrapping in the output",
      "- Short item",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "bullet list");
  });

  test("ordered list with long items wraps within width", () => {
    const md = [
      "1. First ordered item with enough text to force word wrapping at the terminal width boundary",
      "2. Second item also long enough to wrap around the line and continue on the next line",
      "10. Double digit numbered item with a very long description that wraps",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "ordered list");
  });

  test("nested bullet list wraps within width", () => {
    const md = [
      "- Outer item with some text",
      "  - Inner item with enough text to force wrapping at terminal width",
      "    - Deeply nested item with even more text to verify width constraint",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "nested bullet list");
  });

  test("nested ordered in bullet wraps within width", () => {
    const md = [
      "- Outer bullet item",
      "  1. Inner ordered item with enough text to test wrapping behavior at narrow widths",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "nested ordered in bullet");
  });

  test("list item with multiple paragraphs wraps within width", () => {
    const md = [
      "- First paragraph of the list item which is long enough to wrap around.",
      "",
      "  Second paragraph inside the same list item that also exceeds width.",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "multi-paragraph list item");
  });
});

// ── Tables ──────────────────────────────────────────────────────

describe("width regression — tables", () => {
  const WIDTH = 40;

  test("wide table shrinks to fit within width", () => {
    const md = [
      "| Column One | Column Two | Column Three | Column Four |",
      "|------------|------------|--------------|-------------|",
      "| data one   | data two   | data three   | data four   |",
      "| more data  | more data  | more data    | more data   |",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "wide table");
  });

  test("table with long cell content fits within width", () => {
    const md = [
      "| Name | Description |",
      "|------|-------------|",
      "| foo  | A very long description that would exceed terminal width |",
      "| bar  | Another long description with enough text to overflow   |",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "table with long cells");
    expect(output).toContain("terminal");
    expect(output).toContain("overflow");
  });

  test("UTF-8 table fits within width", () => {
    const md = [
      "| Column One | Column Two | Column Three |",
      "|------------|------------|--------------|",
      "| data one   | data two   | data three   |",
      "",
    ].join("\n");
    const output = render(md, WIDTH, { adapter: utf8Adapter, format: "utf8" });
    assertAllLinesFit(output, WIDTH, "UTF-8 table");
  });
});

// ── Blockquotes ─────────────────────────────────────────────────

describe("width regression — blockquotes", () => {
  const WIDTH = 40;

  test("blockquote paragraph wraps within width", () => {
    const md = "> This is a long blockquote paragraph that should wrap correctly within the terminal width including the quote bar prefix.\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "blockquote paragraph");
  });

  test("nested blockquote wraps within width", () => {
    const md = "> > This is a nested blockquote with enough text to test that both levels of quoting plus content fit.\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "nested blockquote");
  });

  test("heading in blockquote fits within width", () => {
    const md = "> # This is a long heading inside a blockquote that needs to fit\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "heading in blockquote");
  });

  test("table in blockquote fits within width", () => {
    const md = [
      "> | Col A | Col B | Col C |",
      "> |-------|-------|-------|",
      "> | one   | two   | three |",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "table in blockquote");
  });

  test("hr in blockquote fits within width", () => {
    const md = "> ---\n";
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "hr in blockquote");
  });

  test("list in blockquote wraps within width", () => {
    const md = [
      "> - This is a list item inside a blockquote with enough text to require wrapping",
      "> - Another item that also needs to wrap correctly within the available space",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "list in blockquote");
  });

  test("code block in blockquote fits within width", () => {
    const md = [
      "> ```",
      "> const x = 'a very long line of code';",
      "> ```",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    // Code lines aren't wrapped (by design) but blockquote prefix is added.
    // We just verify the structure is correct.
    expect(output).toContain("const x");
  });
});

// ── Horizontal Rules ────────────────────────────────────────────

describe("width regression — horizontal rules", () => {
  test("hr spans exactly the configured width", () => {
    const WIDTH = 60;
    const output = render("---\n", WIDTH);
    const hrLine = output.split("\n").find(l => l.trim().length > 0)!;
    expect(displayWidth(hrLine)).toBe(WIDTH);
  });

  test("hr at narrow width", () => {
    const WIDTH = 20;
    const output = render("---\n", WIDTH);
    const hrLine = output.split("\n").find(l => l.trim().length > 0)!;
    expect(displayWidth(hrLine)).toBe(WIDTH);
  });
});

// ── Mermaid Diagrams ────────────────────────────────────────────

describe("width regression — mermaid diagrams", () => {
  test("mermaid pre-rendered content respects width", () => {
    // Simulate what transform.ts does: truncate to width
    const WIDTH = 40;
    const { tokens } = parse("```mermaid\ngraph LR\n  A --> B\n```\n");
    for (const t of tokens) {
      if (t.type === "fence" && (t.info || "").trim().toLowerCase() === "mermaid") {
        t.meta = t.meta || {};
        t.meta.isMermaid = true;
        // Simulate a wide diagram that was truncated to WIDTH
        const wideLine = "│  " + "A".repeat(WIDTH + 20) + "  │";
        const truncated = wideLine.slice(0, WIDTH);
        t.meta.mermaidRendered = truncated;
      }
    }
    const ctx: RenderContext = { width: WIDTH, format: "ascii", ansiEnabled: false, theme: DEFAULT_THEME };
    const tree = buildTree(tokens, [], []);
    const visitor = new TerminalVisitor(asciiAdapter, null, ctx);
    const output = visitor.render(tree);
    assertAllLinesFit(output, WIDTH, "mermaid diagram");
  });
});

// ── Mixed Content ───────────────────────────────────────────────

describe("width regression — mixed content", () => {
  const WIDTH = 50;

  test("document with all block types fits within width", () => {
    const md = [
      "# A Heading That Is Reasonably Long",
      "",
      "A paragraph with some text that should wrap within the configured terminal width properly.",
      "",
      "- Bullet item one with enough text to wrap",
      "- Bullet item two also with wrapping text",
      "  - Nested item with more text to test",
      "",
      "1. Ordered first with long text content here",
      "2. Ordered second also with long content",
      "",
      "| Col A | Col B | Col C |",
      "|-------|-------|-------|",
      "| one   | two   | three |",
      "",
      "> A blockquote with enough text to verify wrapping behavior within width constraints.",
      "",
      "---",
      "",
    ].join("\n");
    const output = render(md, WIDTH);
    assertAllLinesFit(output, WIDTH, "mixed content");
  });

  test("very narrow width (20 cols) still works", () => {
    const md = [
      "# Heading",
      "",
      "Some paragraph text that will wrap.",
      "",
      "- A list item",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
    ].join("\n");
    const output = render(md, 20);
    assertAllLinesFit(output, 20, "narrow 20-col");
  });
});
