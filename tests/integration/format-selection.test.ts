import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const FIXTURE = resolve(import.meta.dir, '../fixtures/basic.md');

describe('format selection (TERM-06)', () => {
  test('bmd ascii uses ASCII characters (no Unicode box drawing)', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    // ASCII mode should not contain Unicode box drawing characters
    expect(stdout).not.toContain('\u2500'); // horizontal line
    expect(stdout).not.toContain('\u2502'); // vertical line
    expect(stdout).not.toContain('\u250C'); // top-left corner
  });

  test('bmd utf8 uses Unicode characters', async () => {
    const proc = Bun.spawn(['bun', CLI, 'utf8', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    // UTF-8 mode should contain Unicode box drawing for tables/rules
    const hasUnicode = stdout.includes('\u2500') || stdout.includes('\u2502') || stdout.includes('\u2022');
    expect(hasUnicode).toBe(true);
  });
});
