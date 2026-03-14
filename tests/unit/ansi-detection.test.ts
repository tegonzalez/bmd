import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { resolveAnsiMode } from '../../src/cli/flags.ts';

describe('resolveAnsiMode', () => {
  let originalNoColor: string | undefined;

  beforeEach(() => {
    originalNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
  });

  test('returns true when stdout.isTTY is true and NO_COLOR is unset', () => {
    expect(resolveAnsiMode({}, true)).toBe(true);
  });

  test('returns false when NO_COLOR is set (any value)', () => {
    process.env.NO_COLOR = '';
    expect(resolveAnsiMode({}, true)).toBe(false);
  });

  test('returns false when NO_COLOR is set to "1"', () => {
    process.env.NO_COLOR = '1';
    expect(resolveAnsiMode({}, true)).toBe(false);
  });

  test('returns false when noAnsi flag is true', () => {
    expect(resolveAnsiMode({ noAnsi: true }, true)).toBe(false);
  });

  test('returns false when no-ansi flag is true', () => {
    expect(resolveAnsiMode({ 'no-ansi': true }, true)).toBe(false);
  });

  test('returns true when ansi flag is true even if not TTY', () => {
    expect(resolveAnsiMode({ ansi: true }, false)).toBe(true);
  });

  test('returns true when ansi flag overrides NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    expect(resolveAnsiMode({ ansi: true }, true)).toBe(true);
  });

  test('returns false when not TTY and no flags', () => {
    expect(resolveAnsiMode({}, false)).toBe(false);
  });
});
