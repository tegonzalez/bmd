import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/cli/index.ts");

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

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--no-ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
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

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--no-ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    // Valid diagram should render (contains the nodes)
    expect(stdout).toContain("A");
    expect(stdout).toContain("B");
    // Invalid block should show as raw text fallback
    expect(stdout).toContain("this is not valid mermaid syntax at all");
    // Stderr should have a diagnostic for the error
    expect(stderr).toContain("error");
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

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--no-ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    // TypeScript code block should render
    expect(stdout).toContain("const x = 42");
    // Mermaid diagram should also render
    expect(stdout).toContain("A");
    expect(stdout).toContain("B");
  });
});
