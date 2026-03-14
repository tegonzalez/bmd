import { test, expect, describe } from "bun:test";
import { createAnsiLayer } from "../../src/renderer/ansi-layer.ts";
import { DEFAULT_THEME } from "../../src/types/theme.ts";

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
