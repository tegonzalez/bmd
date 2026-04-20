/**
 * Unit tests for ws-client: backoff, status callbacks, retryNow, no polling.
 *
 * State machine under test:
 *   connected (green) → reconnecting (yellow, immediate retry) →
 *     → connected (green) if success
 *     → disconnected (red, backoff) if fail → reconnecting (yellow) on timer → ...
 */
import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { getRuntime } from '../../src/runtime/index.ts';

describe('ws-client exports', () => {
  const rt = getRuntime();

  test('MAX_BACKOFF_MS equals 60000', async () => {
    const { MAX_BACKOFF_MS } = await import('../../src/web/ws-client.ts');
    expect(MAX_BACKOFF_MS).toBe(60000);
  });

  test('INITIAL_BACKOFF_MS equals 1000', async () => {
    const { INITIAL_BACKOFF_MS } = await import('../../src/web/ws-client.ts');
    expect(INITIAL_BACKOFF_MS).toBe(1000);
  });

  test('no polling functions are exported (startPolling, stopPolling)', async () => {
    const wsClient = await import('../../src/web/ws-client.ts');
    expect((wsClient as any).startPolling).toBeUndefined();
    expect((wsClient as any).stopPolling).toBeUndefined();
    expect((wsClient as any).attemptWsReconnect).toBeUndefined();
  });

  test('showBanner/hideBanner are not imported (source check)', async () => {
    const src = await rt.readFile('src/web/ws-client.ts');
    expect(src).not.toContain('showBanner');
    expect(src).not.toContain('hideBanner');
    expect(src).not.toContain('notifications');
  });

  test('digest tracking not in transport layer (moved to client-adapter)', async () => {
    const wsClient = await import('../../src/web/ws-client.ts');
    expect((wsClient as any).getLastDigest).toBeUndefined();
    expect((wsClient as any).setLastDigest).toBeUndefined();
  });

  test('retryNow is in the WebSocketClient interface (source check)', async () => {
    const src = await rt.readFile('src/web/ws-client.ts');
    expect(src).toContain('retryNow: () => void');
  });
});

describe('ws-client behavior (with mock WebSocket)', () => {
  const rt = getRuntime();
  // Store original globals
  let origWebSocket: any;
  let origWindow: any;
  let mockInstances: MockWebSocket[];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    onopen: ((ev: any) => void) | null = null;
    onclose: ((ev: any) => void) | null = null;
    onmessage: ((ev: any) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    url: string;

    constructor(url: string) {
      this.url = url;
      mockInstances.push(this);
    }

    send(_data: string) {}
    close() {
      this.readyState = MockWebSocket.CLOSED;
    }

    // Test helpers
    simulateOpen() {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({} as any);
    }

    simulateClose() {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({} as any);
    }

    simulateError() {
      this.onerror?.({} as any);
    }

    simulateMessage(data: string) {
      this.onmessage?.({ data } as any);
    }
  }

  beforeEach(() => {
    mockInstances = [];
    origWebSocket = (globalThis as any).WebSocket;
    origWindow = (globalThis as any).window;

    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        host: 'localhost:3000',
      },
    };
  });

  afterEach(() => {
    (globalThis as any).WebSocket = origWebSocket;
    if (origWindow) {
      (globalThis as any).window = origWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  test('onStatusChange fires "connected" on successful open', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');
    const statuses: string[] = [];

    const client = createWebSocketClient({
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });

    expect(mockInstances.length).toBeGreaterThan(0);
    mockInstances[mockInstances.length - 1]!.simulateOpen();

    expect(statuses).toContain('connected');
    client.close();
  });

  test('state machine: connected → reconnecting (immediate retry) → disconnected (backoff)', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');
    const statuses: string[] = [];

    const client = createWebSocketClient({
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });

    // Initial connect
    const ws1 = mockInstances[mockInstances.length - 1]!;
    ws1.simulateOpen();
    statuses.length = 0;

    // Server disconnect → immediate retry (yellow)
    ws1.simulateClose();

    // Should have created a new WS instance immediately (the retry)
    expect(mockInstances.length).toBeGreaterThanOrEqual(2);
    // First status after close should be 'reconnecting' (from the immediate connect() call)
    expect(statuses[0]!).toBe('reconnecting');

    // The immediate retry also fails → deferred backoff (yellow visible for MIN_YELLOW_MS)
    const ws2 = mockInstances[mockInstances.length - 1]!;
    ws2.simulateClose();

    // 'disconnected' is deferred so yellow is visible — wait for it
    await rt.sleep(1000);
    expect(statuses).toContain('disconnected');

    client.close();
  });

  test('state machine: disconnected → reconnecting when backoff timer fires', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');
    const statuses: string[] = [];

    const client = createWebSocketClient({
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });

    const ws1 = mockInstances[mockInstances.length - 1]!;
    ws1.simulateOpen();
    statuses.length = 0;

    // Disconnect → immediate retry → fails → deferred backoff
    ws1.simulateClose();
    const ws2 = mockInstances[mockInstances.length - 1]!;
    ws2.simulateClose();

    // Wait for deferred yellow→red + backoff timer (800ms defer + 1000ms backoff)
    await rt.sleep(2200);

    expect(statuses).toContain('disconnected');
    expect(statuses).toContain('reconnecting');
    client.close();
  });

  test('retryNow() resets backoff and immediately reconnects (yellow)', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');
    const statuses: string[] = [];

    const client = createWebSocketClient({
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });

    const ws1 = mockInstances[mockInstances.length - 1]!;
    ws1.simulateOpen();
    ws1.simulateClose(); // triggers immediate retry
    const ws2 = mockInstances[mockInstances.length - 1]!;
    ws2.simulateClose(); // fails → deferred backoff

    // Wait for deferred yellow→red transition
    await rt.sleep(1000);

    statuses.length = 0;

    // User clicks retry
    client.retryNow();
    expect(statuses).toContain('reconnecting');

    client.close();
  });

  test('retryNow() clears pending timers (defer + reconnect)', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');

    const client = createWebSocketClient({
      onMessage: () => {},
    });

    const ws1 = mockInstances[mockInstances.length - 1]!;
    ws1.simulateOpen();
    ws1.simulateClose(); // immediate retry
    const ws2 = mockInstances[mockInstances.length - 1]!;
    ws2.simulateClose(); // fails → defer timer starts (yellow hold)

    // Wait for defer + backoff to settle
    await rt.sleep(2000);

    const countBefore = mockInstances.length;

    // retryNow should create a new WS instance immediately
    client.retryNow();
    expect(mockInstances.length).toBe(countBefore + 1);

    // Wait to make sure old timers don't also fire
    await rt.sleep(2000);

    // Should not have created extra connections from old timers
    expect(mockInstances.length).toBe(countBefore + 1);

    client.close();
  });

  test('client returns retryNow function', async () => {
    const { createWebSocketClient } = await import('../../src/web/ws-client.ts');

    const client = createWebSocketClient({
      onMessage: () => {},
    });

    expect(typeof client.retryNow).toBe('function');
    client.close();
  });
});
