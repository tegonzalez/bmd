import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "../..");
const buildScript = resolve(root, "scripts/build.mjs");
const postinstallScript = resolve(root, "postinstall.mjs");

describe("build script entrypoints", () => {
  test("exports independent web, CLI, and full build stages", async () => {
    const buildModule = await import(pathToFileURL(buildScript).href);

    expect(typeof buildModule.buildWeb).toBe("function");
    expect(typeof buildModule.buildCli).toBe("function");
    expect(typeof buildModule.runBuild).toBe("function");
  });

  test("keeps observable stage logs and isolated diagnosis flags", async () => {
    const source = await readFile(buildScript, "utf8");

    expect(source).toContain("build:web start");
    expect(source).toContain("build:web complete");
    expect(source).toContain("build:cli start");
    expect(source).toContain("build:cli complete");
    expect(source).toContain("--web-only");
    expect(source).toContain("--cli-only");
    expect(source).not.toContain("skipped due to build error");
    expect(source).not.toContain("web app may not be complete yet");
  });

  test("postinstall delegates to the shared build runner", async () => {
    const source = await readFile(postinstallScript, "utf8");

    expect(source).toContain("runBuild");
    expect(source).toContain("./scripts/build.mjs");
    expect(source).toContain("BMD_RELEASE");
    expect(source).not.toContain("esbuild.build");
  });
});
