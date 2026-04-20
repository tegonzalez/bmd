/**
 * Contract tests: Config default resolution shape.
 * The literal default policy lives in src/config/bmd-defaults.ts and is allowed
 * to change. These tests protect the resolver contract and type normalization.
 */

import { describe, test, expect } from 'bun:test';
import { resolveConfig } from '../../../src/config/merge.ts';
import { SERVE_DEFAULTS } from '../../../src/config/bmd-defaults.ts';

describe('config contract: defaults', () => {
  const defaults = resolveConfig({}, null);

  test('format defaults to "utf8"', () => {
    expect(defaults.format).toBe('utf8');
  });

  test('width defaults to 80', () => {
    expect(defaults.width).toBe(80);
  });

  test('ansiEnabled defaults to true', () => {
    expect(defaults.ansiEnabled).toBe(true);
  });

  test('pager defaults to "auto"', () => {
    expect(defaults.pager).toBe('auto');
  });

  test('unsafeHtml defaults to false', () => {
    expect(defaults.unsafeHtml).toBe(false);
  });

  test('filePath defaults to undefined', () => {
    expect(defaults.filePath).toBeUndefined();
  });

  test('theme defaults to undefined', () => {
    expect(defaults.theme).toBeUndefined();
  });

  // --- serve sub-field defaults ---

  test('serve.host comes from the default source of truth', () => {
    expect(defaults.serve.host).toBe(SERVE_DEFAULTS.host);
  });

  test('serve.port comes from the default source of truth', () => {
    expect(defaults.serve.port).toBe(SERVE_DEFAULTS.port);
  });

  test('serve.open comes from the default source of truth', () => {
    expect(defaults.serve.open).toBe(SERVE_DEFAULTS.open);
  });

  test('serve.mode comes from the default source of truth', () => {
    expect(defaults.serve.mode).toBe(SERVE_DEFAULTS.mode);
  });

  test('serve.colorMode comes from the default source of truth', () => {
    expect(defaults.serve.colorMode).toBe(SERVE_DEFAULTS.colorMode);
  });

  test('serve.readonly comes from the default source of truth', () => {
    expect(defaults.serve.readonly).toBe(SERVE_DEFAULTS.readonly);
  });

  // --- Anti-false-positive ---

  test('anti-false-positive: defaults contain truthy values (not all falsy)', () => {
    // A stub returning zeros/empty/false would fail these
    expect(defaults.width).toBe(80);           // truthy number
    expect(defaults.ansiEnabled).toBe(true);   // truthy boolean
    expect(defaults.pager).toBe('auto');        // truthy string
    expect(defaults.serve.open).toBe(SERVE_DEFAULTS.open);
    expect(defaults.serve.port).toBe(SERVE_DEFAULTS.port);
  });
});
