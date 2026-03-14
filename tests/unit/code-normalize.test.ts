import { test, expect, describe } from "bun:test";
import {
  normalizeCodeBlock,
  TAB_WIDTH,
} from "../../src/transform/code-normalize.ts";
import { runTransforms } from "../../src/transform/pipeline.ts";
import type { Token } from "../../src/parser/index.ts";

/**
 * Helper to create a minimal Token-like object for testing.
 */
function makeToken(
  type: string,
  content: string,
  meta: Record<string, any> | null = null
): Token {
  return {
    type,
    tag: "code",
    attrs: null,
    map: null,
    nesting: 0,
    level: 0,
    children: null,
    content,
    markup: "```",
    info: "",
    meta,
    block: false,
    hidden: false,
  } as Token;
}

describe("normalizeCodeBlock", () => {
  test("removes 4-space common indent from all lines", () => {
    const token = makeToken("fence", "    line1\n    line2");
    normalizeCodeBlock(token);
    expect(token.content).toBe("line1\nline2");
  });

  test("preserves relative indent", () => {
    const token = makeToken("fence", "    line1\n        line2");
    normalizeCodeBlock(token);
    expect(token.content).toBe("line1\n    line2");
  });

  test("does NOT remove indent when lines have no common indent", () => {
    const token = makeToken("fence", "line1\n    line2");
    normalizeCodeBlock(token);
    expect(token.content).toBe("line1\n    line2");
  });

  test("expands tabs to 4 spaces", () => {
    const token = makeToken("fence", "\tindented");
    normalizeCodeBlock(token);
    expect(token.content).toBe("indented");
    expect(TAB_WIDTH).toBe(4);
  });

  test("trims leading blank lines from content", () => {
    const token = makeToken("fence", "\n\ncode");
    normalizeCodeBlock(token);
    expect(token.content).toBe("code");
  });

  test("trims trailing blank lines from content", () => {
    const token = makeToken("fence", "code\n\n");
    normalizeCodeBlock(token);
    expect(token.content).toBe("code");
  });

  test("preserves original content in token.meta.originalContent", () => {
    const original = "    line1\n    line2\n";
    const token = makeToken("fence", original);
    normalizeCodeBlock(token);
    expect(token.meta).toBeDefined();
    expect(token.meta!.originalContent).toBe(original);
  });

  test("initializes meta if null", () => {
    const token = makeToken("fence", "code", null);
    expect(token.meta).toBeNull();
    normalizeCodeBlock(token);
    expect(token.meta).toBeDefined();
    expect(token.meta!.originalContent).toBe("code");
  });

  test("handles empty code block without error", () => {
    const token = makeToken("fence", "");
    expect(() => normalizeCodeBlock(token)).not.toThrow();
    expect(token.content).toBe("");
  });

  test("handles content that is only blank lines", () => {
    const token = makeToken("fence", "\n\n\n");
    normalizeCodeBlock(token);
    expect(token.content).toBe("");
  });

  test("expands tabs before calculating indent removal", () => {
    // Tab + "hello" and tab + tab + "world"
    // After tab expansion: "    hello" and "        world"
    // Common indent is 4 -> "hello" and "    world"
    const token = makeToken("fence", "\thello\n\t\tworld");
    normalizeCodeBlock(token);
    expect(token.content).toBe("hello\n    world");
  });
});

describe("runTransforms", () => {
  test("applies normalization to all fence tokens", () => {
    const tokens = [
      makeToken("paragraph_open", ""),
      makeToken("fence", "    code1\n    code2"),
      makeToken("paragraph_close", ""),
      makeToken("fence", "\ttabbed"),
    ];
    runTransforms(tokens);
    expect(tokens[1]!.content).toBe("code1\ncode2");
    expect(tokens[3]!.content).toBe("tabbed");
  });

  test("applies normalization to code_block tokens", () => {
    const tokens = [makeToken("code_block", "    indented\n    code")];
    runTransforms(tokens);
    expect(tokens[0]!.content).toBe("indented\ncode");
  });

  test("does NOT modify non-fence tokens", () => {
    const tokens = [
      makeToken("paragraph_open", ""),
      makeToken("inline", "    some text"),
      makeToken("paragraph_close", ""),
    ];
    const originalContent = tokens[1]!.content;
    runTransforms(tokens);
    expect(tokens[1]!.content).toBe(originalContent);
  });
});
