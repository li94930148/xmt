import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

test('socket unread-count refresh ignores stale responses', async () => {
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://xmt.test/' });
const globalKeys = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator'] as const;
const previousGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: dom.window },
    document: { configurable: true, writable: true, value: dom.window.document },
    localStorage: { configurable: true, writable: true, value: dom.window.localStorage },
    sessionStorage: { configurable: true, writable: true, value: dom.window.sessionStorage },
    navigator: { configurable: true, writable: true, value: dom.window.navigator },
  });
  const { createUnreadCountRefresher } = await import('../../src/hooks/useSocket');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/hooks/useSocket.ts'), 'utf8');
assert.equal((source.match(/void refreshUnreadCount\(\)/g) ?? []).length, 2, 'connect and unread_count events share the guarded refresh');
assert.match(source, /globalSocket === nextSocket[\s\S]*?currentAuth\.user\?\.id === user\.id[\s\S]*?currentAuth\.token === token/, 'a response must still belong to the active socket and authenticated user');

const pendingReads: Array<ReturnType<typeof deferred<{ unreadCount: number }>>> = [];
let unreadCount = -1;
const refreshForCurrentSocket = createUnreadCountRefresher(
  () => {
    const request = deferred<{ unreadCount: number }>();
    pendingReads.push(request);
    return request.promise;
  },
  (count) => { unreadCount = count; },
  () => true,
);

const olderRequest = refreshForCurrentSocket();
const newerRequest = refreshForCurrentSocket();
pendingReads[1]!.resolve({ unreadCount: 2 });
await newerRequest;
pendingReads[0]!.resolve({ unreadCount: 1 });
await olderRequest;
assert.equal(unreadCount, 2, 'an older response cannot overwrite the newest unread count');

let activeSocketId = 'socket-a';
let activeUserId = 17;
const previousSocketRead = deferred<{ unreadCount: number }>();
const staleSocketRefresher = createUnreadCountRefresher(
  () => previousSocketRead.promise,
  (count) => { unreadCount = count; },
  () => activeSocketId === 'socket-a' && activeUserId === 17,
);
const staleSocketRequest = staleSocketRefresher();

activeSocketId = 'socket-b';
const currentSocketRead = deferred<{ unreadCount: number }>();
const refreshForSocketB = createUnreadCountRefresher(
  () => currentSocketRead.promise,
  (count) => { unreadCount = count; },
  () => activeSocketId === 'socket-b' && activeUserId === 17,
);
const currentSocketRequest = refreshForSocketB();
currentSocketRead.resolve({ unreadCount: 4 });
await currentSocketRequest;
previousSocketRead.resolve({ unreadCount: 99 });
await staleSocketRequest;
assert.equal(unreadCount, 4, 'a previous socket response cannot overwrite the active socket count');

const previousUserRead = deferred<{ unreadCount: number }>();
const refreshForPreviousUser = createUnreadCountRefresher(
  () => previousUserRead.promise,
  (count) => { unreadCount = count; },
  () => activeSocketId === 'socket-b' && activeUserId === 17,
);
const staleUserRequest = refreshForPreviousUser();
activeUserId = 29;
previousUserRead.resolve({ unreadCount: 123 });
await staleUserRequest;
assert.equal(unreadCount, 4, 'a previous user response cannot overwrite the active account count');

} finally {
  for (const key of globalKeys) {
    const descriptor = previousGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  dom.window.close();
}
});
