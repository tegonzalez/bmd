import { test, expect, describe } from "bun:test";
import { getShikiThemeName, getShikiDefaultColor } from "../../src/theme/adapt/shiki.ts";
import { toMermaidTheme } from "../../src/theme/adapt/mermaid.ts";
import { createThemedAnsiLayer } from "../../src/theme/adapt/ansi.ts";
import { toCssVariables } from "../../src/theme/adapt/css.ts";
import { DEFAULT_MD, DEFAULT_MER } from "../../src/theme/defaults.ts";
import type { SynTheme } from "../../src/theme/schema/syn.ts";
import type { MerTheme } from "../../src/theme/schema/mer.ts";
import type { WebTheme } from "../../src/theme/schema/web.ts";

describe("theme/adapt/shiki", () => {
  const syn: SynTheme = { shikiTheme: "dracula", defaultColor: "#f8f8f2" };

  test("getShikiThemeName returns shikiTheme field", () => {
    expect(getShikiThemeName(syn)).toBe("dracula");
  });

  test("getShikiDefaultColor returns defaultColor field", () => {
    expect(getShikiDefaultColor(syn)).toBe("#f8f8f2");
  });

  test("getShikiThemeName with github-dark", () => {
    expect(getShikiThemeName({ shikiTheme: "github-dark", defaultColor: "#e1e4e8" })).toBe("github-dark");
  });
});

describe("theme/adapt/mermaid", () => {
  const mer: MerTheme = { fg: "#e4e4e7", border: "#a1a1aa", line: "#a1a1aa", arrow: "#d4d4d8" };

  test("toMermaidTheme maps MerTheme fields to DiagramColors shape", () => {
    const result = toMermaidTheme(mer);
    expect(result.fg).toBe("#e4e4e7");
    expect(result.border).toBe("#a1a1aa");
    expect(result.line).toBe("#a1a1aa");
    expect(result.arrow).toBe("#d4d4d8");
  });

  test("toMermaidTheme returns plain object with expected keys", () => {
    const result = toMermaidTheme(DEFAULT_MER);
    expect(Object.keys(result)).toContain("fg");
    expect(Object.keys(result)).toContain("border");
    expect(Object.keys(result)).toContain("line");
    expect(Object.keys(result)).toContain("arrow");
  });
});

describe("theme/adapt/css", () => {
  const web: WebTheme = {
    fontFamily: "sans-serif",
    monoFontFamily: "monospace",
    maxWidth: "900px",
    spacing: 24,
    fontSize: 15,
    day: { bg: "#ffffff", fg: "#1a1a2e", accent: "#2563eb", border: "#dddddd", codeBg: "#f4f4f4", codeFg: "#1a1a2e" },
    night: { bg: "#1a1a2e", fg: "#e0e0e0", accent: "#60a5fa", border: "#2a2a4a", codeBg: "#0d1117", codeFg: "#e0e0e0" },
  };

  test("toCssVariables produces :root { wrapper", () => {
    const css = toCssVariables(web);
    expect(css).toContain(":root {");
    expect(css).toContain("}");
  });

  test("toCssVariables includes --font-family", () => {
    const css = toCssVariables(web);
    expect(css).toContain("--font-family:");
  });

  test("toCssVariables includes day palette variables", () => {
    const css = toCssVariables(web);
    expect(css).toContain("--day-bg:");
    expect(css).toContain("--day-fg:");
    expect(css).toContain("--day-accent:");
  });

  test("toCssVariables includes night palette variables", () => {
    const css = toCssVariables(web);
    expect(css).toContain("--night-bg:");
    expect(css).toContain("--night-fg:");
    expect(css).toContain("--night-accent:");
  });

  test("toCssVariables includes actual color values", () => {
    const css = toCssVariables(web);
    expect(css).toContain("#ffffff");
    expect(css).toContain("#1a1a2e");
  });
});

describe("theme/adapt/ansi - createThemedAnsiLayer", () => {
  test("returns object implementing full AnsiLayer interface", () => {
    const layer = createThemedAnsiLayer(DEFAULT_MD);
    expect(typeof layer.heading).toBe("function");
    expect(typeof layer.bold).toBe("function");
    expect(typeof layer.italic).toBe("function");
    expect(typeof layer.strikethrough).toBe("function");
    expect(typeof layer.code).toBe("function");
    expect(typeof layer.codeBlock).toBe("function");
    expect(typeof layer.link).toBe("function");
    expect(typeof layer.blockquoteBar).toBe("function");
  });

  test("heading output contains ANSI escape sequences", () => {
    const layer = createThemedAnsiLayer(DEFAULT_MD);
    const result = layer.heading("Test", 1);
    expect(result).toContain("Test");
    expect(result).toMatch(/\x1b\[/);
  });

  test("heading output differs for different heading colors", () => {
    const theme1 = { ...DEFAULT_MD, headings: { ...DEFAULT_MD.headings, "1": { bold: true, color: "#ff0000" } } };
    const theme2 = { ...DEFAULT_MD, headings: { ...DEFAULT_MD.headings, "1": { bold: true, color: "#00ff00" } } };
    const layer1 = createThemedAnsiLayer(theme1);
    const layer2 = createThemedAnsiLayer(theme2);
    const result1 = layer1.heading("Test", 1);
    const result2 = layer2.heading("Test", 1);
    expect(result1).not.toBe(result2);
  });

  test("bold with boldColor applies hex color", () => {
    const theme = { ...DEFAULT_MD, boldColor: "#ff5500" };
    const layer = createThemedAnsiLayer(theme);
    const result = layer.bold("strong");
    expect(result).toContain("strong");
    expect(result).toMatch(/\x1b\[/);
  });

  test("code with codeColor applies hex color", () => {
    const theme = { ...DEFAULT_MD, codeColor: "#aabbcc" };
    const layer = createThemedAnsiLayer(theme);
    const result = layer.code("x = 1");
    expect(result).toContain("x = 1");
    expect(result).toMatch(/\x1b\[/);
  });

  test("link with linkColor uses specified color", () => {
    const theme = { ...DEFAULT_MD, linkColor: "#3399ff" };
    const layer = createThemedAnsiLayer(theme);
    const result = layer.link("click", "https://example.com");
    expect(result).toContain("click");
    expect(result).toContain("https://example.com");
  });

  test("blockquoteBar with blockquoteBarColor uses specified color", () => {
    const theme = { ...DEFAULT_MD, blockquoteBarColor: "#888888" };
    const layer = createThemedAnsiLayer(theme);
    const result = layer.blockquoteBar("|");
    expect(result).toContain("|");
    expect(result).toMatch(/\x1b\[/);
  });
});
