/**
 * Pager policy (TERM-05) — pure `shouldPage` logic (no subprocess, no full pipeline).
 * Rendered output for fixtures is covered by tests that import `runPipeline` under Bun
 * (e.g. render-file). Full CLI + shell paging belongs in tests/e2e/.
 */
import { describe, test, expect } from "bun:test";
import { shouldPage } from "../../src/pager/index.ts";

describe("pager behavior (TERM-05)", () => {
  test("auto mode does not page when stdout is not a TTY", () => {
    expect(shouldPage(1000, 24, false, "auto")).toBe(false);
  });

  test("never mode never pages, even for long output on a TTY", () => {
    expect(shouldPage(1000, 24, true, "never")).toBe(false);
  });

  test("auto mode does not page when line count fits in terminal height", () => {
    expect(shouldPage(10, 24, true, "auto")).toBe(false);
  });

  test("auto mode may page when TTY and output exceeds terminal height", () => {
    expect(shouldPage(100, 24, true, "auto")).toBe(true);
  });
});
