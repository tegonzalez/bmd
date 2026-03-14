import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const FIXTURE = resolve(import.meta.dir, '../fixtures/basic.md');

describe('elements rendering (TERM-03)', () => {
  let output: string;

  // Run once and cache output
  test('renders basic.md fixture', async () => {
    const proc = Bun.spawn(['bun', CLI, 'ascii', FIXTURE, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(output.length).toBeGreaterThan(0);
  });

  test('headings are present', () => {
    expect(output).toContain('Heading 1');
    expect(output).toContain('Heading 2');
    expect(output).toContain('Heading 3');
  });

  test('bold text renders', () => {
    expect(output).toContain('bold text');
  });

  test('lists render with markers', () => {
    // Unordered list bullets
    expect(output).toContain('Unordered item 1');
    expect(output).toContain('Unordered item 2');
    // Ordered list numbers
    expect(output).toContain('1.');
    expect(output).toContain('2.');
  });

  test('code blocks render with indented content', async () => {
    const codeFixture = resolve(import.meta.dir, '../fixtures/code-blocks.md');
    const proc = Bun.spawn(['bun', CLI, 'ascii', codeFixture, '--no-ansi'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const codeOutput = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    // Code blocks are indented with 4 spaces
    expect(codeOutput).toContain('    ');
  });

  test('tables render with border characters', () => {
    // ASCII table uses + and | and -
    expect(output).toContain('|');
    expect(output).toContain('+');
    expect(output).toContain('Left');
    expect(output).toContain('Center');
    expect(output).toContain('Right');
  });

  test('blockquotes render with quote bar character', () => {
    expect(output).toContain('| Blockquote');
  });
});
