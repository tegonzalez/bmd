import type { TableCharSet } from './types.ts';
import type { AnsiLayer } from './ansi-layer.ts';
import { displayWidth, wrapText } from './wrap.ts';

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

  // Measure natural column widths using display width.
  const naturalWidths: number[] = new Array(numCols).fill(0);
  for (const row of rows) {
    for (let c = 0; c < numCols; c++) {
      const cell = row.cells[c]! || '';
      const w = displayWidth(cell);
      if (w > naturalWidths[c]!) naturalWidths[c] = w;
    }
  }

  // Each column needs: vertical + space + content + space
  // Total = vertical + sum(space + colWidth + space) + vertical
  // = 1 + numCols * 2 (padding) + sum(colWidths) + (numCols - 1) * 1 (inner verticals) + 1
  const borderOverhead = 2 + numCols * 2 + (numCols - 1); // outer verticals + padding + inner verticals
  const colWidths = fitColumnWidths(naturalWidths, maxWidth - borderOverhead);

  const lines: string[] = [];

  // Top border
  lines.push(horizontalLine(chars.topLeft, chars.topTee, chars.topRight, chars.horizontal, colWidths));

  // Find header rows and body rows
  const headerRows = rows.filter(r => r.isHeader);
  const bodyRows = rows.filter(r => !r.isHeader);

  // Render header rows
  for (const row of headerRows) {
    lines.push(...contentLines(row.cells, colWidths, aligns, chars.vertical, ansi, true));
  }

  // Header separator
  if (headerRows.length > 0) {
    lines.push(horizontalLine(chars.leftTee, chars.cross, chars.rightTee, chars.horizontal, colWidths));
  }

  // Render body rows
  for (const row of bodyRows) {
    lines.push(...contentLines(row.cells, colWidths, aligns, chars.vertical, ansi, false));
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

function fitColumnWidths(naturalWidths: number[], available: number): number[] {
  if (naturalWidths.length === 0) return [];

  const naturalTotal = naturalWidths.reduce((a, b) => a + b, 0);
  if (naturalTotal <= available) return [...naturalWidths];

  if (available <= naturalWidths.length) {
    return new Array(naturalWidths.length).fill(1);
  }

  const widths = new Array(naturalWidths.length).fill(1);
  let remaining = available - naturalWidths.length;

  // Preserve short, label-like columns before giving extra width to long text.
  const readableCaps = naturalWidths.map(width => Math.min(width, 8));
  remaining = distributeWidth(widths, readableCaps, remaining);

  // Use any remaining room for columns that still need to wrap.
  distributeWidth(widths, naturalWidths, remaining);

  return widths;
}

function distributeWidth(widths: number[], caps: number[], remaining: number): number {
  while (remaining > 0) {
    let changed = false;

    for (let c = 0; c < widths.length && remaining > 0; c++) {
      if (widths[c]! >= caps[c]!) continue;
      widths[c] = widths[c]! + 1;
      remaining--;
      changed = true;
    }

    if (!changed) break;
  }

  return remaining;
}

function contentLines(
  cells: string[],
  colWidths: number[],
  aligns: TableAlign[],
  vertical: string,
  ansi: AnsiLayer | null,
  isHeader: boolean,
): string[] {
  const wrappedCells = colWidths.map((colWidth, c) => {
    let cell = cells[c]! || '';
    if (isHeader && ansi) {
      cell = ansi.bold(cell);
    }

    const wrapped = wrapCell(cell, colWidth);
    return wrapped.length > 0 ? wrapped : [''];
  });
  const rowHeight = Math.max(...wrappedCells.map(cellLines => cellLines.length));
  const lines: string[] = [];

  for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
    const parts: string[] = [];

    for (let c = 0; c < colWidths.length; c++) {
      const cell = wrappedCells[c]![lineIndex]! || '';
      const cellDisplayWidth = displayWidth(cell);
      const colWidth = colWidths[c]!;
      const align = aligns[c]! || 'left';

      parts.push(alignCell(cell, cellDisplayWidth, colWidth, align));
    }

    lines.push(vertical + parts.join(vertical) + vertical);
  }

  return lines;
}

function wrapCell(cell: string, colWidth: number): string[] {
  if (!cell) return [''];

  const logicalLines = cell.split('\n');
  const visualLines: string[] = [];

  for (const line of logicalLines) {
    const wrapped = wrapText(line, colWidth, 0);
    if (wrapped === '') {
      visualLines.push('');
      continue;
    }

    visualLines.push(...wrapped.split('\n'));
  }

  return visualLines;
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
