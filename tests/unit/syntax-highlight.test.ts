import { test, expect, describe } from "bun:test";
import { highlightCodeBlock } from "../../src/transform/syntax-highlight.ts";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import { TerminalVisitor } from "../../src/pipeline/terminal-visitor.ts";
import { parse } from "../../src/parser/index.ts";
import type { Token } from "../../src/parser/index.ts";
import type { HighlightToken } from "../../src/types/highlight.ts";
import type { RenderContext } from "../../src/renderer/types.ts";

function makeFenceToken(content: string, info: string): Token {
  return {
    type: "fence",
    tag: "code",
    attrs: null,
    content,
    children: null,
    info,
    meta: {},
    map: [0, 1],
    nesting: 0,
    level: 0,
    markup: "```",
    block: true,
    hidden: false,
  } as unknown as Token;
}

describe("highlightCodeBlock", () => {
  test("highlights known language (typescript) and produces highlightTokens in meta", async () => {
    const token = makeFenceToken("const x = 1;\n", "typescript");
    await highlightCodeBlock(token);

    expect(token.meta).toBeDefined();
    expect(token.meta.highlightTokens).toBeDefined();
    expect(Array.isArray(token.meta.highlightTokens)).toBe(true);
    expect(token.meta.highlightTokens.length).toBeGreaterThan(0);
    const firstLine = token.meta.highlightTokens[0]!;
    expect(Array.isArray(firstLine)).toBe(true);
    expect(firstLine.length).toBeGreaterThan(0);
  });

  test("highlightTokens contain color (hex string) and fontStyle (number)", async () => {
    const token = makeFenceToken("const x: number = 42;\n", "typescript");
    await highlightCodeBlock(token);

    const tokens = token.meta.highlightTokens;
    expect(tokens).toBeDefined();

    for (const line of tokens!) {
      for (const ht of line) {
        expect(typeof ht.content).toBe("string");
        expect(typeof ht.color).toBe("string");
        if (ht.color) {
          expect(ht.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
        expect(typeof ht.fontStyle).toBe("number");
      }
    }
  });

  test("unknown language (fakeLang99) leaves meta without highlightTokens", async () => {
    const token = makeFenceToken("foo bar baz\n", "fakeLang99");
    await highlightCodeBlock(token);

    expect(token.meta.highlightTokens).toBeUndefined();
  });

  test("no lang info (empty string) skips highlighting", async () => {
    const token = makeFenceToken("some code\n", "");
    await highlightCodeBlock(token);

    expect(token.meta.highlightTokens).toBeUndefined();
  });

  test("mermaid lang skips highlighting", async () => {
    const token = makeFenceToken("graph TD\n  A --> B\n", "mermaid");
    await highlightCodeBlock(token);

    expect(token.meta.highlightTokens).toBeUndefined();
  });
});

describe("runTransforms (async)", () => {
  test("runTransforms is async and processes fence tokens with syntax highlighting", async () => {
    const { runTransforms } = await import("../../src/transform/pipeline.ts");

    const token = makeFenceToken("const x = 1;\n", "typescript");
    const tokens = [token];

    const result = runTransforms(tokens);
    expect(result).toBeInstanceOf(Promise);
    await result;

    expect(token.meta.highlightTokens).toBeDefined();
    expect(Array.isArray(token.meta.highlightTokens)).toBe(true);
  });
});

// --- TerminalVisitor: highlighted code blocks ---

const mockHighlightTokens: HighlightToken[][] = [
  [
    { content: "const", color: "#ff7b72", fontStyle: 2 },
    { content: " x = ", color: "#e1e4e8", fontStyle: 0 },
    { content: "1", color: "#79c0ff", fontStyle: 0 },
    { content: ";", color: "#e1e4e8", fontStyle: 0 },
  ],
  [
    { content: "// comment", color: "#8b949e", fontStyle: 1 },
  ],
];

/** Build a DocTree with a fence node that has highlightTokens in meta. */
function fenceSource(content: string, info: string): string {
  return "```" + info + "\n" + content + "\n```\n";
}

function buildTreeWithHighlightMeta(
  content: string,
  info: string,
  highlightTokens?: HighlightToken[][],
) {
  const { tokens } = parse(fenceSource(content, info));
  // Inject highlightTokens into the fence token's meta
  for (const t of tokens) {
    if (t.type === 'fence') {
      t.meta = t.meta || {};
      if (highlightTokens) {
        t.meta.highlightTokens = highlightTokens;
      }
    }
  }
  return buildTree(tokens, [], []);
}

describe("TerminalVisitor: highlighted code blocks", () => {
  test("fence with highlightTokens + ansi mode renders per-token ANSI truecolor escapes", () => {
    const tree = buildTreeWithHighlightMeta(
      "const x = 1;\n// comment",
      "typescript",
      mockHighlightTokens,
    );
    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = {
      width: 80,
      format: "utf8",
      ansiEnabled: true,
      theme: DEFAULT_THEME,
    };

    const visitor = new TerminalVisitor(adapter, ansi, ctx);
    const output = visitor.render(tree);

    expect(output).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    expect(output).toContain("const");
    expect(output).toContain("// comment");
  });

  test("fence with highlightTokens + utf8 mode renders bold/italic, no color escapes", () => {
    const tree = buildTreeWithHighlightMeta(
      "const x = 1;\n// comment",
      "typescript",
      mockHighlightTokens,
    );
    const adapter = new Utf8Adapter();
    const ctx: RenderContext = {
      width: 80,
      format: "utf8",
      ansiEnabled: false,
      theme: DEFAULT_THEME,
    };

    const visitor = new TerminalVisitor(adapter, null, ctx);
    const output = visitor.render(tree);

    expect(output).toContain("\x1b[1m");
    expect(output).toContain("\x1b[22m");
    expect(output).toContain("\x1b[3m");
    expect(output).toContain("\x1b[23m");
    expect(output).not.toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });

  test("fence with highlightTokens + ascii mode renders plain text (no ANSI escapes)", () => {
    const tree = buildTreeWithHighlightMeta(
      "const x = 1;\n// comment",
      "typescript",
      mockHighlightTokens,
    );
    const adapter = new AsciiAdapter();
    const ctx: RenderContext = {
      width: 80,
      format: "ascii",
      ansiEnabled: false,
      theme: DEFAULT_THEME,
      parsedSource: fenceSource("const x = 1;\n// comment", "typescript"),
    };

    const visitor = new TerminalVisitor(adapter, null, ctx);
    const output = visitor.render(tree);

    expect(output).not.toContain("\x1b[");
    expect(output).toContain("const");
    expect(output).toContain("// comment");
  });

  test("fence without highlightTokens renders plain code block", () => {
    const tree = buildTreeWithHighlightMeta(
      "some code",
      "javascript",
    );
    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = {
      width: 80,
      format: "utf8",
      ansiEnabled: true,
      theme: DEFAULT_THEME,
      parsedSource: fenceSource("some code", "javascript"),
    };

    const visitor = new TerminalVisitor(adapter, ansi, ctx);
    const output = visitor.render(tree);

    expect(output).not.toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    expect(output).toContain("some code");
  });

  test("language label appears above code block for fence tokens with info string", () => {
    const tree = buildTreeWithHighlightMeta(
      "const x = 1;",
      "typescript",
      mockHighlightTokens,
    );
    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = {
      width: 80,
      format: "utf8",
      ansiEnabled: true,
      theme: DEFAULT_THEME,
      parsedSource: fenceSource("const x = 1;", "typescript"),
    };

    const visitor = new TerminalVisitor(adapter, ansi, ctx);
    const output = visitor.render(tree);
    const lines = output.split("\n");

    const firstContentLine = lines.find(l => l.trim().length > 0);
    expect(firstContentLine).toContain("typescript");
  });
});
