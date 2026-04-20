import type { FormatAdapter, TableCharSet } from './types.ts';

const BULLETS = ['*', '-', '+'];

export class AsciiAdapter implements FormatAdapter {
  bulletChar(depth: number): string {
    return BULLETS[depth % BULLETS.length]!;
  }

  hrRule(width: number): string {
    return '-'.repeat(width);
  }

  tableChars(): TableCharSet {
    return {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      horizontal: '-',
      vertical: '|',
      cross: '+',
      topTee: '+',
      bottomTee: '+',
      leftTee: '+',
      rightTee: '+',
    };
  }

  quoteBar(): string {
    return '|';
  }

  orderedMarker(index: number): string {
    return `${index}.`;
  }

  headingPrefix(level: number): string {
    return '#'.repeat(level);
  }

  codeIndent(): string {
    return '    ';
  }
}
