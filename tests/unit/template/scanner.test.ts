import { test, expect, describe } from 'bun:test';
import { findSkipRegions, findExpressionRanges } from '../../../src/template/scanner';
import type { SkipRegion } from '../../../src/template/types';

describe('findSkipRegions', () => {
  describe('fenced code blocks (backtick)', () => {
    test('triple backtick block is a skip region', () => {
      const src = '# Title\n```\ncode {{FIELD}}\n```\nafter';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      // Region covers from start of opening fence line to end of closing fence line
      expect(regions[0]!.start).toBe(8); // position of first ```
      expect(regions[0]!.end).toBe(31); // after closing ```\n
    });

    test('backtick fence with info string', () => {
      const src = '```typescript\ncode\n```\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(regions[0]!.start).toBe(0);
    });

    test('backtick fence with optional indent (up to 3 spaces)', () => {
      const src = '   ```\ncode\n   ```\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
    });

    test('4-space indent is NOT a fenced code block opener', () => {
      const src = '    ```\ncode\n    ```\n';
      const regions = findSkipRegions(src);
      // This should NOT produce a fenced code block skip region
      // (though it may produce an indented code block)
      const fencedRegion = regions.find(
        (r) => src.slice(r.start, r.end).includes('```'),
      );
      // The 4-space indented ``` should not be detected as a fenced block
      // It would be an indented code block instead
      expect(
        fencedRegion === undefined ||
          src.slice(fencedRegion.start, fencedRegion.end).startsWith('    '),
      ).toBe(true);
    });

    test('closing fence must be same-or-greater length', () => {
      const src = '````\ncode\n````\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
    });

    test('shorter closing fence does not close block', () => {
      const src = '````\ncode\n```\nmore code\n````\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      // The region should span to the matching ```` not the shorter ```
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain(
        'more code',
      );
    });

    test('unclosed fenced block extends to end of document', () => {
      const src = '```\ncode\nmore code';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(regions[0]!.end).toBe(src.length);
    });
  });

  describe('fenced code blocks (tilde)', () => {
    test('tilde fence is a skip region', () => {
      const src = '~~~\ncode {{FIELD}}\n~~~\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
    });

    test('tilde closing must match tilde (not backtick)', () => {
      const src = '~~~\ncode\n```\nmore\n~~~\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      // The ``` should not close the ~~~ fence
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain('more');
    });

    test('backtick closing must match backtick (not tilde)', () => {
      const src = '```\ncode\n~~~\nmore\n```\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain('more');
    });
  });

  describe('inline code spans', () => {
    test('single backtick inline code is a skip region', () => {
      const src = 'text `code {{FIELD}}` after';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toBe(
        '`code {{FIELD}}`',
      );
    });

    test('double backtick inline code matches double backtick close', () => {
      const src = 'text ``code with ` inside {{FIELD}}`` after';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toBe(
        '``code with ` inside {{FIELD}}``',
      );
    });

    test('unclosed inline code backtick produces no skip region', () => {
      const src = 'text `no close here';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(0);
    });

    test('inline code does not overlap with fenced code blocks', () => {
      const src = '```\ncode with `backtick` inside\n```\n';
      const regions = findSkipRegions(src);
      // Should be 1 region (the fenced block), not separate inline regions
      expect(regions.length).toBe(1);
    });
  });

  describe('indented code blocks', () => {
    test('4+ spaces after blank line is an indented code block', () => {
      const src = 'paragraph\n\n    code line {{FIELD}}\n    more code\n\nafter';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain(
        '    code line {{FIELD}}',
      );
    });

    test('4+ spaces without preceding blank line is NOT indented code', () => {
      const src = 'paragraph\n    not code\n';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(0);
    });

    test('indented code block continues through blank lines', () => {
      const src = 'text\n\n    code1\n\n    code2\n\nafter';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain('code1');
      expect(src.slice(regions[0]!.start, regions[0]!.end)).toContain('code2');
    });

    test('indented code at start of document (after implicit blank)', () => {
      const src = '    code at start\n\nafter';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('empty source returns no skip regions', () => {
      expect(findSkipRegions('')).toEqual([]);
    });

    test('source with no code blocks returns no skip regions', () => {
      expect(findSkipRegions('just plain text {{FIELD}}')).toEqual([]);
    });

    test('regions are sorted by start offset', () => {
      const src = 'text `a` middle `b` end';
      const regions = findSkipRegions(src);
      expect(regions.length).toBe(2);
      expect(regions[0]!.start).toBeLessThan(regions[1]!.start);
    });
  });
});

describe('findExpressionRanges', () => {
  test('finds expression outside skip regions', () => {
    const src = 'Hello {{NAME}}, welcome!';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(1);
    expect(ranges[0]!.raw).toBe('NAME');
    expect(ranges[0]!.start).toBe(6);
    expect(ranges[0]!.end).toBe(14); // after }}
  });

  test('excludes expression inside skip region', () => {
    const src = 'text `code {{FIELD}}` after {{VISIBLE}}';
    const skipRegions = findSkipRegions(src);
    const ranges = findExpressionRanges(src, skipRegions);
    expect(ranges.length).toBe(1);
    expect(ranges[0]!.raw).toBe('VISIBLE');
  });

  test('non-greedy matching: two adjacent expressions', () => {
    const src = '{{A}}{{B}}';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(2);
    expect(ranges[0]!.raw).toBe('A');
    expect(ranges[1]!.raw).toBe('B');
  });

  test('multiple expressions on one line', () => {
    const src = '{{A}} and {{B}}';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(2);
    expect(ranges[0]!.raw).toBe('A');
    expect(ranges[1]!.raw).toBe('B');
  });

  test('unclosed {{ is ignored', () => {
    const src = 'text {{ no close here';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(0);
  });

  test('empty source returns no ranges', () => {
    expect(findExpressionRanges('', [])).toEqual([]);
  });

  test('source with no expressions returns no ranges', () => {
    expect(findExpressionRanges('just text', [])).toEqual([]);
  });

  test('expression in fenced code block is excluded', () => {
    const src = '```\n{{HIDDEN}}\n```\n{{VISIBLE}}';
    const skipRegions = findSkipRegions(src);
    const ranges = findExpressionRanges(src, skipRegions);
    expect(ranges.length).toBe(1);
    expect(ranges[0]!.raw).toBe('VISIBLE');
  });

  test('expression in indented code block is excluded', () => {
    const src = 'paragraph\n\n    {{HIDDEN}}\n\n{{VISIBLE}}';
    const skipRegions = findSkipRegions(src);
    const ranges = findExpressionRanges(src, skipRegions);
    expect(ranges.length).toBe(1);
    expect(ranges[0]!.raw).toBe('VISIBLE');
  });

  test('adjacent expressions with no space', () => {
    const src = '{{A}}{{B}}';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(2);
    expect(ranges[0]!.raw).toBe('A');
    expect(ranges[0]!.start).toBe(0);
    expect(ranges[0]!.end).toBe(5);
    expect(ranges[1]!.raw).toBe('B');
    expect(ranges[1]!.start).toBe(5);
    expect(ranges[1]!.end).toBe(10);
  });

  test('expression with spaces and operators in raw', () => {
    const src = '{{ NAME | upper }}';
    const ranges = findExpressionRanges(src, []);
    expect(ranges.length).toBe(1);
    expect(ranges[0]!.raw).toBe(' NAME | upper ');
  });
});
