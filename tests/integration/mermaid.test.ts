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

describe("Mermaid integration", () => {
  test("document with 2 Mermaid blocks renders both in source order (MERM-02)", async () => {
    const input = [
      "# Test",
      "",
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
      "",
      "Some text between diagrams.",
      "",
      "```mermaid",
      "graph TD",
      "  C --> D",
      "```",
    ].join("\n") + "\n";

    const config = makeConfig({ ansiEnabled: false });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // Both diagrams should appear in the output
    expect(stdout).toContain("A");
    expect(stdout).toContain("B");
    expect(stdout).toContain("C");
    expect(stdout).toContain("D");
    // Text between should also appear
    expect(stdout).toContain("Some text between diagrams");

    // A should appear before C in the output (source order)
    const posA = stdout.indexOf("A");
    const posC = stdout.indexOf("C");
    expect(posA).toBeLessThan(posC);
  });

  test("document with 1 valid + 1 invalid Mermaid block: valid renders, invalid falls back", async () => {
    const input = [
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
      "",
      "```mermaid",
      "this is not valid mermaid syntax at all",
      "```",
    ].join("\n") + "\n";

    const config = makeConfig({ ansiEnabled: false });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // Valid diagram should render (contains the nodes)
    expect(stdout).toContain("A");
    expect(stdout).toContain("B");
    // Invalid block should show as raw text fallback
    expect(stdout).toContain("this is not valid mermaid syntax at all");
  });

  test("document with syntax-highlighted code + Mermaid diagram renders both correctly", async () => {
    const input = [
      "```typescript",
      "const x = 42;",
      "```",
      "",
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
    ].join("\n") + "\n";

    const config = makeConfig({ ansiEnabled: false });
    const result = await runPipeline({ source: input, config });
    const stdout = result.rendered;

    // TypeScript code block should render
    expect(stdout).toContain("const x = 42");
    // Mermaid diagram should also render
    expect(stdout).toContain("A");
    expect(stdout).toContain("B");
  });
});
