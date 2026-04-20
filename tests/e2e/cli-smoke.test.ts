import { test, expect, describe } from 'bun:test';
import { getRuntime } from '../../src/runtime/index.ts';
import { bmdCliPrefix } from './cli-spawn.ts';

describe('CLI smoke tests', () => {
  const rt = getRuntime();

  test('render --help prints help and exits 0', async () => {
    const proc = rt.spawn([...bmdCliPrefix(), 'render', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout!).text();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('render');
  });

  test('bmd with no args shows available subcommands', async () => {
    const proc = rt.spawn([...bmdCliPrefix()], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout!).text();
    const stderr = await new Response(proc.stderr!).text();
    const output = stdout + stderr;
    expect(output).toContain('render');
    expect(output).toContain('info');
    expect(output).toContain('map');
    expect(output).toContain('serve');
  });

  test('dependency imports work (smoke test)', async () => {
    // Verify all dependencies are importable
    const citty = await import('citty');
    expect(citty.defineCommand).toBeDefined();

    const chalk = await import('chalk');
    expect(chalk.default).toBeDefined();

    const stringWidth = await import('string-width');
    expect(stringWidth.default).toBeDefined();

    const wrapAnsi = await import('wrap-ansi');
    expect(wrapAnsi.default).toBeDefined();

    const stripAnsi = await import('strip-ansi');
    expect(stripAnsi.default).toBeDefined();
  });
});
