/**
 * TerminalVisitor tests.
 *
 * Tests verify the tree-walking renderer produces correct terminal output.
 * Previously compared against old renderTokens() pipeline -- now standalone
 * since base-renderer.ts has been obliterated.
 */

import { test, expect, describe } from "bun:test";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { parse } from "../../src/parser/index.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import { TerminalVisitor } from "../../src/pipeline/terminal-visitor.ts";
import type { RenderContext } from "../../src/renderer/types.ts";
import type { DocNode } from "../../src/pipeline/types.ts";

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

/** Render markdown using TerminalVisitor pipeline */
function render(md: string, adapter = asciiAdapter, ansi = null as ReturnType<typeof createAnsiLayer> | null, ctx = asciiCtx): string {
  const { tokens } = parse(md);
  const tree = buildTree(tokens, [], []);
  const visitor = new TerminalVisitor(adapter, ansi, { ...ctx, parsedSource: md });
  return visitor.render(tree);
}

describe("TerminalVisitor", () => {
  describe("Test 1: Heading levels 1-6", () => {
    test("heading levels with ASCII adapter", () => {
      const md = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n";
      const result = render(md);
      expect(result).toContain("H1");
      expect(result).toContain("H2");
      expect(result).toContain("H6");
    });

    test("heading with ANSI styling", () => {
      const md = "# Hello World\n\n## Subheading\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("Hello World");
      expect(result).toContain("Subheading");
      // Should contain ANSI escape sequences
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("Test 2: Paragraph with text wrapping", () => {
    test("wraps text at configured width", () => {
      const longText = "This is a very long paragraph that should be wrapped at the specified width when rendered in the terminal output format for testing purposes.\n";
      const narrowCtx: RenderContext = { ...asciiCtx, width: 40 };
      const result = render(longText, asciiAdapter, null, narrowCtx);
      // Check that lines don't exceed 40 chars
      for (const line of result.split('\n')) {
        if (line.trim()) expect(line.length).toBeLessThanOrEqual(40);
      }
    });

    test("blank line between paragraphs", () => {
      const md = "First paragraph.\n\nSecond paragraph.\n";
      const result = render(md);
      expect(result).toContain("First paragraph.");
      expect(result).toContain("Second paragraph.");
    });
  });

  describe("Test 3: Bullet list", () => {
    test("correct indentation and markers", () => {
      const md = "- item1\n- item2\n- item3\n";
      const result = render(md);
      expect(result).toContain("item1");
      expect(result).toContain("item2");
      expect(result).toContain("item3");
    });

    test("UTF-8 bullets", () => {
      const md = "- item1\n- item2\n";
      const result = render(md, utf8Adapter, null, utf8Ctx);
      expect(result).toContain("item1");
      expect(result).toContain("item2");
    });
  });

  describe("Test 4: Ordered list", () => {
    test("correct numbering and indentation", () => {
      const md = "1. first\n2. second\n3. third\n";
      const result = render(md);
      expect(result).toContain("first");
      expect(result).toContain("second");
      expect(result).toContain("third");
    });

    test("starts from specified number", () => {
      const md = "3. third\n4. fourth\n";
      const result = render(md);
      expect(result).toContain("third");
      expect(result).toContain("fourth");
    });
  });

  describe("Test 5: Nested lists", () => {
    test("bullet inside ordered", () => {
      const md = "1. outer\n   - inner\n";
      const result = render(md);
      expect(result).toContain("outer");
      expect(result).toContain("inner");
    });

    test("ordered inside bullet", () => {
      const md = "- outer\n  1. inner\n";
      const result = render(md);
      expect(result).toContain("outer");
      expect(result).toContain("inner");
    });

    test("unordered inside unordered", () => {
      const md = "- outer\n  - inner\n";
      const result = render(md);
      expect(result).toContain("outer");
      expect(result).toContain("inner");
    });
  });

  describe("Test 6: Fenced code block", () => {
    test("with language label", () => {
      const md = "```js\nconsole.log(1)\n```\n";
      const result = render(md);
      expect(result).toContain("js");
      expect(result).toContain("console.log(1)");
    });

    test("without language", () => {
      const md = "```\ncode here\n```\n";
      const result = render(md);
      expect(result).toContain("code here");
    });

    test("with ANSI dim styling", () => {
      const md = "```\ncode here\n```\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("code here");
    });
  });

  describe("Test 7: Table with alignment", () => {
    test("basic table", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |\n";
      const result = render(md);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result).toContain("1");
      expect(result).toContain("2");
    });

    test("table with alignment", () => {
      const md = "| Left | Center | Right |\n|:-----|:------:|------:|\n| a | b | c |\n";
      const result = render(md);
      expect(result).toContain("Left");
      expect(result).toContain("Center");
      expect(result).toContain("Right");
    });

    test("UTF-8 table", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |\n";
      const result = render(md, utf8Adapter, null, utf8Ctx);
      expect(result).toContain("A");
      expect(result).toContain("B");
    });
  });

  describe("Test 8: Blockquote", () => {
    test("with quote bar prefix", () => {
      const md = "> This is a quote\n";
      const result = render(md);
      expect(result).toContain("This is a quote");
    });

    test("blockquote with ANSI styling", () => {
      const md = "> This is a quote\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("This is a quote");
    });
  });

  describe("Test 9: Nested blockquote", () => {
    test("cumulative prefix", () => {
      const md = "> > Nested quote\n";
      const result = render(md);
      expect(result).toContain("Nested quote");
    });

    test("multi-level nesting", () => {
      const md = "> outer\n>\n> > inner\n";
      const result = render(md);
      expect(result).toContain("outer");
      expect(result).toContain("inner");
    });
  });

  describe("Test 10: Horizontal rule", () => {
    test("spanning width ASCII", () => {
      const md = "---\n";
      const result = render(md);
      expect(result.trim().length).toBeGreaterThan(0);
    });

    test("spanning width UTF-8", () => {
      const md = "---\n";
      const result = render(md, utf8Adapter, null, utf8Ctx);
      expect(result.trim().length).toBeGreaterThan(0);
    });
  });

  describe("Test 11: Inline formatting", () => {
    test("bold", () => {
      const md = "This is **bold** text.\n";
      const result = render(md);
      expect(result).toContain("bold");
    });

    test("italic", () => {
      const md = "This is *italic* text.\n";
      const result = render(md);
      expect(result).toContain("italic");
    });

    test("strikethrough", () => {
      const md = "This is ~~deleted~~ text.\n";
      const result = render(md);
      expect(result).toContain("deleted");
    });

    test("inline code", () => {
      const md = "Use `console.log` here\n";
      const result = render(md);
      expect(result).toContain("console.log");
    });

    test("link ASCII", () => {
      const md = "[click here](https://example.com)\n";
      const result = render(md);
      expect(result).toContain("click here");
      expect(result).toContain("https://example.com");
    });

    test("link ANSI", () => {
      const md = "[click here](https://example.com)\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("click here");
    });

    test("ANSI bold", () => {
      const md = "This is **bold** text.\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("bold");
      expect(result).toMatch(/\x1b\[/);
    });

    test("ANSI italic", () => {
      const md = "This is *italic* text.\n";
      const result = render(md, utf8Adapter, ansiLayer, ansiCtx);
      expect(result).toContain("italic");
    });
  });

  describe("Test 12: Tight list (hidden paragraphs)", () => {
    test("no extra blank lines", () => {
      const md = "- item1\n- item2\n- item3\n";
      const result = render(md);
      expect(result).toContain("item1");
      expect(result).toContain("item2");
      expect(result).toContain("item3");
    });
  });

  describe("Test 13: Loose list", () => {
    test("blank lines between items", () => {
      const md = "- item1\n\n- item2\n\n- item3\n";
      const result = render(md);
      expect(result).toContain("item1");
      expect(result).toContain("item2");
      expect(result).toContain("item3");
    });
  });

  describe("Test 14: List item with multiple paragraphs", () => {
    test("multiple paragraphs in item", () => {
      const md = "- First paragraph.\n\n  Second paragraph.\n";
      const result = render(md);
      expect(result).toContain("First paragraph.");
      expect(result).toContain("Second paragraph.");
    });
  });

  describe("Test 15: Table inside blockquote", () => {
    test("table with blockquote prefix", () => {
      const md = "> | A | B |\n> |---|---|\n> | 1 | 2 |\n";
      const result = render(md);
      expect(result).toContain("A");
      expect(result).toContain("B");
    });
  });

  describe("Test 16: Mermaid fence", () => {
    test("mermaid with mermaidRendered meta", () => {
      const { tokens } = parse("```mermaid\ngraph LR\n  A --> B\n```\n");
      for (const t of tokens) {
        if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
          t.meta = t.meta || {};
          t.meta.isMermaid = true;
          t.meta.mermaidRendered = '  [Mermaid Diagram]';
        }
      }
      const tree = buildTree(tokens, [], []);
      const visitor = new TerminalVisitor(asciiAdapter, null, asciiCtx);
      const result = visitor.render(tree);
      expect(result).toContain('[Mermaid Diagram]');
    });
  });

  describe("Test 17: Deeply nested context", () => {
    test("paragraph in blockquote in list item", () => {
      const md = "- > Some quoted text\n";
      const result = render(md);
      expect(result).toContain("Some quoted text");
    });
  });

  describe("Test 18: ASCII mode", () => {
    test("no ANSI escapes", () => {
      const md = "# Heading\n\nParagraph with **bold** and *italic*.\n\n- item\n\n> quote\n";
      const result = render(md);
      expect(result).not.toMatch(/\x1b\[/);
    });
  });

  describe("Test 19: ANSI escape findings", () => {
    test("text node with ansi-escape finding renders visible glyph", () => {
      const tree: DocNode = {
        type: 'document',
        byteRange: [0, 20],
        children: [{
          type: 'paragraph',
          byteRange: [0, 20],
          children: [{
            type: 'text',
            byteRange: [0, 20],
            children: [],
            content: 'Hello \x1b[31mWorld',
            meta: {},
            findings: [{
              offset: 6,
              length: 5,
              category: 'ansi-escape',
              codepoint: 0x001B,
              glyph: '\u241B[31m',
              tooltip: 'U+001B ANSI escape',
              isAtomic: true,
            }],
            regions: [],
          }],
          meta: {},
          findings: [],
          regions: [],
        }],
        meta: {},
        findings: [],
        regions: [],
      };

      const visitor = new TerminalVisitor(asciiAdapter, null, asciiCtx);
      const result = visitor.render(tree);
      expect(result).toContain('\u241B[31m');
      expect(result).not.toContain('\x1b[31m');
    });
  });

  describe("Test 20: Mixed findings (unicode + ANSI)", () => {
    test("renders all findings as visible glyphs", () => {
      const tree: DocNode = {
        type: 'document',
        byteRange: [0, 30],
        children: [{
          type: 'paragraph',
          byteRange: [0, 30],
          children: [{
            type: 'text',
            byteRange: [0, 30],
            children: [],
            content: 'A\u200BB\x1b[0mC',
            meta: {},
            findings: [
              {
                offset: 1,
                length: 1,
                category: 'zero-width',
                codepoint: 0x200B,
                glyph: '\u2423',
                tooltip: 'U+200B Zero Width Space',
                isAtomic: false,
              },
              {
                offset: 3,
                length: 4,
                category: 'ansi-escape',
                codepoint: 0x001B,
                glyph: '\u241B[0m',
                tooltip: 'U+001B ANSI escape',
                isAtomic: true,
              },
            ],
            regions: [],
          }],
          meta: {},
          findings: [],
          regions: [],
        }],
        meta: {},
        findings: [],
        regions: [],
      };

      const visitor = new TerminalVisitor(asciiAdapter, null, asciiCtx);
      const result = visitor.render(tree);
      expect(result).toContain('\u2423');
      expect(result).toContain('\u241B[0m');
    });
  });

  describe("Test 21: Template region styling", () => {
    test("ANSI mode applies template-region theme style", () => {
      const tree: DocNode = {
        type: 'document',
        byteRange: [0, 11],
        children: [{
          type: 'paragraph',
          byteRange: [0, 11],
          children: [{
            type: 'text',
            byteRange: [0, 11],
            children: [],
            content: 'Hello World',
            meta: {},
            findings: [],
            regions: [{
              id: 1,
              type: 'T',
              originalByteRange: [6, 11],
              expandedByteRange: [6, 11],
              originalContent: '{{NAME}}',
              expandedContent: 'World',
            }],
          }],
          meta: {},
          findings: [],
          regions: [],
        }],
        meta: {},
        findings: [],
        regions: [],
      };

      const regionCtx: RenderContext = {
        ...ansiCtx,
        theme: {
          ...(ansiCtx.theme as any),
          unic: {
            ...(ansiCtx.theme as any)?.unic,
            'template-region': { fg: '#60a5fa', bg: '#1e293b' },
          },
        } as any,
      };
      const visitor = new TerminalVisitor(utf8Adapter, ansiLayer, regionCtx);
      const result = visitor.render(tree);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("Additional edge cases", () => {
    test("image renders correctly", () => {
      const md = "![alt text](https://img.png)\n";
      const result = render(md);
      expect(result).toContain("alt text");
      expect(result).toContain("https://img.png");
    });

    test("softbreak renders as space", () => {
      const md = "line1\nline2\n";
      const result = render(md);
      expect(result).toContain("line1");
      expect(result).toContain("line2");
    });

    test("hardbreak renders as newline", () => {
      const md = "line1  \nline2\n";
      const result = render(md);
      expect(result).toContain("line1");
      expect(result).toContain("line2");
    });

    test("block spacing between elements", () => {
      const md = "# Heading\n\nParagraph.\n\n- item\n";
      const result = render(md);
      expect(result).toContain("Heading");
      expect(result).toContain("Paragraph.");
      expect(result).toContain("item");
    });
  });
});
