import { describe, test, expect } from 'bun:test';
import { shouldPage } from '../../src/pager/index.ts';

describe('shouldPage', () => {
  test('returns false when pager mode is never', () => {
    expect(shouldPage(100, 24, true, 'never')).toBe(false);
  });

  test('returns true when pager mode is always', () => {
    expect(shouldPage(5, 24, true, 'always')).toBe(true);
  });

  test('returns false when line count is less than terminal height (auto mode)', () => {
    expect(shouldPage(10, 24, true, 'auto')).toBe(false);
  });

  test('returns true when line count exceeds terminal height and isTTY is true (auto mode)', () => {
    expect(shouldPage(50, 24, true, 'auto')).toBe(true);
  });

  test('returns false when isTTY is false even if line count exceeds height (auto mode)', () => {
    expect(shouldPage(50, 24, false, 'auto')).toBe(false);
  });
});
