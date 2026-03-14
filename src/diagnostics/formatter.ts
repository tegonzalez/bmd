/**
 * Compiler-style diagnostic formatting for bmd.
 * Outputs diagnostics to stderr in a format similar to rustc/clang.
 */

/** Exit codes per bmd spec */
export const ExitCode = {
  SUCCESS: 0,
  USAGE: 2,
  PARSE: 3,
  MERMAID: 4,
  THEME: 5,
  OUTPUT: 6,
  SERVE: 7,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** Diagnostic information for error/warning reporting */
export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  span: number;
  message: string;
  severity: 'error' | 'warning';
  source?: string;
}

/**
 * Format a diagnostic into compiler-style output.
 *
 * Output format:
 *   bmd: {severity}: {file}:{line}:{col}: {message}
 *   {source line}
 *   {caret marker}
 *
 * If source is not provided, only the first line is included.
 */
export function formatDiagnostic(diag: Diagnostic): string {
  const header = `bmd: ${diag.severity}: ${diag.file}:${diag.line}:${diag.col}: ${diag.message}`;

  if (diag.source === undefined) {
    return header;
  }

  const sourceLines = diag.source.split('\n');
  const sourceLine = sourceLines[diag.line - 1] ?? '';
  const caret = ' '.repeat(diag.col - 1) + '^' + '~'.repeat(Math.max(0, diag.span - 1));

  return [
    header,
    `  ${sourceLine}`,
    `  ${caret}`,
  ].join('\n');
}

/** Error class with exit code and optional diagnostic */
export class BmdError extends Error {
  readonly exitCode: number;
  readonly diagnostic?: Diagnostic;

  constructor(message: string, exitCode: number, diagnostic?: Diagnostic) {
    super(message);
    this.name = 'BmdError';
    this.exitCode = exitCode;
    this.diagnostic = diagnostic;
  }
}

/** Write a formatted diagnostic to stderr */
export function writeDiagnostic(diag: Diagnostic): void {
  process.stderr.write(formatDiagnostic(diag) + '\n');
}
