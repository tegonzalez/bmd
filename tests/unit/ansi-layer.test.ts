import { test, expect, describe } from "bun:test";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";
import { createThemedAnsiLayer } from "../../src/theme/adapt/ansi.ts";
import { DEFAULT_MD } from "../../src/theme/defaults.ts";

describe("AnsiLayer", () => {
  const ansi = createAnsiLayer(DEFAULT_THEME);

  describe("heading", () => {
    test("applies bold styling", () => {
      const result = ansi.heading("Hello", 1);
      expect(result).toContain("Hello");
      // ANSI bold escape is \x1b[1m
      expect(result).toMatch(/\x1b\[/);
    });

    test("h1 uses cyan color", () => {
      const result = ansi.heading("Title", 1);
      // chalk cyan includes \x1b[36m
      expect(result).toContain("\x1b[36m");
    });

    test("h2 uses green color", () => {
      const result = ansi.heading("Sub", 2);
      expect(result).toContain("\x1b[32m");
    });

    test("h3 uses yellow color", () => {
      const result = ansi.heading("Sub2", 3);
      expect(result).toContain("\x1b[33m");
    });
  });

  describe("bold", () => {
    test("wraps text in ANSI bold", () => {
      const result = ansi.bold("strong");
      expect(result).toContain("strong");
      expect(result).toMatch(/\x1b\[1m/);
    });
  });

  describe("italic", () => {
    test("wraps text in ANSI italic", () => {
      const result = ansi.italic("emphasis");
      expect(result).toContain("emphasis");
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("strikethrough", () => {
    test("wraps text in ANSI strikethrough", () => {
      const result = ansi.strikethrough("deleted");
      expect(result).toContain("deleted");
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("code", () => {
    test("applies gray styling to inline code", () => {
      const result = ansi.code("const x = 1");
      expect(result).toContain("const x = 1");
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("codeBlock", () => {
    test("applies dim styling to code block content", () => {
      const result = ansi.codeBlock("function foo() {}");
      expect(result).toContain("function foo() {}");
      expect(result).toMatch(/\x1b\[/);
    });
  });

  describe("link", () => {
    test("produces OSC 8 hyperlink sequence", () => {
      const result = ansi.link("click here", "https://example.com");
      // OSC 8 format: \x1b]8;;url\x07text\x1b]8;;\x07
      expect(result).toContain("\x1b]8;;https://example.com");
      expect(result).toContain("click here");
    });
  });

  describe("blockquoteBar", () => {
    test("applies dim styling to bar character", () => {
      const result = ansi.blockquoteBar("|");
      expect(result).toContain("|");
      expect(result).toMatch(/\x1b\[/);
    });
  });
});

describe("ThemedAnsiLayer", () => {
  test("hex heading color produces ANSI output with escape sequences", () => {
    const layer = createThemedAnsiLayer(DEFAULT_MD);
    const result = layer.heading("Title", 1);
    expect(result).toContain("Title");
    // Should contain ANSI escape codes (not plain text)
    expect(result).toMatch(/\x1b\[/);
  });

  test("chalk.hex with known color produces ANSI SGR codes", () => {
    const theme = { ...DEFAULT_MD, headings: { ...DEFAULT_MD.headings, "1": { bold: true, color: "#ff0000" } } };
    const layer = createThemedAnsiLayer(theme);
    const result = layer.heading("Red", 1);
    // Must contain ANSI escape sequence for the color
    expect(result).toMatch(/\x1b\[/);
    expect(result).toContain("Red");
  });

  test("heading output differs for different heading colors", () => {
    const themeA = { ...DEFAULT_MD, headings: { ...DEFAULT_MD.headings, "1": { bold: true, color: "#ff0000" } } };
    const themeB = { ...DEFAULT_MD, headings: { ...DEFAULT_MD.headings, "1": { bold: true, color: "#0000ff" } } };
    const layerA = createThemedAnsiLayer(themeA);
    const layerB = createThemedAnsiLayer(themeB);
    expect(layerA.heading("Test", 1)).not.toBe(layerB.heading("Test", 1));
  });

  test("optional boldColor changes bold output", () => {
    const plain = createThemedAnsiLayer(DEFAULT_MD);
    const colored = createThemedAnsiLayer({ ...DEFAULT_MD, boldColor: "#ff5500" });
    // Both produce output, but colored version should differ
    const plainResult = plain.bold("word");
    const coloredResult = colored.bold("word");
    expect(plainResult).toMatch(/\x1b\[/);
    expect(coloredResult).toMatch(/\x1b\[/);
    expect(plainResult).not.toBe(coloredResult);
  });

  test("optional codeColor changes code output", () => {
    const plain = createThemedAnsiLayer(DEFAULT_MD);
    const colored = createThemedAnsiLayer({ ...DEFAULT_MD, codeColor: "#aabbcc" });
    expect(plain.code("x")).not.toBe(colored.code("x"));
  });

  test("optional linkColor changes link output", () => {
    const plain = createThemedAnsiLayer(DEFAULT_MD);
    const colored = createThemedAnsiLayer({ ...DEFAULT_MD, linkColor: "#3399ff" });
    expect(plain.link("a", "https://x.com")).not.toBe(colored.link("a", "https://x.com"));
  });

  test("graceful level downgrade: level 2 still produces colored output", () => {
    const layer = createThemedAnsiLayer(DEFAULT_MD, 2);
    const result = layer.heading("Test", 1);
    expect(result).toMatch(/\x1b\[/);
    expect(result).toContain("Test");
  });

  test("backward compatibility: themed layer with DEFAULT_MD produces working output", () => {
    const themed = createThemedAnsiLayer(DEFAULT_MD);
    const legacy = createAnsiLayer(DEFAULT_THEME);
    // Both should produce ANSI output for the same operations
    expect(themed.heading("H", 1)).toMatch(/\x1b\[/);
    expect(legacy.heading("H", 1)).toMatch(/\x1b\[/);
    expect(themed.bold("b")).toMatch(/\x1b\[1m/);
    expect(legacy.bold("b")).toMatch(/\x1b\[1m/);
  });
});
