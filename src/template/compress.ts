/**
 * Whitespace compression for empty template expansions.
 *
 * After substitution, empty expansions (null, empty string) leave behind
 * extra whitespace. This module collapses that whitespace while preserving
 * indentation and punctuation.
 */

export interface ExpansionMark {
  /** Start offset in the line (after substitution). */
  start: number;
  /** End offset in the line (after substitution). */
  end: number;
  /** Whether the expansion resolved to empty/null. */
  isEmpty: boolean;
}

/**
 * Compress whitespace around empty expansions in a single line.
 *
 * Rules:
 * - Space on both sides of empty: collapse double space to single
 * - Empty at line start (after indent): remove the space that follows
 * - Empty at line end (pos == line.length): remove trailing space before
 * - Multiple adjacent empties: collapse resulting multi-spaces to single
 * - Preserve leading indentation
 * - Punctuation is never removed
 */
export function compressWhitespace(
  line: string,
  expansions: ExpansionMark[],
): string {
  // Fast path: no empty expansions means no compression needed
  const empties = expansions.filter((e) => e.isEmpty);
  if (empties.length === 0) return line;

  // Mark spaces for removal based on adjacency to empty expansion points
  const toRemove = new Set<number>();

  for (const e of empties) {
    const pos = e.start;
    const hasSpaceBefore = pos > 0 && line[pos - 1]! === " ";
    const hasSpaceAfter = pos < line.length && line[pos]! === " ";

    if (hasSpaceBefore && hasSpaceAfter) {
      // Space on both sides of empty expansion creates a double space.
      // Remove one to collapse.
      toRemove.add(pos);
    } else if (hasSpaceAfter && pos === 0) {
      // Empty at very start of line with space after: remove the space
      toRemove.add(pos);
    } else if (hasSpaceBefore && pos >= line.length) {
      // Empty at very end of line with space before: remove trailing space
      toRemove.add(pos - 1);
    } else if (!hasSpaceBefore && hasSpaceAfter) {
      // After a non-space char with space after (e.g., indent boundary)
      // Only compress if everything before is whitespace (indent zone)
      let allWsBefore = true;
      for (let i = 0; i < pos; i++) {
        if (line[i]! !== " " && line[i]! !== "\t") { allWsBefore = false; break; }
      }
      if (allWsBefore && pos > 0) {
        toRemove.add(pos);
      }
    }
  }

  // Build result, skipping removed positions
  let result = "";
  for (let i = 0; i < line.length; i++) {
    if (!toRemove.has(i)) {
      result += line[i]!;
    }
  }

  // Collapse remaining runs of multiple spaces (from multiple adjacent empties)
  // but preserve leading indentation
  const indentMatch = result.match(/^([\t ]*?)(\S|$)/);
  const indent = indentMatch ? indentMatch[1]! : "";
  const content = result.slice(indent.length);

  // Collapse multiple spaces in content area to single space
  const collapsed = content.replace(/ {2,}/g, " ");

  // If the entire line is whitespace after compression, return empty
  const final = indent + collapsed;
  if (final.trim().length === 0 && empties.length > 0) return "";

  return final;
}
