/**
 * Config file discovery and loading.
 * Looks for bmd.config.yaml in CWD only (project-local, not global per CONF-03).
 */

import { join } from "path";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { DEFAULT_CONFIG_FILENAME } from "./bmd-defaults.ts";
import { configSchema, type RawFileConfig } from "./schema.ts";
import { BmdError, ExitCode, writeDiagnostic, Severity } from "../diagnostics/formatter.ts";
import { findFieldInYaml } from "../theme/loader.ts";

/**
 * Load bmd.config.yaml from CWD if it exists.
 * Returns null when no config file found (not an error).
 * Throws BmdError with diagnostics on validation failure.
 */
export async function loadConfig(customPath?: string): Promise<RawFileConfig | null> {
  const configPath = customPath ? customPath : join(process.cwd(), DEFAULT_CONFIG_FILENAME);

  if (customPath && !existsSync(configPath)) {
    writeDiagnostic({
      file: configPath,
      line: 1,
      col: 1,
      span: 1,
      message: `Config file not found: ${configPath}`,
      severity: Severity.DiagError,
    });
    throw new BmdError(`Config file not found: ${configPath}`, ExitCode.USAGE);
  }

  if (!existsSync(configPath)) {
    return null;
  }

  let source: string;
  try {
    source = readFileSync(configPath, "utf-8");
  } catch (err) {
    writeDiagnostic({
      file: configPath,
      line: 1,
      col: 1,
      span: 1,
      message: `Could not read config file: ${err instanceof Error ? err.message : String(err)}`,
      severity: Severity.DiagError,
    });
    throw new BmdError("Could not read config file", ExitCode.USAGE);
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(source) ?? {};
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeDiagnostic({
      file: configPath,
      line: 1,
      col: 1,
      span: 1,
      message: `YAML syntax error: ${message}`,
      severity: Severity.DiagError,
      context: source,
    });
    throw new BmdError(`Invalid YAML in config file: ${configPath}`, ExitCode.USAGE);
  }

  // SAFE-03: Check for URLs in string values
  const urlPaths = findUrlValues(parsed);
  if (urlPaths.length > 0) {
    for (const urlPath of urlPaths) {
      const pos = findFieldInYaml(source, urlPath);
      writeDiagnostic({
        file: configPath,
        line: pos.line,
        col: pos.col,
        span: pos.span,
        message: `Remote URL not allowed in config file: ${urlPath}`,
        severity: Severity.DiagError,
        context: source,
      });
    }
    throw new BmdError(
      `Config file contains remote URLs (SAFE-03 violation): ${configPath}`,
      ExitCode.USAGE
    );
  }

  // Validate against schema
  const result = configSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error?.issues ?? [];
    for (const issue of issues) {
      const fieldPath = issue.path.join(".");
      const pos = findFieldInYaml(source, fieldPath || "(root)");
      writeDiagnostic({
        file: configPath,
        line: pos.line,
        col: pos.col,
        span: pos.span,
        message: `${fieldPath ? fieldPath + ": " : ""}${issue.message}`,
        severity: Severity.DiagError,
        context: source,
      });
    }
    throw new BmdError(
      `Config validation failed: ${configPath} (${issues.length} error${issues.length === 1 ? "" : "s"})`,
      ExitCode.USAGE
    );
  }

  return result.data;
}

/**
 * Recursively find URL values in an object (SAFE-03).
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
