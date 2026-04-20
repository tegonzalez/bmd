/**
 * Parse raw stdin/file bytes into rows using the selected input format.
 */

import type { ParseTableResult } from "./types.ts";
import type { TableInputFormatId } from "./formats/types.ts";
import { getTableFormatParser } from "./formats/registry.ts";

export function parseTableInput(
  raw: string,
  format: TableInputFormatId,
): ParseTableResult {
  return getTableFormatParser(format)(raw);
}
