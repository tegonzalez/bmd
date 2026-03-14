import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const FIXTURE = resolve(import.meta.dir, '../fixtures/basic.md');

describe('pager behavior (TERM-05)', () => {
  test('short output to non-TTY does not invoke pager (output appears on stdout)', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Heading 1');
  });

  test('--no-pager flag works (output goes to stdout even for long content)', async () => {
    // Generate long content
    const longContent = Array.from({ length: 100 }, (_, i) => `## Section ${i}\n\nParagraph ${i} with some content.\n`).join('\n');

    const proc = Bun.spawn(['bun', CLI, 'ascii', '-', '--no-pager', '--no-ansi'], {
      stdin: new TextEncoder().encode(longContent),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Section 0');
    expect(stdout).toContain('Section 99');
  });

  test('pipe output goes to stdout without paging (non-TTY behavior)', async () => {
    // When not a TTY (which is the case in tests), output should go directly to stdout
    const proc = Bun.spawn(['bun', CLI, 'ascii', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    // Verify complete output was received (not truncated by pager)
    expect(stdout).toContain('Heading 1');
    expect(stdout).toContain('Left');
  });
});
