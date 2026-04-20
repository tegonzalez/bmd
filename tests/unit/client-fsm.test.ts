/**
 * Client FSM unit tests.
 * Tests clientTransition as a pure function -- no DOM, no WebSocket, no Yjs.
 */
import { test, expect, describe } from 'bun:test';
import { getRuntime } from '../../src/runtime/index.ts';
import { clientTransition } from '../../src/protocol/client-fsm.ts';
import type { ClientState } from '../../src/protocol/types.ts';
import { PROTOCOL_VERSION } from '../../src/protocol/types.ts';
import type { FileConfig } from '../../src/types/ws-messages.ts';

function makeState(overrides: Partial<ClientState> = {}): ClientState {
  return {
    fileConfig: null,
    currentPath: null,
    content: null,
    unsaved: false,
    lastDigest: null,
    connectionStatus: 'connected',
    ...overrides,
  };
}

const testConfig: FileConfig = {
  readonly: false,
  unsafeHtml: false,
  theme: null,
  mode: 'both',
  colorMode: 'auto',
};

describe('clientTransition', () => {
  test('server:init -> no state changes, no effects', () => {
    const state = makeState();
    const result = clientTransition(state, {
      type: 'server:init',
      config: { host: 'localhost', port: 3000 },
    });

    expect(result.state).toEqual(state);
    expect(result.effects).toHaveLength(0);
  });

  test('file:open -> state updated, effects for UI initialization', () => {
    const state = makeState();
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
    });

    // State updated
    expect(result.state.fileConfig).toEqual(testConfig);
    expect(result.state.currentPath).toBe('/tmp/test.md');
    expect(result.state.content).toBe('# Hello');
    expect(result.state.unsaved).toBe(false);

    // Effects
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).toContain('set-view-mode');
    expect(effectTypes).toContain('init-color-mode');
    expect(effectTypes).toContain('init-lock-badge');
    expect(effectTypes).toContain('set-editor-content');
    expect(effectTypes).toContain('render-preview');
    expect(effectTypes).toContain('update-filename');
    expect(effectTypes).toContain('set-unsaved');
    expect(effectTypes).toContain('reset-yjs');

    // Verify specific effect values
    expect(result.effects).toContainEqual({ type: 'set-view-mode', mode: 'both' });
    expect(result.effects).toContainEqual({ type: 'init-color-mode', colorMode: 'auto' });
    expect(result.effects).toContainEqual({ type: 'init-lock-badge', readonly: false });
    expect(result.effects).toContainEqual({ type: 'set-editor-content', content: '# Hello' });
    expect(result.effects).toContainEqual({ type: 'render-preview', content: '# Hello', unsafeHtml: false });
    expect(result.effects).toContainEqual({ type: 'update-filename', path: '/tmp/test.md', modified: false });
    expect(result.effects).toContainEqual({ type: 'set-unsaved', unsaved: false });
    expect(result.effects).toContainEqual({ type: 'reset-yjs', content: '# Hello' });
  });

  test('file:open with readonly config -> effects include set-editor-editable(false)', () => {
    const readonlyConfig: FileConfig = { ...testConfig, readonly: true };
    const state = makeState();
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: readonlyConfig,
    });

    expect(result.effects).toContainEqual({ type: 'set-editor-editable', editable: false });
  });

  test('file:open with non-readonly config -> no set-editor-editable effect', () => {
    const state = makeState();
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
    });

    const editableEffects = result.effects.filter(e => e.type === 'set-editor-editable');
    expect(editableEffects).toHaveLength(0);
  });

  test('file:changed -> stashes update and shows persistent "File updated" banner', () => {
    const state = makeState({ content: '# Hello', currentPath: '/tmp/test.md' });
    const result = clientTransition(state, {
      type: 'file:changed',
      update: 'base64data',
    });

    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).toContain('stash-pending-update');
    expect(effectTypes).toContain('show-banner');
    // Editor NOT touched — state unchanged
    expect(result.state.content).toBe('# Hello');
  });

  test('file:saved -> state.unsaved=false, effects include update-filename + set-unsaved', () => {
    const state = makeState({ unsaved: true, currentPath: '/tmp/test.md' });
    const result = clientTransition(state, {
      type: 'file:saved',
      path: '/tmp/test.md',
    });

    expect(result.state.unsaved).toBe(false);
    expect(result.effects).toContainEqual({ type: 'update-filename', path: '/tmp/test.md', modified: false });
    expect(result.effects).toContainEqual({ type: 'set-unsaved', unsaved: false });
  });

  test('file:error -> effects include persistent show-banner', () => {
    const state = makeState();
    const result = clientTransition(state, {
      type: 'file:error',
      message: 'Something went wrong',
    });

    expect(result.effects).toContainEqual({
      type: 'show-banner',
      text: 'Error: Something went wrong',
    });
  });
});

describe('reconciliation transitions', () => {
  test('file:open with digest updates lastDigest in state', () => {
    const state = makeState();
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
      digest: 'abc123',
    });

    expect(result.state.lastDigest).toBe('abc123');
  });

  test('file:open with digest match on reconnect preserves local state and sends reconcile', () => {
    const state = makeState({ lastDigest: 'abc123', content: '# Local edits', unsaved: true });
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
      digest: 'abc123',
    });

    // Reconnect with matching digest: preserve local state, do NOT replace editor
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).not.toContain('set-editor-content');
    expect(effectTypes).not.toContain('reset-yjs');
    expect(effectTypes).not.toContain('sync-yjs-state');
    expect(effectTypes).toContain('set-view-mode');
    expect(effectTypes).toContain('set-connection-status');
    // Sends reconcile to push local changes to server
    expect(effectTypes).toContain('send-reconcile-request');
    // Preserves local content and unsaved state
    expect(result.state.content).toBe('# Local edits');
    expect(result.state.unsaved).toBe(true);
    expect(result.state.lastDigest).toBe('abc123');
  });

  test('file:open with digest mismatch emits send-reconcile-request instead of set-editor-content/reset-yjs', () => {
    const state = makeState({ lastDigest: 'old-digest' });
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
      digest: 'new-digest',
    });

    const effectTypes = result.effects.map(e => e.type);
    // Should emit reconciliation request
    expect(effectTypes).toContain('send-reconcile-request');
    // Should NOT emit set-editor-content or reset-yjs or sync-yjs-state
    expect(effectTypes).not.toContain('set-editor-content');
    expect(effectTypes).not.toContain('reset-yjs');
    expect(effectTypes).not.toContain('sync-yjs-state');
    // Should still emit view-mode, color-mode, lock-badge, filename
    expect(effectTypes).toContain('set-view-mode');
    expect(effectTypes).toContain('init-color-mode');
    expect(effectTypes).toContain('init-lock-badge');
    expect(effectTypes).toContain('update-filename');
    // connectionStatus should be reconnecting
    expect(result.state.connectionStatus).toBe('reconnecting');
  });

  test('file:open with no prior lastDigest (first connect) behaves as before', () => {
    const state = makeState({ lastDigest: null });
    const result = clientTransition(state, {
      type: 'file:open',
      path: '/tmp/test.md',
      content: '# Hello',
      config: testConfig,
      digest: 'some-digest',
    });

    // Normal behavior -- no reconciliation on first connect
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).toContain('set-editor-content');
    expect(effectTypes).not.toContain('send-reconcile-request');
    expect(result.state.lastDigest).toBe('some-digest');
  });

  test('file:changed updates lastDigest from event.digest', () => {
    const state = makeState({ content: '# Hello', lastDigest: 'old-digest' });
    const result = clientTransition(state, {
      type: 'file:changed',
      update: 'base64data',
      digest: 'new-digest',
    });

    expect(result.state.lastDigest).toBe('new-digest');
  });

  test('file:changed without digest preserves existing lastDigest', () => {
    const state = makeState({ content: '# Hello', lastDigest: 'existing-digest' });
    const result = clientTransition(state, {
      type: 'file:changed',
      update: 'base64data',
    });

    expect(result.state.lastDigest).toBe('existing-digest');
  });

  test('reconcile:complete with no update -- emits set-connection-status connected, updates lastDigest', () => {
    const state = makeState({ lastDigest: 'old-digest', connectionStatus: 'reconnecting' });
    const result = clientTransition(state, {
      type: 'reconcile:complete',
      digest: 'new-digest',
    });

    expect(result.state.lastDigest).toBe('new-digest');
    expect(result.state.connectionStatus).toBe('connected');
    expect(result.effects).toContainEqual({ type: 'set-connection-status', status: 'connected' });
    // No apply-yjs-update since no update provided
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).not.toContain('apply-yjs-update');
  });

  test('reconcile:complete with update -- emits apply-yjs-update + show-banner + stash-pending-update', () => {
    const state = makeState({ lastDigest: 'old-digest', connectionStatus: 'reconnecting' });
    const result = clientTransition(state, {
      type: 'reconcile:complete',
      digest: 'new-digest',
      update: 'base64-update-data',
    });

    expect(result.state.lastDigest).toBe('new-digest');
    expect(result.state.connectionStatus).toBe('connected');
    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).toContain('apply-yjs-update');
    expect(effectTypes).toContain('stash-pending-update');
    expect(effectTypes).toContain('show-banner');
    expect(effectTypes).toContain('set-connection-status');
    expect(result.effects).toContainEqual({ type: 'apply-yjs-update', base64Update: 'base64-update-data' });
    expect(result.effects).toContainEqual({ type: 'stash-pending-update', base64Update: 'base64-update-data' });
  });

  test('reconcile:complete with version mismatch -- emits notify-version-mismatch effect', () => {
    const state = makeState({ lastDigest: 'old-digest', connectionStatus: 'reconnecting' });
    const result = clientTransition(state, {
      type: 'reconcile:complete',
      digest: 'new-digest',
      protocolVersion: 99,
    });

    const effectTypes = result.effects.map(e => e.type);
    expect(effectTypes).toContain('notify-version-mismatch');
    expect(result.effects).toContainEqual({
      type: 'notify-version-mismatch',
      clientVersion: PROTOCOL_VERSION,
      serverVersion: 99,
    });
  });
});

describe('purity constraints', () => {
  const rt = getRuntime();

  test('no DOM/WS/browser imports in client-fsm.ts', async () => {
    const source = await rt.readFile('src/protocol/client-fsm.ts');
    expect(source).not.toMatch(/import.*from.*['"]yjs['"]/);
    expect(source).not.toMatch(/import.*from.*['"]@tiptap/);
    expect(source).not.toMatch(/document\./);
    expect(source).not.toMatch(/window\./);
    expect(source).not.toMatch(/WebSocket/);
    expect(source).not.toMatch(/fetch\(/);
  });
});
