/**
 * Byte Range Annotation - S3 support for the unified render pipeline.
 *
 * Recovers positional information (UTF-16 code unit ranges) from
 * markdown-exit tokens using line-to-offset mapping and cursor-based
 * inline child position recovery.
 *
 * "Byte range" in this system means UTF-16 code unit range -- JavaScript
 * string indices. Not actual byte offsets.
 */

import type { ByteRange } from './types.js';

/**
 * Scan source for newlines and record the UTF-16 code unit offset
 * of each line start.
 *
 * @returns Array where index = line number, value = UTF-16 offset of line start
 */
export function computeLineByteOffsets(source: string): number[] {
  const offsets: number[] = [0]; // Line 0 always starts at offset 0
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      // newline found; next line starts at i + 1
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/** Minimal Token shape for annotation (matches markdown-exit Token) */
interface Token {
  type: string;
  content: string;
  markup: string;
  map: [number, number] | null;
  children: Token[] | null;
  meta: any;
  nesting: number;
}

/**
 * Find `content` in `source` starting at `fromIndex`.
 * Falls back to NUL-aware matching when direct indexOf fails,
 * because CommonMark replaces NUL (U+0000) with U+FFFD in token content.
 */
function indexOfContent(source: string, content: string, fromIndex: number): number {
  const pos = source.indexOf(content, fromIndex);
  if (pos !== -1) return pos;

  // Fallback: content may contain U+FFFD where source has U+0000
  if (!content.includes('\uFFFD')) return -1;

  // Try matching with FFFD treated as NUL
  const contentLen = content.length;
  for (let i = fromIndex; i <= source.length - contentLen; i++) {
    let match = true;
    for (let j = 0; j < contentLen; j++) {
      const sc = source.charCodeAt(i + j);
      const cc = content.charCodeAt(j);
      if (sc !== cc && !(sc === 0x00 && cc === 0xFFFD)) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Mutate tokens in-place to add meta.byteRange based on their map field.
 * Block tokens use line-to-offset mapping. Inline children use cursor-based
 * position recovery.
 */
export function annotateByteRanges(tokens: Token[], source: string): void {
  const bMarks = computeLineByteOffsets(source);

  // Track the most recent tr_open map for table cell inline tokens that lack map
  let lastRowMap: [number, number] | null = null;

  for (const token of tokens) {
    // Track table row maps for cell content annotation
    if (token.type === 'tr_open' && token.map) {
      lastRowMap = token.map;
    } else if (token.type === 'tr_close') {
      lastRowMap = null;
    }

    if (token.map) {
      const start = bMarks[token.map[0]!]!;
      // end: if map[1] line exists in bMarks, use its offset - 1 (exclude the newline)
      // otherwise use source.length
      const end = token.map[1]! < bMarks.length
        ? bMarks[token.map[1]!]! - 1
        : source.length;

      token.meta = token.meta || {};
      token.meta.byteRange = [start, end] as ByteRange;
    }

    // Process inline token children with per-line content-start offsets
    if (token.type === 'inline' && token.children) {
      if (token.meta?.byteRange) {
        // Normal path: inline token has its own map
        const mapStart = token.map![0]!;

        const contentLines = token.content.split('\n');
        const lineOffsets: number[] = contentLines.map((line, i) => {
          const srcLineStart = bMarks[mapStart + i]! ?? bMarks[bMarks.length - 1]!;
          if (!line) return srcLineStart;
          const pos = indexOfContent(source, line, srcLineStart);
          return pos !== -1 ? pos : srcLineStart;
        });

        annotateInlineChildren(token.children, token.content, lineOffsets);
      } else if (lastRowMap && token.content) {
        // Table cell path: inline token has map=null.
        // Use the parent row's map to find the source line, then locate
        // the cell content within that line.
        const rowLineStart = bMarks[lastRowMap[0]!]! ?? 0;
        const rowLineEnd = lastRowMap[1]! < bMarks.length
          ? bMarks[lastRowMap[1]!]! - 1
          : source.length;
        const rowSource = source.slice(rowLineStart, rowLineEnd);

        // Find the cell content in the row's source line
        const contentPos = indexOfContent(rowSource, token.content, 0);
        if (contentPos !== -1) {
          const absStart = rowLineStart + contentPos;
          const absEnd = absStart + token.content.length;
          token.meta = token.meta || {};
          token.meta.byteRange = [absStart, absEnd] as ByteRange;

          // Single-line cell content: one offset entry
          annotateInlineChildren(token.children, token.content, [absStart]);
        }
      }
    }
  }
}

/**
 * Cursor-based left-to-right position recovery for inline children.
 * Walks children in order, searching for their content/markup in the
 * parent's content starting from the cursor position.
 *
 * Uses per-line source offsets to account for stripped block markup
 * prefixes (e.g., "# ", "> ", "- ") on each line.
 */
function annotateInlineChildren(
  children: Token[],
  parentContent: string,
  lineOffsets: number[],
): void {
  let cursor = 0;
  let lineIndex = 0;
  let lineStartInContent = 0; // where current line starts within parentContent

  // Convert a parentContent cursor position to an absolute source position
  const toAbsolute = (pos: number): number =>
    lineOffsets[lineIndex]! + (pos - lineStartInContent);

  for (const child of children) {
    child.meta = child.meta || {};

    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      // Find next newline from cursor
      const pos = parentContent.indexOf('\n', cursor);
      if (pos !== -1) {
        const absPos = toAbsolute(pos);
        child.meta.byteRange = [absPos, absPos + 1] as ByteRange;
        cursor = pos + 1;
        lineIndex++;
        lineStartInContent = cursor;
      }
    } else if (child.type === 'code_inline') {
      // code_inline: markup + content + markup (e.g., `code`)
      const markup = child.markup || '`';
      const fullPattern = markup + child.content + markup;
      const pos = parentContent.indexOf(fullPattern, cursor);
      if (pos !== -1) {
        const absStart = toAbsolute(pos);
        child.meta.byteRange = [
          absStart,
          absStart + fullPattern.length,
        ] as ByteRange;
        cursor = pos + fullPattern.length;
      }
    } else if (child.nesting === 1) {
      // Opening tag (strong_open, em_open, link_open, etc.)
      const markup = child.markup;
      if (markup) {
        const pos = parentContent.indexOf(markup, cursor);
        if (pos !== -1) {
          const absStart = toAbsolute(pos);
          child.meta.byteRange = [
            absStart,
            absStart + markup.length,
          ] as ByteRange;
          cursor = pos + markup.length;
        }
      } else if (child.type === 'link_open') {
        // link_open has no markup -- search for [
        const pos = parentContent.indexOf('[', cursor);
        if (pos !== -1) {
          const absPos = toAbsolute(pos);
          child.meta.byteRange = [absPos, absPos + 1] as ByteRange;
          cursor = pos + 1;
        }
      }
    } else if (child.nesting === -1) {
      // Closing tag (strong_close, em_close, link_close, etc.)
      const markup = child.markup;
      if (markup) {
        const pos = parentContent.indexOf(markup, cursor);
        if (pos !== -1) {
          const absStart = toAbsolute(pos);
          child.meta.byteRange = [
            absStart,
            absStart + markup.length,
          ] as ByteRange;
          cursor = pos + markup.length;
        }
      } else if (child.type === 'link_close') {
        // link_close has no markup. Find ](url) or ](url "title") pattern.
        // Search for ] at cursor, then scan past (...) to get full range.
        const closeBracket = parentContent.indexOf(']', cursor);
        if (closeBracket !== -1) {
          let endPos = closeBracket + 1;
          // Check for (url) following the ]
          if (endPos < parentContent.length && parentContent[endPos]! === '(') {
            const closeParen = parentContent.indexOf(')', endPos);
            if (closeParen !== -1) {
              endPos = closeParen + 1;
            }
          }
          const absStart = toAbsolute(closeBracket);
          const absEnd = toAbsolute(endPos);
          child.meta.byteRange = [absStart, absEnd] as ByteRange;
          cursor = endPos;
        }
      }
    } else if (child.content) {
      // Text content: find in parent
      const pos = parentContent.indexOf(child.content, cursor);
      if (pos !== -1) {
        const absStart = toAbsolute(pos);
        child.meta.byteRange = [
          absStart,
          absStart + child.content.length,
        ] as ByteRange;
        cursor = pos + child.content.length;
      }
    }
  }
}
