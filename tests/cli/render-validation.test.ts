import { describe, test, expect } from 'bun:test';
import { validateWidth } from '../../src/cli/validate.ts';
import { BmdError, ExitCode } from '../../src/diagnostics/formatter.ts';

describe('ascii/utf8 width validation', () => {
  test('validateWidth("abc") throws BmdError with exitCode 2 and "invalid width value"', () => {
    expect(() => validateWidth('abc')).toThrow(BmdError);
    try {
      validateWidth('abc');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('invalid width value');
    }
  });

  test('validateWidth("-1") throws BmdError with exitCode 2 and "width must be positive integer"', () => {
    expect(() => validateWidth('-1')).toThrow(BmdError);
    try {
      validateWidth('-1');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('width must be positive integer');
    }
  });
});
