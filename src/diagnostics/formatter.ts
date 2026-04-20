/**
 * Unified diagnostic and debug logging for bmd.
 *
 * Two concerns, one module:
 *   Severity.DiagError / DiagWarn → compiler-style diagnostics referencing user documents.
 *   Severity.Info / Debug / Debug2 / Debug3 → source-level traces referencing our code.
 *
 * Logger is an object with pluggable sinks. Each sink has its own gating level.
 * See diagnostics.api-spec for the full contract.
 */

// ---------------------------------------------------------------------------
// Severity enum
// ---------------------------------------------------------------------------

export enum Severity {
  DiagError = 0,
  DiagWarn  = 1,
  Info      = 2,
  Debug     = 3,
  Debug2    = 4,
  Debug3    = 5,
}

const SEVERITY_LABEL: Record<Severity, string> = {
  [Severity.DiagError]: 'error',
  [Severity.DiagWarn]:  'warning',
  [Severity.Info]:      'info',
  [Severity.Debug]:     'debug',
  [Severity.Debug2]:    'debug2',
  [Severity.Debug3]:    'debug3',
};

export function parseSeverityName(name: string): Severity | null {
  switch (name.toLowerCase()) {
    case 'error':     case 'diagerror':  return Severity.DiagError;
    case 'warning':   case 'diagwarn':   return Severity.DiagWarn;
    case 'info':                         return Severity.Info;
    case 'debug':     case 'debug1':     return Severity.Debug;
    case 'debug2':                       return Severity.Debug2;
    case 'debug3':                       return Severity.Debug3;
    default:                             return null;
  }
}

// ---------------------------------------------------------------------------
// Diagnostic DTO
// ---------------------------------------------------------------------------

export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  span: number;
  message: string;
  severity: Severity;
  context?: string;
}

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// BmdError
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Formatting (pure, no logger needed)
// ---------------------------------------------------------------------------

export function formatDiagnostic(diag: Diagnostic): string {
  const label = SEVERITY_LABEL[diag.severity]! ?? 'error';
  const header = `bmd: ${label}: ${diag.file}:${diag.line}:${diag.col}: ${diag.message}`;

  if (diag.context === undefined) {
    return header;
  }

  const sourceLines = diag.context.split('\n');
  const sourceLine = sourceLines[diag.line - 1]! ?? '';
  const caret = ' '.repeat(Math.max(0, diag.col - 1)) + '^' + '~'.repeat(Math.max(0, diag.span - 1));

  return [
    header,
    `  ${sourceLine}`,
    `  ${caret}`,
  ].join('\n');
}

export function buildContext(
  source: string,
  offset: number,
  length: number,
): { line: number; col: number; span: number; context: string } {
  const { line, col } = offsetToLineCol(source, offset);
  return { line, col, span: length, context: source };
}

export function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i]! === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, col: offset - lastNewline };
}

// ---------------------------------------------------------------------------
// Call-site derivation from Error().stack
// ---------------------------------------------------------------------------

/**
 * Parse the caller's file:line:col from an Error stack trace.
 * Skips frames inside this module (formatter.ts / formatter.js).
 * Returns { file, line, col } or a fallback if parsing fails.
 */
/**
 * Parse caller's file:line:col from Error stack.
 * @param skip — number of location-bearing frames to skip (0 = return first frame with a location)
 */
function deriveCallSite(skip: number): { file: string; line: number; col: number } {
  const fallback = { file: '<unknown>', line: 0, col: 0 };
  try {
    const stack = new Error().stack;
    if (!stack) return fallback;
    const lines = stack.split('\n');
    let found = 0;

    for (const frame of lines) {
      // Try V8/Bun: "    at functionName (file:line:col)" or "    at file:line:col"
      let m = frame.match(/at\s+(?:.*?\s+)?\(?(.*?):(\d+):(\d+)\)?/);
      // Try Safari/WebKit: "functionName@file:line:col"
      if (!m) m = frame.match(/(?:.*@)?(.*?):(\d+):(\d+)/);
      if (!m) continue;

      if (found < skip) { found++; continue; }
      return { file: shortenPath(m[1]!), line: parseInt(m[2]!, 10), col: parseInt(m[3]!, 10) };
    }
  } catch {
    // Stack parsing failure
  }
  return fallback;
}

/** Shorten a path/URL to the most useful form for display */
function shortenPath(raw: string): string {
  // Strip to src/ relative path if present (server/dev)
  const srcIdx = raw.indexOf('src/');
  if (srcIdx !== -1) return raw.slice(srcIdx);

  // Strip URL origin for browser bundles: http://host:port/app.js → app.js
  try {
    const url = new URL(raw);
    return url.pathname.slice(1) || raw; // remove leading /
  } catch {
    // Not a URL
  }

  // Last resort: just the filename
  const slashIdx = raw.lastIndexOf('/');
  if (slashIdx !== -1) return raw.slice(slashIdx + 1);
  return raw;
}

// ---------------------------------------------------------------------------
// LogSink
// ---------------------------------------------------------------------------

export interface LogSink {
  write(diag: Diagnostic): void;
  level: Severity;
}

// ---------------------------------------------------------------------------
// Built-in sink factories
// ---------------------------------------------------------------------------

export function stderrSink(level: Severity = Severity.Info): LogSink {
  return {
    level,
    write(diag: Diagnostic) {
      process.stderr.write(formatDiagnostic(diag) + '\n');
    },
  };
}

export function consoleSink(level: Severity = Severity.Debug3): LogSink {
  return {
    level,
    write(diag: Diagnostic) {
      console.error(formatDiagnostic(diag));
    },
  };
}

export function wsSink(send: (msg: any) => void, level: Severity = Severity.Debug3): LogSink {
  return {
    level,
    write(diag: Diagnostic) {
      const out: Record<string, unknown> = {
        file: diag.file,
        line: diag.line,
        col: diag.col,
        span: diag.span,
        message: diag.message,
        severity: diag.severity,
      };
      if (diag.context !== undefined) out.context = diag.context;
      send({ type: 'client:diagnostic', diagnostic: out });
    },
  };
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  /** Source trace — file/line/col derived from call site */
  log(severity: Severity, message: string): void;
  /** Document diagnostic — caller provides document location */
  logDiag(severity: Severity, file: string, line: number, col: number, message: string, span?: number, context?: string): void;
  /** Relay a pre-formed Diagnostic through sinks without adding logger prefix */
  relay(diag: Diagnostic): void;
  addSink(sink: LogSink): void;
  removeSink(sink: LogSink): void;
  clearSinks(): void;
  /** Set all current sinks to the same level */
  setLevel(level: Severity): void;
  /** Return the level of the first sink, or Info if no sinks */
  getLevel(): Severity;
}

export function createLogger(name?: string): Logger {
  const prefix = name ? `[${name}] ` : '';
  const sinks: LogSink[] = [];

  function dispatch(diag: Diagnostic): void {
    const isDiag = diag.severity <= Severity.DiagWarn;
    for (const sink of sinks) {
      if (isDiag || diag.severity <= sink.level) {
        sink.write(diag);
      }
    }
  }

  return {
    log(severity: Severity, message: string): void {
      // Fast path: check if any sink would accept this severity
      if (severity > Severity.DiagWarn) {
        let anyAccepts = false;
        for (const sink of sinks) {
          if (severity <= sink.level) { anyAccepts = true; break; }
        }
        if (!anyAccepts) return;
      }

      // Skip 2 frames: deriveCallSite() + this log() method
      const site = deriveCallSite(2);
      dispatch({
        file: site.file,
        line: site.line,
        col: site.col,
        span: 0,
        message: prefix + message,
        severity,
      });
    },

    logDiag(severity: Severity, file: string, line: number, col: number, message: string, span: number = 0, context?: string): void {
      const diag: Diagnostic = { file, line, col, span, message: prefix + message, severity };
      if (context !== undefined) diag.context = context;
      dispatch(diag);
    },

    relay(diag: Diagnostic): void {
      dispatch(diag);
    },

    addSink(sink: LogSink): void {
      if (!sinks.includes(sink)) sinks.push(sink);
    },

    removeSink(sink: LogSink): void {
      const idx = sinks.indexOf(sink);
      if (idx !== -1) sinks.splice(idx, 1);
    },

    clearSinks(): void {
      sinks.length = 0;
    },

    setLevel(level: Severity): void {
      for (const sink of sinks) {
        sink.level = level;
      }
    },

    getLevel(): Severity {
      return sinks.length > 0 ? sinks[0]!.level : Severity.Info;
    },
  };
}

// ---------------------------------------------------------------------------
// Backward compat — writeDiagnostic, bindDiagnosticTransport, etc.
//
// These shims let existing call sites work during migration.
// They delegate to a default global logger instance.
// TODO: remove once all call sites are migrated to logger.log/logDiag
// ---------------------------------------------------------------------------

const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

export const defaultLogger = createLogger(IS_BROWSER ? 'client' : 'server');

// Wire default sinks
if (IS_BROWSER) {
  defaultLogger.addSink(consoleSink(Severity.Debug3));
} else {
  const level = (() => {
    const envLevel = (typeof process !== 'undefined' && process.env?.BMD_LOG_LEVEL) || '';
    if (envLevel) {
      const parsed = parseSeverityName(envLevel);
      if (parsed !== null) return parsed;
    }
    return Severity.Info;
  })();
  defaultLogger.addSink(stderrSink(level));
}

let _wsSinkRef: LogSink | null = null;

export function bindDiagnosticTransport(send: (msg: any) => void): void {
  if (_wsSinkRef) defaultLogger.removeSink(_wsSinkRef);
  _wsSinkRef = wsSink(send, defaultLogger.getLevel());
  defaultLogger.addSink(_wsSinkRef);
}

export function unbindDiagnosticTransport(): void {
  if (_wsSinkRef) {
    defaultLogger.removeSink(_wsSinkRef);
    _wsSinkRef = null;
  }
}

/** Shim: delegates to defaultLogger.logDiag */
export function writeDiagnostic(diag: Diagnostic): void {
  defaultLogger.logDiag(diag.severity, diag.file, diag.line, diag.col, diag.message, diag.span, diag.context);
}

/** Shim: delegates to defaultLogger.setLevel */
export function setLogLevel(level: Severity): void {
  defaultLogger.setLevel(level);
}

/** Shim: delegates to defaultLogger.getLevel */
export function getLogLevel(): Severity {
  return defaultLogger.getLevel();
}
