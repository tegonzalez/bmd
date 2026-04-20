import { describe, test, expect } from 'bun:test';
import { serverTransition } from '../../../src/protocol/server-fsm.ts';
import { makeServerState } from '../helpers.ts';
import type { ClientMessage } from '../../../src/types/ws-messages.ts';

describe('server_fsm contract: file operations', () => {
  // --- file:read ---

  describe('file:read', () => {
    test('with content + filePath returns file:open reply', () => {
      const state = makeServerState({ content: '# Hello', filePath: '/test.md' });
      const event: ClientMessage = { type: 'file:read' };
      const result = serverTransition(state, event);

      expect(result.reply).toHaveLength(1);
      expect(result.reply[0]!).toEqual({
        type: 'file:open',
        path: '/test.md',
        content: '# Hello',
        config: state.fileConfig,
      });
      expect(result.broadcast).toEqual([]);
      expect(result.sideEffects).toEqual([]);
    });

    test('with null content returns empty reply', () => {
      const state = makeServerState({ content: null, filePath: '/test.md' });
      const result = serverTransition(state, { type: 'file:read' });

      expect(result.reply).toEqual([]);
    });

    test('with null filePath returns empty reply', () => {
      const state = makeServerState({ content: '# Hello', filePath: null });
      const result = serverTransition(state, { type: 'file:read' });

      expect(result.reply).toEqual([]);
    });

    test('does not change state', () => {
      const state = makeServerState();
      const result = serverTransition(state, { type: 'file:read' });

      expect(result.state).toBe(state); // reference equality
    });
  });

  // --- file:write ---

  describe('file:write', () => {
    test('success: updates content, broadcasts file:saved, produces 3 ordered side effects', () => {
      const state = makeServerState({ content: 'old', filePath: '/test.md', isReadonly: false });
      const event: ClientMessage = { type: 'file:write', content: 'new content' };
      const result = serverTransition(state, event);

      expect(result.state.content).toBe('new content');
      expect(result.reply).toEqual([]);
      expect(result.broadcast).toEqual([{ type: 'file:saved', path: '/test.md' }]);
      expect(result.sideEffects).toHaveLength(3);
      expect(result.sideEffects[0]!.type).toBe('set-last-written-content');
      expect(result.sideEffects[1]!.type).toBe('update-yjs');
      expect(result.sideEffects[2]!.type).toBe('write-file');
    });

    test('readonly rejects with file:error, state unchanged, no side effects', () => {
      const state = makeServerState({ isReadonly: true, filePath: '/test.md' });
      const result = serverTransition(state, { type: 'file:write', content: 'x' });

      expect(result.reply).toHaveLength(1);
      expect(result.reply[0]!.type).toBe('file:error');
      expect(result.state).toBe(state);
      expect(result.sideEffects).toEqual([]);
    });

    test('no filePath rejects with file:error, state unchanged', () => {
      const state = makeServerState({ filePath: null, isReadonly: false });
      const result = serverTransition(state, { type: 'file:write', content: 'x' });

      expect(result.reply).toHaveLength(1);
      expect(result.reply[0]!.type).toBe('file:error');
      expect(result.state).toBe(state);
    });

    test('anti-false-positive: file:write actually changes state.content', () => {
      const state = makeServerState({ content: 'original', filePath: '/test.md', isReadonly: false });
      const result = serverTransition(state, { type: 'file:write', content: 'updated' });

      // Stub returning original state would fail this
      expect(result.state.content).not.toBe('original');
      expect(result.state.content).toBe('updated');
    });
  });

  // --- file:unlock ---

  describe('file:unlock', () => {
    test('readonly rejects with file:error', () => {
      const state = makeServerState({ isReadonly: true });
      const result = serverTransition(state, { type: 'file:unlock' });

      expect(result.reply).toHaveLength(1);
      expect(result.reply[0]!.type).toBe('file:error');
    });

    test('non-readonly is no-op', () => {
      const state = makeServerState({ isReadonly: false });
      const result = serverTransition(state, { type: 'file:unlock' });

      expect(result.reply).toEqual([]);
      expect(result.broadcast).toEqual([]);
      expect(result.sideEffects).toEqual([]);
    });
  });

  // --- unknown event ---

  test('unknown event type is no-op', () => {
    const state = makeServerState();
    const result = serverTransition(state, { type: 'unknown:event' } as any);

    expect(result.state).toBe(state);
    expect(result.reply).toEqual([]);
    expect(result.broadcast).toEqual([]);
    expect(result.sideEffects).toEqual([]);
  });
});
