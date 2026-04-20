import { test, expect, describe } from "bun:test";
import { parseThemeSpec } from "../../src/theme/spec-parser";
import { resolveThemeFile, resolveThemeSpec } from "../../src/theme/resolver";
import { loadAndValidateTheme } from "../../src/theme/loader";
import { BmdError, ExitCode } from "../../src/diagnostics/formatter";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";
import { getRuntime } from "../../src/runtime/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = join(__dirname, "../..");

describe("resolveThemeFile", () => {
  const rt = getRuntime();

  test("finds bundled theme file for syn:dark", async () => {
    const filePath = await resolveThemeFile("syn", "dark");
    expect(filePath).toContain("themes/syn/dark.yaml");
    expect(await rt.fileExists(filePath)).toBe(true);
  });

  test("finds bundled theme file for md:light", async () => {
    const filePath = await resolveThemeFile("md", "light");
    expect(filePath).toContain("themes/md/light.yaml");
  });

  test("throws BmdError for nonexistent theme", async () => {
    try {
      await resolveThemeFile("syn", "nonexistent-theme-xyz");
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BmdError);
      expect((e as BmdError).exitCode).toBe(ExitCode.THEME);
    }
  });
});

describe("loadAndValidateTheme", () => {
  const rt = getRuntime();

  test("validates valid syn YAML", async () => {
    // Write a temp valid theme
    const tmpPath = join(PROJECT_ROOT, "themes/syn/dark.yaml");
    const result = await loadAndValidateTheme("syn", tmpPath);
    expect(result).toHaveProperty("shikiTheme");
  });

  test("rejects invalid YAML with BmdError", async () => {
    // Write a temp invalid theme
    const tmpDir = join(PROJECT_ROOT, ".tmp-test-themes");
    const tmpPath = join(tmpDir, "bad.yaml");
    await rt.writeFile(tmpPath, "shikiTheme: x\nunknownField: true\n");

    try {
      await loadAndValidateTheme("syn", tmpPath);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BmdError);
      expect((e as BmdError).exitCode).toBe(ExitCode.THEME);
    } finally {
      // Cleanup
      const { unlinkSync, rmdirSync } = await import("node:fs");
      try { unlinkSync(tmpPath); rmdirSync(tmpDir); } catch {}
    }
  });

  test("rejects URLs in theme values (SAFE-03)", async () => {
    const tmpDir = join(PROJECT_ROOT, ".tmp-test-themes");
    const tmpPath = join(tmpDir, "url-theme.yaml");
    await rt.writeFile(tmpPath, 'shikiTheme: "https://evil.com/theme"\ndefaultColor: "#e1e4e8"\n');

    try {
      await loadAndValidateTheme("syn", tmpPath);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(BmdError);
      expect((e as BmdError).exitCode).toBe(ExitCode.THEME);
    } finally {
      const { unlinkSync, rmdirSync } = await import("node:fs");
      try { unlinkSync(tmpPath); rmdirSync(tmpDir); } catch {}
    }
  });
});

describe("resolveThemeSpec", () => {
  test.skip('Phase 3 TODO: resolveThemeSpec(parseThemeSpec("unic:default")) loads DEFAULT_UNIC', async () => {
    const resolved = await resolveThemeSpec(parseThemeSpec("unic:default"));

    expect(resolved.unic).toBeDefined();
    expect(resolved.unic["template-region"]).toBeDefined();
  });
});
