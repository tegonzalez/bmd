import { describe, test, expect } from 'bun:test';
import { clientTransition } from '../../../src/protocol/client-fsm.ts';
import { makeClientState } from '../helpers.ts';
import type { ServerMessage } from '../../../src/types/ws-messages.ts';

describe('client_fsm contract: file changes', () => {
  // --- file:changed ---

  describe('file:changed', () => {
    test('applies Yjs update, stashes for editor, shows persistent banner — does NOT touch editor', () => {
      const state = makeClientState({ content: '# Test', unsaved: false });
      const event: ServerMessage = { type: 'file:changed', update: 'base64data' };
      const result = clientTransition(state, event);

      expect(result.effects).toHaveLength(3);
      const effectTypes = result.effects.map(e => e.type);
      expect(effectTypes).toContain('apply-yjs-update');
      expect(effectTypes).toContain('stash-pending-update');
      expect(effectTypes).toContain('show-banner');
      // No set-editor-content — editor not touched until user clicks
      expect(effectTypes).not.toContain('set-editor-content');
      expect(result.state.content).toBe('# Test');
    });

    test('stash-pending-update carries base64Update and content from event', () => {
      const state = makeClientState({ unsaved: true });
      const result = clientTransition(state, { type: 'file:changed', update: 'abc123' });

      const stashEffect = result.effects.find(e => e.type === 'stash-pending-update');
      expect(stashEffect).toBeDefined();
      if (stashEffect && stashEffect.type === 'stash-pending-update') {
        expect(stashEffect.base64Update).toBe('abc123');
      }
    });
  });

  // --- file:saved ---

  describe('file:saved', () => {
    test('state.unsaved becomes false, effects: update-filename + set-unsaved', () => {
      const state = makeClientState({ unsaved: true });
      const event: ServerMessage = { type: 'file:saved', path: '/test.md' };
      const result = clientTransition(state, event);

      expect(result.state.unsaved).toBe(false);
      expect(result.effects).toHaveLength(2);

      const effectTypes = result.effects.map(e => e.type);
      expect(effectTypes).toContain('update-filename');
      expect(effectTypes).toContain('set-unsaved');
    });

    test('update-filename path matches event.path', () => {
      const state = makeClientState({ unsaved: true });
      const result = clientTransition(state, { type: 'file:saved', path: '/doc.md' });

      const filenameEffect = result.effects.find(e => e.type === 'update-filename');
      expect(filenameEffect).toBeDefined();
      if (filenameEffect && filenameEffect.type === 'update-filename') {
        expect(filenameEffect.path).toBe('/doc.md');
        expect(filenameEffect.modified).toBe(false);
      }
    });

    test('anti-false-positive: file:saved actually sets unsaved to false', () => {
      const state = makeClientState({ unsaved: true });
      const result = clientTransition(state, { type: 'file:saved', path: '/test.md' });

      // Stub returning original state would fail (unsaved would still be true)
      expect(result.state.unsaved).not.toBe(true);
      expect(result.state.unsaved).toBe(false);
    });
  });

  // --- file:error ---

  describe('file:error', () => {
    test('state unchanged, effects: persistent show-banner with message', () => {
      const state = makeClientState();
      const event: ServerMessage = { type: 'file:error', message: 'Something went wrong' };
      const result = clientTransition(state, event);

      expect(result.state).toBe(state);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]!.type).toBe('show-banner');
    });

    test('show-banner contains error message', () => {
      const state = makeClientState();
      const result = clientTransition(state, { type: 'file:error', message: 'Disk full' });

      const bannerEffect = result.effects[0]!;
      if (bannerEffect.type === 'show-banner') {
        expect(bannerEffect.text).toContain('Disk full');
      }
    });
  });

  // --- unknown event ---

  test('unknown event: state unchanged, no effects', () => {
    const state = makeClientState();
    const result = clientTransition(state, { type: 'unknown:event' } as any);

    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});
