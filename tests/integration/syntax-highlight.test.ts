import { test, expect, describe } from "bun:test";
import { runPipeline } from "../../src/pipeline/index.ts";
import { getDefaults } from "../../src/theme/defaults.ts";
import type { BmdConfig } from "../../src/config/schema.ts";

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
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

describe("Syntax highlighting integration", () => {
  test("TypeScript fence block with ansiEnabled produces ANSI color escapes", async () => {
    const input = "```typescript\nconst x: number = 42;\n```\n";
    const config = makeConfig({ ansiEnabled: true });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // Should contain ANSI truecolor escapes
    expect(stdout).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    // Should contain the code content
    expect(stdout).toContain("const");
    expect(stdout).toContain("42");
  });

  test("TypeScript fence block with ansiEnabled=false produces no ANSI escapes", async () => {
    const input = "```typescript\nconst x: number = 42;\n```\n";
    const config = makeConfig({ ansiEnabled: false });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // Should NOT contain ANSI escapes
    expect(stdout).not.toContain("\x1b[");
    // Should contain the code content
    expect(stdout).toContain("const");
    expect(stdout).toContain("42");
  });

  test("unknown language fence block produces plain output without error", async () => {
    const input = "```fakeLang99\nsome code here\n```\n";
    const config = makeConfig({ ansiEnabled: false });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // Should contain the code content
    expect(stdout).toContain("some code here");
  });
});
