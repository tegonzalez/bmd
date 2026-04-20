/**
 * bmd serve -- HTTP + WebSocket server for browser preview.
 * Uses node:http + ws for cross-runtime compatibility (Bun and Node.js).
 *
 * Thin transport adapter: all protocol logic delegated to pure FSM functions.
 */

import { resolve, extname, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMessage } from '../types/ws-messages.ts';
import { PROTOCOL_VERSION } from '../protocol/types.ts';
import type { ServerState } from '../protocol/types.ts';
import type { BmdConfig } from '../config/schema.ts';
import { parseClientMessage, createServerMessage } from './ws-protocol.ts';
import { serverTransition, serverOnConnect, serverHandleExternal } from '../protocol/server-fsm.ts';
import { watchFile, setLastWrittenContent, hashContent } from './file-watcher.ts';
import { reconcileOnServer } from '../protocol/reconcile.ts';
import * as Y from 'yjs';
import diff from 'fast-diff';
import { YjsDocumentManager } from './yjs-doc.ts';
import { toCssVariables } from '../theme/adapt/css.ts';
import { writeDiagnostic, defaultLogger, Severity, getLogLevel } from '../diagnostics/formatter.ts';
import { resolveStaticAssetPath, resolveWebAssetRoot } from './static-assets.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** MIME types for static file serving */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Template context passed from serve command for values resolution and map watching */
export interface TemplateContext {
  values: Record<string, unknown>;
  cliVars: Array<{ key: string; value: unknown }>;
  templatesConfig: BmdConfig['templates'];
  mapFilePath: string | null;
}

export interface ServerOptions {
  webRoot?: string;
}

export function startServer(
  config: BmdConfig,
  templateContext?: TemplateContext,
  options: ServerOptions = {},
): { server: Server; stop: () => void } {
  const port = config.serve.port;
  const host = config.serve.host;
  const filePath = config.filePath ? resolve(config.filePath) : null;
  const isReadonly = config.serve.readonly;
  const mode = config.serve.mode;
  const colorMode = config.serve.colorMode;
  const unsafeHtml = config.unsafeHtml;
  const themeCss = config.theme?.web ? toCssVariables(config.theme.web) : '';

  let state: ServerState = {
    content: null,
    filePath,
    globalConfig: {
      host,
      port,
      logLevel: getLogLevel(),
    },
    fileConfig: {
      readonly: isReadonly,
      unsafeHtml,
      theme: themeCss || null,
      mode,
      colorMode,
    },
    isReadonly,
    templateValues: templateContext?.values ?? null,
    templatesEnabled: templateContext ? config.templates.enabled : true,
  };

  // Yjs document manager for CRDT-based file sync
  const yjsManager = new YjsDocumentManager();

  // Polling session tracking: sessionId -> { lastSeen, pending messages }
  const pollSessions = new Map<string, { lastSeen: number; pending: ServerMessage[] }>();

  // Cleanup stale polling sessions every 30s
  const pollCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of pollSessions) {
      if (now - session.lastSeen > 60000) pollSessions.delete(id);
    }
  }, 30000);

  /**
   * Enrich serverOnConnect messages with Yjs state for CRDT sync.
   */
  // Track WebSocket connections mid-reconciliation (buffer file:changed for them)
  const reconcilingClients = new Set<WebSocket>();
  const reconcileBuffers = new Map<WebSocket, ServerMessage[]>();

  function getConnectMessages(): ServerMessage[] {
    const messages = serverOnConnect(state);
    if (filePath) {
      const yjsState = yjsManager.getFullState(filePath);
      const digest = state.content !== null ? hashContent(state.content) : undefined;
      if (yjsState) {
        const base64State = Buffer.from(yjsState).toString('base64');
        for (let i = 0; i < messages.length; i++) {
          if (messages[i]!.type === 'file:open') {
            messages[i] = { ...messages[i]!, yjsState: base64State, digest } as any;
          }
        }
      } else if (digest) {
        for (let i = 0; i < messages.length; i++) {
          if (messages[i]!.type === 'file:open') {
            messages[i] = { ...messages[i]!, digest } as any;
          }
        }
      }
    }
    return messages;
  }

  // Track all connected WebSocket clients
  const wsClients = new Set<WebSocket>();

  /**
   * Broadcast a message to all WS subscribers AND append to all polling session queues.
   * Buffers file:changed messages for clients mid-reconciliation.
   */
  function broadcast(msg: ServerMessage, excludeWs?: WebSocket): void {
    const serialized = createServerMessage(msg);

    if (msg.type === 'file:changed' && reconcilingClients.size > 0) {
      for (const ws of wsClients) {
        if (ws === excludeWs) continue;
        if (reconcilingClients.has(ws)) {
          let buf = reconcileBuffers.get(ws);
          if (!buf) {
            buf = [];
            reconcileBuffers.set(ws, buf);
          }
          buf.push(msg);
        } else {
          ws.send(serialized);
        }
      }
    } else {
      for (const ws of wsClients) {
        if (ws !== excludeWs) {
          ws.send(serialized);
        }
      }
    }

    for (const session of pollSessions.values()) {
      session.pending.push(msg);
    }
  }

  /**
   * Execute side effects returned by the FSM.
   * Adapter-level I/O -- the FSM itself is pure.
   */
  function executeSideEffects(
    result: ReturnType<typeof serverTransition>,
    ws: WebSocket,
  ): void {
    // Send replies directly to the requesting client
    for (const msg of result.reply) {
      ws.send(createServerMessage(msg));
    }

    // Separate file:saved from immediate broadcasts (defer until write completes)
    const immediateBroadcasts = result.broadcast.filter((m) => m.type !== 'file:saved');
    const deferredBroadcasts = result.broadcast.filter((m) => m.type === 'file:saved');

    for (const msg of immediateBroadcasts) {
      broadcast(msg);
    }

    // Execute side effects
    let hasWriteFile = false;
    for (const effect of result.sideEffects) {
      switch (effect.type) {
        case 'set-last-written-content':
          setLastWrittenContent(filePath!, effect.content);
          break;
        case 'update-yjs':
          yjsManager.applyExternalChange(effect.path, effect.content);
          break;
        case 'write-file':
          hasWriteFile = true;
          writeFile(effect.path, effect.content, 'utf-8').then(() => {
            for (const msg of deferredBroadcasts) {
              broadcast(msg);
            }
          }).catch((err) => {
            writeDiagnostic({
              file: effect.path,
              line: 1,
              col: 1,
              span: 1,
              message: `File write failed: ${err instanceof Error ? err.message : String(err)}`,
              severity: Severity.DiagError,
            });
            ws.send(createServerMessage({ type: 'file:error', message: 'File write failed' }));
          });
          break;
        case 'reconcile': {
          const doc = filePath ? yjsManager.getDoc(filePath) : null;
          if (!doc || !filePath || state.content === null) {
            ws.send(createServerMessage({
              type: 'file:error',
              message: 'Reconciliation failed: no active document',
            }));
            reconcilingClients.delete(ws);
            reconcileBuffers.delete(ws);
            break;
          }

          try {
            reconcilingClients.add(ws);
            const currentDigest = hashContent(state.content);
            const digestMatch = effect.digest === currentDigest;

            if (digestMatch) {
              ws.send(createServerMessage({
                type: 'reconcile:complete',
                digest: currentDigest,
                protocolVersion: PROTOCOL_VERSION,
              }));
            } else {
              const baseContent = effect.baseContent;
              const newDigest = hashContent(state.content);

              if (!baseContent || baseContent === state.content) {
                ws.send(createServerMessage({
                  type: 'reconcile:complete',
                  digest: newDigest,
                  protocolVersion: PROTOCOL_VERSION,
                }));
              } else {
                const clientDoc = new Y.Doc();
                Y.applyUpdate(clientDoc, effect.clientUpdate);

                const diffs = diff(baseContent, state.content);
                let fc4Update: Uint8Array | null = null;
                const handler = (u: Uint8Array) => { fc4Update = u; };
                clientDoc.on('update', handler);
                clientDoc.transact(() => {
                  const text = clientDoc.getText('content');
                  let cursor = 0;
                  for (const [op, str] of diffs) {
                    if (op === 0) cursor += str.length;
                    else if (op === -1) text.delete(cursor, str.length);
                    else if (op === 1) { text.insert(cursor, str); cursor += str.length; }
                  }
                });
                clientDoc.off('update', handler);
                clientDoc.destroy();

                ws.send(createServerMessage({
                  type: 'reconcile:complete',
                  digest: newDigest,
                  protocolVersion: PROTOCOL_VERSION,
                  ...(fc4Update ? { update: Buffer.from(fc4Update).toString('base64') } : {}),
                }));
              }
            }

            reconcilingClients.delete(ws);
            const buffered = reconcileBuffers.get(ws);
            if (buffered && buffered.length > 0) {
              for (const bufferedMsg of buffered) {
                ws.send(createServerMessage(bufferedMsg));
              }
            }
            reconcileBuffers.delete(ws);
          } catch (err) {
            writeDiagnostic({ file: 'src/server/index.ts', line: 275, col: 13, span: 0, message: `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
            ws.send(createServerMessage({
              type: 'file:error',
              message: 'Reconciliation failed: merge error',
            }));
            reconcilingClients.delete(ws);
            reconcileBuffers.delete(ws);
          }
          break;
        }
      }
    }

    if (!hasWriteFile && deferredBroadcasts.length > 0) {
      for (const msg of deferredBroadcasts) {
        broadcast(msg);
      }
    }
  }

  // Read initial content if file provided
  let stopWatcher: (() => void) | null = null;
  let stopMapWatcher: (() => void) | null = null;

  if (filePath) {
    try {
      const text = readFileSync(filePath, 'utf-8');
      state = { ...state, content: text };
      yjsManager.createDoc(filePath, text);
    } catch (err) {
      writeDiagnostic({ file: 'src/server/index.ts', line: 305, col: 7, span: 0, message: `Initial file read failed (${filePath}): ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
    }

    // Watch for external changes -- use Yjs for delta transport
    stopWatcher = watchFile(filePath, (newContent) => {
      const update = yjsManager.applyExternalChange(filePath, newContent);
      if (update) {
        const base64Update = Buffer.from(update).toString('base64');
        const digest = hashContent(newContent);
        const result = serverHandleExternal(state, {
          type: 'file-watcher:changed',
          content: newContent,
          base64Update,
          digest,
        });
        state = result.state;
        for (const msg of result.broadcast) {
          broadcast(msg);
        }
      }
    });
  }

  // Watch map file for changes if template context provided
  if (templateContext?.mapFilePath && config.templates.enabled) {
    const mapPath = templateContext.mapFilePath;
    const storedCliVars = templateContext.cliVars;

    stopMapWatcher = watchFile(mapPath, async (newContent) => {
      try {
        let newValues: Record<string, unknown>;

        if (newContent === '') {
          const { inflateDotPaths } = await import('../cli/var-parser.ts');
          newValues = storedCliVars.length > 0 ? inflateDotPaths(storedCliVars) : {};
        } else {
          const { loadMapFile } = await import('../config/map-loader.ts');
          const { deepMerge, inflateDotPaths } = await import('../cli/var-parser.ts');
          const mapValues = await loadMapFile(mapPath);
          if (storedCliVars.length > 0) {
            const varValues = inflateDotPaths(storedCliVars);
            newValues = deepMerge(mapValues, varValues);
          } else {
            newValues = mapValues;
          }
        }

        const result = serverHandleExternal(state, {
          type: 'map-file:changed',
          values: newValues,
          templatesEnabled: state.templatesEnabled,
        });
        state = result.state;
        for (const msg of result.broadcast) {
          broadcast(msg);
        }
      } catch (err) {
        writeDiagnostic({ file: 'src/server/index.ts', line: 362, col: 9, span: 0, message: `Map file reload failed (${mapPath}): ${err instanceof Error ? err.message : String(err)}`, severity: Severity.DiagError });
      }
    });
  }

  // resolve dist/web from both src/server/ (dev) and dist/ (bundled CLI)
  const distWebDir = resolveWebAssetRoot(__dirname, options.webRoot);

  // HTTP server for static files and polling API
  const httpServer = createServer((req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Polling API
    if (url.pathname === '/api/poll') {
      const sessionId = url.searchParams.get('session');

      if (!sessionId) {
        const messages = getConnectMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
        return;
      }

      const session = pollSessions.get(sessionId);
      if (!session) {
        pollSessions.set(sessionId, { lastSeen: Date.now(), pending: [] });
        const messages = getConnectMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
        return;
      }

      const pending = session.pending;
      session.pending = [];
      session.lastSeen = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pending));
      return;
    }

    // Static file serving from dist/web/
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const staticPath = resolveStaticAssetPath(distWebDir, url.pathname);

    if (staticPath && existsSync(staticPath)) {
      const content = readFileSync(staticPath);
      const ext = extname(requestedPath);
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream';

      // TODO(prod): conditional caching headers for edge/prod deployment
      // e.g. Cache-Control: public, max-age=31536000, immutable for hashed assets
      // e.g. Cache-Control: no-cache for index.html (revalidate on every request)
      const cacheHeaders = {
        'Content-Type': mime,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };

      if (requestedPath.endsWith('.html') && themeCss) {
        let html = content.toString('utf-8');
        const themeTag = `<style id="bmd-theme">\n${themeCss}\n</style>`;
        const injected = html.includes('</head>')
          ? html.replace('</head>', `${themeTag}\n</head>`)
          : html.replace('<head>', `<head>\n${themeTag}`);
        res.writeHead(200, cacheHeaders);
        res.end(injected);
      } else {
        res.writeHead(200, cacheHeaders);
        res.end(content);
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // WebSocket server attached to HTTP server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    wsClients.add(ws);
    const messages = getConnectMessages();
    for (const msg of messages) {
      ws.send(createServerMessage(msg));
    }

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const raw = Array.isArray(data)
        ? Buffer.concat(data).toString('utf-8')
        : Buffer.isBuffer(data)
          ? data.toString('utf-8')
          : Buffer.from(data).toString('utf-8');
      const parsed = parseClientMessage(raw);
      if (!parsed) return;

      if (parsed.type === 'client:error') {
        writeDiagnostic({
          file: 'src/server/index.ts',
          line: 448, col: 9, span: 0,
          message: `client error: ${parsed.message}${parsed.stack ? '\n' + parsed.stack : ''}`,
          severity: Severity.DiagError,
        });
        return;
      }

      if (parsed.type === 'client:diagnostic') {
        // Relay through sinks (level-gated) without adding [server] prefix
        defaultLogger.relay(parsed.diagnostic);
        return;
      }

      const result = serverTransition(state, parsed);
      state = result.state;
      executeSideEffects(result, ws);
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      reconcilingClients.delete(ws);
      reconcileBuffers.delete(ws);
    });
  });

  httpServer.listen(port, host);

  // Graceful shutdown
  const handleShutdown = () => {
    clearInterval(pollCleanupInterval);
    if (filePath) yjsManager.cleanup(filePath);
    if (stopWatcher) stopWatcher();
    if (stopMapWatcher) stopMapWatcher();
    wss.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  return {
    server: httpServer,
    stop: () => {
      process.off('SIGINT', handleShutdown);
      process.off('SIGTERM', handleShutdown);
      clearInterval(pollCleanupInterval);
      if (filePath) yjsManager.cleanup(filePath);
      if (stopWatcher) stopWatcher();
      if (stopMapWatcher) stopMapWatcher();
      wss.close();
      httpServer.close();
    },
  };
}
