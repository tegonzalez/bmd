import type { TableCharSet } from './types.ts';
import type { AnsiLayer } from './ansi-layer.ts';
import { displayWidth } from './wrap.ts';
import stripAnsi from 'strip-ansi';

export interface TableRow {
  cells: string[];
  isHeader: boolean;
}

export type TableAlign = 'left' | 'center' | 'right' | '';

/**
 * Layout a table with proper column widths, alignment, and borders.
 *
 * @param rows - Table rows with cell content
 * @param aligns - Column alignment specifications
 * @param maxWidth - Maximum total width for the table
 * @param chars - Border character set (ASCII or UTF-8)
 * @param ansi - Optional ANSI layer for header styling
 * @returns Formatted table string
 */
export function layoutTable(
  rows: TableRow[],
  aligns: TableAlign[],
  maxWidth: number,
  chars: TableCharSet,
  ansi: AnsiLayer | null,
): string {
  if (rows.length === 0) return '';

  const numCols = Math.max(...rows.map(r => r.cells.length));

  // Measure column widths using display width
  const colWidths: number[] = new Array(numCols).fill(0);
  for (const row of rows) {
    for (let c = 0; c < numCols; c++) {
      const cell = row.cells[c] || '';
      const w = displayWidth(cell);
      if (w > colWidths[c]) colWidths[c] = w;
    }
  }

  // Each column needs: vertical + space + content + space
  // Total = vertical + sum(space + colWidth + space) + vertical
  // = 1 + numCols * 2 (padding) + sum(colWidths) + (numCols - 1) * 1 (inner verticals) + 1
  const borderOverhead = 2 + numCols * 2 + (numCols - 1); // outer verticals + padding + inner verticals
  const contentWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalWidth = borderOverhead + contentWidth;

  // Proportionally shrink if needed
  if (totalWidth > maxWidth && contentWidth > 0) {
    const available = maxWidth - borderOverhead;
    if (available > 0) {
      const ratio = available / contentWidth;
      for (let c = 0; c < numCols; c++) {
        colWidths[c] = Math.max(1, Math.floor(colWidths[c] * ratio));
      }
      // Distribute remainder
      let remaining = available - colWidths.reduce((a, b) => a + b, 0);
      for (let c = 0; c < numCols && remaining > 0; c++) {
        colWidths[c]++;
        remaining--;
      }
    }
  }

  const lines: string[] = [];

  // Top border
  lines.push(horizontalLine(chars.topLeft, chars.topTee, chars.topRight, chars.horizontal, colWidths));

  // Find header rows and body rows
  const headerRows = rows.filter(r => r.isHeader);
  const bodyRows = rows.filter(r => !r.isHeader);

  // Render header rows
  for (const row of headerRows) {
    lines.push(contentLine(row.cells, colWidths, aligns, chars.vertical, ansi, true));
  }

  // Header separator
  if (headerRows.length > 0) {
    lines.push(horizontalLine(chars.leftTee, chars.cross, chars.rightTee, chars.horizontal, colWidths));
  }

  // Render body rows
  for (const row of bodyRows) {
    lines.push(contentLine(row.cells, colWidths, aligns, chars.vertical, ansi, false));
  }

  // Bottom border
  lines.push(horizontalLine(chars.bottomLeft, chars.bottomTee, chars.bottomRight, chars.horizontal, colWidths));

  return lines.join('\n');
}

function horizontalLine(
  left: string,
  mid: string,
  right: string,
  h: string,
  colWidths: number[],
): string {
  const segments = colWidths.map(w => h.repeat(w + 2)); // +2 for padding
  return left + segments.join(mid) + right;
}

function contentLine(
  cells: string[],
  colWidths: number[],
  aligns: TableAlign[],
  vertical: string,
  ansi: AnsiLayer | null,
  isHeader: boolean,
): string {
  const parts: string[] = [];
  for (let c = 0; c < colWidths.length; c++) {
    let cell = cells[c] || '';
    if (isHeader && ansi) {
      cell = ansi.bold(cell);
    }
    // Truncate cell content if it exceeds column width
    let cellDisplayWidth = displayWidth(cell);
    if (cellDisplayWidth > colWidths[c]) {
      cell = truncateToWidth(cell, colWidths[c]);
      cellDisplayWidth = displayWidth(cell);
    }
    const colWidth = colWidths[c];
    const align = aligns[c] || 'left';

    parts.push(alignCell(cell, cellDisplayWidth, colWidth, align));
  }
  return vertical + parts.join(vertical) + vertical;
}

function alignCell(
  cell: string,
  cellWidth: number,
  colWidth: number,
  align: TableAlign,
): string {
  const padding = Math.max(0, colWidth - cellWidth);

  switch (align) {
    case 'right':
      return ' ' + ' '.repeat(padding) + cell + ' ';
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' ' + ' '.repeat(leftPad) + cell + ' '.repeat(rightPad) + ' ';
    }
    case 'left':
    default:
      return ' ' + cell + ' '.repeat(padding) + ' ';
  }
}

/**
 * Truncate a string to fit within a given display width.
 * Handles ANSI escapes correctly by stripping them, truncating the plain text,
 * then returning just the truncated plain text (ANSI styling lost on truncation).
 */
function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  const plain = stripAnsi(text);
  let width = 0;
  let i = 0;
  for (const char of plain) {
    const charWidth = displayWidth(char);
    if (width + charWidth > maxWidth) break;
    width += charWidth;
    i += char.length;
  }
  return plain.slice(0, i);
}
