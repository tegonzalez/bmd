import { test, expect, describe } from "bun:test";
import { highlightCodeBlock } from "../../src/transform/syntax-highlight.ts";
import { renderTokens } from "../../src/renderer/base-renderer.ts";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
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
    // Should have at least one line of tokens
    expect(token.meta.highlightTokens.length).toBeGreaterThan(0);
    // Each line should be an array of tokens
    const firstLine = token.meta.highlightTokens[0];
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
        // Color should be a hex string (6 chars, no alpha)
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

    // runTransforms should return a promise
    const result = runTransforms(tokens);
    expect(result).toBeInstanceOf(Promise);
    await result;

    // After transform, the token should have highlightTokens
    expect(token.meta.highlightTokens).toBeDefined();
    expect(Array.isArray(token.meta.highlightTokens)).toBe(true);
  });
});

// --- Task 2: Renderer tests ---

const mockHighlightTokens: HighlightToken[][] = [
  [
    { content: "const", color: "#ff7b72", fontStyle: 2 },  // bold (keyword)
    { content: " x = ", color: "#e1e4e8", fontStyle: 0 },
    { content: "1", color: "#79c0ff", fontStyle: 0 },
    { content: ";", color: "#e1e4e8", fontStyle: 0 },
  ],
  [
    { content: "// comment", color: "#8b949e", fontStyle: 1 },  // italic (comment)
  ],
];

function makeFenceTokenWithHighlights(
  content: string,
  info: string,
  highlightTokens?: HighlightToken[][],
): Token {
  const token = makeFenceToken(content, info);
  if (highlightTokens) {
    (token.meta as any).highlightTokens = highlightTokens;
  }
  return token;
}

describe("Renderer: highlighted code blocks", () => {
  test("fence with highlightTokens + ansi mode renders per-token ANSI truecolor escapes", () => {
    const token = makeFenceTokenWithHighlights(
      "const x = 1;\n// comment\n",
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

    const output = renderTokens([token], adapter, ansi, ctx);

    // Should contain truecolor ANSI escapes: \x1b[38;2;R;G;Bm
    expect(output).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    // Should contain "const" text
    expect(output).toContain("const");
    // Should contain "// comment" text
    expect(output).toContain("// comment");
  });

  test("fence with highlightTokens + utf8 mode renders bold/italic, no color escapes", () => {
    const token = makeFenceTokenWithHighlights(
      "const x = 1;\n// comment\n",
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

    const output = renderTokens([token], adapter, null, ctx);

    // Should contain bold escape for keyword (fontStyle & 2)
    expect(output).toContain("\x1b[1m");   // bold start
    expect(output).toContain("\x1b[22m");  // bold end
    // Should contain italic escape for comment (fontStyle & 1)
    expect(output).toContain("\x1b[3m");   // italic start
    expect(output).toContain("\x1b[23m");  // italic end
    // Should NOT contain truecolor escapes
    expect(output).not.toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });

  test("fence with highlightTokens + ascii mode renders plain text (no ANSI escapes)", () => {
    const token = makeFenceTokenWithHighlights(
      "const x = 1;\n// comment\n",
      "typescript",
      mockHighlightTokens,
    );
    const adapter = new AsciiAdapter();
    const ctx: RenderContext = {
      width: 80,
      format: "ascii",
      ansiEnabled: false,
      theme: DEFAULT_THEME,
    };

    const output = renderTokens([token], adapter, null, ctx);

    // Should NOT contain any ANSI escapes
    expect(output).not.toContain("\x1b[");
    // Should contain the text content
    expect(output).toContain("const");
    expect(output).toContain("// comment");
  });

  test("fence without highlightTokens renders as before (plain code block)", () => {
    const token = makeFenceToken("some code\n", "javascript");
    // No highlightTokens in meta
    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = {
      width: 80,
      format: "utf8",
      ansiEnabled: true,
      theme: DEFAULT_THEME,
    };

    const output = renderTokens([token], adapter, ansi, ctx);

    // Should NOT have truecolor escapes (no highlight tokens)
    expect(output).not.toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    // Should contain the code content
    expect(output).toContain("some code");
  });

  test("language label appears above code block for fence tokens with info string", () => {
    const token = makeFenceTokenWithHighlights(
      "const x = 1;\n",
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

    const output = renderTokens([token], adapter, ansi, ctx);
    const lines = output.split("\n");

    // First non-empty line should contain the language label "typescript"
    const firstContentLine = lines.find(l => l.trim().length > 0);
    expect(firstContentLine).toContain("typescript");
  });
});
