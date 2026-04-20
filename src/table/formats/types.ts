/**
 * Identifiers for table input decoders. Extend with new formats (yaml, csv, …)
 * without changing the CLI shape: `-t/--type` selects a decoder.
 */

import type { ParseTableResult } from "../types.ts";

/** Built-in input format ids (CLI `-t` / `--type`). */
export type TableInputFormatId = "auto" | "json";

export type TableFormatParser = (raw: string) => ParseTableResult;
