import { test, expect, describe } from 'bun:test';
import { scanUnicode } from '../../../src/unicode/scanner';

describe('scanUnicode', () => {
  // ─── UNIC-01: AI Watermark Detection ───

  describe('AI watermark codepoints (UNIC-01)', () => {
    test('detects U+E200 as ai-watermark with opener glyph', () => {
      const findings = scanUnicode('test\uE200data');
      const f = findings.find(f => f.category === 'ai-watermark');
      expect(f).toBeDefined();
      expect(f!.offset).toBe(4);
      expect(f!.glyph).toBe('\u231C'); // ⌜
    });

    test('detects U+E201 as ai-watermark with closer glyph', () => {
      const findings = scanUnicode('test\uE201data');
      const f = findings.find(f => f.category === 'ai-watermark');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u231F'); // ⌟
    });

    test('detects U+E202 as ai-watermark with bullet operator glyph (U+2219, not U+00B7)', () => {
      const findings = scanUnicode('test\uE202data');
      const f = findings.find(f => f.category === 'ai-watermark');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2219'); // ∙ bullet operator
    });

    test('detects U+E203-E2FF as ai-watermark with diamond glyph', () => {
      const findings = scanUnicode('test\uE210data');
      const f = findings.find(f => f.category === 'ai-watermark');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u25C7'); // ◇
    });
  });

  // ─── UNIC-02: Zero-Width Detection ───

  describe('zero-width characters (UNIC-02)', () => {
    test('detects ZWSP at correct offset with ␣ glyph', () => {
      const findings = scanUnicode('hello\u200Bworld');
      const f = findings.find(f => f.category === 'zero-width');
      expect(f).toBeDefined();
      expect(f!.offset).toBe(5);
      expect(f!.glyph).toBe('\u2423'); // ␣
    });

    test('detects Word Joiner with ⊹ glyph', () => {
      const findings = scanUnicode('test\u2060data');
      const f = findings.find(f => f.category === 'zero-width');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u22B9'); // ⊹
    });

    test('detects BOM at non-zero offset with ⍊ glyph', () => {
      const findings = scanUnicode('test\uFEFFdata');
      const f = findings.find(f => f.category === 'zero-width');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u234A'); // ⍊
    });

    test('does NOT flag BOM at offset 0', () => {
      const findings = scanUnicode('\uFEFFhello');
      const zw = findings.filter(f => f.category === 'zero-width');
      expect(zw.length).toBe(0);
    });
  });

  // ─── UNIC-03: Bidi Detection ───

  describe('bidi overrides and embeddings (UNIC-03)', () => {
    test('detects RLO + PDF as atomic region', () => {
      const findings = scanUnicode('test\u202Econtent\u202C');
      const bidi = findings.filter(f => f.category === 'bidi');
      expect(bidi.length).toBe(2);
      // RLO
      expect(bidi[0]!.glyph).toBe('\u22B2!'); // ⊲!
      expect(bidi[0]!.isAtomic).toBe(true);
      // PDF
      expect(bidi[1]!.glyph).toBe('\u2298'); // ⊘
      expect(bidi[1]!.isAtomic).toBe(true);
      // Same atomic group
      expect(bidi[0]!.atomicGroupId).toBe(bidi[1]!.atomicGroupId);
    });

    test('detects LRM and RLM', () => {
      const findings = scanUnicode('a\u200Eb\u200Fc');
      const bidi = findings.filter(f => f.category === 'bidi');
      expect(bidi.length).toBe(2);
      expect(bidi[0]!.glyph).toBe('\u22B3'); // ⊳ LRM
      expect(bidi[1]!.glyph).toBe('\u22B2'); // ⊲ RLM
    });
  });

  // ─── C0 Controls ───

  describe('C0 controls', () => {
    test('detects NUL with correct control picture glyph', () => {
      const findings = scanUnicode('test\u0000data');
      const f = findings.find(f => f.category === 'c0-control');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2400'); // ␀
    });

    test('detects ESC (standalone, not ANSI sequence) with ␛ glyph', () => {
      // ESC followed by a non-sequence char (e.g. a letter outside 0x40-0x7E range for Fe sequences)
      // Actually ESC + letter IS an Fe sequence. Use ESC at end of string.
      const findings = scanUnicode('test\u001B');
      const f = findings.find(f => f.category === 'c0-control');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u241B'); // ␛
    });

    test('does NOT flag TAB, LF, or CR', () => {
      const findings = scanUnicode('line1\tvalue\nline2\r');
      expect(findings.length).toBe(0);
    });

    test('detects DEL (U+007F) with ␡ glyph', () => {
      const findings = scanUnicode('test\u007Fdata');
      const f = findings.find(f => f.category === 'c0-control');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2421'); // ␡
    });
  });

  // ─── C1 Controls ───

  describe('C1 controls', () => {
    test('detects C1 control with shared ⌧ glyph', () => {
      const findings = scanUnicode('test\u0085data');
      const f = findings.find(f => f.category === 'c1-control');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2327'); // ⌧
    });
  });

  // ─── Whitespace Lookalikes ───

  describe('whitespace lookalikes', () => {
    test('detects NBSP with ⍽ glyph', () => {
      const findings = scanUnicode('test\u00A0data');
      const f = findings.find(f => f.category === 'whitespace');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u237D'); // ⍽
    });

    test('detects En Space with ␣ glyph', () => {
      const findings = scanUnicode('test\u2002data');
      const f = findings.find(f => f.category === 'whitespace');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2423'); // ␣
    });
  });

  // ─── Variation Selectors ───

  describe('variation selectors', () => {
    test('detects VS1 with ⬡ glyph', () => {
      const findings = scanUnicode('test\uFE00data');
      const f = findings.find(f => f.category === 'variation-sel');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2B21'); // ⬡
    });
  });

  // ─── Deprecated Format Characters ───

  describe('deprecated format characters', () => {
    test('detects U+206A-206F with ⊘ glyph', () => {
      const findings = scanUnicode('test\u206Adata');
      const f = findings.find(f => f.category === 'deprecated');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2298'); // ⊘
    });
  });

  // ─── Noncharacters ───

  describe('noncharacters', () => {
    test('detects U+FFFE with ⊘ glyph', () => {
      const findings = scanUnicode('test\uFFFEdata');
      const f = findings.find(f => f.category === 'noncharacter');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2298'); // ⊘
    });

    test('detects U+FDD0 with ⊘ glyph', () => {
      const findings = scanUnicode('test\uFDD0data');
      const f = findings.find(f => f.category === 'noncharacter');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2298'); // ⊘
    });
  });

  // ─── Separators ───

  describe('line/paragraph separators', () => {
    test('detects U+2028 with ␤ glyph', () => {
      const findings = scanUnicode('test\u2028data');
      const f = findings.find(f => f.category === 'separator');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u2424'); // ␤
    });

    test('detects U+2029 with paragraph glyph', () => {
      const findings = scanUnicode('test\u2029data');
      const f = findings.find(f => f.category === 'separator');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u00B6'); // ¶
    });
  });

  // ─── Tag Characters ───

  describe('tag characters', () => {
    test('detects tag characters with 🏷 glyph', () => {
      // U+E0001 is a supplementary plane char (2 UTF-16 code units)
      const findings = scanUnicode('test' + String.fromCodePoint(0xE0001) + 'data');
      const f = findings.find(f => f.category === 'tag');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\uD83C\uDFF7'); // 🏷
      expect(f!.length).toBe(2); // supplementary plane = 2 UTF-16 units
    });
  });

  // ─── ANSI Escape Sequences ───

  describe('ANSI escape sequences', () => {
    test('detects CSI sequence as single atomic finding', () => {
      const findings = scanUnicode('text\x1b[31mred');
      const f = findings.find(f => f.category === 'ansi-escape');
      expect(f).toBeDefined();
      expect(f!.isAtomic).toBe(true);
      expect(f!.glyph.startsWith('\u241B')).toBe(true); // starts with ␛
      expect(f!.glyph).toContain('[31m');
    });

    test('ANSI sequence over 256 bytes is NOT treated as sequence', () => {
      // Build a very long CSI "sequence" that exceeds 256 bytes
      const longParams = '1'.repeat(260);
      const source = '\x1b[' + longParams + 'm';
      const findings = scanUnicode(source);
      // Should NOT find an ansi-escape finding covering the whole thing
      const ansi = findings.filter(f => f.category === 'ansi-escape');
      // The ESC should fall through as c0-control or short ANSI
      expect(ansi.every(f => f.length <= 256)).toBe(true);
    });
  });

  // ─── Aggregation ───

  describe('aggregation', () => {
    test('5 consecutive tag chars aggregate into single finding with x5', () => {
      const tags = String.fromCodePoint(0xE0041, 0xE0042, 0xE0043, 0xE0044, 0xE0045);
      const findings = scanUnicode('start' + tags + 'end');
      const tagFindings = findings.filter(f => f.category === 'tag');
      expect(tagFindings.length).toBe(1);
      expect(tagFindings[0]!.glyph).toContain('x5');
    });

    test('3 consecutive variation selectors aggregate with x3', () => {
      const vs = '\uFE00\uFE01\uFE02';
      const findings = scanUnicode('test' + vs + 'data');
      const vsFindings = findings.filter(f => f.category === 'variation-sel');
      expect(vsFindings.length).toBe(1);
      expect(vsFindings[0]!.glyph).toContain('x3');
    });

    test('3+ combining marks aggregate into flood notation', () => {
      // Base char 'a' + 5 combining acute accents (U+0301)
      const marks = '\u0301'.repeat(5);
      const findings = scanUnicode('test' + 'a' + marks + 'data');
      const flood = findings.filter(f => f.category === 'combining-flood');
      expect(flood.length).toBe(1);
      expect(flood[0]!.glyph).toContain('x5');
    });

    test('mixed BMP and supplementary VS runs aggregate together', () => {
      // BMP VS + supplementary VS
      const mixed = '\uFE00' + String.fromCodePoint(0xE0100) + '\uFE01';
      const findings = scanUnicode('test' + mixed + 'data');
      const vsFindings = findings.filter(f => f.category === 'variation-sel');
      expect(vsFindings.length).toBe(1);
      expect(vsFindings[0]!.glyph).toContain('x3');
    });
  });

  // ─── UTF-16 Offset Tracking ───

  describe('UTF-16 offset tracking', () => {
    test('supplementary plane chars have correct offsets', () => {
      // U+E0001 is at offset 4, takes 2 UTF-16 code units
      const source = 'test' + String.fromCodePoint(0xE0001) + 'data';
      const findings = scanUnicode(source);
      const f = findings.find(f => f.category === 'tag');
      expect(f).toBeDefined();
      expect(f!.offset).toBe(4);
      expect(f!.length).toBe(2);
    });

    test('offset is correct after supplementary plane chars', () => {
      // Two supplementary chars followed by a BMP invisible char
      const source = String.fromCodePoint(0xE0041) + String.fromCodePoint(0xE0042) + '\u200B';
      const findings = scanUnicode(source);
      const zw = findings.find(f => f.category === 'zero-width');
      expect(zw).toBeDefined();
      expect(zw!.offset).toBe(4); // 2 supplementary chars = 4 UTF-16 units
    });
  });

  // ─── Clean Input ───

  describe('clean input', () => {
    test('pure ASCII text returns no findings', () => {
      const findings = scanUnicode('Hello, world! This is normal text.');
      expect(findings.length).toBe(0);
    });

    test('empty string returns no findings', () => {
      const findings = scanUnicode('');
      expect(findings.length).toBe(0);
    });
  });

  // ─── Annotation Characters ───

  describe('interlinear annotations', () => {
    test('detects annotation anchor', () => {
      const findings = scanUnicode('test\uFFF9data');
      const f = findings.find(f => f.category === 'annotation');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u27E6\u2090\u27E7'); // ⟦ₐ⟧
    });
  });

  // ─── PUA Characters ───

  describe('private use area', () => {
    test('detects BMP PUA with ⟐ glyph', () => {
      const findings = scanUnicode('test\uE000data');
      const f = findings.find(f => f.category === 'pua');
      expect(f).toBeDefined();
      expect(f!.glyph).toBe('\u27D0'); // ⟐
    });
  });
});
