/**
 * Tests for config schema, loader, and merge chain.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getRuntime } from "../../src/runtime/index.ts";

describe("configSchema", () => {
  test("validates a complete valid config", async () => {
    const { configSchema } = await import("../../src/config/schema.ts");
    const result = configSchema.safeParse({
      width: "auto",
      ansi: "auto",
      pager: true,
      theme: "syn:dark+md:dark",
      unsafe_html: false,
      serve: {
        host: "0.0.0.0",
        port: 3000,
      },
    });
    expect(result.success).toBe(true);
  });

  test("validates a sparse config (all fields optional)", async () => {
    const { configSchema } = await import("../../src/config/schema.ts");
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("validates width as number", async () => {
    const { configSchema } = await import("../../src/config/schema.ts");
    const result = configSchema.safeParse({ width: 120 });
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields (strict mode)", async () => {
    const { configSchema } = await import("../../src/config/schema.ts");
    const result = configSchema.safeParse({ unknown_field: "value" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid ansi value", async () => {
    const { configSchema } = await import("../../src/config/schema.ts");
    const result = configSchema.safeParse({ ansi: "maybe" });
    expect(result.success).toBe(false);
  });
});

describe("loadConfig", () => {
  const rt = getRuntime();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bmd-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns null when bmd.config.yaml doesn't exist", async () => {
    const { loadConfig } = await import("../../src/config/loader.ts");
    // Use a temp dir with no config file
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const config = await loadConfig();
      expect(config).toBeNull();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("returns parsed config when file exists", async () => {
    const { loadConfig } = await import("../../src/config/loader.ts");
    const configPath = join(tempDir, "bmd.config.yaml");
    await rt.writeFile(configPath, "width: 100\npager: false\n");

    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const config = await loadConfig();
      expect(config).not.toBeNull();
      expect(config!.width).toBe(100);
      expect(config!.pager).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("throws BmdError for invalid config", async () => {
    const { loadConfig } = await import("../../src/config/loader.ts");
    const configPath = join(tempDir, "bmd.config.yaml");
    await rt.writeFile(configPath, "unknown_field: true\n");

    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await expect(loadConfig()).rejects.toThrow();
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("resolveConfig", () => {
  test("CLI overrides config which overrides defaults", async () => {
    const { resolveConfig } = await import("../../src/config/merge.ts");
    const result = resolveConfig(
      { width: 120 },                  // CLI: width=120
      { width: 100, pager: false },    // Config: width=100, pager=false
    );
    expect(result.width).toBe(120);    // CLI wins
    expect(result.pager).toBe("never");  // Config false -> 'never' wins over default 'auto'
  });

  test("undefined CLI values don't override config", async () => {
    const { resolveConfig } = await import("../../src/config/merge.ts");
    const result = resolveConfig(
      { width: undefined },            // CLI: width not set
      { width: 100 },                  // Config: width=100
    );
    expect(result.width).toBe(100);    // Config value preserved
  });

  test("defaults used when neither CLI nor config set value", async () => {
    const { resolveConfig } = await import("../../src/config/merge.ts");
    const result = resolveConfig({}, {});
    expect(result.pager).toBe("auto");       // default PagerMode
    expect(result.unsafeHtml).toBe(false);   // default
  });

  test("theme is undefined when no resolvedTheme provided", async () => {
    const { resolveConfig } = await import("../../src/config/merge.ts");
    const result = resolveConfig(
      { theme: "syn:dracula" },
      {},
    );
    // theme spec string is parsed internally but resolvedTheme not provided
    // so result.theme is undefined (resolution happens externally)
    expect(result.theme).toBeUndefined();
  });
});
