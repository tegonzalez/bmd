/**
 * GFM pipe table from normalized columns + rows. No column-width tuning —
 * renderers (bmd, browsers) lay out Markdown tables.
 */

import type { NormalizedTable } from "./types.ts";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Escape pipes so cells don’t break GFM table syntax. */
function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r\n|\n|\r/g, " ");
}

export function normalizedTableToMarkdown(table: NormalizedTable): string {
  const { columns, rows } = table;
  if (columns.length === 0 && rows.length === 0) {
    return "";
  }
  if (columns.length === 0) {
    return "";
  }

  const header = `| ${columns.map((c) => escapeCell(c)).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = columns.map((col) => escapeCell(cellText(row[col]!)));
    return `| ${cells.join(" | ")} |`;
  });

  return [header, sep, ...body].join("\n") + "\n";
}
