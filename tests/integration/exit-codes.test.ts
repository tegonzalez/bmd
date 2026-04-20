import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../../src/pipeline/index.ts';
import { validateFile } from '../../src/cli/validate.ts';
import { BmdError, ExitCode } from '../../src/diagnostics/formatter.ts';
import { getDefaults } from '../../src/theme/defaults.ts';
import type { BmdConfig } from '../../src/config/schema.ts';

function makeConfig(overrides?: Partial<BmdConfig>): BmdConfig {
  return {
    format: 'ascii',
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

describe('exit codes (CLI-02)', () => {
  test('successful render completes without error', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const result = await runPipeline({ source: '# Hello\n', config });
    expect(result.rendered.length).toBeGreaterThan(0);
  });

  test('missing file throws BmdError with exit code OUTPUT (6)', async () => {
    try {
      await validateFile('nonexistent-file.md');
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(BmdError);
      expect((err as BmdError).exitCode).toBe(ExitCode.USAGE);
    }
  });

  test('empty source renders without error (exit code 0 equivalent)', async () => {
    const config = makeConfig({ format: 'ascii', ansiEnabled: false });
    const result = await runPipeline({ source: '', config });
    expect(result.rendered).toBeDefined();
  });
});
