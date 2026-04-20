import { test, expect, describe } from "bun:test";
import { synThemeSchema, type SynTheme } from "../../src/theme/schema/syn";
import { mdThemeSchema, type MdTheme } from "../../src/theme/schema/md";
import { merThemeSchema, type MerTheme } from "../../src/theme/schema/mer";
import { webThemeSchema, type WebTheme } from "../../src/theme/schema/web";
import { parseThemeSpec, FACETS, type ThemeSpec, type Facet } from "../../src/theme/spec-parser";
import { DEFAULT_SYN, DEFAULT_MD, DEFAULT_MER, DEFAULT_WEB, getDefaults } from "../../src/theme/defaults";

describe("synThemeSchema", () => {
  test("validates a valid syn theme", () => {
    const valid = { shikiTheme: "github-dark", defaultColor: "#e1e4e8" };
    const result = synThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields with .strict()", () => {
    const invalid = { shikiTheme: "github-dark", defaultColor: "#e1e4e8", unknownField: true };
    const result = synThemeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid hex color", () => {
    const invalid = { shikiTheme: "github-dark", defaultColor: "not-a-hex" };
    const result = synThemeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("mdThemeSchema", () => {
  test("validates a valid md theme with all fields", () => {
    const valid: Record<string, unknown> = {
      headings: {
        1: { bold: true, color: "#00ffff" },
        2: { bold: true, color: "#00ff00" },
      },
      codeBlockIndent: 4,
      blockquoteBarChar: "|",
      tableBorder: true,
      listBullets: ["*", "-", "+"],
      linkFormat: "inline",
      hrChar: "-",
      hrWidth: "full",
      elementSpacing: 1,
    };
    const result = mdThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("validates with optional ANSI color fields", () => {
    const valid = {
      headings: { 1: { bold: true, color: "#ffffff" } },
      codeBlockIndent: 4,
      blockquoteBarChar: "|",
      tableBorder: true,
      listBullets: ["*"],
      linkFormat: "inline",
      hrChar: "-",
      hrWidth: "full",
      elementSpacing: 1,
      boldColor: "#ffffff",
      codeColor: "#808080",
      linkColor: "#5f87ff",
    };
    const result = mdThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields with .strict()", () => {
    const invalid = {
      headings: {},
      codeBlockIndent: 4,
      blockquoteBarChar: "|",
      tableBorder: true,
      listBullets: ["*"],
      linkFormat: "inline",
      hrChar: "-",
      hrWidth: "full",
      elementSpacing: 1,
      unknownField: "oops",
    };
    const result = mdThemeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("merThemeSchema", () => {
  test("validates DiagramColors-compatible shape", () => {
    const valid = {
      fg: "#e4e4e7",
      border: "#a1a1aa",
      line: "#a1a1aa",
      arrow: "#d4d4d8",
    };
    const result = merThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("validates with optional fields", () => {
    const valid = {
      fg: "#e4e4e7",
      border: "#a1a1aa",
      line: "#a1a1aa",
      arrow: "#d4d4d8",
      corner: "+",
      junction: "+",
      nodeFill: "#333333",
      edgeColor: "#aaaaaa",
      labelColor: "#ffffff",
    };
    const result = merThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields with .strict()", () => {
    const invalid = {
      fg: "#e4e4e7",
      border: "#a1a1aa",
      line: "#a1a1aa",
      arrow: "#d4d4d8",
      badField: true,
    };
    const result = merThemeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("webThemeSchema", () => {
  test("validates CSS custom property fields", () => {
    const valid = {
      fontFamily: "system-ui, sans-serif",
      monoFontFamily: "monospace",
      maxWidth: "900px",
      spacing: 24,
      fontSize: 15,
      day: {
        bg: "#ffffff",
        fg: "#1a1a2e",
        accent: "#2563eb",
        border: "#dddddd",
        codeBg: "#f4f4f4",
        codeFg: "#1a1a2e",
      },
      night: {
        bg: "#1a1a2e",
        fg: "#e0e0e0",
        accent: "#60a5fa",
        border: "#2a2a4a",
        codeBg: "#0d1117",
        codeFg: "#e0e0e0",
      },
    };
    const result = webThemeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("rejects unknown fields with .strict()", () => {
    const invalid = {
      fontFamily: "system-ui",
      monoFontFamily: "monospace",
      maxWidth: "900px",
      spacing: 24,
      fontSize: 15,
      day: { bg: "#fff", fg: "#000", accent: "#00f", border: "#ccc", codeBg: "#eee", codeFg: "#111" },
      night: { bg: "#000", fg: "#fff", accent: "#00f", border: "#333", codeBg: "#111", codeFg: "#eee" },
      badField: true,
    };
    const result = webThemeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("parseThemeSpec", () => {
  test('parses "syn:dracula+md:dark" correctly', () => {
    const result = parseThemeSpec("syn:dracula+md:dark");
    expect(result).toEqual({ syn: "dracula", md: "dark" });
  });

  test('parses "syn:dracula" as partial spec', () => {
    const result = parseThemeSpec("syn:dracula");
    expect(result).toEqual({ syn: "dracula" });
  });

  test('throws for "bad" (missing theme name)', () => {
    expect(() => parseThemeSpec("bad")).toThrow("Missing theme name");
  });

  test('throws for "fake:thing" (unknown facet)', () => {
    expect(() => parseThemeSpec("fake:thing")).toThrow("Unknown theme facet");
  });

  test("parses full spec with all four facets", () => {
    const result = parseThemeSpec("syn:dracula+md:dark+mer:neon+web:clean");
    expect(result).toEqual({ syn: "dracula", md: "dark", mer: "neon", web: "clean" });
  });

  test("FACETS contains all four facets", () => {
    expect(FACETS).toEqual(["syn", "md", "mer", "web"]);
  });

  test.skip("Phase 3 TODO: parses unic:default as the unicode facet", () => {
    expect(parseThemeSpec("unic:default") as unknown).toEqual({ unic: "default" });
  });

  test.skip("Phase 3 TODO: FACETS includes syn md mer web and unic from the authoritative theme type source", () => {
    expect(FACETS as readonly string[]).toEqual(["syn", "md", "mer", "web", "unic"]);
  });
});

describe("defaults", () => {
  test("DEFAULT_SYN passes synThemeSchema", () => {
    const result = synThemeSchema.safeParse(DEFAULT_SYN);
    expect(result.success).toBe(true);
  });

  test("DEFAULT_MD passes mdThemeSchema", () => {
    const result = mdThemeSchema.safeParse(DEFAULT_MD);
    expect(result.success).toBe(true);
  });

  test("DEFAULT_MER passes merThemeSchema", () => {
    const result = merThemeSchema.safeParse(DEFAULT_MER);
    expect(result.success).toBe(true);
  });

  test("DEFAULT_WEB passes webThemeSchema", () => {
    const result = webThemeSchema.safeParse(DEFAULT_WEB);
    expect(result.success).toBe(true);
  });

  test("getDefaults returns all four facets", () => {
    const defaults = getDefaults();
    expect(defaults.syn).toBeDefined();
    expect(defaults.md).toBeDefined();
    expect(defaults.mer).toBeDefined();
    expect(defaults.web).toBeDefined();
  });
});
