import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { writeDiagnostic, Severity, setLogLevel, getLogLevel, formatDiagnostic, bindDiagnosticTransport, unbindDiagnosticTransport, type Diagnostic } from '../../src/diagnostics/formatter.ts';

describe('unified logger (writeDiagnostic)', () => {
  let stderrOutput: string[];
  const originalWrite = process.stderr.write;
  let savedLevel: Severity;

  beforeEach(() => {
    stderrOutput = [];
    savedLevel = getLogLevel();
    process.stderr.write = ((chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    setLogLevel(savedLevel);
  });

  test('DiagError always emits to stderr', () => {
    writeDiagnostic({ file: 'test.md', line: 1, col: 1, span: 1, message: 'something broke', severity: Severity.DiagError });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('error');
    expect(stderrOutput[0]!).toContain('something broke');
  });

  test('DiagWarn always emits to stderr', () => {
    writeDiagnostic({ file: 'test.md', line: 1, col: 1, span: 1, message: 'heads up', severity: Severity.DiagWarn });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('warning');
    expect(stderrOutput[0]!).toContain('heads up');
  });

  test('Debug is suppressed when level is Info (default)', () => {
    setLogLevel(Severity.Info);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'verbose stuff', severity: Severity.Debug });
    expect(stderrOutput.length).toBe(0);
  });

  test('Debug emits when level is Debug', () => {
    setLogLevel(Severity.Debug);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'verbose stuff', severity: Severity.Debug });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('debug');
    expect(stderrOutput[0]!).toContain('verbose stuff');
  });

  test('Debug2 is suppressed when level is Debug', () => {
    setLogLevel(Severity.Debug);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'd2 stuff', severity: Severity.Debug2 });
    expect(stderrOutput.length).toBe(0);
  });

  test('Debug2 emits when level is Debug2', () => {
    setLogLevel(Severity.Debug2);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'd2 stuff', severity: Severity.Debug2 });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('debug2');
  });

  test('Debug3 emits when level is Debug3', () => {
    setLogLevel(Severity.Debug3);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'd3 stuff', severity: Severity.Debug3 });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('debug3');
  });

  test('DiagError always emits even when level is DiagError', () => {
    setLogLevel(Severity.DiagError);
    writeDiagnostic({ file: 'test.md', line: 1, col: 1, span: 1, message: 'error', severity: Severity.DiagError });
    expect(stderrOutput.length).toBe(1);
  });

  test('DiagWarn always emits even when level is DiagError', () => {
    // DiagWarn is severity 1, which is >= Info (2) is false, so it always emits
    setLogLevel(Severity.DiagError);
    writeDiagnostic({ file: 'test.md', line: 1, col: 1, span: 1, message: 'warn', severity: Severity.DiagWarn });
    expect(stderrOutput.length).toBe(1);
  });

  test('Info is suppressed when level is DiagWarn', () => {
    setLogLevel(Severity.DiagWarn);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'info msg', severity: Severity.Info });
    expect(stderrOutput.length).toBe(0);
  });

  test('Info emits when level is Info', () => {
    setLogLevel(Severity.Info);
    writeDiagnostic({ file: 'src/test.ts', line: 1, col: 1, span: 0, message: 'info msg', severity: Severity.Info });
    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]!).toContain('info');
  });

  test('setLogLevel/getLogLevel round-trips', () => {
    setLogLevel(Severity.Debug2);
    expect(getLogLevel()).toBe(Severity.Debug2);
    setLogLevel(Severity.Info);
    expect(getLogLevel()).toBe(Severity.Info);
  });

  test('formatDiagnostic includes real source file:line:col for debug entries', () => {
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

  test('formatDiagnostic includes context with caret for diag entries', () => {
    const diag: Diagnostic = {
      file: 'config.yaml',
      line: 2,
      col: 3,
      span: 4,
      message: 'bad field',
      severity: Severity.DiagError,
      context: 'line1\n  badvalue: 123\nline3',
    };
    const result = formatDiagnostic(diag);
    const lines = result.split('\n');
    expect(lines[0]!).toBe('bmd: error: config.yaml:2:3: bad field');
    expect(lines[1]!).toBe('    badvalue: 123');
    expect(lines[2]!).toBe('    ^~~~');
  });
});
