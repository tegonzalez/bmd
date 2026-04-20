import { describe, test, expect } from 'bun:test';
import { validatePort, validateMode, validateFile } from '../../src/cli/validate.ts';
import { BmdError, ExitCode } from '../../src/diagnostics/formatter.ts';

describe('serve command validation', () => {
  test('--port abc exits 2 with "invalid port number"', () => {
    expect(() => validatePort('abc')).toThrow(BmdError);
    try {
      validatePort('abc');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('invalid port number');
    }
  });

  test('--port 99999 exits 2 with "port must be 0-65535"', () => {
    expect(() => validatePort('99999')).toThrow(BmdError);
    try {
      validatePort('99999');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('port must be 0-65535');
    }
  });

  test('--port -1 exits 2 with "port must be 0-65535"', () => {
    expect(() => validatePort('-1')).toThrow(BmdError);
    try {
      validatePort('-1');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('port must be 0-65535');
    }
  });

  test('nonexistent file exits 2 with "file not found"', async () => {
    try {
      await validateFile('/nonexistent-xyz.md');
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('file not found');
    }
  });

  test('--mode invalid exits 2 with "mode must be editor, preview, or both"', () => {
    expect(() => validateMode('invalid')).toThrow(BmdError);
    try {
      validateMode('invalid');
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
      expect((err as BmdError).message).toContain('mode must be editor, preview, or both');
    }
  });
});
