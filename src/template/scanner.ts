/**
 * Two-pass scanner for the template engine.
 *
 * Pass 1: findSkipRegions() -- identifies fenced code blocks, inline code
 *         spans, and indented code blocks as regions to skip.
 * Pass 2: findExpressionRanges() -- finds {{...}} expressions outside
 *         skip regions.
 */

import type { SkipRegion, ExpressionRange } from './types';

/**
 * Scan source text to build a sorted, non-overlapping array of skip regions.
 *
 * Detects:
 * - Fenced code blocks (backtick and tilde, 3+ chars, optional 0-3 space indent)
 * - Inline code spans (N-backtick matching per CommonMark)
 * - Indented code blocks (4+ leading spaces after blank line)
 */
export function findSkipRegions(source: string): SkipRegion[] {
  if (source.length === 0) return [];

  const regions: SkipRegion[] = [];

  // Phase 1: Fenced code blocks (line-by-line)
  findFencedCodeBlocks(source, regions);

  // Phase 2: Inline code spans (must not overlap fenced regions)
  findInlineCodeSpans(source, regions);

  // Phase 3: Indented code blocks (must not overlap existing regions)
  findIndentedCodeBlocks(source, regions);

  // Sort by start offset
  regions.sort((a, b) => a.start - b.start);

  // Merge overlapping regions
  return mergeRegions(regions);
}

/**
 * Scan for {{...}} expression pairs outside skip regions.
 * Uses indexOf (not global regex) for non-greedy, predictable matching.
 */
export function findExpressionRanges(
  source: string,
  skipRegions: SkipRegion[],
): ExpressionRange[] {
  const ranges: ExpressionRange[] = [];
  let pos = 0;

  while (pos < source.length) {
    const openIdx = source.indexOf('{{', pos);
    if (openIdx === -1) break;

    const closeIdx = source.indexOf('}}', openIdx + 2);
    if (closeIdx === -1) break;

    const end = closeIdx + 2;

    // Check if this range overlaps any skip region
    if (!overlapsSkipRegion(openIdx, end, skipRegions)) {
      ranges.push({
        start: openIdx,
        end,
        raw: source.slice(openIdx + 2, closeIdx),
      });
    }

    pos = end;
  }

  return ranges;
}

// --- Internal helpers ---

const FENCE_OPEN_RE = /^( {0,3})((`{3,})[^`]*|(~{3,})[^~]*)$/;

function findFencedCodeBlocks(source: string, regions: SkipRegion[]): void {
  const lines = splitLines(source);
  let i = 0;

  while (i < lines.length) {
    const { text, start } = lines[i]!;
    const match = FENCE_OPEN_RE.exec(text);

    if (match) {
      // Determine fence type and length
      const backtickRun = match[3]!; // e.g. ``` or ````
      const tildeRun = match[4]!; // e.g. ~~~ or ~~~~
      const fenceChar = backtickRun ? '`' : '~';
      const fenceLen = (backtickRun || tildeRun).length;
      const regionStart = start;

      // Search for closing fence
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const closeLine = lines[j]!.text;
        const closeMatch = matchClosingFence(closeLine, fenceChar, fenceLen);
        if (closeMatch) {
          // Region spans from start of opening fence line to end of closing fence line
          regions.push({
            start: regionStart,
            end: lines[j]!.start + lines[j]!.text.length + 1, // +1 for newline
          });
          i = j + 1;
          closed = true;
          break;
        }
        j++;
      }

      if (!closed) {
        // Unclosed fence extends to end of document
        regions.push({ start: regionStart, end: source.length });
        i = lines.length;
      }
    } else {
      i++;
    }
  }
}

function matchClosingFence(
  line: string,
  fenceChar: string,
  minLen: number,
): boolean {
  // Closing fence: optional 0-3 spaces, then N+ of same char, then only whitespace
  const re =
    fenceChar === '`'
      ? /^( {0,3})(`{3,})\s*$/
      : /^( {0,3})(~{3,})\s*$/;
  const m = re.exec(line);
  if (!m) return false;
  return m[2]!.length >= minLen;
}

function findInlineCodeSpans(source: string, regions: SkipRegion[]): void {
  let pos = 0;

  while (pos < source.length) {
    if (source[pos]! !== '`') {
      pos++;
      continue;
    }

    // Already inside a fenced region? Skip.
    if (isInRegion(pos, regions)) {
      pos++;
      continue;
    }

    // Count opening backtick run length
    let runLen = 0;
    let p = pos;
    while (p < source.length && source[p]! === '`') {
      runLen++;
      p++;
    }

    // Search for matching closing run of exactly runLen backticks
    let searchPos = p;
    let found = false;
    while (searchPos < source.length) {
      const nextBacktick = source.indexOf('`', searchPos);
      if (nextBacktick === -1) break;

      // Count backtick run at this position
      let closeLen = 0;
      let cp = nextBacktick;
      while (cp < source.length && source[cp]! === '`') {
        closeLen++;
        cp++;
      }

      if (closeLen === runLen) {
        // Found matching close
        const regionStart = pos;
        const regionEnd = cp;
        if (!isInRegion(regionStart, regions)) {
          regions.push({ start: regionStart, end: regionEnd });
        }
        pos = cp;
        found = true;
        break;
      }

      searchPos = cp;
    }

    if (!found) {
      // No matching close found -- not a code span
      pos = p;
    }
  }
}

function findIndentedCodeBlocks(source: string, regions: SkipRegion[]): void {
  const lines = splitLines(source);
  let i = 0;
  // Start of document counts as "after blank line"
  let prevWasBlank = true;

  while (i < lines.length) {
    const { text, start } = lines[i]!;
    const isBlank = text.trim().length === 0;
    const hasIndent = text.length > 0 && /^ {4,}/.test(text);

    if (hasIndent && prevWasBlank && !isInRegion(start, regions)) {
      // Start of indented code block
      const blockStart = start;
      let blockEnd = start + text.length;
      let j = i + 1;

      // Continue while lines are indented or blank
      while (j < lines.length) {
        const nextLine = lines[j]!;
        const nextIsBlank = nextLine.text.trim().length === 0;
        const nextHasIndent =
          nextLine.text.length > 0 && /^ {4,}/.test(nextLine.text);

        if (nextHasIndent) {
          blockEnd = nextLine.start + nextLine.text.length;
          j++;
        } else if (nextIsBlank) {
          // Blank line might continue the block -- look ahead
          j++;
        } else {
          break;
        }
      }

      regions.push({ start: blockStart, end: blockEnd });
      i = j;
      prevWasBlank = false;
    } else {
      prevWasBlank = isBlank;
      i++;
    }
  }
}

interface LineInfo {
  text: string;
  start: number;
}

function splitLines(source: string): LineInfo[] {
  const result: LineInfo[] = [];
  let pos = 0;
  const raw = source.split('\n');

  for (const line of raw) {
    result.push({ text: line, start: pos });
    pos += line.length + 1; // +1 for the \n
  }

  return result;
}

function isInRegion(offset: number, regions: SkipRegion[]): boolean {
  for (const r of regions) {
    if (offset >= r.start && offset < r.end) return true;
  }
  return false;
}

function overlapsSkipRegion(
  start: number,
  end: number,
  regions: SkipRegion[],
): boolean {
  // Binary search for efficiency on sorted regions
  let lo = 0;
  let hi = regions.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = regions[mid]!;

    if (r.end <= start) {
      lo = mid + 1;
    } else if (r.start >= end) {
      hi = mid - 1;
    } else {
      return true; // overlap
    }
  }

  return false;
}

function mergeRegions(sorted: SkipRegion[]): SkipRegion[] {
  if (sorted.length === 0) return [];

  const merged: SkipRegion[] = [{ ...sorted[0]! }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const curr = sorted[i]!;

    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
