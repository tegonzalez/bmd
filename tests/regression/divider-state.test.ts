/**
 * Regression tests for divider state persistence.
 *
 * Verifies that:
 * - Divider position survives mode toggle (editor -> both restores last position)
 * - Divider position persists via localStorage across page refresh
 * - Invalid/out-of-range values are handled gracefully
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

// Mock document with minimal getElementById
const mockElements: Record<string, any> = {};
function makeMockElement(id: string) {
  return {
    id,
    style: { flexBasis: '', userSelect: '' },
    classList: {
      _classes: new Set<string>(),
      add(c: string) { this._classes.add(c); },
      remove(c: string) { this._classes.delete(c); },
      contains(c: string) { return this._classes.has(c); },
    },
    setAttribute(_name: string, _val: string) {},
    getAttribute(_name: string) { return null; },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() { return false; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { width: 1000 }; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    textContent: '',
    dispatchEvent() {},
  };
}

// Install document mock
globalThis.document = {
  getElementById(id: string) {
    if (!mockElements[id]) mockElements[id] = makeMockElement(id);
    return mockElements[id]!;
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {},
  body: { style: { userSelect: '' } },
  documentElement: { setAttribute() {} },
} as any;

// Install window mock for matchMedia
globalThis.window = {
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
} as any;

// Import after mocks are in place
const { setViewMode, initDivider } = await import('../../src/web/layout.ts');

beforeEach(() => {
  storage.clear();
  // Reset mock element styles
  for (const key of Object.keys(mockElements)) {
    delete mockElements[key];
  }
});

test('setViewMode("both") restores persisted divider percent from localStorage', () => {
  storage.set('bmd-divider-percent', '65');
  setViewMode('both');
  const editor = mockElements['editor-pane']!;
  expect(editor.style.flexBasis).toBe('65%');
});

test('setViewMode("both") uses default 50% when localStorage is empty', () => {
  setViewMode('both');
  const editor = mockElements['editor-pane']!;
  expect(editor.style.flexBasis).toBe('50%');
});

test('initDivider loads persisted value and applies to editor pane', () => {
  storage.set('bmd-divider-percent', '70');
  // Ensure elements exist before calling initDivider
  mockElements['divider'] = makeMockElement('divider');
  mockElements['main-area'] = makeMockElement('main-area');
  mockElements['editor-pane'] = makeMockElement('editor-pane');

  initDivider();

  expect(mockElements['editor-pane']!.style.flexBasis).toBe('70%');
});

test('initDivider ignores out-of-range persisted values', () => {
  storage.set('bmd-divider-percent', '95'); // above MAX_PANE_PERCENT (80)
  mockElements['divider'] = makeMockElement('divider');
  mockElements['main-area'] = makeMockElement('main-area');
  mockElements['editor-pane'] = makeMockElement('editor-pane');

  initDivider();

  // Should NOT apply the out-of-range value
  expect(mockElements['editor-pane']!.style.flexBasis).toBe('');
});

test('initDivider ignores NaN persisted values', () => {
  storage.set('bmd-divider-percent', 'garbage');
  mockElements['divider'] = makeMockElement('divider');
  mockElements['main-area'] = makeMockElement('main-area');
  mockElements['editor-pane'] = makeMockElement('editor-pane');

  initDivider();

  expect(mockElements['editor-pane']!.style.flexBasis).toBe('');
});

test('divider percent survives mode toggle cycle', () => {
  // Simulate: user dragged to 60%, saved in localStorage
  storage.set('bmd-divider-percent', '60');

  // Switch to editor (single pane), then back to both
  setViewMode('editor');
  setViewMode('both');

  const editor = mockElements['editor-pane']!;
  expect(editor.style.flexBasis).toBe('60%');
});
