import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolveTemplateValues } from "../../../src/config/map-loader.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRuntime } from '../../../src/runtime/index.ts';

const rt = getRuntime();

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bmd-values-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeYaml(name: string, content: string): Promise<string> {
  const filePath = join(tmpDir, name);
  await rt.writeFile(filePath, content);
  return filePath;
}

describe("resolveTemplateValues", () => {
  test("returns empty values when nothing specified", async () => {
    const result = await resolveTemplateValues(undefined, [], {}, undefined);
    expect(result).toEqual({});
  });

  test("--map returns map file values", async () => {
    const mapPath = await writeYaml("vals.yaml", "name: Alice\nage: 30\n");
    const result = await resolveTemplateValues(mapPath, [], {}, undefined);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("--map + --var deep-merges var on top of map", async () => {
    const mapPath = await writeYaml("vals.yaml", "user:\n  name: Alice\n  age: 30\n");
    const vars = [{ key: "user.name", value: "Bob" }];
    const result = await resolveTemplateValues(mapPath, vars, {}, undefined);
    expect(result).toEqual({ user: { name: "Bob", age: 30 } });
  });

  test("config.map is used when no CLI --map", async () => {
    const mapPath = await writeYaml("config.yaml", "title: FromConfig\n");
    const result = await resolveTemplateValues(undefined, [], { map: mapPath }, undefined);
    expect(result).toEqual({ title: "FromConfig" });
  });

  test("CLI --map overrides config.map entirely", async () => {
    const configMap = await writeYaml("config.yaml", "source: config\n");
    const cliMap = await writeYaml("cli.yaml", "source: cli\n");
    const result = await resolveTemplateValues(cliMap, [], { map: configMap }, undefined);
    expect(result).toEqual({ source: "cli" });
  });

  test("auto_map discovers .t paired file", async () => {
    const templatePath = join(tmpDir, "readme.t");
    await rt.writeFile(templatePath, "# {{ title }}");
    await writeYaml("readme.yaml", "title: Hello\n");
    const result = await resolveTemplateValues(
      undefined, [], { auto_map: true, enabled: true }, templatePath,
    );
    expect(result).toEqual({ title: "Hello" });
  });

  test("enabled=false skips auto-map", async () => {
    const templatePath = join(tmpDir, "readme.t");
    await rt.writeFile(templatePath, "# {{ title }}");
    await writeYaml("readme.yaml", "title: Hello\n");
    const result = await resolveTemplateValues(
      undefined, [], { auto_map: true, enabled: false }, templatePath,
    );
    expect(result).toEqual({});
  });

  test("enabled=false does not block explicit --map", async () => {
    const mapPath = await writeYaml("vals.yaml", "name: Alice\n");
    const result = await resolveTemplateValues(
      mapPath, [], { enabled: false }, undefined,
    );
    expect(result).toEqual({ name: "Alice" });
  });

  test("precedence: --var > --map > config.map > auto-map", async () => {
    // Set up auto-map
    const templatePath = join(tmpDir, "readme.t");
    await rt.writeFile(templatePath, "template");
    await writeYaml("readme.yaml", "a: auto\nb: auto\nc: auto\nd: auto\n");

    // Set up config map
    const configMap = await writeYaml("config.yaml", "b: config\nc: config\nd: config\n");

    // Set up CLI map -- overrides config map entirely
    const cliMap = await writeYaml("cli.yaml", "c: cli\nd: cli\n");

    // --var overrides
    const vars = [{ key: "d", value: "var" }];

    const result = await resolveTemplateValues(
      cliMap, vars, { map: configMap, auto_map: true, enabled: true }, templatePath,
    );

    // CLI --map replaces config.map entirely, so only c and d from cli.yaml
    // then --var d overrides cli.yaml d
    expect(result).toEqual({ c: "cli", d: "var" });
  });

  test("--var with no map file works standalone", async () => {
    const vars = [
      { key: "name", value: "Alice" },
      { key: "count", value: 42 },
    ];
    const result = await resolveTemplateValues(undefined, vars, {}, undefined);
    expect(result).toEqual({ name: "Alice", count: 42 });
  });
});
