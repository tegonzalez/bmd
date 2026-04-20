/**
 * Contract tests: Pipeline format modes.
 * Verifies ASCII vs UTF8 format output and ANSI on/off behavior.
 */

import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../../src/pipeline/index.ts';
import { makeConfig } from '../helpers.ts';

async function render(source: string, config: any): Promise<string> {
  return (await runPipeline({ source, config })).rendered;
}

describe('pipeline contract: format modes', () => {
  const tableMarkdown = '| Col A | Col B |\n|-------|-------|\n| val1  | val2  |\n';

  test('ASCII mode produces output containing content text', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const output = await render(tableMarkdown, config);
    expect(output).toContain('Col A');
    expect(output).toContain('val1');
  });

  test('UTF8 mode produces output containing content text', async () => {
    const config = makeConfig({ format: 'utf8', ansiEnabled: false });
    const output = await render(tableMarkdown, config);
    expect(output).toContain('Col A');
    expect(output).toContain('val1');
  });

  test('ANSI enabled produces escape sequences', async () => {
    const config = makeConfig({ ansiEnabled: true });
    const output = await render('# Hello\n', config);
    expect(output).toContain('\x1b[');
  });

  test('ANSI disabled produces no escape sequences', async () => {
    const config = makeConfig({ ansiEnabled: false });
    const output = await render('# Hello\n', config);
    expect(output).not.toContain('\x1b[');
  });

  test('anti-false-positive: ASCII and UTF8 outputs differ in decoration', async () => {
    const asciiConfig = makeConfig({ format: 'ascii', ansiEnabled: false });
    const utf8Config = makeConfig({ format: 'utf8', ansiEnabled: false });

    const asciiOutput = await render(tableMarkdown, asciiConfig);
    const utf8Output = await render(tableMarkdown, utf8Config);

    // Both contain the same content text
    expect(asciiOutput).toContain('Col A');
    expect(utf8Output).toContain('Col A');

    // But the full outputs differ (different border/decoration characters)
    expect(asciiOutput).not.toBe(utf8Output);
  });
});
