import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');

describe('render-stdin (TERM-02)', () => {
  test('echo "# Hello" | bmd ascii - exits 0 and stdout contains "Hello"', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', '-', '--no-ansi'], {
      stdin: new TextEncoder().encode('# Hello\n'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Hello');
  });

  test('echo "# Hello" | bmd utf8 - exits 0 and stdout contains "Hello"', async () => {
    const proc = Bun.spawn(['bun', CLI, 'utf8', '-', '--no-ansi'], {
      stdin: new TextEncoder().encode('# Hello\n'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Hello');
  });
});
