/**
 * CLI boundary validation functions.
 * All validators emit diagnostics to stderr before throwing BmdError.
 */

import { BmdError, ExitCode, writeDiagnostic, Severity } from '../diagnostics/formatter.ts';

/**
 * Validate a port number string. Returns the parsed port on success.
 * Throws BmdError with ExitCode.USAGE on invalid input.
 */
export function validatePort(raw: string): number {
  const port = parseInt(raw, 10);
  if (isNaN(port)) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 16, col: 5, span: 0,
      message: `invalid port number: ${raw}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`invalid port number: ${raw}`, ExitCode.USAGE);
  }
  if (port < 0 || port > 65535) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 24, col: 5, span: 0,
      message: `port must be 0-65535, got ${port}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`port must be 0-65535, got ${port}`, ExitCode.USAGE);
  }
  return port;
}

/**
 * Validate a width value string. Returns the parsed width on success.
 * Throws BmdError with ExitCode.USAGE on invalid input.
 */
export function validateWidth(raw: string): number {
  const width = parseInt(raw, 10);
  if (isNaN(width)) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 42, col: 5, span: 0,
      message: `invalid width value: ${raw}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`invalid width value: ${raw}`, ExitCode.USAGE);
  }
  if (width <= 0) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 50, col: 5, span: 0,
      message: `width must be positive integer, got ${width}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`width must be positive integer, got ${width}`, ExitCode.USAGE);
  }
  return width;
}

const VALID_MODES = ['editor', 'preview', 'both'] as const;
type Mode = (typeof VALID_MODES)[number];

/**
 * Validate a serve mode string. Returns the validated mode on success.
 * Throws BmdError with ExitCode.USAGE on invalid input.
 */
export function validateMode(raw: string): Mode {
  if (!VALID_MODES.includes(raw as Mode)) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 69, col: 5, span: 0,
      message: `mode must be editor, preview, or both, got '${raw}'`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`mode must be editor, preview, or both, got '${raw}'`, ExitCode.USAGE);
  }
  return raw as Mode;
}

/**
 * Validate that a file path exists. Throws BmdError with ExitCode.USAGE if not found.
 */
export async function validateFile(filePath: string): Promise<void> {
  const { access } = await import('node:fs/promises');
  let exists = true;
  try {
    await access(filePath);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') writeDiagnostic({ file: 'src/cli/validate.ts', line: 87, col: 35, span: 0, message: `Unexpected file access error (${filePath}): ${err?.message ?? err}`, severity: Severity.DiagError });
    exists = false;
  }
  if (!exists) {
    writeDiagnostic({
      file: 'src/cli/validate.ts', line: 91, col: 5, span: 0,
      message: `file not found: ${filePath}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`file not found: ${filePath}`, ExitCode.USAGE);
  }
}

/**
 * Emit a warning diagnostic for an invalid theme name. Does NOT throw.
 */
export function warnInvalidTheme(themeName: string): void {
  writeDiagnostic({
    file: 'src/cli/validate.ts', line: 101, col: 3, span: 0,
    message: `theme not found: ${themeName}, using default`,
    severity: Severity.DiagWarn,
  });
}
