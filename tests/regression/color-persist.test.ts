/**
 * Regression tests for color mode persistence.
 *
 * Verifies that:
 * - toggleColorMode saves to localStorage
 * - initColorMode reads from localStorage when saved value exists
 * - initColorMode uses initial param when localStorage is empty
 * - Invalid localStorage values are ignored
 */

import { beforeEach, afterAll, test, expect } from 'bun:test';

afterAll(() => {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).document;
  delete (globalThis as any).window;
});

// Mock localStorage as a simple Map wrapper
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: () => null,
} as Storage;

// Track last data-theme set on documentElement
let lastDataTheme = '';

globalThis.document = {
  getElementById(_id: string) {
    return { textContent: '', addEventListener() {}, setAttribute() {} };
  },
  documentElement: {
    setAttribute(_name: string, val: string) {
      lastDataTheme = val;
    },
  },
  querySelectorAll() { return []; },
  addEventListener() {},
} as any;

globalThis.window = {
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
} as any;

// Import after mocks
const { toggleColorMode, initColorMode, getColorMode } = await import('../../src/web/theme.ts');

beforeEach(() => {
  storage.clear();
  lastDataTheme = '';
});

test('toggleColorMode saves new mode to localStorage', () => {
  // Start from day (default)
  initColorMode('day');
  expect(storage.has('bmd-color-mode')).toBe(false); // initColorMode does not save

  const next = toggleColorMode(); // day -> night
  expect(next).toBe('night');
  expect(storage.get('bmd-color-mode')).toBe('night');
});

test('toggleColorMode cycles day -> night -> auto -> day', () => {
  initColorMode('day');

  const r1 = toggleColorMode(); // night
  expect(r1).toBe('night');

  const r2 = toggleColorMode(); // auto
  expect(r2).toBe('auto');

  const r3 = toggleColorMode(); // day
  expect(r3).toBe('day');
});

test('initColorMode reads persisted mode from localStorage', () => {
  storage.set('bmd-color-mode', 'night');
  initColorMode('day'); // initial is day, but night is persisted
  expect(getColorMode()).toBe('night');
  expect(lastDataTheme).toBe('night');
});

test('initColorMode uses initial param when localStorage is empty', () => {
  initColorMode('day');
  expect(getColorMode()).toBe('day');
  expect(lastDataTheme).toBe('day');
});

test('initColorMode ignores invalid localStorage values', () => {
  storage.set('bmd-color-mode', 'bogus');
  initColorMode('day');
  expect(getColorMode()).toBe('day');
});

test('initColorMode resolves auto mode to day/night based on system preference', () => {
  storage.set('bmd-color-mode', 'auto');
  initColorMode('day');
  expect(getColorMode()).toBe('auto');
  // With our mock matchMedia returning matches:false, auto resolves to 'day'
  expect(lastDataTheme).toBe('day');
});
