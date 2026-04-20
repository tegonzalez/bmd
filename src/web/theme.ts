/**
 * Color mode logic with system preference detection for bmd web app
 */

import type { UnicTheme } from '../theme/schema/unic';
import type { UnicodeCategory } from '../unicode/types';

export type ColorMode = 'day' | 'night' | 'auto';

const CYCLE_ORDER: ColorMode[] = ['day', 'night', 'auto'];
const ICON_MAP: Record<ColorMode, string> = {
  day: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  night: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  auto: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17.4 12.48A5.4 5.4 0 1 1 11.52 6.6a4.2 4.2 0 0 0 5.88 5.88z" stroke-width="1.5"/><g stroke-width="2"><line x1="12" y1="1" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="4.93" y2="4.93"/><line x1="19.07" y1="19.07" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="2" y2="12"/><line x1="22" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="4.93" y2="19.07"/><line x1="19.07" y1="4.93" x2="19.78" y2="4.22"/></g></svg>`,
};

const TOOLTIP_MAP: Record<ColorMode, string> = {
  day: 'Light mode (click: dark)',
  night: 'Dark mode (click: auto)',
  auto: 'Auto mode (click: light)',
};

const STORAGE_KEY_COLOR = 'bmd-color-mode';

let currentMode: ColorMode = 'day';
let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

/**
 * Resolve the effective theme ('day' or 'night') for a given color mode
 */
function resolveTheme(mode: ColorMode): 'day' | 'night' {
  if (mode === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
    }
    return 'day'; // fallback
  }
  return mode;
}

/**
 * Apply a color mode, setting the data-theme attribute on the document root
 */
export function applyColorMode(mode: ColorMode): void {
  currentMode = mode;
  const theme = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', theme);
  updateToggleIcon(mode);
}

/**
 * Toggle color mode: day -> night -> auto -> day
 * Returns the new mode
 */
export function toggleColorMode(): ColorMode {
  const idx = CYCLE_ORDER.indexOf(currentMode);
  const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
  applyColorMode(next);
  try { localStorage.setItem(STORAGE_KEY_COLOR, next); } catch {}
  return next;
}

/**
 * Get the current color mode
 */
export function getColorMode(): ColorMode {
  return currentMode;
}

/**
 * Update the toggle button icon to reflect current mode
 */
function updateToggleIcon(mode: ColorMode): void {
  const icon = document.getElementById('color-icon');
  if (icon) {
    icon.innerHTML = ICON_MAP[mode]!;
  }
  const btn = document.getElementById('color-toggle');
  if (btn) {
    btn.title = TOOLTIP_MAP[mode]!;
  }
}

/**
 * Initialize color mode system
 * @param initial - Starting color mode
 */
export function initColorMode(initial: ColorMode): void {
  const saved = (() => { try { return localStorage.getItem(STORAGE_KEY_COLOR) as ColorMode | null; } catch { return null; } })();
  const effective = (saved && CYCLE_ORDER.includes(saved)) ? saved : initial;
  applyColorMode(effective);

  // Listen for system theme changes when in auto mode
  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = (_e: MediaQueryListEvent) => {
      if (currentMode === 'auto') {
        applyColorMode('auto'); // Re-resolve
      }
    };
    mediaQuery.addEventListener('change', mediaListener);
  }

  // Wire toggle button
  const toggleBtn = document.getElementById('color-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      toggleColorMode();
    });
  }
}

/**
 * Apply unic theme CSS custom properties to the document root.
 * Sets --bmd-unic-{category}-fg and --bmd-unic-{category}-bg
 * for each category in the UnicTheme.
 */
export function applyUnicTheme(theme: UnicTheme): void {
  const root = document.documentElement;
  const categories: UnicodeCategory[] = [
    'zero-width', 'bidi', 'tag', 'c0-control', 'c1-control',
    'ansi-escape', 'whitespace', 'pua', 'ai-watermark', 'variation-sel',
    'annotation', 'deprecated', 'noncharacter', 'separator', 'combining-flood',
    'unclassified',
  ];

  for (const cat of categories) {
    const style = theme[cat]!;
    if (style) {
      root.style.setProperty(`--bmd-unic-${cat}-fg`, style.fg);
      if (style.bg) {
        root.style.setProperty(`--bmd-unic-${cat}-bg`, style.bg);
      }
    }
  }
}
