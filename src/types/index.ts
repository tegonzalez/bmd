/**
 * Shared types for bmd
 */

export type OutputFormat = 'ascii' | 'utf8';
export type AnsiMode = 'auto' | 'on' | 'off';

// Re-export BmdError from diagnostics (canonical location)
export { BmdError } from '../diagnostics/formatter.ts';
