import type { FormatAdapter, TableCharSet } from './types.ts';

const BULLETS = ['\u2022', '\u25E6', '\u25AA']; // bullet, circle, square

export class Utf8Adapter implements FormatAdapter {
  bulletChar(depth: number): string {
    return BULLETS[depth % BULLETS.length]!;
  }

  hrRule(width: number): string {
    return '\u2500'.repeat(width);
  }

  tableChars(): TableCharSet {
    return {
      topLeft: '\u250C',
      topRight: '\u2510',
      bottomLeft: '\u2514',
      bottomRight: '\u2518',
      horizontal: '\u2500',
      vertical: '\u2502',
      cross: '\u253C',
      topTee: '\u252C',
      bottomTee: '\u2534',
      leftTee: '\u251C',
      rightTee: '\u2524',
    };
  }

  quoteBar(): string {
    return '\u2502';
  }

  orderedMarker(index: number): string {
    return `${index}.`;
  }

  headingPrefix(level: number): string {
    return '';
  }

  codeIndent(): string {
    return '    ';
  }
}
