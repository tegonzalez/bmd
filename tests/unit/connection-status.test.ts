/**
 * Unit tests for connection status dot component.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { Window } from 'happy-dom';

// Set up DOM globals
const happyWindow = new Window();
Object.assign(globalThis, {
  window: happyWindow,
  document: happyWindow.document,
  HTMLElement: happyWindow.HTMLElement,
  Element: happyWindow.Element,
  Node: happyWindow.Node,
});

afterAll(() => {
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node']) {
    delete (globalThis as any)[key];
  }
});

import { createStatusDot, type ConnectionStatus } from '../../src/web/connection-status.ts';

describe('createStatusDot', () => {
  test('returns element with connection-dot class', () => {
    const dot = createStatusDot(() => {});
    expect(dot.element.className).toBe('connection-dot');
    expect(dot.element.tagName).toBe('SPAN');
  });

  test('setStatus("connected") sets title and class', () => {
    const dot = createStatusDot(() => {});
    dot.setStatus('connected');
    expect(dot.element.title).toBe('Connected');
    expect(dot.element.className).toBe('connection-dot connection-connected');
  });

  test('setStatus("reconnecting") sets title and class', () => {
    const dot = createStatusDot(() => {});
    dot.setStatus('reconnecting');
    expect(dot.element.title).toBe('Reconnecting');
    expect(dot.element.className).toBe('connection-dot connection-reconnecting');
  });

  test('setStatus("offline") sets title and class', () => {
    const dot = createStatusDot(() => {});
    dot.setStatus('disconnected');
    expect(dot.element.title).toBe('Disconnected');
    expect(dot.element.className).toBe('connection-dot connection-disconnected');
  });

  test('clicking dot when offline calls onRetryClick', () => {
    let called = false;
    const dot = createStatusDot(() => { called = true; });
    dot.setStatus('disconnected');
    dot.element.click();
    expect(called).toBe(true);
  });

  test('clicking dot when connected does NOT call onRetryClick', () => {
    let called = false;
    const dot = createStatusDot(() => { called = true; });
    dot.setStatus('connected');
    dot.element.click();
    expect(called).toBe(false);
  });

  test('transitioning from offline to connected removes click handler', () => {
    let callCount = 0;
    const dot = createStatusDot(() => { callCount++; });
    dot.setStatus('disconnected');
    dot.element.click();
    expect(callCount).toBe(1);

    dot.setStatus('connected');
    dot.element.click();
    expect(callCount).toBe(1); // should not increment
  });

  test('transitioning to offline multiple times does not double-wire handler', () => {
    let callCount = 0;
    const dot = createStatusDot(() => { callCount++; });
    dot.setStatus('disconnected');
    dot.setStatus('disconnected');
    dot.element.click();
    expect(callCount).toBe(1); // only one handler
  });
});
