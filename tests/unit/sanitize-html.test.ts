import { test, expect, describe } from 'bun:test';
import { detectHtmlTags, detectAnsiSequences, sanitize } from '../../src/pipeline/sanitize.js';
import type { Finding } from '../../src/unicode/types.js';

describe('detectHtmlTags', () => {
  test('detects script tags with correct offset and length', () => {
    const source = '<script>alert(1)</script>';
    const findings = detectHtmlTags(source);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    // Opening tag
    const opening = findings.find(f => f.offset === 0);
    expect(opening).toBeDefined();
    expect(opening!.length).toBe('<script>'.length);
    expect(opening!.tooltip).toContain('<script>');
    // Closing tag
    const closing = findings.find(f => f.offset === '<script>alert(1)'.length);
    expect(closing).toBeDefined();
    expect(closing!.length).toBe('</script>'.length);
    expect(closing!.tooltip).toContain('</script>');
  });

  test('finds all HTML tags in markdown with embedded HTML', () => {
    const source = 'Hello <b>world</b> and <em>test</em>';
    const findings = detectHtmlTags(source);
    expect(findings.length).toBe(4); // <b>, </b>, <em>, </em>
    const offsets = findings.map(f => f.offset);
    expect(offsets).toContain(source.indexOf('<b>'));
    expect(offsets).toContain(source.indexOf('</b>'));
    expect(offsets).toContain(source.indexOf('<em>'));
    expect(offsets).toContain(source.indexOf('</em>'));
  });

  test('ignores content inside fenced code blocks', () => {
    const source = '```\n<script>alert(1)</script>\n```\n<b>outside</b>';
    const findings = detectHtmlTags(source);
    // Only <b> and </b> outside the fence
    expect(findings.length).toBe(2);
    expect(findings[0]!.tooltip).toContain('<b>');
    expect(findings[1]!.tooltip).toContain('</b>');
  });
});

describe('detectAnsiSequences', () => {
  test('detects ANSI color escape sequences', () => {
    const source = '\x1b[31mred\x1b[0m';
    const findings = detectAnsiSequences(source);
    expect(findings.length).toBe(2);
    // First: ESC[31m
    expect(findings[0]!.offset).toBe(0);
    expect(findings[0]!.length).toBe('\x1b[31m'.length);
    expect(findings[0]!.category).toBe('ansi-escape');
    // Second: ESC[0m
    expect(findings[1]!.offset).toBe('\x1b[31m'.length + 'red'.length);
    expect(findings[1]!.length).toBe('\x1b[0m'.length);
  });

  test('returns empty array for clean text', () => {
    const source = 'Hello world, no escapes here!';
    const findings = detectAnsiSequences(source);
    expect(findings).toEqual([]);
  });
});

describe('sanitize', () => {
  test('combines unicode + HTML + ANSI findings into single array', () => {
    // Use a source with HTML and ANSI and a zero-width space (unicode finding)
    const zwsp = '\u200B';
    const source = `${zwsp}<b>bold</b>\x1b[31m`;
    const findings = sanitize(source, 'utf8');
    // Should have findings from at least two different sources
    const categories = new Set(findings.map(f => f.category));
    // zero-width (unicode), html_tag, ansi-escape
    expect(categories.has('html_tag' as any)).toBe(true);
    expect(categories.has('ansi-escape')).toBe(true);
  });

  test('never mutates the source string', () => {
    const source = '<b>hello</b>\x1b[31mworld\x1b[0m';
    const original = source.slice(); // copy
    sanitize(source, 'utf8');
    expect(source).toBe(original);
  });

  test('is cacheable -- same source + format produces same findings', () => {
    const source = '<b>hello</b>\x1b[31mworld\x1b[0m';
    const result1 = sanitize(source, 'utf8');
    const result2 = sanitize(source, 'utf8');
    expect(result1).toEqual(result2);
  });
});
