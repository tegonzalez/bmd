import { describe, test, expect, mock } from 'bun:test';
import { BmdError } from '../../src/diagnostics/formatter.ts';

import {
  validatePort,
  validateWidth,
  validateMode,
  validateFile,
  warnInvalidTheme,
} from '../../src/cli/validate.ts';

describe('validatePort', () => {
  test('throws on non-numeric string "abc"', () => {
    expect(() => validatePort('abc')).toThrow(BmdError);
    try { validatePort('abc'); } catch (e: any) {
      expect(e.message).toContain('invalid port number');
      expect(e.exitCode).toBe(2);
    }
  });

  test('throws on port > 65535', () => {
    expect(() => validatePort('99999')).toThrow(BmdError);
    try { validatePort('99999'); } catch (e: any) {
      expect(e.message).toContain('port must be 0-65535');
      expect(e.exitCode).toBe(2);
    }
  });

  test('throws on negative port', () => {
    expect(() => validatePort('-1')).toThrow(BmdError);
    try { validatePort('-1'); } catch (e: any) {
      expect(e.message).toContain('port must be 0-65535');
      expect(e.exitCode).toBe(2);
    }
  });

  test('returns 3000 for "3000"', () => {
    expect(validatePort('3000')).toBe(3000);
  });

  test('returns 0 for "0"', () => {
    expect(validatePort('0')).toBe(0);
  });

  test('returns 65535 for "65535"', () => {
    expect(validatePort('65535')).toBe(65535);
  });
});

describe('validateWidth', () => {
  test('throws on non-numeric string "abc"', () => {
    expect(() => validateWidth('abc')).toThrow(BmdError);
    try { validateWidth('abc'); } catch (e: any) {
      expect(e.message).toContain('invalid width value');
      expect(e.exitCode).toBe(2);
    }
  });

  test('throws on negative width "-1"', () => {
    expect(() => validateWidth('-1')).toThrow(BmdError);
    try { validateWidth('-1'); } catch (e: any) {
      expect(e.message).toContain('width must be positive integer');
      expect(e.exitCode).toBe(2);
    }
  });

  test('throws on zero width "0"', () => {
    expect(() => validateWidth('0')).toThrow(BmdError);
    try { validateWidth('0'); } catch (e: any) {
      expect(e.message).toContain('width must be positive integer');
      expect(e.exitCode).toBe(2);
    }
  });

  test('returns 80 for "80"', () => {
    expect(validateWidth('80')).toBe(80);
  });
});

describe('validateMode', () => {
  test('throws on invalid mode', () => {
    expect(() => validateMode('invalid')).toThrow(BmdError);
    try { validateMode('invalid'); } catch (e: any) {
      expect(e.message).toContain('mode must be editor, preview, or both');
      expect(e.exitCode).toBe(2);
    }
  });

  test('returns "editor" for "editor"', () => {
    expect(validateMode('editor')).toBe('editor');
  });

  test('returns "preview" for "preview"', () => {
    expect(validateMode('preview')).toBe('preview');
  });

  test('returns "both" for "both"', () => {
    expect(validateMode('both')).toBe('both');
  });
});

describe('validateFile', () => {
  test('throws on nonexistent file', async () => {
    try {
      await validateFile('/nonexistent-path-abc123.md');
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e).toBeInstanceOf(BmdError);
      expect(e.message).toContain('file not found');
      expect(e.exitCode).toBe(2);
    }
  });

  test('does not throw on existing file', async () => {
    // /dev/null always exists
    await validateFile('/dev/null');
  });
});

describe('warnInvalidTheme', () => {
  test('writes warning to stderr but does not throw', () => {
    const originalWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = ((chunk: any) => {
      captured += String(chunk);
      return true;
    }) as any;

    try {
      expect(() => warnInvalidTheme('nonexistent')).not.toThrow();
      expect(captured).toContain('theme not found');
      expect(captured).toContain('warning');
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});
