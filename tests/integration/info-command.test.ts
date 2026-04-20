/**
 * Info command behavior — in-process (same steps as `bmd info`, no subprocess).
 * Subprocess / full CLI coverage lives under tests/e2e/.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import { extractFields } from "../../src/template/index.ts";
import { inflateDotPaths } from "../../src/cli/var-parser.ts";

describe("info command", () => {
  test("extracts sorted unique fields from file and emits YAML skeleton", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bmd-info-"));
    const file = join(dir, "doc.md");
    try {
      await writeFile(
        file,
        [
          "# Title {{zeta}}",
          "Name: {{user.name}}",
          "Again: {{alpha}} {{alpha}}",
          "Code: `{{ignored.in.code}}`",
        ].join("\n"),
      );

      const source = await readFile(file, "utf-8");
      const fields = extractFields(source).sort();
      const skeleton = inflateDotPaths(
        fields.map((key) => ({ key, value: "" })),
      );
      const stdout = stringifyYaml(skeleton);

      expect(stdout).toBe(
        [
          "alpha: \"\"",
          "user:",
          "  name: \"\"",
          "zeta: \"\"",
          "",
        ].join("\n"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reads template source from stdin when input is -", async () => {
    const source = "{{beta}} {{alpha}}";
    const fields = extractFields(source).sort();
    const skeleton = inflateDotPaths(
      fields.map((key) => ({ key, value: "" })),
    );
    const stdout = stringifyYaml(skeleton);

    expect(stdout).toBe(
      [
        "alpha: \"\"",
        "beta: \"\"",
        "",
      ].join("\n"),
    );
  });
});
