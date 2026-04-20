/**
 * Integration tests for HTML safety controls.
 * Tests parser dual-mode and HTML stripping diagnostic.
 */

import { test, expect, describe } from "bun:test";
import { parse, checkHtmlContent } from "../../src/parser/index.ts";
import { runPipeline } from "../../src/pipeline/index.ts";
import { getDefaults } from "../../src/theme/defaults.ts";
import type { BmdConfig } from "../../src/config/schema.ts";

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'ascii',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    undo: { groupDelay: 500, depth: 200 },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
  };
}

describe("parser dual-mode", () => {
  test("default mode strips HTML (html_block/html_inline not in output)", () => {
    const source = "# Hello\n\n<div>raw html</div>\n\nParagraph.";
    const result = parse(source, false);
    const types = result.tokens.map(t => t.type);
    expect(types).not.toContain("html_block");
    expect(types).not.toContain("html_inline");
  });

  test("unsafe mode preserves html_block tokens", () => {
    const source = "# Hello\n\n<div>raw html</div>\n\nParagraph.";
    const result = parse(source, true);
    const types = result.tokens.map(t => t.type);
    expect(types).toContain("html_block");
  });

  test("parse() defaults to safe mode (no second arg)", () => {
    const source = "<b>bold</b>";
    const result = parse(source);
    const types = result.tokens.map(t => t.type);
    expect(types).not.toContain("html_inline");
  });
});

describe("HTML stripping diagnostic", () => {
  test("emits diagnostic to stderr when HTML detected in safe mode", () => {
    const stderrWrites: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as any;

    try {
      checkHtmlContent("<div>test</div>", "test.md");
      expect(stderrWrites.length).toBeGreaterThan(0);
      expect(stderrWrites.join("")).toContain("HTML");
    } finally {
      process.stderr.write = origWrite;
    }
  });
});

describe("pipeline HTML safety integration", () => {
  test("pipeline in safe mode renders document with HTML content present", async () => {
    const input = "# Test\n\n<div>html content</div>\n";
    const config = makeConfig({ unsafeHtml: false });
    const result = await runPipeline({ source: input, config });
    // Pipeline always runs safe parse -- HTML tags are stripped from token stream
    // but the text content is still present in the output
    expect(result.rendered).toContain("Test");
  });

  test("pipeline renders content without crashing when unsafeHtml config is set", async () => {
    // Note: the pipeline currently always parses in safe mode (parse(source, false)).
    // The unsafeHtml config flag is consumed by the CLI layer for diagnostics.
    const input = "<div>html content</div>\n";
    const config = makeConfig({ unsafeHtml: true });
    const result = await runPipeline({ source: input, config });
    expect(result.rendered).toBeDefined();
  });
});

describe("Phase 8 TODO: unsafe HTML policy guardrails", () => {
  test.skip("Phase 8 TODO: safe mode does not render raw dangerous HTML", async () => {
    const dangerousInputs = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">bad</a>',
    ];
    const config = makeConfig({ unsafeHtml: false });

    for (const input of dangerousInputs) {
      const result = await runPipeline({ source: input, config });
      expect(result.rendered).not.toContain(input);
    }
  });

  test.skip("Phase 8 TODO: unsafeHtml=true changes parse/render behavior for harmless HTML", async () => {
    const harmless = '<span class="ok">allowed</span>';
    const parseResult = parse(harmless, true);
    const tokenTypes = parseResult.tokens.map((token) => token.type);
    expect(tokenTypes).toContain("html_inline");

    const result = await runPipeline({
      source: harmless,
      config: makeConfig({ unsafeHtml: true }),
    });
    expect(result.rendered).toContain(harmless);
  });

  test.skip("Phase 8 TODO: browser preview unsafe mode preserves harmless HTML after DOMPurify while removing scripts events and javascript URLs", async () => {
    const { renderPreview } = await import("../../src/web/preview.ts");
    const targetEl = document.createElement("div");
    const dangerousAndHarmlessHtml = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">bad</a>',
      '<span class="ok">allowed</span>',
    ].join("\n");

    await renderPreview(dangerousAndHarmlessHtml, targetEl, true);

    expect(targetEl.innerHTML).toContain('<span class="ok">allowed</span>');
    expect(targetEl.innerHTML).not.toContain("<script>");
    expect(targetEl.innerHTML).not.toContain("onerror=alert(1)");
    expect(targetEl.innerHTML).not.toContain("javascript:alert(1)");
  });
});
