import { describe, test, expect } from 'bun:test';
import { clientTransition } from '../../../src/protocol/client-fsm.ts';
import { makeClientState } from '../helpers.ts';
import type { ServerMessage, FileConfig } from '../../../src/types/ws-messages.ts';

describe('client_fsm contract: init flow', () => {
  // --- server:init ---

  test('server:init: no state change, no effects', () => {
    const state = makeClientState();
    const event: ServerMessage = {
      type: 'server:init',
      config: { host: 'localhost', port: 3000 },
    };
    const result = clientTransition(state, event);

    expect(result.state).toBe(state); // reference equality
    expect(result.effects).toEqual([]);
  });

  // --- file:open ---

  describe('file:open', () => {
    const baseConfig: FileConfig = {
      readonly: false,
      unsafeHtml: false,
      theme: null,
      mode: 'both',
      colorMode: 'auto',
    };

    const makeFileOpenEvent = (configOverrides?: Partial<FileConfig>): ServerMessage => ({
      type: 'file:open',
      path: '/test.md',
      content: '# Hello',
      config: { ...baseConfig, ...configOverrides },
    });

    test('updates state with fileConfig, currentPath, content, unsaved=false', () => {
      const state = makeClientState();
      const result = clientTransition(state, makeFileOpenEvent());

      expect(result.state.fileConfig).toEqual(baseConfig);
      expect(result.state.currentPath).toBe('/test.md');
      expect(result.state.content).toBe('# Hello');
      expect(result.state.unsaved).toBe(false);
    });

    test('non-readonly produces 8 effects (no set-editor-editable)', () => {
      const state = makeClientState();
      const result = clientTransition(state, makeFileOpenEvent({ readonly: false }));

      expect(result.effects).toHaveLength(8);

      const effectTypes = result.effects.map(e => e.type);
      expect(effectTypes).toContain('set-view-mode');
      expect(effectTypes).toContain('init-color-mode');
      expect(effectTypes).toContain('init-lock-badge');
      expect(effectTypes).toContain('set-editor-content');
      expect(effectTypes).toContain('render-preview');
      expect(effectTypes).toContain('reset-yjs');
      expect(effectTypes).toContain('update-filename');
      expect(effectTypes).toContain('set-unsaved');
      expect(effectTypes).not.toContain('set-editor-editable');
    });

    test('readonly produces 9 effects including set-editor-editable(false)', () => {
      const state = makeClientState();
      const result = clientTransition(state, makeFileOpenEvent({ readonly: true }));

      expect(result.effects).toHaveLength(9);

      const editableEffect = result.effects.find(e => e.type === 'set-editor-editable');
      expect(editableEffect).toBeDefined();
      if (editableEffect && editableEffect.type === 'set-editor-editable') {
        expect(editableEffect.editable).toBe(false);
      }
    });

    test('render-preview carries unsafeHtml=true from config', () => {
      const state = makeClientState();
      const result = clientTransition(state, makeFileOpenEvent({ unsafeHtml: true }));

      const renderEffect = result.effects.find(e => e.type === 'render-preview');
      expect(renderEffect).toBeDefined();
      if (renderEffect && renderEffect.type === 'render-preview') {
        expect(renderEffect.unsafeHtml).toBe(true);
      }
    });

    test('render-preview carries unsafeHtml=false from config', () => {
      const state = makeClientState();
      const result = clientTransition(state, makeFileOpenEvent({ unsafeHtml: false }));

      const renderEffect = result.effects.find(e => e.type === 'render-preview');
      expect(renderEffect).toBeDefined();
      if (renderEffect && renderEffect.type === 'render-preview') {
        expect(renderEffect.unsafeHtml).toBe(false);
      }
    });

    test('anti-false-positive: file:open actually changes state', () => {
      const state = makeClientState(); // content: null
      const result = clientTransition(state, makeFileOpenEvent());

      // Stub returning initial state would fail this
      expect(result.state.content).not.toBeNull();
      expect(result.state.content).toBe('# Hello');
      expect(result.state).not.toBe(state);
    });
  });
});
