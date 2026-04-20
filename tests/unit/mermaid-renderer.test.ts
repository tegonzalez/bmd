import { test, expect, describe } from "bun:test";
import { Utf8Adapter } from "../../src/renderer/utf8-adapter.ts";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import { buildTree } from "../../src/pipeline/tree-build.ts";
import { TerminalVisitor } from "../../src/pipeline/terminal-visitor.ts";
import { parse } from "../../src/parser/index.ts";
import type { RenderContext } from "../../src/renderer/types.ts";

describe("TerminalVisitor: Mermaid support", () => {
  test("fence with isMermaid=true and mermaidRendered renders diagram text (not raw source)", () => {
    const diagramText = "  ┌───┐     ┌───┐\n  │ A │────>│ B │\n  └───┘     └───┘";
    const { tokens } = parse("```mermaid\ngraph LR\n  A --> B\n```\n");
    for (const t of tokens) {
      if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
        t.meta = t.meta || {};
        t.meta.isMermaid = true;
        t.meta.mermaidRendered = diagramText;
      }
    }

    const tree = buildTree(tokens, [], []);
    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const visitor = new TerminalVisitor(adapter, null, ctx);
    const output = visitor.render(tree);

    expect(output).toContain("┌───┐");
    expect(output).toContain("│ A │");
    expect(output).not.toContain("graph LR");
  });

  test("fence with isMermaid=true and mermaidUnsupported renders placeholder box", () => {
    const { tokens } = parse("```mermaid\ngantt\n  title Test\n```\n");
    for (const t of tokens) {
      if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
        t.meta = t.meta || {};
        t.meta.isMermaid = true;
        t.meta.mermaidUnsupported = "gantt";
      }
    }

    const tree = buildTree(tokens, [], []);
    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const visitor = new TerminalVisitor(adapter, null, ctx);
    const output = visitor.render(tree);

    expect(output).toContain("gantt");
    expect(output).toContain("unsupported");
  });

  test("fence with isMermaid=true but no mermaidRendered (error fallback) renders raw source", () => {
    const { tokens } = parse("```mermaid\ngraph\n  ---invalid\n```\n");
    for (const t of tokens) {
      if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
        t.meta = t.meta || {};
        t.meta.isMermaid = true;
      }
    }

    const tree = buildTree(tokens, [], []);
    const adapter = new Utf8Adapter();
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: false, theme: DEFAULT_THEME };
    const visitor = new TerminalVisitor(adapter, null, ctx);
    const output = visitor.render(tree);

    expect(output).toContain("graph");
  });

  test("Mermaid fence blocks have no language label", () => {
    const diagramText = "┌───┐\n│ A │\n└───┘";
    const { tokens } = parse("```mermaid\ngraph LR\n  A\n```\n");
    for (const t of tokens) {
      if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
        t.meta = t.meta || {};
        t.meta.isMermaid = true;
        t.meta.mermaidRendered = diagramText;
      }
    }

    const tree = buildTree(tokens, [], []);
    const adapter = new Utf8Adapter();
    const ansi = createAnsiLayer(DEFAULT_THEME);
    const ctx: RenderContext = { width: 80, format: "utf8", ansiEnabled: true, theme: DEFAULT_THEME };
    const visitor = new TerminalVisitor(adapter, ansi, ctx);
    const output = visitor.render(tree);

    expect(output).not.toContain("mermaid");
    expect(output).toContain("┌───┐");
  });
});
