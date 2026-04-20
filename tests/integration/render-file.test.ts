import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import { getDefaults } from '../../src/theme/defaults.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'utf8',
    width: 80,
    ansiEnabled: false,
    pager: 'never',
    unsafeHtml: false,
    unicode: true,
    filePath: undefined,
    theme: getDefaults(),
    templates: { enabled: false, map: undefined, auto_map: false, list_spec: undefined },
    undo: { groupDelay: 500, depth: 200 },
    serve: { host: '0.0.0.0', port: 3000, open: true, mode: 'both', colorMode: 'auto', readonly: false },
    ...overrides,
  };
}

const BASIC_MD = `# Heading 1

## Heading 2

### Heading 3

This is a paragraph with **bold text**, *italic text*, and ~~strikethrough~~.

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

> Blockquote line 1

---

| Left | Center | Right |
|:-----|:------:|------:|
| a    |   b    |     c |
`;

describe('render-file (TERM-01)', () => {
  test('ascii render produces non-empty output', async () => {
    const config = makeConfig({ format: 'ascii' });
    const result = await runPipeline({ source: BASIC_MD, config });
    expect(result.rendered.length).toBeGreaterThan(0);
  });

  test('utf8 render produces non-empty output', async () => {
    const config = makeConfig({ format: 'utf8' });
    const result = await runPipeline({ source: BASIC_MD, config });
    expect(result.rendered.length).toBeGreaterThan(0);
  });

  test('empty source renders without error', async () => {
    const config = makeConfig({ format: 'ascii' });
    const result = await runPipeline({ source: '', config });
    // Empty source should produce empty or minimal output, not crash
    expect(result.rendered).toBeDefined();
  });

  test('template expansion does not leak region marker bytes', async () => {
    const config = makeConfig({
      format: 'ascii',
      templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
    });
    const result = await runPipeline({
      source: 'Hello {{NAME}}',
      config,
      values: { NAME: 'World' },
    });

    expect(result.rendered).toContain('Hello World');
    expect(result.rendered).not.toContain('\uFFFD');
    expect(result.rendered).not.toContain('\x00');
    expect(result.rendered).not.toContain('\x01');
    expect(result.rendered).not.toContain('\x02');
  });

  test('ascii render with unresolved template fields preserves literal field markers', async () => {
    const config = makeConfig({
      format: 'ascii',
      width: 200,
      templates: { enabled: true, map: undefined, auto_map: false, list_spec: undefined },
    });
    const source = 'Hello {{NAME}}, today is {{DATE}}';
    const result = await runPipeline({ source, config });

    expect(result.rendered).toContain('{{NAME}}');
    expect(result.rendered).toContain('{{DATE}}');
    expect(result.rendered).not.toContain('\uFFFD');
    expect(result.rendered).not.toContain('\x00');
    expect(result.rendered).not.toContain('\x01');
    expect(result.rendered).not.toContain('\x02');
  });
});
