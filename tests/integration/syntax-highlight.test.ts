import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/cli/index.ts");

describe("Syntax highlighting integration", () => {
  test("TypeScript fence block with --ansi produces ANSI color escapes", async () => {
    const input = "```typescript\nconst x: number = 42;\n```\n";

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    // Should contain ANSI truecolor escapes
    expect(stdout).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    // Should contain the code content
    expect(stdout).toContain("const");
    expect(stdout).toContain("42");
  });

  test("TypeScript fence block with --no-ansi produces no ANSI escapes", async () => {
    const input = "```typescript\nconst x: number = 42;\n```\n";

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--no-ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    // Should NOT contain ANSI escapes
    expect(stdout).not.toContain("\x1b[");
    // Should contain the code content
    expect(stdout).toContain("const");
    expect(stdout).toContain("42");
  });

  test("unknown language fence block produces plain output without error", async () => {
    const input = "```fakeLang99\nsome code here\n```\n";

    const proc = Bun.spawn(["bun", CLI, "utf8", "-", "--no-ansi"], {
      stdin: new TextEncoder().encode(input),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    // Should contain the code content
    expect(stdout).toContain("some code here");
    // Should exit successfully
    expect(exitCode).toBe(0);
    // Should not emit errors for unknown language
    expect(stderr).not.toContain("error");
  });
});
