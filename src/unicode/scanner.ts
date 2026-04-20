/**
 * Unicode Scanner
 *
 * Core detection engine. Scans raw source text and produces
 * Finding[] for downstream renderers to consume.
 *
 * Pure function: scanUnicode(source: string) => Finding[]
 */

import type { Finding, UnicodeCategory, GlyphMode } from './types';
import type { AggregationConfig } from './aggregator';
import { classifyCodepoint, isCombiningMark } from './categories';
import { isPassThrough } from './context';
import { getGlyph, getTooltip } from './glyph-map';
import { aggregateFindings } from './aggregator';

/** Maximum ANSI escape sequence length in bytes */
const MAX_ANSI_LENGTH = 256;

/** Atomic group ID counter */
let nextAtomicGroupId = 1;

/**
 * Scan source text for invisible/malicious Unicode characters.
 *
 * Returns an array of findings sorted by offset. Findings include
 * replacement glyphs, tooltips, and atomic region information.
 */
export function scanUnicode(source: string, mode: GlyphMode = 'utf8', ucConfig?: AggregationConfig): Finding[] {
  // Reset atomic group counter per scan
  nextAtomicGroupId = 1;

  const rawFindings: Finding[] = [];
  let offset = 0;

  // Track combining mark floods
  let combiningCount = 0;
  let combiningStart = -1;

  while (offset < source.length) {
    const cp = source.codePointAt(offset)!;
    const charLen = cp > 0xFFFF ? 2 : 1;

    // --- ANSI escape sequence detection ---
    if (cp === 0x001B) {
      const ansiResult = tryParseAnsiSequence(source, offset, mode);
      if (ansiResult) {
        // Flush any pending combining marks before ANSI
        flushCombiningMarks(rawFindings, combiningCount, combiningStart, offset, mode);
        combiningCount = 0;

        rawFindings.push(ansiResult);
        // Skip past the entire ANSI sequence
        offset += ansiResult.length;
        continue;
      }
    }

    // --- Combining mark flood tracking ---
    if (isCombiningMark(cp)) {
      if (combiningCount === 0) {
        combiningStart = offset;
      }
      combiningCount++;
      offset += charLen;
      continue;
    } else if (combiningCount > 0) {
      // Non-combining char: flush any pending combining marks
      flushCombiningMarks(rawFindings, combiningCount, combiningStart, offset, mode);
      combiningCount = 0;
    }

    // --- Context-aware pass-through check ---
    if (isPassThrough(source, offset, cp)) {
      offset += charLen;
      continue;
    }

    // --- Classify the codepoint ---
    const category = classifyCodepoint(cp);
    if (category === null) {
      // Every non-ASCII codepoint MUST produce a finding (catch-all)
      if (cp > 0x7E) {
        const hex = cp.toString(16).toUpperCase().padStart(4, '0');
        const glyph = mode === 'ascii'
          ? `[U+${hex}]`
          : String.fromCodePoint(cp);  // pass-through in UTF-8
        rawFindings.push({
          offset,
          length: charLen,
          codepoint: cp,
          category: 'unclassified',
          glyph,
          tooltip: `U+${hex}`,
          isAtomic: false,
        });
      }
      offset += charLen;
      continue;
    }

    // --- Create finding ---
    const glyph = getGlyph(category, cp, mode);
    const tooltip = getTooltip(cp);

    rawFindings.push({
      offset,
      length: charLen,
      codepoint: cp,
      category,
      glyph,
      tooltip,
      isAtomic: false,
    });

    offset += charLen;
  }

  // Flush any trailing combining marks
  flushCombiningMarks(rawFindings, combiningCount, combiningStart, offset, mode);

  // Mark paired controls as atomic regions (bidi + annotations)
  markPairedAtomicRegions(rawFindings);

  // Run aggregation pass
  return aggregateFindings(rawFindings, ucConfig);
}

/**
 * Try to parse an ANSI escape sequence starting at the given offset.
 * Returns a Finding for the entire sequence, or null if not a valid sequence.
 */
function tryParseAnsiSequence(source: string, escOffset: number, mode: GlyphMode = 'utf8'): Finding | null {
  // ESC is at escOffset; check what follows
  if (escOffset + 1 >= source.length) return null;

  const next = source.charCodeAt(escOffset + 1);

  // CSI: ESC + [
  if (next === 0x5B) { // [
    return parseCSISequence(source, escOffset, mode);
  }

  // OSC: ESC + ]
  if (next === 0x5D) { // ]
    return parseOSCSequence(source, escOffset, mode);
  }

  // Other ESC sequences (Fe, Fs types): ESC + single byte in 0x40-0x7E
  if (next >= 0x40 && next <= 0x7E) {
    const escGlyph = mode === 'ascii' ? '[ESC]' : '\u241B';
    const glyphStr = escGlyph + String.fromCharCode(next);
    return {
      offset: escOffset,
      length: 2,
      codepoint: 0x001B,
      category: 'ansi-escape',
      glyph: glyphStr,
      tooltip: 'U+001B ESC',
      isAtomic: true,
      atomicGroupId: nextAtomicGroupId++,
    };
  }

  return null;
}

/**
 * Parse a CSI sequence: ESC [ params terminator
 * Params are bytes 0x30-0x3F, intermediates are 0x20-0x2F, final is 0x40-0x7E
 */
function parseCSISequence(source: string, escOffset: number, mode: GlyphMode = 'utf8'): Finding | null {
  let pos = escOffset + 2; // skip ESC [
  const maxEnd = Math.min(source.length, escOffset + MAX_ANSI_LENGTH);

  // Consume parameter bytes (0x30-0x3F)
  while (pos < maxEnd) {
    const b = source.charCodeAt(pos);
    if (b >= 0x30 && b <= 0x3F) {
      pos++;
    } else {
      break;
    }
  }

  // Consume intermediate bytes (0x20-0x2F)
  while (pos < maxEnd) {
    const b = source.charCodeAt(pos);
    if (b >= 0x20 && b <= 0x2F) {
      pos++;
    } else {
      break;
    }
  }

  // Final byte (0x40-0x7E)
  if (pos >= maxEnd) return null;
  const finalByte = source.charCodeAt(pos);
  if (finalByte < 0x40 || finalByte > 0x7E) return null;
  pos++;

  const length = pos - escOffset;
  if (length > MAX_ANSI_LENGTH) return null;

  // Build glyph: ESC replaced by ␛ (or [ESC] in ASCII mode), rest shown literally
  const escGlyph = mode === 'ascii' ? '[ESC]' : '\u241B';
  const params = source.slice(escOffset + 1, pos);
  const glyphStr = escGlyph + params;

  return {
    offset: escOffset,
    length,
    codepoint: 0x001B,
    category: 'ansi-escape',
    glyph: glyphStr,
    tooltip: 'U+001B ESC',
    isAtomic: true,
    atomicGroupId: nextAtomicGroupId++,
  };
}

/**
 * Parse an OSC sequence: ESC ] payload ST
 * ST is ESC \ (0x1B 0x5C) or BEL (0x07)
 */
function parseOSCSequence(source: string, escOffset: number, mode: GlyphMode = 'utf8'): Finding | null {
  let pos = escOffset + 2; // skip ESC ]
  const maxEnd = Math.min(source.length, escOffset + MAX_ANSI_LENGTH);

  while (pos < maxEnd) {
    const b = source.charCodeAt(pos);

    // BEL terminates
    if (b === 0x07) {
      pos++;
      break;
    }

    // ESC \ (ST) terminates
    if (b === 0x1B && pos + 1 < maxEnd && source.charCodeAt(pos + 1) === 0x5C) {
      pos += 2;
      break;
    }

    pos++;
  }

  const length = pos - escOffset;
  if (length > MAX_ANSI_LENGTH) return null;
  if (pos === escOffset + 2) return null; // empty payload, no terminator

  const escGlyph = mode === 'ascii' ? '[ESC]' : '\u241B';
  const params = source.slice(escOffset + 1, pos);
  const glyphStr = escGlyph + params;

  return {
    offset: escOffset,
    length,
    codepoint: 0x001B,
    category: 'ansi-escape',
    glyph: glyphStr,
    tooltip: 'U+001B ESC',
    isAtomic: true,
    atomicGroupId: nextAtomicGroupId++,
  };
}

/**
 * Flush pending combining marks as a combining-flood finding
 * if the count meets the threshold (3+).
 */
function flushCombiningMarks(
  findings: Finding[],
  count: number,
  startOffset: number,
  endOffset: number,
  mode: GlyphMode = 'utf8',
): void {
  if (count < 3) return;

  const baseGlyph = mode === 'ascii' ? '[Mn]' : '\u25CC';
  findings.push({
    offset: startOffset,
    length: endOffset - startOffset,
    codepoint: 0x0300, // generic combining mark
    category: 'combining-flood',
    glyph: `${baseGlyph}x${count}`,
    tooltip: `${count} consecutive combining marks`,
    isAtomic: true,
    atomicGroupId: nextAtomicGroupId++,
  });
}

// Closer codepoint map (from docs/unicode-mappings.md Closer column)
const BIDI_EMBED_OPENERS = new Set([0x202A, 0x202B, 0x202D, 0x202E]); // LRE, RLE, LRO, RLO
const BIDI_EMBED_CLOSER = 0x202C; // PDF
const BIDI_ISOLATE_OPENERS = new Set([0x2066, 0x2067, 0x2068]); // LRI, RLI, FSI
const BIDI_ISOLATE_CLOSER = 0x2069; // PDI
const ANNOTATION_OPENER = 0xFFF9; // Interlinear Annotation Anchor
const ANNOTATION_CLOSER = 0xFFFB; // Interlinear Annotation Terminator

/**
 * Mark paired controls as atomic regions using Closer codepoints.
 *
 * Handles:
 * - Bidi embedding/override pairs: LRE/RLE/LRO/RLO → PDF (U+202C)
 * - Bidi isolate pairs: LRI/RLI/FSI → PDI (U+2069)
 * - Annotation pairs: U+FFF9 → U+FFFB
 */
function markPairedAtomicRegions(findings: Finding[]): void {
  const bidiOpenerStack: { index: number; groupId: number }[] = [];
  const isolateOpenerStack: { index: number; groupId: number }[] = [];
  const annotationOpenerStack: { index: number; groupId: number }[] = [];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    const cp = f.codepoint;

    // --- Bidi embedding/override pairs ---
    if (BIDI_EMBED_OPENERS.has(cp)) {
      const groupId = nextAtomicGroupId++;
      f.isAtomic = true;
      f.atomicGroupId = groupId;
      bidiOpenerStack.push({ index: i, groupId });
    }
    else if (cp === BIDI_EMBED_CLOSER) {
      const opener = bidiOpenerStack.pop();
      if (opener) {
        f.isAtomic = true;
        f.atomicGroupId = opener.groupId;
        for (let j = opener.index + 1; j < i; j++) {
          findings[j]!.isAtomic = true;
          findings[j]!.atomicGroupId = opener.groupId;
        }
      }
    }

    // --- Bidi isolate pairs ---
    else if (BIDI_ISOLATE_OPENERS.has(cp)) {
      const groupId = nextAtomicGroupId++;
      f.isAtomic = true;
      f.atomicGroupId = groupId;
      isolateOpenerStack.push({ index: i, groupId });
    }
    else if (cp === BIDI_ISOLATE_CLOSER) {
      const opener = isolateOpenerStack.pop();
      if (opener) {
        f.isAtomic = true;
        f.atomicGroupId = opener.groupId;
        for (let j = opener.index + 1; j < i; j++) {
          findings[j]!.isAtomic = true;
          findings[j]!.atomicGroupId = opener.groupId;
        }
      }
    }

    // --- Annotation pairs ---
    else if (cp === ANNOTATION_OPENER) {
      const groupId = nextAtomicGroupId++;
      f.isAtomic = true;
      f.atomicGroupId = groupId;
      annotationOpenerStack.push({ index: i, groupId });
    }
    else if (cp === ANNOTATION_CLOSER) {
      const opener = annotationOpenerStack.pop();
      if (opener) {
        f.isAtomic = true;
        f.atomicGroupId = opener.groupId;
        for (let j = opener.index + 1; j < i; j++) {
          findings[j]!.isAtomic = true;
          findings[j]!.atomicGroupId = opener.groupId;
        }
      }
    }
  }
}
