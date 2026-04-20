/**
 * Unit tests for YjsDocumentManager - CRDT document management for file sync.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import { YjsDocumentManager } from '../../src/server/yjs-doc.ts';

describe('YjsDocumentManager', () => {
  let manager: YjsDocumentManager;

  beforeEach(() => {
    manager = new YjsDocumentManager();
  });

  test('createDoc stores a Y.Doc and getText returns initial content', () => {
    const doc = manager.createDoc('/test.md', 'hello world');
    expect(doc).toBeInstanceOf(Y.Doc);
    const text = doc.getText('content');
    expect(text.toString()).toBe('hello world');
  });

  test('applyExternalChange returns null when content unchanged', () => {
    manager.createDoc('/test.md', 'hello world');
    const update = manager.applyExternalChange('/test.md', 'hello world');
    expect(update).toBeNull();
  });

  test('applyExternalChange returns Uint8Array update when content differs', () => {
    manager.createDoc('/test.md', 'hello world');
    const update = manager.applyExternalChange('/test.md', 'hello universe');
    expect(update).toBeInstanceOf(Uint8Array);
    expect(update!.length).toBeGreaterThan(0);
  });

  test('getFullState returns Uint8Array for existing doc', () => {
    manager.createDoc('/test.md', 'hello');
    const state = manager.getFullState('/test.md');
    expect(state).toBeInstanceOf(Uint8Array);
    expect(state!.length).toBeGreaterThan(0);
  });

  test('getFullState returns null for unknown path', () => {
    const state = manager.getFullState('/nonexistent.md');
    expect(state).toBeNull();
  });

  test('cleanup removes doc and subsequent getFullState returns null', () => {
    manager.createDoc('/test.md', 'hello');
    manager.cleanup('/test.md');
    expect(manager.getFullState('/test.md')).toBeNull();
  });

  test('applying full state to a fresh Y.Doc reproduces the current content', () => {
    manager.createDoc('/test.md', 'hello world');
    manager.applyExternalChange('/test.md', 'hello universe');

    // Get full state and apply to a completely fresh doc
    const fullState = manager.getFullState('/test.md');
    expect(fullState).not.toBeNull();

    const freshDoc = new Y.Doc();
    Y.applyUpdate(freshDoc, fullState!);
    const freshText = freshDoc.getText('content');
    expect(freshText.toString()).toBe('hello universe');
  });

  test('applyExternalChange returns null for unknown path', () => {
    const update = manager.applyExternalChange('/nonexistent.md', 'content');
    expect(update).toBeNull();
  });

  // --- New methods: getStateVector, applyClientUpdate, getDoc, getContent ---

  describe('getStateVector', () => {
    test('returns Uint8Array for existing doc', () => {
      manager.createDoc('/test.md', 'hello');
      const sv = manager.getStateVector('/test.md');
      expect(sv).toBeInstanceOf(Uint8Array);
      expect(sv!.length).toBeGreaterThan(0);
    });

    test('returns null for unknown path', () => {
      const sv = manager.getStateVector('/nonexistent.md');
      expect(sv).toBeNull();
    });
  });

  describe('applyClientUpdate', () => {
    test('merges client ops into server doc', () => {
      const serverDoc = manager.createDoc('/test.md', 'hello');

      // Create a separate client doc with different content
      const clientDoc = new Y.Doc();
      Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(serverDoc));
      clientDoc.getText('content').insert(5, ' world');

      // Capture the client update
      const clientUpdate = Y.encodeStateAsUpdate(clientDoc);

      // Apply client update to server doc via manager
      manager.applyClientUpdate('/test.md', clientUpdate);

      // Server doc should now have the merged content
      const content = manager.getContent('/test.md');
      expect(content).toBe('hello world');
    });

    test('logs error for unknown path (does not throw)', () => {
      // Should not throw, just log
      expect(() => {
        manager.applyClientUpdate('/nonexistent.md', new Uint8Array([0]));
      }).not.toThrow();
    });
  });

  describe('getDoc', () => {
    test('returns Y.Doc instance for existing path', () => {
      manager.createDoc('/test.md', 'hello');
      const doc = manager.getDoc('/test.md');
      expect(doc).toBeInstanceOf(Y.Doc);
    });

    test('returns null for unknown path', () => {
      const doc = manager.getDoc('/nonexistent.md');
      expect(doc).toBeNull();
    });
  });

  describe('getContent', () => {
    test('returns text content string', () => {
      manager.createDoc('/test.md', 'hello world');
      const content = manager.getContent('/test.md');
      expect(content).toBe('hello world');
    });

    test('returns updated content after applyExternalChange', () => {
      manager.createDoc('/test.md', 'hello');
      manager.applyExternalChange('/test.md', 'hello world');
      const content = manager.getContent('/test.md');
      expect(content).toBe('hello world');
    });

    test('returns null for unknown path', () => {
      const content = manager.getContent('/nonexistent.md');
      expect(content).toBeNull();
    });
  });
});
