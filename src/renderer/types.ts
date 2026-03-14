/**
 * Renderer type contracts.
 * These interfaces define the contracts that Plan 02 and Plan 03 implement against.
 */

import type { ThemeConfig } from '../types/theme.ts';
import type { OutputFormat } from '../types/index.ts';

export interface TableCharSet {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  cross: string;
  topTee: string;
  bottomTee: string;
  leftTee: string;
  rightTee: string;
}

export interface FormatAdapter {
  bulletChar(depth: number): string;
  hrRule(width: number): string;
  tableChars(): TableCharSet;
  quoteBar(): string;
  orderedMarker(index: number): string;
  headingPrefix(level: number): string;
  codeIndent(): string;
}

export interface RenderContext {
  width: number;
  format: OutputFormat;
  ansiEnabled: boolean;
  theme: ThemeConfig;
}

export interface ListContext {
  type: 'ordered' | 'unordered';
  counter: number;
  depth: number;
}

export interface RenderState {
  indent: number;
  listStack: ListContext[];
  tableRows: string[][];
  blockSpacing: number;
  width: number;
}
