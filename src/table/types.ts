/**
 * Normalized tabular data for Markdown (and future) output.
 * Input parsers produce rows; column order is derived separately.
 */

export type TableRow = Record<string, unknown>;

export interface NormalizedTable {
  rows: TableRow[];
  /** Union of keys across rows, stable “first seen” order (jtbl-style). */
  columns: string[];
}

export type ParseTableFailure = { ok: false; message: string };

export type ParseTableSuccess = {
  ok: true;
  rows: TableRow[];
};

export type ParseTableResult = ParseTableFailure | ParseTableSuccess;
