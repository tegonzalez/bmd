import { test, expect, describe, mock, spyOn } from "bun:test";
import type { Token } from "../../src/parser/index.ts";
import * as diagnostics from "../../src/diagnostics/formatter.ts";

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

describe("renderMermaidBlock", () => {
  test("valid flowchart sets isMermaid=true and mermaidRendered to non-empty string with box-drawing", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");
    const token = makeFenceToken("graph LR\n  A --> B", "mermaid");
    const ctx = { format: "utf8" as const, ansiEnabled: false, width: 120, filePath: "test.md" };

    renderMermaidBlock(token, ctx);

    const meta = token.meta as any;
    expect(meta.isMermaid).toBe(true);
    expect(meta.mermaidRendered).toBeDefined();
    expect(typeof meta.mermaidRendered).toBe("string");
    expect(meta.mermaidRendered.length).toBeGreaterThan(0);
    // Should contain box-drawing characters (Unicode mode)
    expect(meta.mermaidRendered).toMatch(/[─│┌┐└┘├┤┬┴┼]/);
  });

  test("invalid Mermaid source leaves content unchanged, no mermaidRendered, calls writeDiagnostic", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");
    const spy = spyOn(diagnostics, "writeDiagnostic").mockImplementation(() => {});

    const token = makeFenceToken("graph\n  ---invalid", "mermaid");
    const originalContent = token.content;
    const ctx = { format: "utf8" as const, ansiEnabled: false, width: 120, filePath: "test.md" };

    renderMermaidBlock(token, ctx);

    const meta = token.meta as any;
    expect(meta.isMermaid).toBe(true);
    expect(meta.mermaidRendered).toBeUndefined();
    // Content should be unchanged
    expect(token.content).toBe(originalContent);
    // Diagnostic should have been emitted
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]?.severity).toBe("error");

    spy.mockRestore();
  });

  test("unsupported diagram type (gantt) sets mermaidUnsupported and calls writeDiagnostic (warning)", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");
    const spy = spyOn(diagnostics, "writeDiagnostic").mockImplementation(() => {});

    const token = makeFenceToken("gantt\n  title A Gantt", "mermaid");
    const ctx = { format: "utf8" as const, ansiEnabled: false, width: 120, filePath: "test.md" };

    renderMermaidBlock(token, ctx);

    const meta = token.meta as any;
    expect(meta.isMermaid).toBe(true);
    expect(meta.mermaidUnsupported).toBe("gantt");
    expect(meta.mermaidRendered).toBeUndefined();
    // Diagnostic should be a warning
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]?.severity).toBe("warning");

    spy.mockRestore();
  });

  test("useAscii=true (format=ascii) produces ASCII chars (+--+), useAscii=false produces Unicode", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");

    // ASCII mode
    const asciiToken = makeFenceToken("graph LR\n  A --> B", "mermaid");
    renderMermaidBlock(asciiToken, { format: "ascii", ansiEnabled: false, width: 120 });
    const asciiResult = (asciiToken.meta as any).mermaidRendered as string;
    expect(asciiResult).toBeDefined();
    expect(asciiResult).toMatch(/[+\-|]/);

    // UTF8 mode
    const utf8Token = makeFenceToken("graph LR\n  A --> B", "mermaid");
    renderMermaidBlock(utf8Token, { format: "utf8", ansiEnabled: false, width: 120 });
    const utf8Result = (utf8Token.meta as any).mermaidRendered as string;
    expect(utf8Result).toBeDefined();
    expect(utf8Result).toMatch(/[─│┌┐└┘]/);
  });

  test("colorMode='none' produces no ANSI escapes, colorMode via ansiEnabled produces colored output", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");

    // No color
    const noColorToken = makeFenceToken("graph LR\n  A --> B", "mermaid");
    renderMermaidBlock(noColorToken, { format: "utf8", ansiEnabled: false, width: 120 });
    const noColorResult = (noColorToken.meta as any).mermaidRendered as string;
    expect(noColorResult).not.toContain("\x1b[");

    // With color
    const colorToken = makeFenceToken("graph LR\n  A --> B", "mermaid");
    renderMermaidBlock(colorToken, { format: "utf8", ansiEnabled: true, width: 120 });
    const colorResult = (colorToken.meta as any).mermaidRendered as string;
    expect(colorResult).toBeDefined();
    // Colored output should contain ANSI escape sequences
    expect(colorResult).toContain("\x1b[");
  });

  test("does not require any browser DOM APIs (pure Bun)", async () => {
    // If we got this far without errors, DOM was not needed
    // Verify globalThis doesn't have document/window being accessed
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");

    const token = makeFenceToken("graph LR\n  A --> B", "mermaid");
    const ctx = { format: "utf8" as const, ansiEnabled: false, width: 120 };

    // Should not throw about missing DOM
    expect(() => renderMermaidBlock(token, ctx)).not.toThrow();
    expect((token.meta as any).isMermaid).toBe(true);
    expect((token.meta as any).mermaidRendered).toBeDefined();
  });

  test("output lines are truncated to not exceed given width", async () => {
    const { renderMermaidBlock } = await import("../../src/transform/mermaid-render.ts");

    const token = makeFenceToken("graph LR\n  A --> B", "mermaid");
    const narrowWidth = 40;
    renderMermaidBlock(token, { format: "utf8", ansiEnabled: false, width: narrowWidth });

    const result = (token.meta as any).mermaidRendered as string;
    expect(result).toBeDefined();

    // Each line should not exceed narrowWidth visible characters
    const lines = result.split("\n");
    for (const line of lines) {
      // Use simple length for non-ANSI content
      expect(line.length).toBeLessThanOrEqual(narrowWidth);
    }
  });
});
