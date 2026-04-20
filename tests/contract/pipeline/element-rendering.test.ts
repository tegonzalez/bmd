/**
 * Contract tests: Pipeline element rendering.
 * Verifies semantic rendering of all major markdown elements.
 * Uses semantic assertions (toContain) -- never exact string matching.
 * ansiEnabled: false for clean text assertions.
 */

import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../../src/pipeline/index.ts';
import { makeConfig } from '../helpers.ts';

async function render(source: string, config: any): Promise<string> {
  return (await runPipeline({ source, config })).rendered;
}

describe('pipeline contract: element rendering', () => {
  const config = makeConfig({ ansiEnabled: false });

  test('heading text is present in output', async () => {
    const output = await render('# My Heading\n', config);
    expect(output).toContain('My Heading');
  });

  test('paragraph text is present in output', async () => {
    const output = await render('Body text here.\n', config);
    expect(output).toContain('Body text here');
  });

  test('bold text is present in output', async () => {
    const output = await render('**bold text**\n', config);
    expect(output).toContain('bold text');
  });

  test('italic text is present in output', async () => {
    const output = await render('*italic text*\n', config);
    expect(output).toContain('italic text');
  });

  test('unordered list items are present in output', async () => {
    const output = await render('- item1\n- item2\n', config);
    expect(output).toContain('item1');
    expect(output).toContain('item2');
  });

  test('ordered list items are present in output', async () => {
    const output = await render('1. first\n2. second\n', config);
    expect(output).toContain('first');
    expect(output).toContain('second');
  });

  test('link text is present in output', async () => {
    const output = await render('[click here](http://example.com)\n', config);
    expect(output).toContain('click here');
  });

  test('blockquote text is present in output', async () => {
    const output = await render('> quoted text\n', config);
    expect(output).toContain('quoted text');
  });

  test('code block content is preserved in output', async () => {
    const output = await render('```\ncode here\n```\n', config);
    expect(output).toContain('code here');
  });

  test('table content is present in output', async () => {
    const output = await render('| A | B |\n|---|---|\n| 1 | 2 |\n', config);
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('1');
    expect(output).toContain('2');
  });

  test('thematic break produces non-empty output', async () => {
    const output = await render('---\n', config);
    expect(output.trim().length).toBeGreaterThan(0);
  });

  // --- Anti-false-positive ---

  test('anti-false-positive: heading text actually in output (empty string fails)', async () => {
    const output = await render('# Test Heading\n', config);
    expect(output).toContain('Test Heading');
    expect(output.length).toBeGreaterThan(0);
  });
});
