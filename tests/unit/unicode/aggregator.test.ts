/**
 * Aggregator tests: config-driven aggregation modes.
 *
 * Tests the three aggregation modes (region, aggregate, none)
 * and backward compatibility when no config is provided.
 */

import { test, expect, describe } from "bun:test";
import { aggregateFindings } from "../../../src/unicode/aggregator";
import type { Finding, UnicodeCategory } from "../../../src/unicode/types";
import type { AggregationConfig } from "../../../src/unicode/aggregator";

/** Helper to create a minimal Finding */
function makeFinding(
  offset: number,
  category: UnicodeCategory,
  opts: Partial<Finding> = {},
): Finding {
  return {
    offset,
    length: 1,
    codepoint: 0x200B,
    category,
    glyph: `[${category}]`,
    tooltip: `test ${category}`,
    isAtomic: false,
    ...opts,
  };
}

/** Helper to create N consecutive findings of the same category */
function makeRun(
  startOffset: number,
  count: number,
  category: UnicodeCategory,
  opts: Partial<Finding> = {},
): Finding[] {
  return Array.from({ length: count }, (_, i) =>
    makeFinding(startOffset + i, category, { length: 1, ...opts }),
  );
}

describe("aggregateFindings with mode='region'", () => {
  test("never collapses consecutive bidi findings", () => {
    const config: AggregationConfig = {
      bidi: { mode: "region", threshold: 2 },
    };
    const findings = makeRun(0, 5, "bidi");
    const result = aggregateFindings(findings, config);
    // Region mode: every finding passes through individually
    expect(result).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(result[i]!.offset).toBe(i);
      expect(result[i]!.category).toBe("bidi");
    }
  });

  test("never collapses consecutive annotation findings in region mode", () => {
    const config: AggregationConfig = {
      annotation: { mode: "region", threshold: 2 },
    };
    const findings = makeRun(0, 10, "annotation");
    const result = aggregateFindings(findings, config);
    expect(result).toHaveLength(10);
  });
});

describe("aggregateFindings with mode='aggregate'", () => {
  test("collapses runs of 3+ when threshold=3", () => {
    const config: AggregationConfig = {
      tag: { mode: "aggregate", threshold: 3 },
    };
    const findings = makeRun(0, 5, "tag");
    const result = aggregateFindings(findings, config);
    expect(result).toHaveLength(1);
    expect(result[0]!.glyph).toContain("x5");
  });

  test("does NOT collapse run of 2 when threshold=3", () => {
    const config: AggregationConfig = {
      tag: { mode: "aggregate", threshold: 3 },
    };
    const findings = makeRun(0, 2, "tag");
    const result = aggregateFindings(findings, config);
    expect(result).toHaveLength(2);
  });

  test("collapses at exact threshold boundary", () => {
    const config: AggregationConfig = {
      "ai-watermark": { mode: "aggregate", threshold: 3 },
    };
    const findings = makeRun(0, 3, "ai-watermark");
    const result = aggregateFindings(findings, config);
    expect(result).toHaveLength(1);
    expect(result[0]!.glyph).toContain("x3");
  });

  test("respects per-category threshold differences", () => {
    const config: AggregationConfig = {
      tag: { mode: "aggregate", threshold: 2 },
      pua: { mode: "aggregate", threshold: 5 },
    };
    // 3 tags (above threshold 2) -> collapsed
    const tags = makeRun(0, 3, "tag");
    // 3 pua (below threshold 5) -> not collapsed
    const puas = makeRun(10, 3, "pua");
    const result = aggregateFindings([...tags, ...puas], config);
    // 1 collapsed tag + 3 individual pua
    expect(result).toHaveLength(4);
    expect(result[0]!.glyph).toContain("x3");
    expect(result[1]!.category).toBe("pua");
  });
});

describe("aggregateFindings with mode='none'", () => {
  test("passes every finding through individually regardless of consecutive runs", () => {
    const config: AggregationConfig = {
      "ai-watermark": { mode: "none", threshold: 2 },
    };
    const findings = makeRun(0, 10, "ai-watermark");
    const result = aggregateFindings(findings, config);
    expect(result).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(result[i]!.offset).toBe(i);
    }
  });

  test("none mode works even for previously-aggregatable categories", () => {
    const config: AggregationConfig = {
      tag: { mode: "none", threshold: 2 },
      whitespace: { mode: "none", threshold: 2 },
    };
    const tags = makeRun(0, 5, "tag");
    const ws = makeRun(10, 5, "whitespace");
    const result = aggregateFindings([...tags, ...ws], config);
    expect(result).toHaveLength(10);
  });
});

describe("aggregateFindings backward compatibility (no config)", () => {
  test("undefined config produces identical output to hardcoded behavior", () => {
    // ai-watermark: threshold 2, aggregatable -> run of 3 collapses
    const findings = makeRun(0, 3, "ai-watermark");
    const result = aggregateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0]!.glyph).toContain("x3");
  });

  test("tag category still aggregates at threshold 2 without config", () => {
    const findings = makeRun(0, 4, "tag");
    const result = aggregateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0]!.glyph).toContain("x4");
  });

  test("zero-width category NOT aggregated without config (not in AGGREGATABLE)", () => {
    const findings = makeRun(0, 5, "zero-width");
    const result = aggregateFindings(findings);
    expect(result).toHaveLength(5);
  });

  test("combining-flood still uses threshold 3 without config", () => {
    const findings = makeRun(0, 2, "combining-flood");
    const result = aggregateFindings(findings);
    // Below threshold 3 -> not aggregated
    expect(result).toHaveLength(2);
  });
});

describe("unic schema aggregation fields", () => {
  // These tests will validate the schema accepts/rejects aggregation config
  // Import is deferred to keep test file loadable even if schema not yet extended
  test("schema accepts valid aggregation fields", async () => {
    const { unicThemeSchema } = await import("../../../src/theme/schema/unic");
    const validEntry = {
      fg: "#e06c75",
      mode: "aggregate",
      threshold: 3,
    };
    const input: Record<string, unknown> = {};
    const categories = [
      "zero-width", "bidi", "tag", "c0-control", "c1-control",
      "template-region", "template-unresolved",
      "ansi-escape", "whitespace", "pua", "ai-watermark", "variation-sel",
      "annotation", "deprecated", "noncharacter", "separator", "combining-flood",
      "unclassified",
    ];
    for (const cat of categories) {
      input[cat] = { ...validEntry };
    }
    const result = unicThemeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("schema accepts region mode with closer", async () => {
    const { unicThemeSchema } = await import("../../../src/theme/schema/unic");
    const categories = [
      "zero-width", "bidi", "tag", "c0-control", "c1-control",
      "template-region", "template-unresolved",
      "ansi-escape", "whitespace", "pua", "ai-watermark", "variation-sel",
      "annotation", "deprecated", "noncharacter", "separator", "combining-flood",
      "unclassified",
    ];
    const input: Record<string, unknown> = {};
    for (const cat of categories) {
      input[cat] = { fg: "#e06c75" };
    }
    // Override bidi with region mode + closer
    input["bidi"] = {
      fg: "#e5c07b",
      bg: "#3e3022",
      bold: true,
      mode: "region",
      closer: 0x202C,
    };
    const result = unicThemeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("schema rejects invalid mode value", async () => {
    const { unicThemeSchema } = await import("../../../src/theme/schema/unic");
    const categories = [
      "zero-width", "bidi", "tag", "c0-control", "c1-control",
      "template-region", "template-unresolved",
      "ansi-escape", "whitespace", "pua", "ai-watermark", "variation-sel",
      "annotation", "deprecated", "noncharacter", "separator", "combining-flood",
      "unclassified",
    ];
    const input: Record<string, unknown> = {};
    for (const cat of categories) {
      input[cat] = { fg: "#e06c75", mode: "invalid_mode" };
    }
    const result = unicThemeSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("schema rejects threshold < 1", async () => {
    const { unicThemeSchema } = await import("../../../src/theme/schema/unic");
    const categories = [
      "zero-width", "bidi", "tag", "c0-control", "c1-control",
      "template-region", "template-unresolved",
      "ansi-escape", "whitespace", "pua", "ai-watermark", "variation-sel",
      "annotation", "deprecated", "noncharacter", "separator", "combining-flood",
      "unclassified",
    ];
    const input: Record<string, unknown> = {};
    for (const cat of categories) {
      input[cat] = { fg: "#e06c75" };
    }
    input["tag"] = { fg: "#e06c75", threshold: 0 };
    const result = unicThemeSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("schema still validates style-only configs (backward compat)", async () => {
    const { unicThemeSchema } = await import("../../../src/theme/schema/unic");
    // Old format: only fg/bg/bold/underline, no mode/threshold/closer
    const input: Record<string, unknown> = {
      "zero-width": { fg: "#e06c75" },
      "bidi": { fg: "#e5c07b", bg: "#3e3022", bold: true },
      "template-region": { fg: "#60a5fa", bg: "#1e293b" },
      "template-unresolved": { fg: "#94a3b8", bg: "#1e293b" },
      "tag": { fg: "#c678dd" },
      "c0-control": { fg: "#e06c75" },
      "c1-control": { fg: "#e06c75" },
      "ansi-escape": { fg: "#e06c75", bg: "#2c1a1a", bold: true },
      "whitespace": { fg: "#7f848e" },
      "pua": { fg: "#c678dd" },
      "ai-watermark": { fg: "#61afef" },
      "variation-sel": { fg: "#7f848e" },
      "annotation": { fg: "#c678dd" },
      "deprecated": { fg: "#7f848e" },
      "noncharacter": { fg: "#e06c75" },
      "separator": { fg: "#7f848e" },
      "combining-flood": { fg: "#e5c07b" },
      "unclassified": { fg: "#7f848e" },
    };
    const result = unicThemeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
