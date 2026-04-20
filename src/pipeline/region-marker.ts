/**
 * Region Marker Encode/Decode - S2 support for the unified render pipeline.
 *
 * Binary-safe content framing using NUL+SOH sentinels for template expansion.
 * Region markers wrap expanded content so that byte ranges can be tracked
 * through markdown parsing and tree construction.
 *
 * Wire format:
 *   START_SENTINEL + type(1 byte) + id(2 bytes BE) + START_SENTINEL + content + END_SENTINEL + id(2 bytes BE) + END_SENTINEL
 *
 * NUL escaping: \x00 in payload -> \x00\x00 (doubled)
 */

import type { RegionMap, RegionType, ByteRange } from './types.js';

/** Start sentinel: NUL + SOH */
export const START_SENTINEL = '\x00\x01';

/** End sentinel: NUL + STX */
export const END_SENTINEL = '\x00\x02';

/**
 * Start sentinel as it appears after markdown-exit parsing.
 * CommonMark spec replaces NUL (U+0000) with U+FFFD.
 */
export const PARSED_START_SENTINEL = '\uFFFD\x01';

/**
 * End sentinel as it appears after markdown-exit parsing.
 * CommonMark spec replaces NUL (U+0000) with U+FFFD.
 */
export const PARSED_END_SENTINEL = '\uFFFD\x02';

/**
 * Encode a region marker around content.
 *
 * @param content - The expanded content to wrap
 * @param type - Region type: T=template, U=unicode, H=HTML, A=ANSI
 * @param id - Unique region identifier (0-65535, 2-byte big-endian)
 * @returns Binary-framed string with sentinels
 */
export function encodeRegion(content: string, type: RegionType, id: number): string {
  // Escape NUL bytes in content: \x00 -> \x00\x00
  const escaped = content.replace(/\x00/g, '\x00\x00');

  // Encode id as 2-byte big-endian
  const idHigh = (id >> 8) & 0xff;
  const idLow = id & 0xff;
  const idStr = String.fromCharCode(idHigh, idLow);

  return `${START_SENTINEL}${type}${idStr}${START_SENTINEL}${escaped}${END_SENTINEL}${idStr}${END_SENTINEL}`;
}

/**
 * Decode all region markers from a marked source string.
 *
 * @param markedSource - Source string potentially containing region markers
 * @returns cleanSource with markers stripped, and array of RegionMap entries
 */
export function decodeRegions(markedSource: string): { cleanSource: string; regions: RegionMap[] } {
  const regions: RegionMap[] = [];
  let cleanSource = '';
  let i = 0;
  // Track the byte offset difference between marked and clean source
  let cleanOffset = 0;

  while (i < markedSource.length) {
    // Check for START_SENTINEL at current position
    if (
      i + 1 < markedSource.length &&
      markedSource.charCodeAt(i) === 0x00 &&
      markedSource.charCodeAt(i + 1) === 0x01
    ) {
      // Found a potential region marker start
      const headerStart = i;

      // Skip START_SENTINEL (2 bytes)
      i += 2;

      // Read type byte (1 byte)
      if (i >= markedSource.length) break;
      const type = markedSource[i]! as RegionType;
      i += 1;

      // Read id (2 bytes big-endian)
      if (i + 1 >= markedSource.length) break;
      const idHigh = markedSource.charCodeAt(i);
      const idLow = markedSource.charCodeAt(i + 1);
      const id = (idHigh << 8) | idLow;
      const idStr = markedSource.slice(i, i + 2);
      i += 2;

      // Expect second START_SENTINEL
      if (
        i + 1 >= markedSource.length ||
        markedSource.charCodeAt(i) !== 0x00 ||
        markedSource.charCodeAt(i + 1) !== 0x01
      ) {
        // Not a valid marker; output what we skipped
        cleanSource += markedSource.slice(headerStart, i);
        continue;
      }
      i += 2; // skip second START_SENTINEL

      // Find the matching END_SENTINEL + id + END_SENTINEL
      const endPattern = `${END_SENTINEL}${idStr}${END_SENTINEL}`;
      const contentStart = i;
      let contentEnd = -1;

      // Scan for END_SENTINEL, skipping escaped NULs (\x00\x00)
      let j = i;
      while (j < markedSource.length) {
        if (
          j + endPattern.length <= markedSource.length &&
          markedSource.charCodeAt(j) === 0x00 &&
          markedSource.charCodeAt(j + 1) === 0x02
        ) {
          // Potential END_SENTINEL -- check full pattern
          const candidate = markedSource.slice(j, j + endPattern.length);
          if (candidate === endPattern) {
            contentEnd = j;
            break;
          }
        }
        j++;
      }

      if (contentEnd === -1) {
        // No matching end found; output raw
        cleanSource += markedSource.slice(headerStart, i);
        continue;
      }

      // Extract raw content (with NUL escaping still in place)
      const rawContent = markedSource.slice(contentStart, contentEnd);

      // Unescape NUL bytes: \x00\x00 -> \x00
      const content = rawContent.replace(/\x00\x00/g, '\x00');

      // Record byte ranges
      const expandedStart = headerStart;
      const expandedEnd = contentEnd + endPattern.length;
      const cleanContentStart = cleanSource.length;
      const cleanContentEnd = cleanContentStart + content.length;

      regions.push({
        id,
        type,
        originalByteRange: [cleanContentStart, cleanContentEnd] as ByteRange,
        expandedByteRange: [expandedStart, expandedEnd] as ByteRange,
        originalContent: '', // filled by template stage (caller)
        expandedContent: content,
      });

      // Add content to cleanSource (markers stripped)
      cleanSource += content;

      // Advance past the end pattern
      i = contentEnd + endPattern.length;
    } else {
      // Regular character -- copy to cleanSource
      cleanSource += markedSource[i]!;
      i++;
    }
  }

  return { cleanSource, regions };
}

/**
 * Check if a character code is part of a sentinel byte sequence.
 */
export function isMarkerByte(charCode: number): boolean {
  return charCode === 0x00 || charCode === 0x01 || charCode === 0x02;
}
