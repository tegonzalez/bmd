/**
 * End-to-end CRDT merge regression test.
 *
 * Runs BOTH server and client FSMs with Yjs docs on each side,
 * passing DTOs through a mock transport (no network, no file I/O).
 * Verifies that local editor edits survive external file changes
 * after the user clicks "File updated".
 *
 * This is the definitive test that bmd's CRDT merge works correctly.
 */
import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import diff from 'fast-diff';

import { serverOnConnect, serverHandleExternal } from '../../src/protocol/server-fsm.ts';
import { hashContent } from '../../src/server/file-watcher.ts';
import { clientTransition } from '../../src/protocol/client-fsm.ts';
import { YjsDocumentManager } from '../../src/server/yjs-doc.ts';
import type { ServerState, ClientState, ClientEffect } from '../../src/protocol/types.ts';
import type { ServerMessage, FileConfig } from '../../src/types/ws-messages.ts';

// --- Harness ---

const FILE_PATH = '/test/doc.md';
const FILE_CONFIG: FileConfig = {
  readonly: false,
  unsafeHtml: false,
  theme: null,
  mode: 'both',
  colorMode: 'auto',
};

/** Server-side harness: FSM state + Yjs doc manager */
function createServer(initialContent: string) {
  const yjsManager = new YjsDocumentManager();
  yjsManager.createDoc(FILE_PATH, initialContent);

  let state: ServerState = {
    content: initialContent,
    filePath: FILE_PATH,
    globalConfig: { host: 'localhost', port: 3000 },
    fileConfig: FILE_CONFIG,
    isReadonly: false,
    templateValues: null,
    templatesEnabled: false,
  };

  return {
    get state() { return state; },
    yjsManager,

    /** Simulate connection — returns messages to send to client */
    connect(): ServerMessage[] {
      const messages = serverOnConnect(state);
      // Inject yjsState into file:open (same as real server adapter)
      const yjsState = yjsManager.getFullState(FILE_PATH);
      if (yjsState) {
        const base64State = Buffer.from(yjsState).toString('base64');
        for (let i = 0; i < messages.length; i++) {
          if (messages[i]!.type === 'file:open') {
            messages[i] = { ...messages[i]!, yjsState: base64State } as any;
          }
        }
      }
      return messages;
    },

    /** Simulate external file change (e.g., user saves from vim) */
    externalFileChange(newContent: string): ServerMessage[] {
      const update = yjsManager.applyExternalChange(FILE_PATH, newContent);
      if (!update) return [];
      const base64Update = Buffer.from(update).toString('base64');
      const result = serverHandleExternal(state, {
        type: 'file-watcher:changed',
        content: newContent,
        base64Update,
        digest: hashContent(newContent),
      });
      state = result.state;
      return result.broadcast;
    },
  };
}

/** Client-side harness: FSM state + Yjs doc + mock editor content */
function createClient() {
  let clientState: ClientState = {
    fileConfig: null,
    currentPath: null,
    content: null,
    unsaved: false,
    lastDigest: null,
    connectionStatus: 'disconnected',
  };

  let yDoc: Y.Doc | null = null;
  let lastYjsContent = '';
  let editorContent = '';  // mock Tiptap editor
  let pendingUpdate: string | null = null;
  let bannerText: string | null = null;
  let bannerClickable = false;

  /** Apply a diff to the client Yjs doc (same as app.ts syncEditorToYjs) */
  function syncEditorToYjs(newText: string) {
    if (!yDoc) return;
    const text = yDoc.getText('content');
    const diffs = diff(lastYjsContent, newText);
    yDoc.transact(() => {
      let cursor = 0;
      for (const [op, str] of diffs) {
        if (op === 0) cursor += str.length;
        else if (op === -1) text.delete(cursor, str.length);
        else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
      }
    });
    lastYjsContent = newText;
  }

  /** Process effects from FSM (mirrors app.ts applyEffect) */
  function applyEffects(effects: ClientEffect[]) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'set-editor-content':
          editorContent = effect.content;
          break;
        case 'sync-yjs-state': {
          if (yDoc) yDoc.destroy();
          yDoc = new Y.Doc();
          const bytes = Uint8Array.from(atob(effect.base64State), (c) => c.charCodeAt(0));
          Y.applyUpdate(yDoc, bytes);
          lastYjsContent = yDoc.getText('content').toString();
          break;
        }
        case 'reset-yjs':
          if (yDoc) yDoc.destroy();
          yDoc = new Y.Doc();
          yDoc.getText('content').insert(0, effect.content);
          lastYjsContent = effect.content;
          break;
        case 'apply-yjs-update': {
          if (!yDoc) break;
          const bytes = Uint8Array.from(atob(effect.base64Update), (c) => c.charCodeAt(0));
          Y.applyUpdate(yDoc, bytes);
          break;
        }
        case 'stash-pending-update':
          pendingUpdate = effect.base64Update;
          break;
        case 'show-banner':
          bannerText = effect.text;
          bannerClickable = (effect.text === 'File updated' && pendingUpdate !== null);
          break;
        case 'show-timed-banner':
          bannerText = effect.text;
          bannerClickable = false;
          break;
        case 'refresh-from-yjs':
          if (!yDoc) break;
          editorContent = yDoc.getText('content').toString();
          clientState = { ...clientState, content: editorContent };
          break;
      }
    }
  }

  return {
    get state() { return clientState; },
    get editorContent() { return editorContent; },
    get yDocContent() { return yDoc?.getText('content').toString() ?? ''; },
    get pendingUpdate() { return pendingUpdate; },
    get bannerText() { return bannerText; },
    get bannerClickable() { return bannerClickable; },

    /** Receive server messages (mock WS transport) */
    receive(messages: ServerMessage[]) {
      for (const msg of messages) {
        const result = clientTransition(clientState, msg);
        clientState = result.state;
        applyEffects(result.effects);
      }
    },

    /** Simulate user typing in editor */
    type(newContent: string) {
      editorContent = newContent;
      clientState = { ...clientState, unsaved: true };
      syncEditorToYjs(newContent);
    },

    /** Simulate user clicking the "File updated" banner */
    clickBanner() {
      if (!pendingUpdate || !yDoc) return;
      // Yjs update already applied on receive — just read merged result (same as app.ts)
      const merged = yDoc.getText('content').toString();
      lastYjsContent = merged;
      editorContent = merged;
      clientState = { ...clientState, content: merged };
      pendingUpdate = null;
      bannerText = null;
      bannerClickable = false;
    },
  };
}

// --- Tests ---

describe('CRDT merge end-to-end (server FSM + client FSM + Yjs, no network)', () => {

  test('baseline: client receives file on connect', () => {
    const server = createServer('# Hello World');
    const client = createClient();

    client.receive(server.connect());

    expect(client.editorContent).toBe('# Hello World');
    expect(client.yDocContent).toBe('# Hello World');
    expect(client.state.content).toBe('# Hello World');
  });

  test('external file change with no local edits: banner shown, click applies', () => {
    const server = createServer('# Hello World');
    const client = createClient();
    client.receive(server.connect());

    // External change
    const msgs = server.externalFileChange('# Hello World\n\nNew paragraph.');
    client.receive(msgs);

    // Editor NOT changed yet
    expect(client.editorContent).toBe('# Hello World');
    expect(client.bannerText).toBe('File updated');
    expect(client.bannerClickable).toBe(true);

    // User clicks banner
    client.clickBanner();

    expect(client.editorContent).toBe('# Hello World\n\nNew paragraph.');
    expect(client.bannerText).toBeNull();
  });

  test('CRDT merge: local edit at top + remote edit at bottom = both preserved', () => {
    const server = createServer('line one\nline two\nline three');
    const client = createClient();
    client.receive(server.connect());

    // User edits top
    client.type('LINE ONE\nline two\nline three');

    // External process edits bottom
    const msgs = server.externalFileChange('line one\nline two\nline THREE');
    client.receive(msgs);

    // Editor still has user's edits
    expect(client.editorContent).toBe('LINE ONE\nline two\nline three');

    // User clicks banner to merge
    client.clickBanner();

    // BOTH changes present
    expect(client.editorContent).toContain('LINE ONE');
    expect(client.editorContent).toContain('line THREE');
  });

  test('CRDT merge: local insert in middle + remote append = both preserved', () => {
    const server = createServer('hello world');
    const client = createClient();
    client.receive(server.connect());

    // User inserts word
    client.type('hello beautiful world');

    // External append
    const msgs = server.externalFileChange('hello world!');
    client.receive(msgs);

    expect(client.editorContent).toBe('hello beautiful world');

    client.clickBanner();

    expect(client.editorContent).toContain('beautiful');
    expect(client.editorContent).toContain('!');
  });

  test('no local edits, dismiss banner: editor unchanged', () => {
    const server = createServer('original');
    const client = createClient();
    client.receive(server.connect());

    const msgs = server.externalFileChange('modified');
    client.receive(msgs);

    expect(client.editorContent).toBe('original');
    expect(client.pendingUpdate).not.toBeNull();

    // User dismisses without applying — editor keeps original
    // (simulate clicking ×, which just clears the notification)
    expect(client.editorContent).toBe('original');
  });

  test('multiple external changes before user clicks: last update wins', () => {
    const server = createServer('v1');
    const client = createClient();
    client.receive(server.connect());

    client.receive(server.externalFileChange('v2'));
    client.receive(server.externalFileChange('v3'));

    // Only latest stashed update
    client.clickBanner();
    expect(client.editorContent).toBe('v3');
  });

  test('user types after external change but before clicking banner: both merge', () => {
    const server = createServer('aaa\nbbb\nccc');
    const client = createClient();
    client.receive(server.connect());

    // External change to last line
    client.receive(server.externalFileChange('aaa\nbbb\nCCC'));

    // User edits first line AFTER the external change arrived but BEFORE clicking banner
    client.type('AAA\nbbb\nccc');

    // Now click banner — should merge both
    client.clickBanner();

    expect(client.editorContent).toContain('AAA');
    expect(client.editorContent).toContain('CCC');
  });
});
