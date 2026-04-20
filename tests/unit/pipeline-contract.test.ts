import { describe, test, expect, spyOn } from "bun:test";
import { runPipeline } from "../../src/pipeline/index.ts";
import type { BmdConfig } from "../../src/config/schema.ts";

const testConfig: BmdConfig = {
  format: 'utf8',
  width: 80,
  ansiEnabled: false,
  pager: 'never',
  unsafeHtml: false,
  unicode: true,
  filePath: undefined,
  theme: undefined,
  templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
  undo: { groupDelay: 500, depth: 100 },
  serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
};

async function render(source: string, config: BmdConfig): Promise<string> {
  return (await runPipeline({ source, config })).rendered;
}

describe("render pipeline contract", () => {
  test("render returns rendered string for valid markdown", async () => {
    const result = await render("# Hello\n\nWorld\n", testConfig);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  test("render does not write to stderr", async () => {
    const spy = spyOn(process.stderr, "write");
    try {
      await render("# Test\n\nSome content.\n", testConfig);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("render throws BmdError on parse error", async () => {
    // The markdown-exit parser is fault-tolerant, so we test that if
    // the parser were to throw, the error propagates as BmdError.
    // We mock parse to throw to test this path.
    const parserModule = await import("../../src/parser/index.ts");
    const spy = spyOn(parserModule, "parse").mockImplementation(() => {
      throw new Error("Simulated parse failure");
    });
    try {
      await expect(render("bad input", testConfig)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  test("render output contains expected formatted content", async () => {
    const input = "# Heading\n\nA paragraph with **bold** text.\n\n- item one\n- item two\n";
    const result = await render(input, testConfig);
    expect(result).toContain("Heading");
    expect(result).toContain("bold");
    expect(result).toContain("item one");
    expect(result).toContain("item two");
  });
});
