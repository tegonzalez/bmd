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

describe('render-stdin (TERM-02)', () => {
  test('ascii stdin "# Hello" renders and output contains "Hello"', async () => {
    const config = makeConfig({ format: 'ascii' });
    const result = await runPipeline({ source: '# Hello\n', config });
    expect(result.rendered).toContain('Hello');
  });

  test('utf8 stdin "# Hello" renders and output contains "Hello"', async () => {
    const config = makeConfig({ format: 'utf8' });
    const result = await runPipeline({ source: '# Hello\n', config });
    expect(result.rendered).toContain('Hello');
  });
});
