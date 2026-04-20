import { test, expect, describe } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("parse", () => {
  test("heading produces heading_open, inline, heading_close tokens", () => {
    const result = parse("# Hello");
    const types = result.tokens.map((t) => t.type);
    expect(types).toContain("heading_open");
    expect(types).toContain("inline");
    expect(types).toContain("heading_close");

    const headingOpen = result.tokens.find((t) => t.type === "heading_open");
    expect(headingOpen!.tag).toBe("h1");

    const inline = result.tokens.find((t) => t.type === "inline");
    expect(inline!.content).toBe("Hello");
  });

  test("bold produces strong_open/strong_close in inline children", () => {
    const result = parse("**bold**");
    const inline = result.tokens.find((t) => t.type === "inline");
    expect(inline).toBeDefined();
    const childTypes = inline!.children!.map((c) => c.type);
    expect(childTypes).toContain("strong_open");
    expect(childTypes).toContain("text");
    expect(childTypes).toContain("strong_close");

    const textToken = inline!.children!.find(
      (c) => c.type === "text" && c.content === "bold"
    );
    expect(textToken).toBeDefined();
    expect(textToken!.content).toBe("bold");
  });

  test("fenced code block produces fence token with content and info", () => {
    const result = parse("```js\nconsole.log('hi');\n```");
    const fence = result.tokens.find((t) => t.type === "fence");
    expect(fence).toBeDefined();
    expect(fence!.info).toBe("js");
    expect(fence!.content).toContain("console.log");
  });

  test("env object captures reference definitions", () => {
    const result = parse(
      "[link text][ref]\n\n[ref]: https://example.com\n"
    );
    expect(result.env).toBeDefined();
    expect(result.env.references).toBeDefined();
    // markdown-exit normalizes reference keys to uppercase
    expect(result.env.references["REF"]!).toBeDefined();
    expect(result.env.references["REF"]!.href).toBe("https://example.com");
  });

  test("html: false does not produce html_block tokens for raw HTML", () => {
    const result = parse("<div>raw html</div>\n\n<p>more html</p>");
    const htmlBlocks = result.tokens.filter(
      (t) => t.type === "html_block"
    );
    // With html: false, raw HTML should not produce html_block tokens
    expect(htmlBlocks.length).toBe(0);
  });

  test("parses basic.md fixture without errors", () => {
    const fixture = readFileSync(
      join(__dirname, "../fixtures/basic.md"),
      "utf-8"
    );
    const result = parse(fixture);
    expect(result.tokens.length).toBeGreaterThan(0);

    // Should contain headings, paragraphs, lists, blockquotes, tables
    const types = new Set(result.tokens.map((t) => t.type));
    expect(types.has("heading_open")).toBe(true);
    expect(types.has("paragraph_open")).toBe(true);
    expect(types.has("bullet_list_open")).toBe(true);
    expect(types.has("ordered_list_open")).toBe(true);
    expect(types.has("blockquote_open")).toBe(true);
    expect(types.has("table_open")).toBe(true);
    expect(types.has("hr")).toBe(true);
  });

  test("parses code-blocks.md fixture without errors", () => {
    const fixture = readFileSync(
      join(__dirname, "../fixtures/code-blocks.md"),
      "utf-8"
    );
    const result = parse(fixture);
    expect(result.tokens.length).toBeGreaterThan(0);

    const fences = result.tokens.filter((t) => t.type === "fence");
    expect(fences.length).toBeGreaterThanOrEqual(4);
  });
});
