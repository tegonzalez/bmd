import { test, expect, describe } from 'bun:test';
import { formatDiagnostic, ExitCode, BmdError, type Diagnostic } from '../../src/diagnostics/formatter.ts';

describe('formatDiagnostic', () => {
  test('produces "bmd: error: file.md:5:3: message" format', () => {
    const diag: Diagnostic = {
      file: 'file.md',
      line: 5,
      col: 3,
      span: 1,
      message: 'unexpected token',
      severity: 'error',
    };
    const result = formatDiagnostic(diag);
    expect(result).toStartWith('bmd: error: file.md:5:3: unexpected token');
  });

  test('includes source line and caret marker at correct column', () => {
    const source = 'line 1\nline 2\nsome bad code here\nline 4';
    const diag: Diagnostic = {
      file: 'test.md',
      line: 3,
      col: 6,
      span: 1,
      message: 'invalid syntax',
      severity: 'error',
      source,
    };
    const result = formatDiagnostic(diag);
    const lines = result.split('\n');
    expect(lines[0]).toBe('bmd: error: test.md:3:6: invalid syntax');
    expect(lines[1]).toBe('  some bad code here');
    expect(lines[2]).toBe('       ^');
  });

  test('with span > 1 shows caret + tildes (e.g., "  ^~~~")', () => {
    const source = 'hello world foobar';
    const diag: Diagnostic = {
      file: 'doc.md',
      line: 1,
      col: 7,
      span: 5,
      message: 'unknown word',
      severity: 'error',
      source,
    };
    const result = formatDiagnostic(diag);
    const lines = result.split('\n');
    expect(lines[2]).toBe('        ^~~~~');
  });

  test('with severity "warning" uses "warning" not "error"', () => {
    const diag: Diagnostic = {
      file: 'warn.md',
      line: 1,
      col: 1,
      span: 1,
      message: 'deprecated syntax',
      severity: 'warning',
    };
    const result = formatDiagnostic(diag);
    expect(result).toStartWith('bmd: warning: warn.md:1:1: deprecated syntax');
  });

  test('omits source and caret lines when source is not provided', () => {
    const diag: Diagnostic = {
      file: 'no-source.md',
      line: 10,
      col: 1,
      span: 1,
      message: 'file not found',
      severity: 'error',
    };
    const result = formatDiagnostic(diag);
    expect(result).toBe('bmd: error: no-source.md:10:1: file not found');
    expect(result.split('\n')).toHaveLength(1);
  });
});

describe('ExitCode', () => {
  test('exit code constants match spec', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.USAGE).toBe(2);
    expect(ExitCode.PARSE).toBe(3);
    expect(ExitCode.MERMAID).toBe(4);
    expect(ExitCode.THEME).toBe(5);
    expect(ExitCode.OUTPUT).toBe(6);
    expect(ExitCode.SERVE).toBe(7);
  });
});

describe('BmdError', () => {
  test('has exitCode and message', () => {
    const err = new BmdError('something broke', ExitCode.PARSE);
    expect(err.message).toBe('something broke');
    expect(err.exitCode).toBe(3);
    expect(err).toBeInstanceOf(Error);
  });

  test('can include a diagnostic', () => {
    const diag: Diagnostic = {
      file: 'test.md',
      line: 1,
      col: 1,
      span: 1,
      message: 'bad',
      severity: 'error',
    };
    const err = new BmdError('parse failed', ExitCode.PARSE, diag);
    expect(err.diagnostic).toEqual(diag);
  });
});
