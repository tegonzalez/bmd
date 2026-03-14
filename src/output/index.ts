/**
 * Output orchestrator for bmd.
 * Connects the full pipeline: parse -> transform -> render -> pager -> output.
 */

import { parse } from '../parser/index.ts';
import { runTransforms } from '../transform/pipeline.ts';
import { renderTokens } from '../renderer/base-renderer.ts';
import { AsciiAdapter } from '../renderer/ascii-adapter.ts';
import { Utf8Adapter } from '../renderer/utf8-adapter.ts';
import { createAnsiLayer } from '../renderer/ansi-layer.ts';
import { DEFAULT_THEME } from '../types/theme.ts';
import { BmdError, ExitCode, writeDiagnostic } from '../diagnostics/formatter.ts';
import { outputWithPager, type PagerMode } from '../pager/index.ts';

export interface RenderOptions {
  format: 'ascii' | 'utf8';
  width: number;
  ansiEnabled: boolean;
  pager: PagerMode;
  filePath?: string;
}

/**
 * Render a Markdown source string to the terminal.
 *
 * Orchestrates the full pipeline:
 * 1. Parse source into tokens
 * 2. Run transforms (code normalization)
 * 3. Create format adapter and optional ANSI layer
 * 4. Render tokens to formatted string
 * 5. Output through pager (if applicable)
 */
export async function renderDocument(
  source: string,
  options: RenderOptions,
): Promise<void> {
  let tokens;
  let env;

  try {
    const result = parse(source);
    tokens = result.tokens;
    env = result.env;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeDiagnostic({
      file: options.filePath || '<stdin>',
      line: 1,
      col: 1,
      span: 1,
      message: `Parse error: ${message}`,
      severity: 'error',
    });
    throw new BmdError(`Parse error: ${message}`, ExitCode.PARSE);
  }

  try {
    await runTransforms(tokens, {
      format: options.format,
      ansiEnabled: options.ansiEnabled,
      width: options.width,
      filePath: options.filePath,
    });

    const adapter = options.format === 'ascii' ? new AsciiAdapter() : new Utf8Adapter();
    const ansi = options.ansiEnabled ? createAnsiLayer(DEFAULT_THEME) : null;
    const ctx = {
      width: options.width,
      format: options.format,
      ansiEnabled: options.ansiEnabled,
      theme: DEFAULT_THEME,
    };

    const output = renderTokens(tokens, adapter, ansi, ctx);
    await outputWithPager(output, { pager: options.pager });
  } catch (err) {
    if (err instanceof BmdError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new BmdError(`Output error: ${message}`, ExitCode.OUTPUT);
  }
}
