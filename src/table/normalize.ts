/**
 * Attach column order to parsed rows for Markdown rendering.
 */

import { columnOrderForRows } from "./column-order.ts";
import type { NormalizedTable, TableRow } from "./types.ts";

export function normalizeRows(rows: TableRow[]): NormalizedTable {
  return {
    rows,
    columns: columnOrderForRows(rows),
  };
}
