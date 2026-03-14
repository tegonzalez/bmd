/**
 * Theme configuration for bmd rendering.
 * Phase 1 uses hardcoded defaults; Phase 4 will load from YAML theme files.
 */

export interface HeadingStyle {
  bold: boolean;
  color: string;
}

export interface ThemeConfig {
  headings: Record<number, HeadingStyle>;
  codeBlockIndent: number;
  blockquoteBarChar: string;
  tableBorder: boolean;
  listBullets: string[];
  linkFormat: 'inline' | 'reference' | 'osc8';
  hrChar: string;
  hrWidth: 'full' | number;
  elementSpacing: number;
}

export const DEFAULT_THEME: ThemeConfig = {
  headings: {
    1: { bold: true, color: 'cyan' },
    2: { bold: true, color: 'green' },
    3: { bold: true, color: 'yellow' },
    4: { bold: true, color: 'blue' },
    5: { bold: true, color: 'magenta' },
    6: { bold: true, color: 'white' },
  },
  codeBlockIndent: 4,
  blockquoteBarChar: '|',
  tableBorder: true,
  listBullets: ['*', '-', '+'],
  linkFormat: 'inline',
  hrChar: '-',
  hrWidth: 'full',
  elementSpacing: 1,
};
