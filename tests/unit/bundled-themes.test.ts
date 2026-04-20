import { test, expect, describe } from "bun:test";
import { dirname, join } from "path";
import { fileURLToPath } from "node:url";
import { loadAndValidateTheme } from "../../src/theme/loader";
import type { Facet } from "../../src/theme/types";
import { getRuntime } from "../../src/runtime/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const THEMES_DIR = join(__dirname, "../../themes");

const BUNDLED_THEMES: Record<Facet, string[]> = {
  syn: ["light", "dark", "dracula"],
  md: ["light", "dark"],
  mer: ["light", "dark", "dracula"],
  web: ["light", "dark"],
  unic: ["default"],
};

describe("bundled theme files", () => {
  const rt = getRuntime();
  for (const [facet, themes] of Object.entries(BUNDLED_THEMES)) {
    describe(`${facet} facet`, () => {
      for (const theme of themes) {
        test(`has ${theme}.yaml`, async () => {
          const path = join(THEMES_DIR, facet, `${theme}.yaml`);
          expect(await rt.fileExists(path)).toBe(true);
        });

        test(`${theme}.yaml passes schema validation`, async () => {
          const path = join(THEMES_DIR, facet, `${theme}.yaml`);
          const result = await loadAndValidateTheme(facet as Facet, path);
          expect(result).toBeDefined();
        });
      }
    });
  }

  describe("dracula variants", () => {
    test("syn has dracula variant", async () => {
      const path = join(THEMES_DIR, "syn", "dracula.yaml");
      expect(await rt.fileExists(path)).toBe(true);
    });

    test("mer has dracula variant", async () => {
      const path = join(THEMES_DIR, "mer", "dracula.yaml");
      expect(await rt.fileExists(path)).toBe(true);
    });
  });
});
