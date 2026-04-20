/**
 * Sanitize Stage (S1) - HTML tag and ANSI sequence detection.
 *
 * Scans raw source text for HTML tags and ANSI escape sequences,
 * producing Finding[] with the same shape as the unicode scanner.
 * The sanitize() orchestrator merges unicode, HTML, and ANSI findings.
 *
 * CRITICAL: sanitize NEVER mutates source. It only DETECTS.
 * Visitors handle escaping during output.
 */

import type { Finding, GlyphMode } from '../unicode/types.js';
import type { AggregationConfig } from '../unicode/aggregator.js';
import { scanUnicode } from '../unicode/scanner.js';

/**
 * Extended category for HTML tag findings.
 * Uses a value compatible with the Finding interface but distinct
 * from UnicodeCategory values.
 */
const HTML_TAG_CATEGORY = 'html_tag' as Finding['category'];

/**
 * Detect HTML tags in source text, producing Finding[] entries.
 * Skips content inside fenced code blocks (triple backtick boundaries).
 */
export function detectHtmlTags(source: string): Finding[] {
  const findings: Finding[] = [];

  // First, compute fenced code block ranges to skip
  const fenceRanges = computeFenceRanges(source);

  // Regex to match HTML tags (opening, closing, self-closing, comments)
  const htmlTagRe = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/g;

  let match: RegExpExecArray | null;
  while ((match = htmlTagRe.exec(source)) !== null) {
    const offset = match.index;
    const tagText = match[0]!;

    // Skip tags inside fenced code blocks
    if (isInsideFence(offset, fenceRanges)) {
      continue;
    }

    findings.push({
      offset,
      length: tagText.length,
      category: HTML_TAG_CATEGORY,
      codepoint: tagText.charCodeAt(0), // '<'
      glyph: tagText,
      tooltip: `HTML tag: ${tagText}`,
      isAtomic: false,
    });
  }

  return findings;
}

/**
 * Compute byte ranges of fenced code blocks (``` ... ```)
 * so that HTML detection can skip their contents.
 */
function computeFenceRanges(source: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fenceRe = /^(`{3,}|~{3,})/gm;
  let openStart = -1;
  let openFence = '';

  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(source)) !== null) {
    const fence = match[1]!;
    if (openStart === -1) {
      // Opening fence
      openStart = match.index;
      openFence = fence.charAt(0); // ` or ~
    } else if (fence.charAt(0) === openFence && fence.length >= openFence.length) {
      // Closing fence (same char, at least as many)
      ranges.push([openStart, match.index + fence.length]);
      openStart = -1;
      openFence = '';
    }
  }

  // Unclosed fence extends to end of source
  if (openStart !== -1) {
    ranges.push([openStart, source.length]);
  }

  return ranges;
}

/** Check if an offset falls inside any fenced code block range */
function isInsideFence(offset: number, ranges: [number, number][]): boolean {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) {
      return true;
    }
  }
  return false;
}

/**
 * Detect ANSI escape sequences in source text.
 * Looks for ESC (0x1B) followed by CSI sequences [...m], [...H], etc.
 */
export function detectAnsiSequences(source: string): Finding[] {
  const findings: Finding[] = [];
  let offset = 0;

  while (offset < source.length) {
    const cp = source.charCodeAt(offset);

    if (cp === 0x1b) {
      // Try to parse ANSI sequence
      const result = tryParseAnsi(source, offset);
      if (result) {
        findings.push(result);
        offset += result.length;
        continue;
      }
    }

    offset++;
  }

  return findings;
}

/** Maximum ANSI escape sequence length */
const MAX_ANSI_LENGTH = 256;

/**
 * Try to parse an ANSI escape sequence starting at escOffset.
 */
function tryParseAnsi(source: string, escOffset: number): Finding | null {
  if (escOffset + 1 >= source.length) return null;

  const next = source.charCodeAt(escOffset + 1);

  // CSI: ESC + [
  if (next === 0x5b) {
    return parseCSI(source, escOffset);
  }

  // OSC: ESC + ]
  if (next === 0x5d) {
    return parseOSC(source, escOffset);
  }

  // Other ESC sequences: ESC + single byte in 0x40-0x7E
  if (next >= 0x40 && next <= 0x7e) {
    return {
      offset: escOffset,
      length: 2,
      codepoint: 0x1b,
      category: 'ansi-escape',
      glyph: '\u241B' + String.fromCharCode(next),
      tooltip: 'ANSI escape sequence',
      isAtomic: true,
    };
  }

  return null;
}

/** Parse CSI sequence: ESC [ params final_byte */
function parseCSI(source: string, escOffset: number): Finding | null {
  let pos = escOffset + 2;
  const maxEnd = Math.min(source.length, escOffset + MAX_ANSI_LENGTH);

  // Parameter bytes (0x30-0x3F)
  while (pos < maxEnd && source.charCodeAt(pos) >= 0x30 && source.charCodeAt(pos) <= 0x3f) pos++;
  // Intermediate bytes (0x20-0x2F)
  while (pos < maxEnd && source.charCodeAt(pos) >= 0x20 && source.charCodeAt(pos) <= 0x2f) pos++;
  // Final byte (0x40-0x7E)
  if (pos >= maxEnd) return null;
  const fb = source.charCodeAt(pos);
  if (fb < 0x40 || fb > 0x7e) return null;
  pos++;

  const length = pos - escOffset;
  return {
    offset: escOffset,
    length,
    codepoint: 0x1b,
    category: 'ansi-escape',
    glyph: '\u241B' + source.slice(escOffset + 1, pos),
    tooltip: 'ANSI escape sequence',
    isAtomic: true,
  };
}

/** Parse OSC sequence: ESC ] payload (BEL | ESC \) */
function parseOSC(source: string, escOffset: number): Finding | null {
  let pos = escOffset + 2;
  const maxEnd = Math.min(source.length, escOffset + MAX_ANSI_LENGTH);

  while (pos < maxEnd) {
    const b = source.charCodeAt(pos);
    if (b === 0x07) { pos++; break; }
    if (b === 0x1b && pos + 1 < maxEnd && source.charCodeAt(pos + 1) === 0x5c) { pos += 2; break; }
    pos++;
  }

  const length = pos - escOffset;
  if (length <= 2) return null;

  return {
    offset: escOffset,
    length,
    codepoint: 0x1b,
    category: 'ansi-escape',
    glyph: '\u241B' + source.slice(escOffset + 1, pos),
    tooltip: 'ANSI escape sequence',
    isAtomic: true,
  };
}

/**
 * Orchestrate all detection passes and merge results.
 *
 * Runs:
 * 1. Unicode scanner (scanUnicode)
 * 2. HTML tag detection (detectHtmlTags)
 * 3. ANSI sequence detection (detectAnsiSequences)
 *
 * Returns merged Finding[] sorted by offset.
 */
export function sanitize(source: string, format: GlyphMode, ucConfig?: AggregationConfig): Finding[] {
  const unicodeFindings = scanUnicode(source, format, ucConfig);
  const htmlFindings = detectHtmlTags(source);
  const ansiFindings = detectAnsiSequences(source);

  // Merge all findings
  const all = [...unicodeFindings, ...htmlFindings, ...ansiFindings];

  // Deduplicate: ANSI findings from unicode scanner overlap with our detectAnsiSequences.
  // Keep unique by offset+length+category.
  const seen = new Set<string>();
  const deduped: Finding[] = [];
  for (const f of all) {
    const key = `${f.offset}:${f.length}:${f.category}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  // Sort by offset
  deduped.sort((a, b) => a.offset - b.offset);

  return deduped;
}
