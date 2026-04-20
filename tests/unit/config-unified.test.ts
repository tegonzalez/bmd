/**
 * Tests for unified BmdConfig construction via resolveConfig.
 */

import { test, expect, describe } from "bun:test";
import { resolveConfig } from "../../src/config/merge.ts";
import { SERVE_DEFAULTS } from "../../src/config/bmd-defaults.ts";
import type { BmdConfig } from "../../src/config/schema.ts";

describe("resolveConfig -> BmdConfig", () => {
  test("returns all defaults when no args provided", () => {
    const cfg = resolveConfig({}, null);
    expect(cfg.format).toBe("utf8");
    expect(cfg.width).toBe(80);
    expect(cfg.ansiEnabled).toBe(true);
    expect(cfg.pager).toBe("auto");
    expect(cfg.unsafeHtml).toBe(false);
    expect(cfg.filePath).toBeUndefined();
    expect(cfg.theme).toBeUndefined();
    expect(cfg.serve).toEqual(SERVE_DEFAULTS);
  });

  test("CLI args override defaults", () => {
    const cfg = resolveConfig(
      { format: "ascii", width: 120, ansiEnabled: false },
      null,
    );
    expect(cfg.format).toBe("ascii");
    expect(cfg.width).toBe(120);
    expect(cfg.ansiEnabled).toBe(false);
  });

  test("config file values fill in when CLI is undefined", () => {
    const cfg = resolveConfig(
      {},
      { pager: false, unsafe_html: true },
    );
    expect(cfg.pager).toBe("never"); // false -> 'never'
    expect(cfg.unsafeHtml).toBe(true);
  });

  test("three-layer precedence: CLI > config > defaults", () => {
    const cfg = resolveConfig(
      { width: 200, pager: "always" },
      { width: 100, pager: false },
    );
    expect(cfg.width).toBe(200);      // CLI wins over config
    expect(cfg.pager).toBe("always");  // CLI wins over config
  });

  test("config file pager boolean maps to PagerMode", () => {
    const cfgFalse = resolveConfig({}, { pager: false });
    expect(cfgFalse.pager).toBe("never");

    const cfgTrue = resolveConfig({}, { pager: true });
    expect(cfgTrue.pager).toBe("auto");
  });

  test("config file ansi tri-state maps correctly when CLI does not override", () => {
    const cfgOn = resolveConfig({}, { ansi: "on" });
    expect(cfgOn.ansiEnabled).toBe(true);

    const cfgOff = resolveConfig({}, { ansi: "off" });
    expect(cfgOff.ansiEnabled).toBe(false);

    // "auto" in config -> use default (true)
    const cfgAuto = resolveConfig({}, { ansi: "auto" });
    expect(cfgAuto.ansiEnabled).toBe(true);
  });

  test("serve sub-fields merge independently", () => {
    const cfg = resolveConfig(
      { serve: { port: 8080 } },
      { serve: { host: "127.0.0.1", mode: "preview" } },
    );
    expect(cfg.serve.port).toBe(8080);         // CLI
    expect(cfg.serve.host).toBe("127.0.0.1");  // config
    expect(cfg.serve.mode).toBe("preview");     // config
    expect(cfg.serve.open).toBe(true);          // default
  });

  test("theme passed through as resolvedTheme when provided in CLI args", () => {
    const mockTheme = {
      syn: {} as any,
      md: {} as any,
      mer: {} as any,
      web: {} as any,
      unic: {} as any,
    };
    const cfg = resolveConfig({ resolvedTheme: mockTheme }, null);
    expect(cfg.theme).toBe(mockTheme);
  });

  test("filePath passed through from CLI args", () => {
    const cfg = resolveConfig({ filePath: "/tmp/test.md" }, null);
    expect(cfg.filePath).toBe("/tmp/test.md");
  });

  test("unsafeHtml from config file (unsafe_html snake_case) maps correctly", () => {
    const cfg = resolveConfig({}, { unsafe_html: true });
    expect(cfg.unsafeHtml).toBe(true);

    const cfg2 = resolveConfig({}, { unsafe_html: false });
    expect(cfg2.unsafeHtml).toBe(false);
  });

  test("config file width 'auto' treated as unset, falls back to default", () => {
    const cfg = resolveConfig({}, { width: "auto" });
    expect(cfg.width).toBe(80); // default
  });

  test("config file width number is used when CLI does not provide", () => {
    const cfg = resolveConfig({}, { width: 100 });
    expect(cfg.width).toBe(100);
  });

  test("CLI width overrides config file width number", () => {
    const cfg = resolveConfig({ width: 120 }, { width: 100 });
    expect(cfg.width).toBe(120);
  });

  test("config file serve.color_mode maps to colorMode", () => {
    const cfg = resolveConfig({}, { serve: { color_mode: "night" } });
    expect(cfg.serve.colorMode).toBe("night");
  });
});
