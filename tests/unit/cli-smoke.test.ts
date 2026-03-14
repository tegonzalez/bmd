import { test, expect, describe } from 'bun:test';

describe('CLI smoke tests', () => {
  test('ascii --help prints help and exits 0', async () => {
    const proc = Bun.spawn(['bun', 'src/cli/index.ts', 'ascii', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('ascii');
  });

  test('utf8 --help prints help and exits 0', async () => {
    const proc = Bun.spawn(['bun', 'src/cli/index.ts', 'utf8', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('utf8');
  });

  test('bmd with no args shows available subcommands', async () => {
    const proc = Bun.spawn(['bun', 'src/cli/index.ts'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = stdout + stderr;
    expect(output).toContain('ascii');
    expect(output).toContain('utf8');
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
