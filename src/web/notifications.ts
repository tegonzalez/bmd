/**
 * Notification queue for status bar.
 * Persistent notifications stay until dismissed. Transient ones auto-dismiss.
 */

export interface Notification {
  id: number;
  text: string;
  persistent: boolean;
  onClick?: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

let nextId = 1;
const queue: Notification[] = [];
let containerEl: HTMLElement | null = null;

/**
 * Initialize the notification system. Call once after DOMContentLoaded.
 */
export function initNotifications(): void {
  containerEl = document.getElementById('notification-area');
}

function render(): void {
  if (!containerEl) return;

  if (queue.length === 0) {
    containerEl.innerHTML = '';
    containerEl.classList.remove('has-items');
    return;
  }

  containerEl.classList.add('has-items');

  // Show the oldest notification, with count badge if more queued
  const current = queue[0]!;
  const count = queue.length;
  const countBadge = count > 1 ? `<span class="notif-count">${count}</span>` : '';

  const clickable = current.onClick ? ' notif-clickable' : '';
  containerEl.innerHTML =
    `<div class="notif-item${current.persistent ? ' notif-persistent' : ''}${clickable}" data-id="${current.id}">` +
    `<span class="notif-text">${escapeHtml(current.text)}</span>` +
    countBadge +
    `<button class="notif-dismiss" aria-label="Dismiss">&times;</button>` +
    `</div>`;

  const dismissBtn = containerEl.querySelector('.notif-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss(current.id);
    });
  }

  if (current.onClick) {
    const textEl = containerEl.querySelector('.notif-text');
    if (textEl) {
      textEl.addEventListener('click', () => {
        current.onClick!();
        dismiss(current.id);
      });
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Add a persistent notification. Stays until user dismisses it.
 */
export function notifyPersistent(text: string): number {
  const id = nextId++;
  queue.push({ id, text, persistent: true });
  render();
  return id;
}

/**
 * Add a persistent clickable notification. Click triggers callback then dismisses.
 */
export function notifyClickable(text: string, onClick: () => void): number {
  const id = nextId++;
  queue.push({ id, text, persistent: true, onClick });
  render();
  return id;
}

/**
 * Add a transient notification. Auto-dismisses after durationMs.
 */
export function notifyTransient(text: string, durationMs: number = 3000): number {
  const id = nextId++;
  const timer = setTimeout(() => dismiss(id), durationMs);
  queue.push({ id, text, persistent: false, timer });
  render();
  return id;
}

/**
 * Dismiss a notification by id.
 */
export function dismiss(id: number): void {
  const idx = queue.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [removed] = queue.splice(idx, 1);
  if (!removed) return;
  if (removed.timer) clearTimeout(removed.timer);
  render();
}

/**
 * Dismiss all notifications matching a text substring.
 */
export function dismissMatching(substring: string): void {
  const toRemove = queue.filter(n => n.text.includes(substring));
  for (const n of toRemove) {
    dismiss(n.id);
  }
}

/**
 * Clear all notifications.
 */
export function clearAll(): void {
  for (const n of queue) {
    if (n.timer) clearTimeout(n.timer);
  }
  queue.length = 0;
  render();
}

// Legacy API compatibility — used by ws-client.ts showBanner/hideBanner
let legacyId: number | null = null;

/**
 * Show a persistent banner (legacy API — replaces previous banner).
 */
export function showBanner(text: string): void {
  if (legacyId !== null) dismiss(legacyId);
  legacyId = notifyPersistent(text);
}

/**
 * Hide the current legacy banner.
 */
export function hideBanner(): void {
  if (legacyId !== null) {
    dismiss(legacyId);
    legacyId = null;
  }
}
