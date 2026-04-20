/**
 * Tests for discoverAutoMap function.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getRuntime } from "../../../src/runtime/index.ts";

describe("discoverAutoMap", () => {
  const rt = getRuntime();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bmd-automap-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("finds .yaml pair for .t file", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    await rt.writeFile(join(tempDir, "README.t"), "template content");
    await rt.writeFile(join(tempDir, "README.yaml"), "title: Hello\n");

    const result = await discoverAutoMap(join(tempDir, "README.t"));
    expect(result).toBe(join(tempDir, "README.yaml"));
  });

  test("finds .yml pair when .yaml missing", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    await rt.writeFile(join(tempDir, "doc.t"), "template");
    await rt.writeFile(join(tempDir, "doc.yml"), "key: val\n");

    const result = await discoverAutoMap(join(tempDir, "doc.t"));
    expect(result).toBe(join(tempDir, "doc.yml"));
  });

  test("prefers .yaml over .yml when both exist", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    await rt.writeFile(join(tempDir, "notes.t"), "template");
    await rt.writeFile(join(tempDir, "notes.yaml"), "from: yaml\n");
    await rt.writeFile(join(tempDir, "notes.yml"), "from: yml\n");

    const result = await discoverAutoMap(join(tempDir, "notes.t"));
    expect(result).toBe(join(tempDir, "notes.yaml"));
  });

  test("returns null for non-.t file", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    const result = await discoverAutoMap(join(tempDir, "README.md"));
    expect(result).toBeNull();
  });

  test("returns null when no paired file exists", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    await rt.writeFile(join(tempDir, "orphan.t"), "template");

    const result = await discoverAutoMap(join(tempDir, "orphan.t"));
    expect(result).toBeNull();
  });

  test("handles subdirectory paths", async () => {
    const { discoverAutoMap } = await import("../../../src/config/map-loader.ts");
    const subDir = join(tempDir, "doc");
    await rt.writeFile(join(subDir, "notes.t"), "template");
    await rt.writeFile(join(subDir, "notes.yaml"), "key: val\n");

    const result = await discoverAutoMap(join(subDir, "notes.t"));
    expect(result).toBe(join(subDir, "notes.yaml"));
  });
});
