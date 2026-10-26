import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { Socket } from 'socket.io-client';
import { useRealtimeSync } from '../../src/hooks/useRealtimeSync';

type Handler = (data?: unknown) => void;

class FakeSocket {
  connected = false;
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  private readonly handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    const listeners = this.handlers.get(event) ?? new Set<Handler>();
    listeners.add(handler);
    this.handlers.set(event, listeners);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (!handler) {
      this.handlers.delete(event);
      return this;
    }
    const listeners = this.handlers.get(event);
    listeners?.delete(handler);
    if (listeners?.size === 0) this.handlers.delete(event);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
    return this;
  }

  dispatch(event: string, data?: unknown) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(data);
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://xmt.test/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const { createRoot } = await import('react-dom/client');

const socket = new FakeSocket();
let earlierHandlerCalls = 0;
let currentHandlerCalls = 0;
let unrelatedHandlerCalls = 0;
const productionRefreshPages: number[] = [];
const unrelatedHandler = () => { unrelatedHandlerCalls += 1; };
socket.on('topic:created', unrelatedHandler);

function Harness({ page, onTopicCreated }: { page: number; onTopicCreated: () => void }) {
  useRealtimeSync({
    room: 'topics',
    socket: socket as unknown as Socket,
    events: {
      'topic:created': onTopicCreated,
      'production:created': () => { productionRefreshPages.push(page); },
    },
  });
  return null;
}

const root = createRoot(document.getElementById('root')!);
let mounted = true;
try {
  await act(async () => {
    root.render(createElement(Harness, { page: 1, onTopicCreated: () => { earlierHandlerCalls += 1; } }));
  });
  assert.equal(socket.listenerCount('topic:created'), 2, 'the hook adds one scoped listener beside an unrelated subscriber');
  assert.equal(socket.listenerCount('connect'), 1, 'the hook installs one reconnect join listener');

  await act(async () => { socket.dispatch('connect'); });
  assert.equal(socket.emitted.filter((entry) => entry.event === 'join').length, 1, 'initial connection joins the room once');

  await act(async () => {
    root.render(createElement(Harness, { page: 2, onTopicCreated: () => { currentHandlerCalls += 1; } }));
  });
  await act(async () => { socket.dispatch('topic:created', { id: 1 }); });
  await act(async () => { socket.dispatch('production:created', { id: 2 }); });
  assert.equal(earlierHandlerCalls, 0, 'an event uses the latest render callback');
  assert.equal(currentHandlerCalls, 1, 'the latest callback receives the event exactly once');
  assert.deepEqual(productionRefreshPages, [2], 'a created event after page 1 → page 2 requests the latest page');
  assert.equal(unrelatedHandlerCalls, 1, 'the unrelated subscriber remains active');

  await act(async () => {
    socket.dispatch('disconnect', 'transport close');
    socket.dispatch('connect');
  });
  assert.equal(socket.emitted.filter((entry) => entry.event === 'join').length, 2, 'reconnection rejoins the room without adding listeners');
  assert.equal(socket.listenerCount('topic:created'), 2, 'reconnection does not duplicate the hook subscription');
  await act(async () => {
    socket.dispatch('topic:created', { id: 3 });
    socket.dispatch('production:created', { id: 4 });
  });
  assert.equal(currentHandlerCalls, 2, 'one event after reconnect invokes the current callback once');
  assert.deepEqual(productionRefreshPages, [2, 2], 'a reconnect does not restore a stale page callback');
  assert.equal(unrelatedHandlerCalls, 2, 'the unrelated subscription still receives the event');

  await act(async () => { root.unmount(); });
  mounted = false;
  assert.equal(socket.listenerCount('topic:created'), 1, 'cleanup removes only the hook-owned event listener');
  assert.equal(socket.listenerCount('connect'), 0, 'cleanup removes the hook-owned reconnect listener');
  assert.equal(socket.emitted.filter((entry) => entry.event === 'leave').length, 1, 'cleanup leaves the room once');
  await act(async () => { socket.dispatch('topic:created', { id: 3 }); });
  assert.equal(currentHandlerCalls, 2, 'unmounted hook no longer receives socket events');
  assert.equal(unrelatedHandlerCalls, 3, 'cleanup preserves the unrelated subscriber');
} finally {
  if (mounted) await act(async () => { root.unmount(); });
  dom.window.close();
}

console.log('Realtime sync lifecycle test passed: handlers stay current, reconnect is idempotent, and cleanup is listener-scoped.');
