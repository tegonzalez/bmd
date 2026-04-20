/**
 * Contract tests: Config merge precedence.
 * Verifies three-layer merge: defaults < config file < CLI flags.
 * Includes regression tests for CT-06 (unsafe-html) and host override behavior.
 */

import { describe, test, expect } from 'bun:test';
import { resolveConfig } from '../../../src/config/merge.ts';

describe('config contract: merge precedence', () => {
  // --- CLI overrides config file ---

  test('CLI width overrides config file width', () => {
    const result = resolveConfig({ width: 42 }, { width: 100 });
    expect(result.width).toBe(42);
  });

  test('CLI unsafeHtml overrides config file unsafe_html', () => {
    const result = resolveConfig({ unsafeHtml: true }, { unsafe_html: false });
    expect(result.unsafeHtml).toBe(true);
  });

  test('CLI serve.host overrides config file serve.host', () => {
    const result = resolveConfig(
      { serve: { host: '127.0.0.1' } },
      { serve: { host: '10.0.0.1' } },
    );
    expect(result.serve.host).toBe('127.0.0.1');
  });

  test('CLI serve.port overrides config file serve.port', () => {
    const result = resolveConfig(
      { serve: { port: 8080 } },
      { serve: { port: 9090 } },
    );
    expect(result.serve.port).toBe(8080);
  });

  // --- Config file overrides defaults ---

  test('config file width overrides default', () => {
    const result = resolveConfig({}, { width: 100 });
    expect(result.width).toBe(100);
  });

  test('config file unsafe_html overrides default', () => {
    const result = resolveConfig({}, { unsafe_html: true });
    expect(result.unsafeHtml).toBe(true);
  });

  test('config file serve.host overrides default', () => {
    const result = resolveConfig({}, { serve: { host: '10.0.0.1' } });
    expect(result.serve.host).toBe('10.0.0.1');
  });

  // --- CLI undefined does not clobber config ---

  test('CLI undefined width does not override config', () => {
    const result = resolveConfig({}, { width: 100 });
    expect(result.width).toBe(100);
  });

  test('CLI undefined unsafeHtml does not override config', () => {
    const result = resolveConfig({}, { unsafe_html: true });
    expect(result.unsafeHtml).toBe(true);
  });

  // --- Serve sub-fields merge independently ---

  test('serve sub-fields merge independently (not all-or-nothing)', () => {
    const result = resolveConfig(
      { serve: { port: 8080 } },
      { serve: { host: '127.0.0.1' } },
    );
    expect(result.serve.port).toBe(8080);
    expect(result.serve.host).toBe('127.0.0.1');
  });

  // --- REGRESSION: CT-06 unsafe-html forwarding ---

  test('REGRESSION CT-06: unsafeHtml CLI overrides config file', () => {
    const result = resolveConfig({ unsafeHtml: true }, { unsafe_html: false });
    expect(result.unsafeHtml).toBe(true);
  });

  test('REGRESSION CT-06: unsafeHtml config file value is forwarded', () => {
    const result = resolveConfig({}, { unsafe_html: true });
    expect(result.unsafeHtml).toBe(true);
  });

  // --- REGRESSION: host override ---

  test('REGRESSION: serve.host CLI override works', () => {
    const result = resolveConfig({ serve: { host: '127.0.0.1' } }, null);
    expect(result.serve.host).toBe('127.0.0.1');
  });

  // --- Anti-false-positive ---

  test('anti-false-positive: CLI values actually applied (non-default values)', () => {
    const result = resolveConfig(
      { width: 42, format: 'ascii', pager: 'never' },
      null,
    );
    expect(result.width).toBe(42);        // not default 80
    expect(result.format).toBe('ascii');   // not default 'utf8'
    expect(result.pager).toBe('never');    // not default 'auto'
  });
});
