import type { Token } from "../parser/index.ts";

/** Tab width for tab-to-space expansion (CODE-02). */
export const TAB_WIDTH = 4;

/**
 * Normalize a code block token in-place.
 *
 * Applies the following transformations in order:
 * 1. CODE-04: Preserve original content in token.meta.originalContent
 * 2. CODE-03: Trim leading and trailing blank lines
 * 3. CODE-02: Expand tabs to spaces
 * 4. CODE-01: Remove incidental (common minimum) indent
 *
 * @param token - A fence or code_block token to normalize
 */
export function normalizeCodeBlock(token: Token): void {
  // CODE-04: Preserve original content for diagnostics
  if (token.meta === null || token.meta === undefined) {
    token.meta = {};
  }
  token.meta.originalContent = token.content;

  let lines = token.content.split("\n");

  // CODE-03: Trim leading blank lines
  while (lines.length > 0 && lines[0]!.trim() === "") {
    lines.shift();
  }

  // CODE-03: Trim trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    token.content = "";
    return;
  }

  // CODE-02: Expand tabs to spaces
  const tabSpaces = " ".repeat(TAB_WIDTH);
  lines = lines.map((line) => line.replace(/\t/g, tabSpaces));

  // CODE-01: Remove incidental indent
  const nonEmptyLines = lines.filter((l) => l.trim() !== "");
  if (nonEmptyLines.length > 0) {
    const minIndent = Math.min(
      ...nonEmptyLines.map((l) => {
        const match = l.match(/^(\s*)/);
        return match![1]!.length;
      })
    );
    if (minIndent > 0) {
      lines = lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l));
    }
  }

  token.content = lines.join("\n");
}
