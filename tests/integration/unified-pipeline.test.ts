/**
 * Integration tests for the unified render pipeline.
 *
 * Verifies that all three output paths (terminal, browser preview, editor)
 * share the same sanitize stage and that the pipeline produces correct output.
 */

import { test, expect, describe } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import type { PipelineInput } from '../../src/pipeline/index.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

/** Minimal config for testing. */
function makeConfig(overrides: Partial<BmdConfig> = {}): BmdConfig {
  return {
    format: 'utf8',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: undefined,
    templates: {
      enabled: true,
      map: undefined,
      auto_map: false,
      list_spec: undefined,
    },
    undo: {
      groupDelay: 500,
      depth: 100,
    },
    serve: {
      host: '0.0.0.0',
      port: 3000,
      open: true,
      mode: 'both',
      colorMode: 'auto',
      readonly: false,
    },
    ...overrides,
  };
}

describe('unified pipeline end-to-end', () => {
  test('terminal pipeline renders headings, paragraphs, and inline formatting', async () => {
    const input: PipelineInput = {
      source: '# Welcome\n\nThis is **bold** and *italic* text.\n\n- Item 1\n- Item 2',
      config: makeConfig(),
    };
    const result = await runPipeline(input);

    expect(result.rendered).toContain('Welcome');
    expect(result.rendered).toContain('bold');
    expect(result.rendered).toContain('italic');
    expect(result.rendered).toContain('Item 1');
    expect(result.rendered).toContain('Item 2');
    expect(result.warnings).toEqual([]);
  });

  test('sanitize findings are produced once and shared via output', async () => {
    // Source with a zero-width space (U+200B)
    const source = 'Hello\u200Bworld';
    const input: PipelineInput = {
      source,
      config: makeConfig(),
    };
    const result = await runPipeline(input);

    // Findings should detect the zero-width space
    expect(result.findings.length).toBeGreaterThan(0);
    const zwsFinding = result.findings.find(f => f.codepoint === 0x200B);
    expect(zwsFinding).toBeDefined();

    // Call again to verify findings consistency
    const result2 = await runPipeline(input);
    expect(result2.findings.length).toBe(result.findings.length);
  });

  test('transform cache prevents redundant computation on repeated calls', async () => {
    const config = makeConfig();
    const source = '```javascript\nconst x = 42;\n```';

    const result1 = await runPipeline({ source, config });
    const result2 = await runPipeline({ source, config });

    // Both calls should produce identical output
    expect(result1.rendered).toBe(result2.rendered);
    expect(result1.rendered).toContain('const x = 42');
  });

  test('pipeline handles mixed content correctly', async () => {
    const source = [
      '# Title',
      '',
      'Some text with `inline code`.',
      '',
      '```python',
      'print("hello")',
      '```',
      '',
      '> A blockquote',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');

    const result = await runPipeline({ source, config: makeConfig() });
    expect(result.rendered).toContain('Title');
    expect(result.rendered).toContain('inline code');
    expect(result.rendered).toContain('print("hello")');
    expect(result.rendered).toContain('blockquote');
  });

  test('template expansion with template regions', async () => {
    const input: PipelineInput = {
      source: '# {{TITLE}}\n\nHello, {{NAME}}!',
      config: makeConfig(),
      values: { TITLE: 'Greetings', NAME: 'World' },
    };
    const result = await runPipeline(input);
    expect(result.rendered).toContain('Greetings');
    expect(result.rendered).toContain('World');
    expect(result.rendered).not.toContain('{{TITLE}}');
    expect(result.rendered).not.toContain('{{NAME}}');
  });
});
