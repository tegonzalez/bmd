/**
 * YAML theme file loading with Zod validation and diagnostic mapping.
 */

import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { BmdError, ExitCode, writeDiagnostic, Severity, type Diagnostic } from "../diagnostics/formatter";
import { synThemeSchema, type SynTheme } from "./schema/syn";
import { mdThemeSchema, type MdTheme } from "./schema/md";
import { merThemeSchema, type MerTheme } from "./schema/mer";
import { webThemeSchema, type WebTheme } from "./schema/web";
import { unicThemeSchema, type UnicTheme } from "./schema/unic";
import type { Facet } from "./types";
import type { z } from "zod";

/** Map facet name to its Zod schema */
const SCHEMAS: Record<Facet, z.ZodType> = {
  syn: synThemeSchema,
  md: mdThemeSchema,
  mer: merThemeSchema,
  web: webThemeSchema,
  unic: unicThemeSchema,
};

/**
 * Find approximate line/col for a field path in YAML source.
 * Searches line-by-line for the leaf key of the dot path.
 */
export function findFieldInYaml(
  source: string,
  dotPath: string
): { line: number; col: number; span: number } {
  const parts = dotPath.split(".");
  const leafKey = parts[parts.length - 1]!;
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Look for "key:" pattern
    const keyMatch = line.match(new RegExp(`^(\\s*)${escapeRegExp(leafKey)}\\s*:`));
    if (keyMatch) {
      const col = (keyMatch[1]!?.length ?? 0) + 1;
      return { line: i + 1, col, span: leafKey.length };
    }
  }

  // Fallback: first line
  return { line: 1, col: 1, span: 1 };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check all string values in an object for URLs (SAFE-03).
 * Returns field paths that contain URLs.
 */
function findUrlValues(obj: unknown, prefix: string = ""): string[] {
  const urlPaths: string[] = [];
  const urlPattern = /https?:\/\//i;

  if (typeof obj === "string") {
    if (urlPattern.test(obj)) {
      urlPaths.push(prefix || "(root)");
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      urlPaths.push(...findUrlValues(obj[i]!, `${prefix}[${i}]`));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      urlPaths.push(...findUrlValues(value, path));
    }
  }

  return urlPaths;
}

/**
 * Load and validate a theme YAML file against its facet schema.
 *
 * @throws BmdError with ExitCode.THEME on validation failure
 */
export async function loadAndValidateTheme(
  facet: Facet,
  filePath: string
): Promise<SynTheme | MdTheme | MerTheme | WebTheme | UnicTheme> {
  if (!existsSync(filePath)) {
    throw new BmdError(`Theme file not found: ${filePath}`, ExitCode.THEME);
  }

  const source = readFileSync(filePath, "utf-8");
  let parsed: unknown;

  try {
    parsed = parseYaml(source);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeDiagnostic({
      file: filePath,
      line: 1,
      col: 1,
      span: 1,
      message: `YAML syntax error: ${message}`,
      severity: Severity.DiagError,
      context: source,
    });
    throw new BmdError(`Invalid YAML in theme file: ${filePath}`, ExitCode.THEME);
  }

  // SAFE-03: Check for URLs in string values
  const urlPaths = findUrlValues(parsed);
  if (urlPaths.length > 0) {
    for (const urlPath of urlPaths) {
      const pos = findFieldInYaml(source, urlPath);
      writeDiagnostic({
        file: filePath,
        line: pos.line,
        col: pos.col,
        span: pos.span,
        message: `Remote URL not allowed in theme file: ${urlPath}`,
        severity: Severity.DiagError,
        context: source,
      });
    }
    throw new BmdError(
      `Theme file contains remote URLs (SAFE-03 violation): ${filePath}`,
      ExitCode.THEME
    );
  }

  // Validate against facet schema
  const schema = SCHEMAS[facet]!;
  const result = schema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error?.issues ?? [];
    const diagnostics: Diagnostic[] = issues.map((issue) => {
      const fieldPath = issue.path.map(String).join(".");
      const pos = findFieldInYaml(source, fieldPath || "(root)");
      return {
        file: filePath,
        line: pos.line,
        col: pos.col,
        span: pos.span,
        message: `${fieldPath ? fieldPath + ": " : ""}${issue.message}`,
        severity: Severity.DiagError,
        context: source,
      };
    });

    for (const diag of diagnostics) {
      writeDiagnostic(diag);
    }

    throw new BmdError(
      `Theme validation failed: ${filePath} (${issues.length} error${issues.length === 1 ? "" : "s"})`,
      ExitCode.THEME
    );
  }

  return result.data as SynTheme | MdTheme | MerTheme | WebTheme | UnicTheme;
}
