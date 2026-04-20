/**
 * Template region marking tests.
 *
 * expandTemplateWithRegions wraps template replacements in binary-safe
 * region markers and produces RegionMap[] tracking original and expanded positions.
 *
 * TDD RED: Tests written first, implementation follows.
 */

import { test, expect, describe } from 'bun:test';
import { expandTemplateWithRegions } from '../../src/pipeline/template-regions';
import { decodeRegions } from '../../src/pipeline/region-marker';

describe('expandTemplateWithRegions', () => {
  test('wraps each replacement in region markers', () => {
    const result = expandTemplateWithRegions('Hello {{name}}!', { name: 'World' });

    expect(result.warnings).toEqual([]);
    // The output should contain region markers around "World"
    // After decoding, we should get back "Hello World!"
    const decoded = decodeRegions(result.output);
    expect(decoded.cleanSource).toBe('Hello World!');
    // The raw output should NOT equal the clean source (markers present)
    expect(result.output).not.toBe('Hello World!');
  });

  test('RegionMap[] tracks original and expanded byte ranges for each replacement', () => {
    const source = 'Hello {{name}}!';
    const result = expandTemplateWithRegions(source, { name: 'World' });

    expect(result.regions).toHaveLength(1);
    const region = result.regions[0]!;
    expect(region.type).toBe('T');
    expect(region.originalContent).toBe('{{name}}');
    expect(region.expandedContent).toBe('World');
    // Original byte range should point to {{name}} in source
    expect(region.originalByteRange[0]!).toBe(6);  // "Hello " = 6 chars
    expect(region.originalByteRange[1]!).toBe(14); // "Hello {{name}}" = 14 chars
  });

  test('multiple replacements produce multiple RegionMap entries with sequential ids', () => {
    const source = '{{greeting}} {{name}}!';
    const result = expandTemplateWithRegions(source, {
      greeting: 'Hello',
      name: 'World',
    });

    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]!.id).toBe(0);
    expect(result.regions[1]!.id).toBe(1);
    expect(result.regions[0]!.expandedContent).toBe('Hello');
    expect(result.regions[1]!.expandedContent).toBe('World');

    const decoded = decodeRegions(result.output);
    expect(decoded.cleanSource).toBe('Hello World!');
  });

  test('template values with NUL bytes in content are properly escaped in markers', () => {
    const result = expandTemplateWithRegions('X{{val}}Y', {
      val: 'a\x00b',
    });

    expect(result.regions).toHaveLength(1);
    // After decode, NUL bytes should be preserved
    const decoded = decodeRegions(result.output);
    expect(decoded.cleanSource).toBe('Xa\x00bY');
    expect(result.regions[0]!.expandedContent).toBe('a\x00b');
  });

  test('unexpanded templates are still wrapped in region markers for consistent decoration', () => {
    const source = '{{unknown}} stays';
    const result = expandTemplateWithRegions(source, {});

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.templateResolved).toBe(false);
    expect(result.regions[0]!.expandedContent).toBe('{{unknown}}');
    const decoded = decodeRegions(result.output);
    expect(decoded.cleanSource).toBe('{{unknown}} stays');
  });

  test('region-marked source + decodeRegions roundtrip recovers original replacements', () => {
    const source = 'A {{x}} B {{y}} C';
    const result = expandTemplateWithRegions(source, { x: 'foo', y: 'bar' });

    const decoded = decodeRegions(result.output);
    expect(decoded.cleanSource).toBe('A foo B bar C');
    expect(decoded.regions).toHaveLength(2);
    expect(decoded.regions[0]!.expandedContent).toBe('foo');
    expect(decoded.regions[1]!.expandedContent).toBe('bar');
  });

  test('region-marked source survives markdown-exit parse (markers in token content)', () => {
    // Simulate what markdown-exit does: replace NUL with U+FFFD
    const source = 'Hello {{name}}!';
    const result = expandTemplateWithRegions(source, { name: 'World' });

    // After markdown-exit, NUL (\x00) becomes \uFFFD
    const parsedOutput = result.output.replace(/\x00/g, '\uFFFD');

    // The markers should still be detectable (using PARSED_START/END_SENTINEL)
    // At minimum, the content between markers should survive intact
    expect(parsedOutput).toContain('World');
    // The U+FFFD sentinels should be present
    expect(parsedOutput).toContain('\uFFFD');
  });
});

describe('Phase 3 TODO: position-based template region assembly', () => {
  test.skip('marks a later replacement instead of matching identical literal text first', () => {
    const source = '{{A}} foo {{B}}';
    const result = expandTemplateWithRegions(source, { A: 'x', B: 'foo' });
    const decoded = decodeRegions(result.output);

    expect(decoded.cleanSource).toBe('x foo foo');
    expect(result.regions[1]!.originalContent).toBe('{{B}}');
    expect(result.regions[1]!.expandedByteRange).toEqual([6, 9]);
  });

  test.skip('keeps adjacent duplicate replacement spans in source order', () => {
    const source = '{{A}}{{B}}';
    const result = expandTemplateWithRegions(source, { A: 'same', B: 'same' });

    expect(result.regions[0]!.expandedByteRange).toEqual([0, 4]);
    expect(result.regions[1]!.expandedByteRange).toEqual([4, 8]);
  });

  test.skip('tracks a null substitution as a zero-length range after whitespace compression', () => {
    const source = 'A {{X}} B';
    const result = expandTemplateWithRegions(source, { X: null });
    const decoded = decodeRegions(result.output);

    expect(decoded.cleanSource).toBe('A B');
    expect(result.regions[0]!.expandedByteRange).toEqual([2, 2]);
  });

  test.skip('tracks adjacent empty and null substitutions without pointing at literal whitespace', () => {
    const source = '{{A}} {{B}}';
    const result = expandTemplateWithRegions(source, { A: '', B: null });
    const decoded = decodeRegions(result.output);

    expect(decoded.cleanSource).toBe('');
    expect(result.regions[0]!.expandedByteRange).toEqual([0, 0]);
    expect(result.regions[1]!.expandedByteRange).toEqual([0, 0]);
  });
});
