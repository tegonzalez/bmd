/**
 * Build ordered column list: union of row keys, order = first appearance across rows.
 */

import type { TableRow } from "./types.ts";

export function columnOrderForRows(rows: TableRow[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
    }
  }
  return order;
}
