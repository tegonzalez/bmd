/**
 * Tests for templates sub-schema in configSchema.
 */

import { test, expect, describe } from "bun:test";
import { configSchema } from "../../../src/config/schema.ts";

describe("templatesSchema", () => {
  test("omitted templates key defaults to file defaults", () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates).toEqual({
      enabled: true,
      auto_map: false,
    });
  });

  test("explicit empty object parses inner defaults", () => {
    const result = configSchema.safeParse({ templates: {} });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates).toEqual({
      enabled: true,
      auto_map: false,
    });
  });

  test("accepts explicit values", () => {
    const result = configSchema.safeParse({
      templates: {
        enabled: false,
        map: "values.yaml",
        auto_map: true,
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates.enabled).toBe(false);
    expect(result.data.templates.map).toBe("values.yaml");
    expect(result.data.templates.auto_map).toBe(true);
  });

  test("rejects unknown keys (strict)", () => {
    const result = configSchema.safeParse({
      templates: {
        enabled: true,
        bogus: "nope",
      },
    });
    expect(result.success).toBe(false);
  });

  test("templates field present in parsed config", () => {
    const result = configSchema.safeParse({
      templates: {},
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("parse failed");
    expect(result.data.templates.enabled).toBe(true);
    expect(result.data.templates.auto_map).toBe(false);
  });
});
