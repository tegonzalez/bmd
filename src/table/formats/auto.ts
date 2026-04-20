/**
 * Auto-detect input format. v1: same as JSON (structured APIs / jq / jc output).
 * Later: sniff YAML front matter, CSV, etc., then delegate to other parsers.
 */

import type { ParseTableResult } from "../types.ts";
import { parseJsonTableInput } from "./json.ts";

export function parseAutoTableInput(raw: string): ParseTableResult {
  return parseJsonTableInput(raw);
}
