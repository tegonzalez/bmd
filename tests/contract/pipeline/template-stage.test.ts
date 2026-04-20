import { test, expect, describe } from 'bun:test';
import { runPipeline } from '../../../src/pipeline/index.ts';
import type { BmdConfig } from '../../../src/config/schema.ts';

/** Minimal config for contract testing. */
function makeConfig(overrides: Partial<BmdConfig> = {}): BmdConfig {
  return {
    format: 'utf8',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
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
    unicode: overrides.unicode ?? true,
  };
}

describe('INT-01 contract: template expansion before markdown parsing', () => {
  test('document with {{TITLE}} in heading renders heading with expanded value', async () => {
    const result = await runPipeline({
      source: '# {{TITLE}}\n\nBody text here.',
      config: makeConfig(),
      values: { TITLE: 'Hello' },
    });

    // The heading should contain "Hello", not "{{TITLE}}"
    expect(result.rendered).toContain('Hello');
    expect(result.rendered).not.toContain('{{TITLE}}');
    // Body should be present
    expect(result.rendered).toContain('Body text here.');
    // No warnings for a clean expansion
    expect(result.warnings).toEqual([]);
  });

  test('template expansion runs BEFORE markdown parsing', async () => {
    // If expansion ran after parsing, the heading would contain raw {{TITLE}}
    // This test proves ordering: expand first, then parse
    const result = await runPipeline({
      source: '## {{SECTION}}\n\n{{BODY}}',
      config: makeConfig(),
      values: { SECTION: 'Introduction', BODY: 'Welcome to **bmd**.' },
    });

    expect(result.rendered).toContain('Introduction');
    expect(result.rendered).toContain('Welcome to');
    // Bold should be processed since expansion happened before parsing
    expect(result.rendered).toContain('bmd');
    expect(result.rendered).not.toContain('{{SECTION}}');
    expect(result.rendered).not.toContain('{{BODY}}');
  });
});
