/**
 * Unit tests for layout.ts and theme.ts state logic
 * Tests use DOM mocking since these modules interact with the DOM
 */
import { test, expect, describe, beforeEach, mock } from 'bun:test';

// Mock DOM for layout.ts and theme.ts
function createMockDOM() {
  const elements: Record<string, any> = {};

  function mockElement(id: string, attrs: Record<string, string> = {}) {
    const el: any = {
      id,
      style: {},
      classList: {
        _classes: new Set<string>(),
        add(c: string) { this._classes.add(c); },
        remove(c: string) { this._classes.delete(c); },
        contains(c: string) { return this._classes.has(c); },
      },
      attributes: { ...attrs },
      listeners: {} as Record<string, Function[]>,
      getAttribute(name: string) { return this.attributes[name]! ?? null; },
      setAttribute(name: string, value: string) { this.attributes[name] = value; },
      addEventListener(event: string, fn: Function) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(fn);
      },
      dispatchEvent(event: any) {
        const handlers = this.listeners[event.type]! || [];
        handlers.forEach((fn: Function) => fn(event));
      },
      setPointerCapture(_id: number) {},
      releasePointerCapture(_id: number) {},
      hasPointerCapture(_id: number) { return false; },
      getBoundingClientRect() { return { width: 800, height: 600, x: 0, y: 0 }; },
      querySelectorAll(_sel: string) { return []; },
    };
    elements[id] = el;
    return el;
  }

  // Create all elements from index.html
  const html = mockElement('html');
  const mainArea = mockElement('main-area', { 'data-mode': 'both' });
  const editorPane = mockElement('editor-pane');
  const previewPane = mockElement('preview-pane');
  const divider = mockElement('divider');
  const lockBadge = mockElement('lock-badge');
  const lockLocked = mockElement('lock-icon-locked');
  const lockUnlocked = mockElement('lock-icon-unlocked');
  const colorToggle = mockElement('color-toggle');
  const colorIcon = mockElement('color-icon');
  const reconnectBanner = mockElement('reconnect-banner');
  const reconnectText = mockElement('reconnect-text');
  const notificationArea = mockElement('notification-area');
  notificationArea.innerHTML = '';
  notificationArea.querySelector = () => null;

  // Mode buttons
  const btnEditor: any = mockElement('btn-editor', { 'data-mode': 'editor' });
  const btnPreview: any = mockElement('btn-preview', { 'data-mode': 'preview' });
  const btnBoth: any = mockElement('btn-both', { 'data-mode': 'both' });
  btnBoth.classList.add('active');

  const modeButtons = [btnEditor, btnBoth, btnPreview];

  // Patch global document
  (globalThis as any).document = {
    documentElement: html,
    getElementById(id: string) { return elements[id]! ?? null; },
    querySelectorAll(sel: string) {
      if (sel === '.mode-btn') return modeButtons;
      return [];
    },
    body: { style: {} },
  };

  // Patch window.matchMedia
  (globalThis as any).window = {
    ...(globalThis as any).window,
    location: { protocol: 'http:', host: 'localhost:3000' },
    matchMedia(query: string) {
      return {
        matches: false,
        media: query,
        addEventListener(_e: string, _fn: Function) {},
        removeEventListener(_e: string, _fn: Function) {},
      };
    },
  };

  return { elements, modeButtons };
}

describe('layout.ts', () => {
  let layoutModule: typeof import('../../src/web/layout.ts');

  beforeEach(async () => {
    createMockDOM();
    // Re-import to get fresh module state
    // Use dynamic import with cache busting
    const mod = await import('../../src/web/layout.ts');
    layoutModule = mod;
  });

  test('setViewMode sets data-mode on main container', () => {
    layoutModule.setViewMode('editor');
    expect(document.getElementById('main-area')!.getAttribute('data-mode')).toBe('editor');
  });

  test('setViewMode("both") sets data-mode to "both"', () => {
    layoutModule.setViewMode('both');
    expect(document.getElementById('main-area')!.getAttribute('data-mode')).toBe('both');
  });

  test('setViewMode("preview") sets data-mode to "preview"', () => {
    layoutModule.setViewMode('preview');
    expect(document.getElementById('main-area')!.getAttribute('data-mode')).toBe('preview');
  });

  test('getViewMode returns current mode after set', () => {
    layoutModule.setViewMode('editor');
    expect(layoutModule.getViewMode()).toBe('editor');

    layoutModule.setViewMode('preview');
    expect(layoutModule.getViewMode()).toBe('preview');

    layoutModule.setViewMode('both');
    expect(layoutModule.getViewMode()).toBe('both');
  });

  test('exports setViewMode, getViewMode, initDivider, initModeButtons, initLockBadge', () => {
    expect(typeof layoutModule.setViewMode).toBe('function');
    expect(typeof layoutModule.getViewMode).toBe('function');
    expect(typeof layoutModule.initDivider).toBe('function');
    expect(typeof layoutModule.initModeButtons).toBe('function');
    expect(typeof layoutModule.initLockBadge).toBe('function');
  });
});

describe('theme.ts', () => {
  let themeModule: typeof import('../../src/web/theme.ts');

  beforeEach(async () => {
    createMockDOM();
    const mod = await import('../../src/web/theme.ts');
    themeModule = mod;
  });

  test('applyColorMode("day") sets data-theme to "day"', () => {
    themeModule.applyColorMode('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });

  test('applyColorMode("night") sets data-theme to "night"', () => {
    themeModule.applyColorMode('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
  });

  test('applyColorMode("auto") reads system preference and sets theme', () => {
    // Mock system preference as light (matchMedia returns false for dark)
    themeModule.applyColorMode('auto');
    // Since mock matchMedia returns matches: false (light), should be 'day'
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });

  test('toggleColorMode cycles day -> night -> auto -> day', () => {
    themeModule.applyColorMode('day');

    const mode1 = themeModule.toggleColorMode();
    expect(mode1).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');

    const mode2 = themeModule.toggleColorMode();
    expect(mode2).toBe('auto');
    // auto resolves to 'day' with our mock (dark: false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');

    const mode3 = themeModule.toggleColorMode();
    expect(mode3).toBe('day');
    expect(document.documentElement.getAttribute('data-theme')).toBe('day');
  });

  test('getColorMode returns current mode', () => {
    themeModule.applyColorMode('night');
    expect(themeModule.getColorMode()).toBe('night');
  });

  test('exports applyColorMode, toggleColorMode, initColorMode, getColorMode', () => {
    expect(typeof themeModule.applyColorMode).toBe('function');
    expect(typeof themeModule.toggleColorMode).toBe('function');
    expect(typeof themeModule.initColorMode).toBe('function');
    expect(typeof themeModule.getColorMode).toBe('function');
  });
});

describe('ws-client.ts', () => {
  test('exports createWebSocketClient', async () => {
    createMockDOM();
    const mod = await import('../../src/web/ws-client.ts');
    expect(typeof mod.createWebSocketClient).toBe('function');
  });
});

describe('notifications.ts', () => {
  test('exports notifyPersistent, notifyTransient, dismiss, showBanner, hideBanner', async () => {
    const mod = await import('../../src/web/notifications.ts');
    expect(typeof mod.notifyPersistent).toBe('function');
    expect(typeof mod.notifyTransient).toBe('function');
    expect(typeof mod.dismiss).toBe('function');
    expect(typeof mod.showBanner).toBe('function');
    expect(typeof mod.hideBanner).toBe('function');
    expect(typeof mod.initNotifications).toBe('function');
  });
});
