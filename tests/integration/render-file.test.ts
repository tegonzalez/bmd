import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const FIXTURE = resolve(import.meta.dir, '../fixtures/basic.md');

describe('render-file (TERM-01)', () => {
  test('bmd ascii <file> exits 0 and produces non-empty stdout', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('bmd utf8 <file> exits 0 and produces non-empty stdout', async () => {
    const proc = Bun.spawn(['bun', CLI, 'utf8', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('bmd ascii nonexistent.md exits with code 6 and writes diagnostic to stderr', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', 'nonexistent.md'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(6);
    expect(stderr).toContain('File not found');
  });
});
