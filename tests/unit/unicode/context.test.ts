import { test, expect, describe } from 'bun:test';
import { scanUnicode } from '../../../src/unicode/scanner';

describe('context pass-through (UNIC-06)', () => {
  // ─── Emoji ZWJ Pass-Through ───

  describe('emoji ZWJ sequences', () => {
    test('ZWJ between two emoji chars returns NO finding for the ZWJ', () => {
      // Family emoji: man + ZWJ + woman
      const source = '\u{1F468}\u200D\u{1F469}';
      const findings = scanUnicode(source);
      const zwjFindings = findings.filter(f => f.category === 'zero-width');
      expect(zwjFindings.length).toBe(0);
    });

    test('ZWJ in Latin context (not between emoji) DOES return a finding', () => {
      const source = 'pass\u200Dword';
      const findings = scanUnicode(source);
      const zwjFindings = findings.filter(f => f.category === 'zero-width');
      expect(zwjFindings.length).toBe(1);
      expect(zwjFindings[0]!.glyph).toBe('\u2295'); // ⊕
    });
  });

  // ─── ZWNJ Pass-Through ───

  describe('ZWNJ in joining scripts', () => {
    test('ZWNJ between joining-script chars returns NO finding', () => {
      // Arabic: ba + ZWNJ + ta
      const source = '\u0628\u200C\u062A';
      const findings = scanUnicode(source);
      const zwnjFindings = findings.filter(f => f.category === 'zero-width');
      expect(zwnjFindings.length).toBe(0);
    });

    test('ZWNJ in Latin context DOES return a finding', () => {
      const source = 'pass\u200Cword';
      const findings = scanUnicode(source);
      const zwnjFindings = findings.filter(f => f.category === 'zero-width');
      expect(zwnjFindings.length).toBe(1);
    });
  });

  // ─── VS on Emoji Base Pass-Through ───

  describe('variation selector on emoji base', () => {
    test('VS16 after emoji base returns NO finding', () => {
      // Heart + VS16 (emoji presentation)
      const source = '\u2764\uFE0F';
      const findings = scanUnicode(source);
      const vsFindings = findings.filter(f => f.category === 'variation-sel');
      expect(vsFindings.length).toBe(0);
    });

    test('VS on non-emoji char DOES return a finding', () => {
      const source = 'A\uFE00';
      const findings = scanUnicode(source);
      const vsFindings = findings.filter(f => f.category === 'variation-sel');
      expect(vsFindings.length).toBe(1);
    });
  });

  // ─── CJK Ideographic Space Pass-Through ───

  describe('ideographic space in CJK context', () => {
    test('U+3000 between CJK chars returns NO finding', () => {
      // Japanese: ka + ideographic space + ki
      const source = '\u304B\u3000\u304D';
      const findings = scanUnicode(source);
      const wsFindings = findings.filter(f => f.category === 'whitespace');
      expect(wsFindings.length).toBe(0);
    });

    test('U+3000 in Latin context DOES return a finding', () => {
      const source = 'hello\u3000world';
      const findings = scanUnicode(source);
      const wsFindings = findings.filter(f => f.category === 'whitespace');
      expect(wsFindings.length).toBe(1);
    });
  });

  // ─── BOM Pass-Through ───

  describe('BOM at offset 0', () => {
    test('BOM at offset 0 returns NO finding', () => {
      const source = '\uFEFF' + 'hello';
      const findings = scanUnicode(source);
      const bomFindings = findings.filter(f =>
        f.category === 'zero-width' && f.tooltip.includes('Byte Order Mark')
      );
      expect(bomFindings.length).toBe(0);
    });

    test('BOM at offset > 0 DOES return a finding', () => {
      const source = 'hello' + '\uFEFF' + 'world';
      const findings = scanUnicode(source);
      const bomFindings = findings.filter(f => f.category === 'zero-width');
      expect(bomFindings.length).toBe(1);
    });
  });

  // ─── TAB/LF/CR Never Flagged ───

  describe('TAB, LF, CR never flagged', () => {
    test('TAB is never flagged', () => {
      const findings = scanUnicode('hello\tworld');
      expect(findings.length).toBe(0);
    });

    test('LF is never flagged', () => {
      const findings = scanUnicode('hello\nworld');
      expect(findings.length).toBe(0);
    });

    test('CR is never flagged', () => {
      const findings = scanUnicode('hello\rworld');
      expect(findings.length).toBe(0);
    });
  });
});
