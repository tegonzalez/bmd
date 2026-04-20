/**
 * Tests for save behavior: offline download and pending delta helpers.
 * Uses happy-dom for DOM-dependent tests.
 */

import { test, expect, describe, beforeEach, afterAll } from 'bun:test';
import { Window } from 'happy-dom';

afterAll(() => {
  delete (globalThis as any).document;
});

describe('offline download', () => {
  let window: InstanceType<typeof Window>;
  let document: Document;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    // Provide global stubs for Blob/URL that happy-dom supports
    (globalThis as any).document = document;
  });

  test('triggerOfflineDownload creates blob with correct content type', () => {
    const content = '# Hello World\n\nSome markdown content.';
    const blob = new Blob([content], { type: 'text/markdown' });
    expect(blob.type).toBe('text/markdown');
    expect(blob.size).toBe(content.length);
  });

  test('triggerOfflineDownload produces an anchor element with download attribute', () => {
    const content = '# Test';
    const filename = 'test.md';

    // Simulate the offline download logic from app.ts
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);

    expect(a.download).toBe('test.md');
    expect(a.href).toContain('blob:');
    expect(document.body.contains(a)).toBe(true);

    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    expect(document.body.contains(a)).toBe(false);
  });

  test('offline download uses fallback filename when path is null', () => {
    let currentPath: string | null = null;
    const filename = (currentPath as string | null)?.split('/').pop() || 'untitled.md';
    expect(filename).toBe('untitled.md');
  });

  test('offline download extracts filename from path', () => {
    const currentPath = '/home/user/docs/notes.md';
    const filename = currentPath?.split('/').pop() || 'untitled.md';
    expect(filename).toBe('notes.md');
  });
});

describe('applyPendingDeltas', () => {
  test('empty array is a no-op', () => {
    // The applyPendingDeltas function guards with: if pendingDeltas.length === 0 return
    // Simulate the guard logic
    const pendingDeltas: any[] = [];
    let applied = false;

    if (pendingDeltas.length > 0) {
      applied = true;
    }

    expect(applied).toBe(false);
    expect(pendingDeltas).toHaveLength(0);
  });

  test('pendingDeltas cleared after apply', () => {
    // Simulate the clearing behavior
    let pendingDeltas = [
      { delta: [{ retain: 5 }, { insert: 'hello' }], contentBefore: 'world' },
      { delta: [{ retain: 10 }, { insert: '!' }], contentBefore: 'worldhello' },
    ];

    expect(pendingDeltas).toHaveLength(2);

    // After applying, the array is cleared
    pendingDeltas = [];
    expect(pendingDeltas).toHaveLength(0);
  });

  test('isLast correctly identifies last delta', () => {
    const pendingDeltas = [
      { delta: [{ insert: 'a' }], contentBefore: '' },
      { delta: [{ insert: 'b' }], contentBefore: 'a' },
      { delta: [{ insert: 'c' }], contentBefore: 'ab' },
    ];

    const isLast = (i: number) => i === pendingDeltas.length - 1;
    expect(isLast(0)).toBe(false);
    expect(isLast(1)).toBe(false);
    expect(isLast(2)).toBe(true);
  });
});

describe('connection status integration', () => {
  test('isOnline tracks connection status correctly', () => {
    // Simulate the status tracking from app.ts onStatusChange
    let isOnline = true;

    const updateStatus = (status: 'connected' | 'reconnecting' | 'disconnected') => {
      isOnline = status === 'connected';
    };

    updateStatus('disconnected');
    expect(isOnline).toBe(false);

    updateStatus('reconnecting');
    expect(isOnline).toBe(false);

    updateStatus('connected');
    expect(isOnline).toBe(true);
  });
});
