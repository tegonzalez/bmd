import { test, expect, describe } from "bun:test";
import { renderTokens } from "../../src/renderer/base-renderer.ts";
import { AsciiAdapter } from "../../src/renderer/ascii-adapter.ts";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import type { Token } from "../../src/parser/index.ts";
import type { RenderContext } from "../../src/renderer/types.ts";

function makeFenceToken(content: string, info: string, meta?: Record<string, any>): Token {
  return {
    type: "fence",
    tag: "code",
    attrs: null,
    content,
    children: null,
    info,
    meta: meta || {},
    map: [0, 1],
    nesting: 0,
    level: 0,
    markup: "```",
    block: true,
    hidden: false,
  } as unknown as Token;
}

describe("Renderer: Mermaid support", () => {
  test("fence with isMermaid=true and mermaidRendered renders diagram text (not raw source)", () => {
    const diagramText = "┌───┐     ┌───┐\n│ A │────>│ B │\n└───┘     └───┘";
    const token = makeFenceToken("graph LR\n  A --> B", "mermaid", {
      isMermaid: true,
      mermaidRendered: diagramText,
    });

    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const output = renderTokens([token], adapter, null, ctx);

    // Should contain the rendered diagram, not the raw source
    expect(output).toContain("┌───┐");
    expect(output).toContain("│ A │");
    expect(output).not.toContain("graph LR");
  });

  test("fence with isMermaid=true and mermaidUnsupported renders placeholder box", () => {
    const token = makeFenceToken("gantt\n  title Test", "mermaid", {
      isMermaid: true,
      mermaidUnsupported: "gantt",
    });

    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const output = renderTokens([token], adapter, null, ctx);

    // Should show placeholder with type name
    expect(output).toContain("gantt");
    expect(output).toContain("unsupported");
    // Should NOT contain the raw mermaid source title line
    expect(output).not.toContain("title Test");
  });

  test("fence with isMermaid=true but no mermaidRendered (error fallback) renders raw source", () => {
    const token = makeFenceToken("graph\n  ---invalid", "mermaid", {
      isMermaid: true,
      // No mermaidRendered, no mermaidUnsupported -> error fallback
    });

    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const output = renderTokens([token], adapter, null, ctx);

    // Should contain the raw source as fallback
    expect(output).toContain("graph");
    expect(output).toContain("---invalid");
  });

  test("Mermaid fence blocks have no language label", () => {
    const diagramText = "┌───┐\n│ A │\n└───┘";
    const token = makeFenceToken("graph LR\n  A", "mermaid", {
      isMermaid: true,
      mermaidRendered: diagramText,
    });

    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: true, theme: DEFAULT_THEME };
    const output = renderTokens([token], adapter, ansi, ctx);

    // Should NOT have "mermaid" as a language label
    // The word "mermaid" should not appear in the output
    expect(output).not.toContain("mermaid");
    // But the diagram should be there
    expect(output).toContain("┌───┐");
  });
});
