/**
 * Tests for loadMapFile function.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getRuntime } from "../../../src/runtime/index.ts";

describe("loadMapFile", () => {
  const rt = getRuntime();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bmd-map-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("valid YAML mapping file returns parsed object", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "values.yaml");
    await rt.writeFile(mapPath, "name: Alice\nage: 30\n");

    const result = await loadMapFile(mapPath);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("file not found throws BmdError", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "missing.yaml");

    expect(loadMapFile(mapPath)).rejects.toThrow("Map file not found");
  });

  test("invalid YAML throws BmdError with diagnostic", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "bad.yaml");
    await rt.writeFile(mapPath, ":\n  :\n    : [}}}");

    expect(loadMapFile(mapPath)).rejects.toThrow();
  });

  test("scalar YAML root throws BmdError", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "scalar.yaml");
    await rt.writeFile(mapPath, "42");

    expect(loadMapFile(mapPath)).rejects.toThrow("not a YAML mapping");
  });

  test("array YAML root throws BmdError", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "array.yaml");
    await rt.writeFile(mapPath, "- one\n- two\n");

    expect(loadMapFile(mapPath)).rejects.toThrow("not a YAML mapping");
  });

  test("null/empty YAML document returns empty object", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "empty.yaml");
    await rt.writeFile(mapPath, "");

    const result = await loadMapFile(mapPath);
    expect(result).toEqual({});
  });

  test("nested YAML mapping returns correct structure", async () => {
    const { loadMapFile } = await import("../../../src/config/map-loader.ts");
    const mapPath = join(tempDir, "nested.yaml");
    await rt.writeFile(mapPath, "user:\n  name: Bob\n  tags:\n    - admin\n    - dev\n");

    const result = await loadMapFile(mapPath);
    expect(result).toEqual({
      user: { name: "Bob", tags: ["admin", "dev"] },
    });
  });
});
