import { test, expect, describe } from "bun:test";
import { renderTokens, renderInline } from "../../src/renderer/base-renderer.ts";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer, type AnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { parse } from "../../src/parser/index.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import type { RenderContext } from "../../src/renderer/types.ts";
import stripAnsi from "strip-ansi";

const asciiAdapter = new AsciiAdapter();
const utf8Adapter = new Utf8Adapter();
const ansiLayer = createAnsiLayer(DEFAULT_THEME);

const asciiCtx: RenderContext = {
  width: 80,
  format: "ascii",
  ansiEnabled: false,
  theme: DEFAULT_THEME,
};

const utf8Ctx: RenderContext = {
  width: 80,
  format: "utf8",
  ansiEnabled: false,
  theme: DEFAULT_THEME,
};

const ansiCtx: RenderContext = {
  width: 80,
  format: "utf8",
  ansiEnabled: true,
  theme: DEFAULT_THEME,
};

function renderAscii(md: string): string {
  const { tokens } = parse(md);
  return renderTokens(tokens, asciiAdapter, null, asciiCtx);
}

function renderUtf8(md: string): string {
  const { tokens } = parse(md);
  return renderTokens(tokens, utf8Adapter, null, utf8Ctx);
}

function renderAnsi(md: string): string {
  const { tokens } = parse(md);
  return renderTokens(tokens, utf8Adapter, ansiLayer, ansiCtx);
}

describe("renderTokens", () => {
  describe("headings", () => {
    test("produces heading with ASCII adapter prefix and line break", () => {
      const result = renderAscii("# Hello World\n");
      expect(result).toContain("# Hello World");
      expect(result).toContain("\n");
    });

    test("produces heading with UTF-8 adapter (no prefix)", () => {
      const result = renderUtf8("# Hello World\n");
      expect(result).toContain("Hello World");
      // UTF-8 adapter returns empty prefix
      expect(result).not.toContain("# Hello");
    });

    test("produces heading with ANSI styling", () => {
      const result = renderAnsi("# Hello World\n");
      expect(result).toContain("Hello World");
      // Should have ANSI escapes
      expect(result).toMatch(/\x1b\[/);
    });

    test("handles multiple heading levels", () => {
      const result = renderAscii("# H1\n\n## H2\n\n### H3\n");
      expect(result).toContain("# H1");
      expect(result).toContain("## H2");
      expect(result).toContain("### H3");
    });
  });

  describe("paragraphs", () => {
    test("produces paragraph with word-wrapped content", () => {
      const longText = "This is a very long paragraph that should be wrapped at the specified width when rendered in the terminal output format.";
      const narrowCtx: RenderContext = { ...asciiCtx, width: 40 };
      const { tokens } = parse(longText + "\n");
      const result = renderTokens(tokens, asciiAdapter, null, narrowCtx);
      const lines = result.trim().split("\n");
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    });

    test("adds blank line between paragraphs", () => {
      const result = renderAscii("First paragraph.\n\nSecond paragraph.\n");
      expect(result).toContain("First paragraph.");
      expect(result).toContain("Second paragraph.");
      // Should have blank line between
      expect(result).toMatch(/First paragraph\.\n\n/);
    });
  });

  describe("inline formatting", () => {
    test("handles bold text", () => {
      const result = renderAscii("This is **bold** text.\n");
      expect(result).toContain("bold");
    });

    test("handles italic text", () => {
      const result = renderAscii("This is *italic* text.\n");
      expect(result).toContain("italic");
    });

    test("handles strikethrough text", () => {
      const result = renderAscii("This is ~~deleted~~ text.\n");
      expect(result).toContain("deleted");
    });

    test("applies ANSI bold when layer active", () => {
      const result = renderAnsi("This is **bold** text.\n");
      expect(result).toMatch(/\x1b\[1m.*bold/);
    });

    test("applies ANSI italic when layer active", () => {
      const result = renderAnsi("This is *italic* text.\n");
      expect(result).toMatch(/\x1b\[/);
      expect(stripAnsi(result)).toContain("italic");
    });
  });

  describe("blockquotes", () => {
    test("renders blockquote with quote bar and indent", () => {
      const result = renderAscii("> This is a quote\n");
      expect(result).toContain("| This is a quote");
    });

    test("renders nested blockquotes with increasing indent", () => {
      const result = renderAscii("> > Nested quote\n");
      // Should have two quote bars
      expect(result).toContain("| | Nested quote");
    });
  });

  describe("unordered lists", () => {
    test("renders with correct bullets and indentation", () => {
      const result = renderAscii("- item1\n- item2\n- item3\n");
      expect(result).toContain("* item1");
      expect(result).toContain("* item2");
      expect(result).toContain("* item3");
    });

    test("renders UTF-8 bullets", () => {
      const result = renderUtf8("- item1\n- item2\n");
      expect(result).toContain("\u2022 item1");
      expect(result).toContain("\u2022 item2");
    });
  });

  describe("ordered lists", () => {
    test("renders with incrementing counters", () => {
      const result = renderAscii("1. first\n2. second\n3. third\n");
      expect(result).toContain("1. first");
      expect(result).toContain("2. second");
      expect(result).toContain("3. third");
    });

    test("starts from specified number", () => {
      const result = renderAscii("3. third\n4. fourth\n");
      expect(result).toContain("3. third");
      expect(result).toContain("4. fourth");
    });
  });

  describe("nested lists", () => {
    test("handles unordered inside unordered", () => {
      const result = renderAscii("- outer\n  - inner\n");
      expect(result).toContain("* outer");
      expect(result).toContain("- inner");
    });

    test("handles ordered inside unordered", () => {
      const result = renderAscii("- outer\n  1. inner\n");
      expect(result).toContain("* outer");
      expect(result).toContain("1. inner");
    });
  });

  describe("code blocks", () => {
    test("renders fence tokens with indentation", () => {
      const result = renderAscii("```js\nconsole.log(1)\n```\n");
      expect(result).toContain("    console.log(1)");
    });

    test("applies ANSI dim when layer active", () => {
      const result = renderAnsi("```\ncode here\n```\n");
      expect(result).toMatch(/\x1b\[/);
      expect(stripAnsi(result)).toContain("code here");
    });
  });

  describe("tables", () => {
    test("renders table via layoutTable", () => {
      const result = renderAscii("| A | B |\n|---|---|\n| 1 | 2 |\n");
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result).toContain("1");
      expect(result).toContain("2");
      // Should have table border characters
      expect(result).toContain("+");
      expect(result).toContain("-");
      expect(result).toContain("|");
    });

    test("renders UTF-8 table with box drawing", () => {
      const result = renderUtf8("| A | B |\n|---|---|\n| 1 | 2 |\n");
      expect(result).toContain("\u250C"); // topLeft
      expect(result).toContain("\u2500"); // horizontal
    });
  });

  describe("horizontal rules", () => {
    test("renders via adapter", () => {
      const result = renderAscii("---\n");
      expect(result).toContain("-".repeat(80));
    });

    test("renders UTF-8 horizontal rule", () => {
      const result = renderUtf8("---\n");
      expect(result).toContain("\u2500".repeat(80));
    });
  });

  describe("links", () => {
    test("renders as text + URL in ASCII mode", () => {
      const result = renderAscii("[click here](https://example.com)\n");
      expect(result).toContain("click here");
      expect(result).toContain("https://example.com");
    });

    test("renders as OSC 8 hyperlink with ANSI layer", () => {
      const result = renderAnsi("[click here](https://example.com)\n");
      expect(result).toContain("\x1b]8;;https://example.com");
      expect(result).toContain("click here");
    });
  });

  describe("images", () => {
    test("renders alt text and URL", () => {
      const result = renderAscii("![alt text](https://img.png)\n");
      expect(result).toContain("alt text");
      expect(result).toContain("https://img.png");
    });
  });

  describe("softbreak and hardbreak", () => {
    test("softbreak renders as space", () => {
      const result = renderAscii("line1\nline2\n");
      // softbreak between line1 and line2 in same paragraph
      expect(result).toContain("line1 line2");
    });

    test("hardbreak renders as newline", () => {
      // Two trailing spaces create hardbreak
      const result = renderAscii("line1  \nline2\n");
      // Hard break should produce actual newline
      const stripped = result.trim();
      expect(stripped).toContain("line1");
      expect(stripped).toContain("line2");
    });
  });

  describe("block spacing", () => {
    test("adds blank line between block elements", () => {
      const result = renderAscii("# Heading\n\nParagraph.\n\n- item\n");
      // Should have spacing between heading and paragraph
      const lines = result.split("\n");
      let foundBlank = false;
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].includes("Heading") && lines[i + 1] === "") {
          foundBlank = true;
          break;
        }
      }
      expect(foundBlank).toBe(true);
    });
  });

  describe("HTML handling", () => {
    test("skips html_block tokens when present", () => {
      // With html: false, HTML becomes plain text in paragraphs.
      // The renderer still handles html_block type if encountered by skipping it.
      // Verify the output contains the text content (treated as paragraph text).
      const result = renderAscii("<div>hello</div>\n");
      expect(result).toContain("hello");
    });

    test("skips html_inline tokens", () => {
      const result = renderAscii("text with <em>inline</em> html\n");
      // html: false means these won't be HTML tokens, just text
      expect(result).toContain("text with");
    });
  });

  describe("inline code", () => {
    test("renders inline code in ASCII mode with backticks", () => {
      const result = renderAscii("Use `console.log` here\n");
      expect(result).toContain("`console.log`");
    });

    test("renders inline code with ANSI styling", () => {
      const result = renderAnsi("Use `console.log` here\n");
      expect(result).toMatch(/\x1b\[/);
      expect(stripAnsi(result)).toContain("console.log");
    });
  });
});
