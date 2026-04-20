import { test, expect, describe } from "bun:test";
import { runPipeline } from "../../src/pipeline/index.ts";
import { getDefaults } from "../../src/theme/defaults.ts";
import { createThemedAnsiLayer } from "../../src/theme/adapt/ansi.ts";
import { toCssVariables } from "../../src/theme/adapt/css.ts";
import { getShikiThemeName } from "../../src/theme/adapt/shiki.ts";
import { toMermaidTheme } from "../../src/theme/adapt/mermaid.ts";
import type { BmdConfig } from "../../src/config/schema.ts";

function makeConfig(overrides: Partial<BmdConfig> = {}): BmdConfig {
  return {
    format: "ascii",
    width: 80,
    ansiEnabled: false,
    pager: "never",
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: undefined,
    templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
    undo: { groupDelay: 500, depth: 100 },
    serve: { host: "0.0.0.0", port: 3000, open: true, mode: "both", colorMode: "auto", readonly: false },
    ...overrides,
  };
}

describe("theme integration", () => {
  test("pipeline with default theme produces output (backward compat)", async () => {
    const result = await runPipeline({
      source: "# Hello\n\nWorld\n",
      config: makeConfig({
        format: "ascii",
        width: 80,
        ansiEnabled: false,
        pager: "never",
      }),
    });

    expect(result.rendered).toContain("Hello");
    expect(result.rendered).toContain("World");
  });

  test("pipeline with custom ResolvedTheme uses themed AnsiLayer", async () => {
    const defaults = getDefaults();
    const customTheme = {
      ...defaults,
      md: { ...defaults.md, headings: { ...defaults.md.headings, "1": { bold: true, color: "#ff0000" } } },
    };

    const result = await runPipeline({
      source: "# Red Heading\n",
      config: makeConfig({
        format: "ascii",
        width: 80,
        ansiEnabled: true,
        pager: "never",
        theme: customTheme,
      }),
    });

    expect(result.rendered).toContain("Red Heading");
    // Should contain ANSI escape codes
    expect(result.rendered).toMatch(/\x1b\[/);
  });

  test("getHighlighter with github-dark returns working highlighter", async () => {
    const { getHighlighter } = await import("../../src/transform/syntax-highlight.ts");
    const highlighter = await getHighlighter("github-dark");
    expect(highlighter).toBeDefined();
    expect(highlighter.getLoadedThemes()).toContain("github-dark");
  });

  test("getHighlighter with dracula returns working highlighter", async () => {
    const { getHighlighter } = await import("../../src/transform/syntax-highlight.ts");
    const highlighter = await getHighlighter("dracula");
    expect(highlighter).toBeDefined();
    expect(highlighter.getLoadedThemes()).toContain("dracula");
  });

  test("AnsiLayer with hex colors produces escape sequences", () => {
    const defaults = getDefaults();
    const layer = createThemedAnsiLayer(defaults.md);
    const heading = layer.heading("Test", 1);
    expect(heading).toMatch(/\x1b\[/);

    const bold = layer.bold("strong");
    expect(bold).toMatch(/\x1b\[1m/);
  });

  test("toCssVariables produces valid CSS from web facet defaults", () => {
    const defaults = getDefaults();
    const css = toCssVariables(defaults.web);
    expect(css).toContain(":root {");
    expect(css).toContain("--day-bg:");
    expect(css).toContain("--night-bg:");
    expect(css).toContain("}");
  });

  test("full pipeline with theme produces themed syntax highlighting output", async () => {
    const defaults = getDefaults();
    // Use dracula theme for syntax highlighting
    const customTheme = {
      ...defaults,
      syn: { shikiTheme: "dracula", defaultColor: "#f8f8f2" },
    };

    const result = await runPipeline({
      source: "```js\nconst x = 1;\n```\n",
      config: makeConfig({
        format: "ascii",
        width: 80,
        ansiEnabled: true,
        pager: "never",
        theme: customTheme,
      }),
    });

    expect(result.rendered).toContain("const");
  });
});
