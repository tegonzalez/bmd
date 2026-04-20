/**
 * Contract tests: Config flag semantics.
 * Verifies config file field mappings: ansi tri-state, pager boolean,
 * width auto, snake_case -> camelCase transformations.
 */

import { describe, test, expect } from 'bun:test';
import { resolveConfig } from '../../../src/config/merge.ts';

describe('config contract: flag semantics', () => {
  // --- ansi tri-state ---

  test('ansi "on" maps to ansiEnabled true', () => {
    const result = resolveConfig({}, { ansi: 'on' });
    expect(result.ansiEnabled).toBe(true);
  });

  test('ansi "off" maps to ansiEnabled false', () => {
    const result = resolveConfig({}, { ansi: 'off' });
    expect(result.ansiEnabled).toBe(false);
  });

  test('ansi "auto" maps to default (true)', () => {
    const result = resolveConfig({}, { ansi: 'auto' });
    expect(result.ansiEnabled).toBe(true);
  });

  // --- pager boolean ---

  test('pager true maps to "auto"', () => {
    const result = resolveConfig({}, { pager: true });
    expect(result.pager).toBe('auto');
  });

  test('pager false maps to "never"', () => {
    const result = resolveConfig({}, { pager: false });
    expect(result.pager).toBe('never');
  });

  // --- width ---

  test('width "auto" maps to default (80)', () => {
    const result = resolveConfig({}, { width: 'auto' });
    expect(result.width).toBe(80);
  });

  test('width number passes through', () => {
    const result = resolveConfig({}, { width: 120 });
    expect(result.width).toBe(120);
  });

  // --- snake_case -> camelCase ---

  test('serve.color_mode maps to serve.colorMode', () => {
    const result = resolveConfig({}, { serve: { color_mode: 'night' } });
    expect(result.serve.colorMode).toBe('night');
  });

  test('unsafe_html maps to unsafeHtml', () => {
    const result = resolveConfig({}, { unsafe_html: true });
    expect(result.unsafeHtml).toBe(true);
  });

  // --- Anti-false-positive ---

  test('anti-false-positive: ansi "off" actually produces false (not identity)', () => {
    const result = resolveConfig({}, { ansi: 'off' });
    // If mapping was identity, 'off' would be truthy -- verify it's boolean false
    expect(result.ansiEnabled).toBe(false);
    expect(typeof result.ansiEnabled).toBe('boolean');
  });
});
