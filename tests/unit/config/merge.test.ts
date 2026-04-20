/**
 * Tests for config merge: list_spec, templates CLI flag, listSpec merge.
 */

import { test, expect, describe } from "bun:test";
import { resolveConfig, type CliArgs } from "../../../src/config/merge.ts";
import { configSchema } from "../../../src/config/schema.ts";

describe("list_spec in schema", () => {
  test("list_spec field defaults to undefined (optional)", () => {
    const result = configSchema.safeParse({ templates: {} });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates.list_spec).toBeUndefined();
  });

  test("list_spec accepts string value", () => {
    const result = configSchema.safeParse({
      templates: { list_spec: "join/[/,/]/" },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates.list_spec).toBe("join/[/,/]/");
  });
});

describe("templates merge", () => {
  test("templates=false sets templates.enabled=false", () => {
    const result = resolveConfig({ templates: false }, null);
    expect(result.templates.enabled).toBe(false);
  });

  test("templates=false overrides config enabled=true", () => {
    const cfg = configSchema.parse({ templates: { enabled: true } });
    const result = resolveConfig({ templates: false }, cfg);
    expect(result.templates.enabled).toBe(false);
  });

  test("templates undefined preserves config enabled=false", () => {
    const cfg = configSchema.parse({ templates: { enabled: false } });
    const result = resolveConfig({}, cfg);
    expect(result.templates.enabled).toBe(false);
  });

  test("templates true does not override config enabled=false", () => {
    const cfg = configSchema.parse({ templates: { enabled: false } });
    const result = resolveConfig({ templates: true }, cfg);
    expect(result.templates.enabled).toBe(false);
  });

  test("templates undefined with no config defaults to enabled=true", () => {
    const result = resolveConfig({}, null);
    expect(result.templates.enabled).toBe(true);
  });
});

describe("listSpec merge", () => {
  test("resolveConfig merges list_spec from config file", () => {
    const cfg = configSchema.parse({ templates: { list_spec: "join/;/" } });
    const result = resolveConfig({}, cfg);
    expect(result.templates.list_spec).toBe("join/;/");
  });

  test("CLI listSpec overrides config list_spec", () => {
    const cfg = configSchema.parse({ templates: { list_spec: "join/;/" } });
    const result = resolveConfig({ listSpec: "join/|/" } as CliArgs, cfg);
    expect(result.templates.list_spec).toBe("join/|/");
  });

  test("list_spec defaults to undefined when not set", () => {
    const result = resolveConfig({}, null);
    expect(result.templates.list_spec).toBeUndefined();
  });
});
