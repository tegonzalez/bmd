import { test, expect, describe } from 'bun:test';
import { resolveWidth } from '../../src/cli/flags.ts';

describe('resolveWidth', () => {
  test('returns process.stdout.columns when no flag set and columns defined', () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 100, configurable: true });
    try {
      expect(resolveWidth({})).toBe(100);
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
    }
  });

  test('returns parsed integer when --width 80 is passed', () => {
    expect(resolveWidth({ width: '80' })).toBe(80);
  });

  test('returns parsed integer when --width 120 is passed', () => {
    expect(resolveWidth({ width: '120' })).toBe(120);
  });

  test('returns 80 as fallback when columns is undefined and no flag', () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    try {
      expect(resolveWidth({})).toBe(80);
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
    }
  });

  test('--width flag takes priority over process.stdout.columns', () => {
    expect(resolveWidth({ width: '42' })).toBe(42);
  });
});
