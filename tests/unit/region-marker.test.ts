import { test, expect, describe } from 'bun:test';
import {
  encodeRegion,
  decodeRegions,
  START_SENTINEL,
  END_SENTINEL,
} from '../../src/pipeline/region-marker';

describe('Region Marker Constants', () => {
  test('START_SENTINEL is \\x00\\x01', () => {
    expect(START_SENTINEL).toBe('\x00\x01');
  });

  test('END_SENTINEL is \\x00\\x02', () => {
    expect(END_SENTINEL).toBe('\x00\x02');
  });
});

describe('encodeRegion', () => {
  // Test 1: produces correct binary-framed string
  test('produces correct binary-framed string with sentinels, type, id, content', () => {
    const encoded = encodeRegion('hello', 'T', 1);
    // Structure: START_SENTINEL + type(1) + id(2 bytes BE) + START_SENTINEL + content + END_SENTINEL + id(2 bytes BE) + END_SENTINEL
    // id=1 -> \x00\x01 (big-endian)
    const idStr = '\x00\x01';
    const expected = `${START_SENTINEL}T${idStr}${START_SENTINEL}hello${END_SENTINEL}${idStr}${END_SENTINEL}`;
    expect(encoded).toBe(expected);
  });

  // Test 7: Region id uses 2-byte big-endian encoding
  test('id 256 encodes as \\x01\\x00 big-endian', () => {
    const encoded = encodeRegion('x', 'U', 256);
    // id=256 -> high=1, low=0 -> \x01\x00
    const idStr = '\x01\x00';
    const expected = `${START_SENTINEL}U${idStr}${START_SENTINEL}x${END_SENTINEL}${idStr}${END_SENTINEL}`;
    expect(encoded).toBe(expected);
  });

  // Test 3: NUL bytes in content are escaped
  test('NUL bytes in content are escaped (\\x00 -> \\x00\\x00)', () => {
    const encoded = encodeRegion('a\x00b', 'T', 1);
    // The content should have \x00 escaped to \x00\x00
    // So 'a\x00b' becomes 'a\x00\x00b' inside the encoded string
    expect(encoded).toContain('a\x00\x00b');
    // And the original single NUL should NOT appear as-is (it's escaped)
    // (tricky to test directly since escaped form also contains \x00)
  });
});

describe('decodeRegions', () => {
  // Test 2: encode then decode roundtrip
  test('roundtrip: encode then decode recovers original content and metadata', () => {
    const content = 'hello world';
    const encoded = encodeRegion(content, 'T', 1);
    const result = decodeRegions(encoded);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.type).toBe('T');
    expect(result.regions[0]!.id).toBe(1);
    expect(result.regions[0]!.expandedContent).toBe(content);
    expect(result.cleanSource).toBe(content);
  });

  // Test 3: NUL byte roundtrip
  test('NUL bytes in content survive encode/decode roundtrip', () => {
    const content = 'a\x00b';
    const encoded = encodeRegion(content, 'H', 5);
    const result = decodeRegions(encoded);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.expandedContent).toBe(content);
    expect(result.cleanSource).toBe(content);
  });

  // Test 4: Multiple regions decoded correctly
  test('multiple regions in one string are all decoded correctly', () => {
    const enc1 = encodeRegion('alpha', 'T', 1);
    const enc2 = encodeRegion('beta', 'U', 2);
    const combined = `before ${enc1} middle ${enc2} after`;
    const result = decodeRegions(combined);

    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]!.id).toBe(1);
    expect(result.regions[0]!.type).toBe('T');
    expect(result.regions[0]!.expandedContent).toBe('alpha');
    expect(result.regions[1]!.id).toBe(2);
    expect(result.regions[1]!.type).toBe('U');
    expect(result.regions[1]!.expandedContent).toBe('beta');
    expect(result.cleanSource).toBe('before alpha middle beta after');
  });

  // Test 6: cleanSource has all markers stripped
  test('cleanSource has all markers stripped', () => {
    const encoded = encodeRegion('replaced', 'A', 10);
    const source = `prefix ${encoded} suffix`;
    const result = decodeRegions(source);

    expect(result.cleanSource).toBe('prefix replaced suffix');
    // No sentinel bytes in cleanSource
    expect(result.cleanSource).not.toContain('\x00');
    expect(result.cleanSource).not.toContain('\x01');
    expect(result.cleanSource).not.toContain('\x02');
  });

  // Test 8: Empty content region roundtrips
  test('empty content region roundtrips correctly', () => {
    const encoded = encodeRegion('', 'T', 0);
    const result = decodeRegions(encoded);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.expandedContent).toBe('');
    expect(result.regions[0]!.id).toBe(0);
    expect(result.cleanSource).toBe('');
  });

  // Byte range tracking
  test('regions have correct byte ranges in marked and clean source', () => {
    const enc = encodeRegion('XY', 'T', 1);
    const source = `AB${enc}CD`;
    const result = decodeRegions(source);

    expect(result.regions).toHaveLength(1);
    // In the expanded (marked) source, the region content starts after the header
    expect(result.regions[0]!.expandedByteRange).toBeDefined();
    // In the clean source, "XY" is at position 2-4 (after "AB")
    expect(result.regions[0]!.originalByteRange).toEqual([2, 4]);
  });
});

describe('Region markers survive markdown-exit parsing', () => {
  // Test 5: markers survive parse() -- NUL bytes become \uFFFD in markdown-exit
  // CommonMark spec replaces NUL (U+0000) with U+FFFD. The SOH (\x01) and STX (\x02)
  // bytes survive intact, so the marker structure is recoverable by checking for
  // \uFFFD\x01 (start) and \uFFFD\x02 (end) after parsing.
  test('markers survive markdown-exit .parse() with NUL -> FFFD normalization', async () => {
    let MarkdownIt: any;
    try {
      MarkdownIt = (await import('markdown-exit')).default;
    } catch {
      console.warn('markdown-exit not available, skipping integration test');
      return;
    }

    const md = new MarkdownIt();
    const marker = encodeRegion('replaced', 'T', 1);

    // After parsing, NUL (\x00) becomes \uFFFD per CommonMark spec.
    // The parsed sentinel becomes \uFFFD\x01 (start) and \uFFFD\x02 (end).
    const PARSED_START = '\uFFFD\x01';
    const PARSED_END = '\uFFFD\x02';

    // Test in paragraph
    const paraSource = `Hello ${marker} world`;
    const paraTokens = md.parse(paraSource, {});
    const inlineToken = paraTokens.find((t: any) => t.type === 'inline');
    expect(inlineToken).toBeDefined();
    expect(inlineToken.content).toContain(PARSED_START);
    expect(inlineToken.content).toContain(PARSED_END);
    // The actual content 'replaced' should still be present
    expect(inlineToken.content).toContain('replaced');

    // Test in heading
    const headingSource = `# Heading ${marker}`;
    const headingTokens = md.parse(headingSource, {});
    const headingInline = headingTokens.find((t: any) => t.type === 'inline');
    expect(headingInline).toBeDefined();
    expect(headingInline.content).toContain(PARSED_START);

    // Test in code block (fence)
    const fenceSource = '```\n' + marker + '\n```';
    const fenceTokens = md.parse(fenceSource, {});
    const fenceToken = fenceTokens.find((t: any) => t.type === 'fence');
    expect(fenceToken).toBeDefined();
    expect(fenceToken.content).toContain(PARSED_START);
  });
});
