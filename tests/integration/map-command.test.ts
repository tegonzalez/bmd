/**
 * Map command behavior — in-process (same pipeline as `bmd map`, no subprocess).
 * Subprocess / full CLI coverage lives under tests/e2e/.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config/loader.ts";
import { resolveConfig } from "../../src/config/merge.ts";
import { resolveTemplateValues } from "../../src/config/map-loader.ts";
import { expandTemplate } from "../../src/template/index.ts";
import { extractVarArgs } from "../../src/cli/var-parser.ts";

async function runMapPipeline(opts: {
  source: string;
  filePath: string | undefined;
  mapPath: string | undefined;
  templates: boolean;
  argvTail: string[];
}): Promise<string> {
  const configFile = await loadConfig(undefined);
  const config = resolveConfig(
    {
      format: "utf8",
      width: 80,
      ansiEnabled: false,
      pager: "never",
      filePath: opts.filePath,
      map: opts.mapPath,
      templates: opts.templates,
    },
    configFile,
  );

  let output = opts.source;
  if (config.templates.enabled) {
    const cliVars = extractVarArgs(opts.argvTail);
    const values = await resolveTemplateValues(
      opts.mapPath || undefined,
      cliVars,
      config.templates,
      config.filePath,
    );
    const result = expandTemplate(opts.source, values, {
      listSpec: config.templates.list_spec,
    });
    output = result.output;
  }

  return output;
}

describe("map command", () => {
  test("applies template mapping and outputs markdown text (file + -m)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmd-map-"));
    const file = join(dir, "doc.md");
    const map = join(dir, "values.yaml");
    try {
      await writeFile(file, "# {{TITLE}}\n\nHello {{user.name}}.");
      await writeFile(map, "TITLE: Welcome\nuser:\n  name: World\n");

      const source = await readFile(file, "utf-8");
      const out = await runMapPipeline({
        source,
        filePath: file,
        mapPath: map,
        templates: true,
        argvTail: ["map", "-m", map, file],
      });

      expect(out).toBe("# Welcome\n\nHello World.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("supports stdin input and --var overrides", async () => {
    const source = "Hi {{NAME:-friend}}";
    const out = await runMapPipeline({
      source,
      filePath: undefined,
      mapPath: undefined,
      templates: true,
      argvTail: ["map", "-", "--var", "NAME=Alice"],
    });

    expect(out).toBe("Hi Alice");
  });

  test("--no-templates returns source unchanged", async () => {
    const source = "Hi {{NAME:-friend}}";
    const out = await runMapPipeline({
      source,
      filePath: undefined,
      mapPath: undefined,
      templates: false,
      argvTail: ["map", "-", "--no-templates", "--var", "NAME=Alice"],
    });

    expect(out).toBe("Hi {{NAME:-friend}}");
  });
});
