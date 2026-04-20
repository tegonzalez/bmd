import { describe, test, expect } from 'bun:test';
import { warnInvalidTheme } from '../../src/cli/validate.ts';

describe('theme warning behavior', () => {
  test('warnInvalidTheme emits "theme not found" warning to stderr', () => {
    const originalWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = ((chunk: any) => {
      captured += String(chunk);
      return true;
    }) as any;

    try {
      // warnInvalidTheme should not throw -- it only emits a diagnostic
      expect(() => warnInvalidTheme('nonexistent-theme-xyz')).not.toThrow();
      expect(captured).toContain('theme not found');
      expect(captured).toContain('warning');
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test('warnInvalidTheme does not throw (renders can proceed with default theme)', () => {
    const originalWrite = process.stderr.write;
    process.stderr.write = (() => true) as any;

    try {
      // Calling warnInvalidTheme should never throw -- the caller
      // is expected to fall back to the default theme
      expect(() => warnInvalidTheme('nonexistent-theme-xyz')).not.toThrow();
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});
