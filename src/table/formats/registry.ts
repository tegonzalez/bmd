/**
 * Maps `-t` / `--type` ids to parsers. Add new entries when new formats ship.
 */

import type { TableInputFormatId, TableFormatParser } from "./types.ts";
import { parseAutoTableInput } from "./auto.ts";
import { parseJsonTableInput } from "./json.ts";

const parsers: Record<TableInputFormatId, TableFormatParser> = {
  auto: parseAutoTableInput,
  json: parseJsonTableInput,
};

export const TABLE_INPUT_FORMAT_IDS = Object.keys(parsers) as TableInputFormatId[];

export function getTableFormatParser(id: TableInputFormatId): TableFormatParser {
  return parsers[id]!;
}

export function isTableInputFormatId(s: string): s is TableInputFormatId {
  return s === "auto" || s === "json";
}
