/**
 * View mode management and draggable divider for bmd web app
 */

export type ViewMode = 'editor' | 'preview' | 'both';

const MIN_PANE_PERCENT = 20;
const MAX_PANE_PERCENT = 80;
const STORAGE_KEY_DIVIDER = 'bmd-divider-percent';

let currentMode: ViewMode = 'both';
let lastDividerPercent = 50;

/**
 * Set the active view mode and update UI
 */
export function setViewMode(mode: ViewMode): void {
  currentMode = mode;
  const main = document.getElementById('main-area');
  if (main) {
    main.setAttribute('data-mode', mode);
    // Restore persisted divider position when switching to 'both'
    if (mode === 'both') {
      const editor = document.getElementById('editor-pane');
      const preview = document.getElementById('preview-pane');
      const saved = (() => { try { return localStorage.getItem(STORAGE_KEY_DIVIDER); } catch { return null; } })();
      const percent = saved ? parseFloat(saved) : lastDividerPercent;
      if (editor) editor.style.flexBasis = `${percent}%`;
      if (preview) preview.style.flexBasis = '';
    }
  }

  // Update active button
  const buttons = document.querySelectorAll('.mode-btn');
  buttons.forEach((btn) => {
    const el = btn as HTMLElement;
    if (el.getAttribute('data-mode') === mode) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

/**
 * Get the current view mode
 */
export function getViewMode(): ViewMode {
  return currentMode;
}

/**
 * Initialize draggable divider for split view
 */
export function initDivider(): void {
  const divider = document.getElementById('divider');
  const main = document.getElementById('main-area');
  const editorPane = document.getElementById('editor-pane');

  if (!divider || !main || !editorPane) return;

  // Restore persisted divider position on startup
  try {
    const saved = localStorage.getItem(STORAGE_KEY_DIVIDER);
    if (saved) {
      const percent = parseFloat(saved);
      if (!isNaN(percent) && percent >= MIN_PANE_PERCENT && percent <= MAX_PANE_PERCENT) {
        lastDividerPercent = percent;
        editorPane.style.flexBasis = `${percent}%`;
      }
    }
  } catch {}

  let startX = 0;
  let startBasis = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (currentMode !== 'both') return;

    divider.setPointerCapture(e.pointerId);
    divider.classList.add('dragging');
    startX = e.clientX;
    startBasis = editorPane.getBoundingClientRect().width;

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!divider.hasPointerCapture(e.pointerId)) return;

    const mainWidth = main.getBoundingClientRect().width;
    if (mainWidth === 0) return;

    const delta = e.clientX - startX;
    const newWidth = startBasis + delta;
    const percent = (newWidth / mainWidth) * 100;
    const clamped = Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, percent));
    lastDividerPercent = clamped;

    editorPane.style.flexBasis = `${clamped}%`;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (divider.hasPointerCapture(e.pointerId)) {
      divider.releasePointerCapture(e.pointerId);
    }
    divider.classList.remove('dragging');
    document.body.style.userSelect = '';
    try { localStorage.setItem(STORAGE_KEY_DIVIDER, String(lastDividerPercent)); } catch {}
  };

  divider.addEventListener('pointerdown', onPointerDown);
  divider.addEventListener('pointermove', onPointerMove);
  divider.addEventListener('pointerup', onPointerUp);
}

/**
 * Initialize mode switcher buttons in bottom bar
 */
export function initModeButtons(): void {
  const buttons = document.querySelectorAll('.mode-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).getAttribute('data-mode') as ViewMode;
      if (mode) {
        setViewMode(mode);
      }
    });
  });
}

/**
 * Initialize lock badge toggle
 * @param readonly - If true, lock is forced on and cannot be toggled
 */
export function initLockBadge(readonly: boolean): void {
  const badge = document.getElementById('lock-badge');
  const lockedIcon = document.getElementById('lock-icon-locked');
  const unlockedIcon = document.getElementById('lock-icon-unlocked');

  if (!badge || !lockedIcon || !unlockedIcon) return;

  let locked = readonly;

  function updateLockUI() {
    if (locked) {
      badge!.classList.add('locked');
      lockedIcon!.style.display = 'block';
      unlockedIcon!.style.display = 'none';
    } else {
      badge!.classList.remove('locked');
      lockedIcon!.style.display = 'none';
      unlockedIcon!.style.display = 'block';
    }
  }

  if (readonly) {
    badge.classList.add('readonly');
    locked = true;
    updateLockUI();
    return; // No toggle in readonly mode
  }

  updateLockUI();

  badge.addEventListener('click', () => {
    locked = !locked;
    updateLockUI();
    badge.dispatchEvent(new CustomEvent('lock-changed', {
      bubbles: true,
      detail: { locked },
    }));
  });
}
