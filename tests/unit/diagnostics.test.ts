import { test, expect, describe } from 'bun:test';
import { formatDiagnostic, ExitCode, BmdError, Severity, buildContext, type Diagnostic } from '../../src/diagnostics/formatter.ts';

describe('formatDiagnostic', () => {
  test('produces "bmd: error: file.md:5:3: message" format', () => {
    const diag: Diagnostic = {
      file: 'file.md',
      line: 5,
      col: 3,
      span: 1,
      message: 'unexpected token',
      severity: Severity.DiagError,
    };
    const result = formatDiagnostic(diag);
    expect(result.startsWith('bmd: error: file.md:5:3: unexpected token')).toBe(true);
  });

  test('includes source line and caret marker at correct column', () => {
    const context = 'line 1\nline 2\nsome bad code here\nline 4';
    const diag: Diagnostic = {
      file: 'test.md',
      line: 3,
      col: 6,
      span: 1,
      message: 'invalid syntax',
      severity: Severity.DiagError,
      context,
    };
    const result = formatDiagnostic(diag);
    const lines = result.split('\n');
    expect(lines[0]!).toBe('bmd: error: test.md:3:6: invalid syntax');
    expect(lines[1]!).toBe('  some bad code here');
    expect(lines[2]!).toBe('       ^');
  });

  test('with span > 1 shows caret + tildes (e.g., "  ^~~~")', () => {
    const context = 'hello world foobar';
    const diag: Diagnostic = {
      file: 'doc.md',
      line: 1,
      col: 7,
      span: 5,
      message: 'unknown word',
      severity: Severity.DiagError,
      context,
    };
    const result = formatDiagnostic(diag);
    const lines = result.split('\n');
    expect(lines[2]!).toBe('        ^~~~~');
  });

  test('with severity DiagWarn uses "warning" not "error"', () => {
    const diag: Diagnostic = {
      file: 'warn.md',
      line: 1,
      col: 1,
      span: 1,
      message: 'deprecated syntax',
      severity: Severity.DiagWarn,
    };
    const result = formatDiagnostic(diag);
    expect(result.startsWith('bmd: warning: warn.md:1:1: deprecated syntax')).toBe(true);
  });

  test('omits context and caret lines when context is not provided', () => {
    const diag: Diagnostic = {
      file: 'no-source.md',
      line: 10,
      col: 1,
      span: 1,
      message: 'file not found',
      severity: Severity.DiagError,
    };
    const result = formatDiagnostic(diag);
    expect(result).toBe('bmd: error: no-source.md:10:1: file not found');
    expect(result.split('\n')).toHaveLength(1);
  });

  test('formats Info severity as "info"', () => {
    const diag: Diagnostic = {
      file: 'src/web/app.ts',
      line: 42,
      col: 5,
      span: 0,
      message: 'connected',
      severity: Severity.Info,
    };
    const result = formatDiagnostic(diag);
    expect(result).toBe('bmd: info: src/web/app.ts:42:5: connected');
  });

  test('formats Debug severity as "debug"', () => {
    const diag: Diagnostic = {
      file: 'src/protocol/client-fsm.ts',
      line: 24,
      col: 3,
      span: 0,
      message: 'file:open -> connected',
      severity: Severity.Debug,
    };
    const result = formatDiagnostic(diag);
    expect(result).toBe('bmd: debug: src/protocol/client-fsm.ts:24:3: file:open -> connected');
  });

  test('formats Debug2 severity as "debug2"', () => {
    const diag: Diagnostic = {
      file: 'src/server/index.ts',
      line: 100,
      col: 1,
      span: 0,
      message: 'broadcast file:changed',
      severity: Severity.Debug2,
    };
    const result = formatDiagnostic(diag);
    expect(result).toBe('bmd: debug2: src/server/index.ts:100:1: broadcast file:changed');
  });
});

describe('Severity enum', () => {
  test('enum values are ordered', () => {
    expect(Severity.DiagError).toBe(0);
    expect(Severity.DiagWarn).toBe(1);
    expect(Severity.Info).toBe(2);
    expect(Severity.Debug).toBe(3);
    expect(Severity.Debug2).toBe(4);
    expect(Severity.Debug3).toBe(5);
  });

  test('DiagError < DiagWarn < Info < Debug < Debug2 < Debug3', () => {
    expect(Severity.DiagError < Severity.DiagWarn).toBe(true);
    expect(Severity.DiagWarn < Severity.Info).toBe(true);
    expect(Severity.Info < Severity.Debug).toBe(true);
    expect(Severity.Debug < Severity.Debug2).toBe(true);
    expect(Severity.Debug2 < Severity.Debug3).toBe(true);
  });
});

describe('buildContext', () => {
  test('converts byte offset to line/col/span/context', () => {
    const source = 'line 1\nline 2\nbad code\nline 4';
    const offset = 14; // start of 'bad code'
    const result = buildContext(source, offset, 3);
    expect(result.line).toBe(3);
    expect(result.col).toBe(1);
    expect(result.span).toBe(3);
    expect(result.context).toBe(source);
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
      severity: Severity.DiagError,
    };
    const err = new BmdError('parse failed', ExitCode.PARSE, diag);
    expect(err.diagnostic).toEqual(diag);
  });
});
