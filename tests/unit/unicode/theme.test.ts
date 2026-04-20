/**
 * Tests for the unic theme facet: schema validation, defaults, and config integration.
 */

import { test, expect, describe } from 'bun:test';
import { unicThemeSchema, type UnicTheme } from '../../../src/theme/schema/unic';
import { FACETS, type ResolvedTheme } from '../../../src/theme/types';
import { getDefaults } from '../../../src/theme/defaults';

const ALL_CATEGORIES = [
  'zero-width', 'bidi', 'tag', 'c0-control', 'c1-control',
  'template-region', 'template-unresolved',
  'ansi-escape', 'whitespace', 'pua', 'ai-watermark',
  'variation-sel', 'annotation', 'deprecated', 'noncharacter',
  'separator', 'combining-flood', 'unclassified',
] as const;

describe('unicThemeSchema', () => {
  test('accepts valid theme with all categories', () => {
    const theme: Record<string, { fg: string }> = {};
    for (const cat of ALL_CATEGORIES) {
      theme[cat] = { fg: '#e06c75' };
    }
    const result = unicThemeSchema.safeParse(theme);
    expect(result.success).toBe(true);
  });

  test('accepts theme with optional bg, bold, underline', () => {
    const theme: Record<string, unknown> = {};
    for (const cat of ALL_CATEGORIES) {
      theme[cat] = { fg: '#e06c75', bg: '#1a1a2e', bold: true, underline: false };
    }
    const result = unicThemeSchema.safeParse(theme);
    expect(result.success).toBe(true);
  });

  test('rejects theme missing fg for a category', () => {
    const theme: Record<string, unknown> = {};
    for (const cat of ALL_CATEGORIES) {
      theme[cat] = { fg: '#e06c75' };
    }
    // Remove fg from one category
    theme['bidi'] = { bold: true };
    const result = unicThemeSchema.safeParse(theme);
    expect(result.success).toBe(false);
  });

  test('rejects invalid hex color format', () => {
    const theme: Record<string, unknown> = {};
    for (const cat of ALL_CATEGORIES) {
      theme[cat] = { fg: '#e06c75' };
    }
    theme['zero-width'] = { fg: 'red' }; // not hex
    const result = unicThemeSchema.safeParse(theme);
    expect(result.success).toBe(false);
  });

  test('rejects missing category', () => {
    const theme: Record<string, unknown> = {};
    for (const cat of ALL_CATEGORIES) {
      theme[cat] = { fg: '#e06c75' };
    }
    delete theme['separator'];
    const result = unicThemeSchema.safeParse(theme);
    expect(result.success).toBe(false);
  });
});

describe('FACETS includes unic', () => {
  test('FACETS contains unic', () => {
    expect(FACETS).toContain('unic');
  });

  test('FACETS has 5 entries', () => {
    expect(FACETS).toHaveLength(5);
  });
});

describe('default unic theme', () => {
  test('getDefaults() includes unic facet', () => {
    const defaults = getDefaults();
    expect(defaults.unic).toBeDefined();
  });

  test('default unic theme has all categories', () => {
    const defaults = getDefaults();
    for (const cat of ALL_CATEGORIES) {
      expect(defaults.unic[cat as keyof UnicTheme]!).toBeDefined();
      expect(defaults.unic[cat as keyof UnicTheme]!.fg).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('ResolvedTheme includes unic', () => {
  test('ResolvedTheme type has unic field', () => {
    const defaults = getDefaults();
    const theme: ResolvedTheme = defaults;
    // TypeScript compilation check -- unic must be accessible
    expect(theme.unic).toBeDefined();
  });
});
