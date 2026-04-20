import { test, expect, describe } from 'bun:test';
import { computeLineByteOffsets, annotateByteRanges } from '../../src/pipeline/byte-range';

describe('computeLineByteOffsets', () => {
  // Test 1: basic two-line string
  test('hello\\nworld -> [0, 6]', () => {
    const offsets = computeLineByteOffsets('hello\nworld');
    expect(offsets).toEqual([0, 6]);
  });

  // Test 2: empty string
  test('empty string -> [0]', () => {
    const offsets = computeLineByteOffsets('');
    expect(offsets).toEqual([0]);
  });

  // Test 3: multi-byte UTF-8 chars produce correct UTF-16 offsets
  test('multi-byte UTF-8 chars produce correct UTF-16 offsets', () => {
    // "cafe\u0301\n" -- e with combining accent (2 code units for base, accent is U+0301 = 1 code unit)
    // "cafe\u0301" is 5 UTF-16 code units, then \n at index 5, next line at 6
    const source = 'caf\u00e9\nworld';
    const offsets = computeLineByteOffsets(source);
    // "cafe" with e-acute (U+00E9) is 1 UTF-16 code unit, so "caf\u00e9" = 4
    // \n at index 4, next line starts at 5
    expect(offsets).toEqual([0, 5]);

    // Emoji (surrogate pair): U+1F600 = 2 UTF-16 code units
    const source2 = '\u{1F600}\nhi';
    const offsets2 = computeLineByteOffsets(source2);
    // \u{1F600} = 2 code units, \n at index 2, next line at 3
    expect(offsets2).toEqual([0, 3]);
  });

  // Test 4: CRLF line endings
  test('CRLF line endings produce correct offsets', () => {
    const source = 'hello\r\nworld\r\nfoo';
    const offsets = computeLineByteOffsets(source);
    // "hello\r\n" = 7 code units, next line at 7
    // "world\r\n" starts at 7, \n at index 12, next line at 13
    expect(offsets).toEqual([0, 7, 14]);
  });

  // Additional: multiple newlines
  test('multiple lines', () => {
    const source = 'a\nb\nc\n';
    const offsets = computeLineByteOffsets(source);
    expect(offsets).toEqual([0, 2, 4, 6]);
  });
});

describe('annotateByteRanges', () => {
  // Helper to create a minimal token-like object
  function makeToken(overrides: Record<string, unknown> = {}): any {
    return {
      type: 'paragraph_open',
      tag: 'p',
      nesting: 0,
      content: '',
      markup: '',
      map: null,
      children: null,
      hidden: false,
      meta: null,
      attrs: null,
      ...overrides,
    };
  }

  // Test 5: assigns token.meta.byteRange for tokens with map field
  test('assigns byteRange for tokens with map field', () => {
    const source = 'hello\nworld\nfoo';
    const tokens = [
      makeToken({ type: 'paragraph_open', map: [0, 1] }),
      makeToken({ type: 'inline', map: [0, 1], content: 'hello', children: [
        makeToken({ type: 'text', content: 'hello' }),
      ]}),
      makeToken({ type: 'paragraph_close', nesting: -1 }),
      makeToken({ type: 'paragraph_open', map: [1, 2] }),
      makeToken({ type: 'inline', map: [1, 2], content: 'world', children: [
        makeToken({ type: 'text', content: 'world' }),
      ]}),
      makeToken({ type: 'paragraph_close', nesting: -1 }),
    ];
    annotateByteRanges(tokens, source);

    // First paragraph: lines 0-1 -> offsets 0 to 5 (before newline)
    expect(tokens[0]!.meta.byteRange).toEqual([0, 5]);
    // Second paragraph: lines 1-2 -> offsets 6 to 11 (bMarks[2]-1 = 12-1 = 11)
    expect(tokens[3]!.meta.byteRange).toEqual([6, 11]);
  });

  // Test 6: skips tokens without map field
  test('skips tokens without map field (no crash)', () => {
    const source = 'hello';
    const tokens = [
      makeToken({ type: 'paragraph_close', map: null }),
    ];
    annotateByteRanges(tokens, source);
    expect(tokens[0]!.meta).toBeNull();
  });

  // Test 7: processes inline children with cursor-based position recovery
  test('processes inline children with cursor-based positions', () => {
    const source = 'hello world';
    const textChild = makeToken({ type: 'text', content: 'hello world' });
    const tokens = [
      makeToken({ type: 'paragraph_open', map: [0, 1] }),
      makeToken({
        type: 'inline',
        map: [0, 1],
        content: 'hello world',
        children: [textChild],
      }),
      makeToken({ type: 'paragraph_close', nesting: -1 }),
    ];
    annotateByteRanges(tokens, source);

    // inline token should have byteRange
    expect(tokens[1]!.meta.byteRange).toEqual([0, 11]);
    // text child should also have byteRange
    expect(textChild.meta.byteRange).toEqual([0, 11]);
  });

  // Test 8: inline children get correct byte ranges with strong/em/code markup
  test('inline children with strong/em/code markup get correct byte ranges', () => {
    const source = '**bold** and `code`';
    const strongOpen = makeToken({ type: 'strong_open', markup: '**', nesting: 1 });
    const boldText = makeToken({ type: 'text', content: 'bold' });
    const strongClose = makeToken({ type: 'strong_close', markup: '**', nesting: -1 });
    const plainText = makeToken({ type: 'text', content: ' and ' });
    const codeInline = makeToken({ type: 'code_inline', content: 'code', markup: '`' });

    const tokens = [
      makeToken({ type: 'paragraph_open', map: [0, 1] }),
      makeToken({
        type: 'inline',
        map: [0, 1],
        content: '**bold** and `code`',
        children: [strongOpen, boldText, strongClose, plainText, codeInline],
      }),
      makeToken({ type: 'paragraph_close', nesting: -1 }),
    ];
    annotateByteRanges(tokens, source);

    // strong_open: ** at position 0-2
    expect(strongOpen.meta.byteRange).toEqual([0, 2]);
    // bold text: "bold" at position 2-6
    expect(boldText.meta.byteRange).toEqual([2, 6]);
    // strong_close: ** at position 6-8
    expect(strongClose.meta.byteRange).toEqual([6, 8]);
    // " and " at position 8-13
    expect(plainText.meta.byteRange).toEqual([8, 13]);
    // code_inline: `code` at position 13-19 (including backticks)
    expect(codeInline.meta.byteRange).toEqual([13, 19]);
  });

  // Edge case: last line (map extends to end)
  test('last block token extends to source.length', () => {
    const source = 'only line';
    const tokens = [
      makeToken({ type: 'paragraph_open', map: [0, 1] }),
    ];
    annotateByteRanges(tokens, source);
    expect(tokens[0]!.meta.byteRange).toEqual([0, 9]);
  });
});
