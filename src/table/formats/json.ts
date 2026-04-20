/**
 * JSON and JSON Lines → array of object rows (jtbl-compatible normalization).
 * No terminal width / wrapping — Markdown handles layout downstream.
 */

import type { ParseTableResult, TableRow } from "../types.ts";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse a single JSON value or JSON Lines (one object per non-empty line).
 * - Whole-buffer `JSON.parse`: root array of objects, or single object → [object].
 * - On failure, try JSON Lines like jtbl.
 */
export function parseJsonTableInput(raw: string): ParseTableResult {
  const text = raw.replace(/^\uFEFF/, "");
  if (text.trim() === "") {
    return { ok: false, message: "table: empty input" };
  }

  try {
    let data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) {
      if (!isPlainObject(data)) {
        return {
          ok: false,
          message:
            "table: JSON root must be an object or array of objects (json)",
        };
      }
      data = [data];
    }

    const list = data as unknown[];
    if (list.length === 0) {
      return { ok: true, rows: [] };
    }

    const rows: TableRow[] = [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i]!;
      if (!isPlainObject(row)) {
        return {
          ok: false,
          message: `table: row ${i + 1} is not a JSON object (json)`,
        };
      }
      rows.push(row);
    }
    return { ok: true, rows };
  } catch {
    return parseJsonLines(text);
  }
}

function parseJsonLines(text: string): ParseTableResult {
  const lines = text.split(/\r?\n/);
  const rows: TableRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (!isPlainObject(entry)) {
        return {
          ok: false,
          message: `table: line ${i + 1} is not a JSON object (json lines)`,
        };
      }
      rows.push(entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const preview = line.length > 120 ? `${line.slice(0, 120)}…` : line;
      return {
        ok: false,
        message: `table: cannot parse line ${i + 1} (${msg}): ${preview}`,
      };
    }
  }
  if (rows.length === 0) {
    return {
      ok: false,
      message: "table: not valid JSON or JSON Lines (json)",
    };
  }
  return { ok: true, rows };
}
