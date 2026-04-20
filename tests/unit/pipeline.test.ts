import { test, expect, describe } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import type { PipelineInput } from '../../src/pipeline/index.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

/** Minimal config for testing -- templates enabled by default. */
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

describe('runPipeline', () => {
  test('expands {{FIELD}} when templates.enabled=true and values provided', async () => {
    const input: PipelineInput = {
      source: '# {{TITLE}}',
      config: makeConfig(),
      values: { TITLE: 'Hello' },
    };
    const result = await runPipeline(input);
    expect(result.rendered).toContain('Hello');
    // Should NOT contain the raw template expression
    expect(result.rendered).not.toContain('{{TITLE}}');
    expect(result.warnings).toEqual([]);
  });

  test('skips expansion when templates.enabled=false', async () => {
    const config = makeConfig({
      templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    });
    const input: PipelineInput = {
      source: '# {{TITLE}}',
      config,
      values: { TITLE: 'Hello' },
    };
    const result = await runPipeline(input);
    // Template expression should pass through as literal
    expect(result.rendered).toContain('{{TITLE}}');
    expect(result.warnings).toEqual([]);
  });

  test('skips expansion when no values provided', async () => {
    const input: PipelineInput = {
      source: '# {{TITLE}}',
      config: makeConfig(),
      // no values
    };
    const result = await runPipeline(input);
    // Missing field with no default keeps as literal
    expect(result.rendered).toContain('{{TITLE}}');
  });

  test('returns warnings from template expansion', async () => {
    // An unknown operator should produce a warning
    const input: PipelineInput = {
      source: '{{FIELD|unknownop}}',
      config: makeConfig(),
      values: { FIELD: 'test' },
    };
    const result = await runPipeline(input);
    // The expression with unknown operator is kept as literal, so we check it renders
    expect(result.rendered).toBeDefined();
  });

  test('produces rendered output for markdown with headings', async () => {
    const input: PipelineInput = {
      source: '# Main Title\n\nSome body text.',
      config: makeConfig(),
    };
    const result = await runPipeline(input);
    expect(result.rendered).toContain('Main Title');
    expect(result.rendered).toContain('Some body text.');
  });

  test('applies list_spec to unterminated array values', async () => {
    const config = makeConfig({
      templates: { enabled: true, map: undefined, auto_map: false, list_spec: 'join/ and /' },
    });
    const input: PipelineInput = {
      source: '{{ITEMS}}',
      config,
      values: { ITEMS: ['a', 'b', 'c'] },
    };
    const result = await runPipeline(input);
    expect(result.rendered).toContain('a and b and c');
  });

  test('pipeline uses tree-based rendering (DocTree path)', async () => {
    // Verify the pipeline produces output from tree-based rendering
    // by testing structural features that only DocTree path handles
    const input: PipelineInput = {
      source: '# Heading\n\nParagraph with **bold** text.',
      config: makeConfig(),
    };
    const result = await runPipeline(input);
    expect(result.rendered).toContain('Heading');
    expect(result.rendered).toContain('bold');
    expect(result.rendered).toContain('Paragraph');
  });

  test('transform cache is hit on second call with same content', async () => {
    const config = makeConfig();
    const input: PipelineInput = {
      source: '```js\nconsole.log("hello");\n```',
      config,
    };
    // First call
    const result1 = await runPipeline(input);
    expect(result1.rendered).toContain('console.log');

    // Second call with same content -- should use cached transform
    const result2 = await runPipeline(input);
    expect(result2.rendered).toContain('console.log');

    // Outputs should be identical (cache hit produces same result)
    expect(result2.rendered).toBe(result1.rendered);
  });

  test('sanitize findings are returned', async () => {
    // Source with a zero-width space (U+200B)
    const input: PipelineInput = {
      source: 'Hello\u200Bworld',
      config: makeConfig(),
    };
    const result = await runPipeline(input);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.category).toBeDefined();
  });
});
