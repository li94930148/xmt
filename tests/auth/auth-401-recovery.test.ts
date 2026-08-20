import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthRuntime } from '../../src/auth/runtime/auth-runtime.js';

const dom = new JSDOM('', { url: 'https://xmt.test/' });
Object.assign(dom.window, { fetch: globalThis.fetch, Request: globalThis.Request, Response: globalThis.Response, Headers: globalThis.Headers });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage });
const { createApiFetchInterceptor } = await import('../../src/utils/apiInterceptor.js');
const origin = 'https://xmt.test';
const baseDependencies = (overrides: Partial<Parameters<typeof createApiFetchInterceptor>[1]> = {}) => ({
  native: () => false, apiBaseUrl: () => 'https://xmt.test/api', refreshWeb: async () => null, refreshNative: async () => null,
  updateAccessToken: () => undefined, expireSession: () => undefined, origin, ...overrides,
});

// v1-web Legacy recovery and AuthRuntime's real single-flight refresh manager.
let refreshCalls = 0;
const runtime = new AuthRuntime({ refreshAccessToken: async () => { refreshCalls += 1; await delay(10); return 'new-web-token'; } });
runtime.beginAuthentication(); runtime.authenticate({ id: 1, username: 'web', name: 'Web', email: '', role: 'member' }, 'old-web-token');
const webRequests: Request[] = [];
const webFetch: typeof fetch = async (request) => {
  const actual = request as Request; webRequests.push(actual.clone());
  return actual.headers.get('authorization') === 'Bearer new-web-token' ? new Response('ok', { status: 200 }) : new Response('', { status: 401 });
};
const webInterceptor = createApiFetchInterceptor(webFetch, baseDependencies({ refreshWeb: () => runtime.refresh() }));
const webResponses = await Promise.all(Array.from({ length: 4 }, () => webInterceptor(`${origin}/api/topics`, { headers: { Authorization: 'Bearer old-web-token' } })));
assert.deepEqual(webResponses.map((response) => response.status), [200, 200, 200, 200]);
assert.equal(refreshCalls, 1);
assert.equal(webRequests.filter((request) => request.headers.get('authorization') === 'Bearer new-web-token').length, 4);

// Native Legacy recovery uses its supplied refresh runtime and the new Bearer token.
let nativeRefreshCalls = 0;
const nativeRequests: Request[] = [];
const nativeInterceptor = createApiFetchInterceptor(async (request) => {
  const actual = request as Request; nativeRequests.push(actual.clone());
  return actual.headers.get('authorization') === 'Bearer native-new' ? new Response('ok', { status: 200 }) : new Response('', { status: 401 });
}, baseDependencies({ native: () => true, refreshNative: async () => { nativeRefreshCalls += 1; return 'native-new'; } }));
assert.equal((await nativeInterceptor(`${origin}/api/topics`, { headers: { Authorization: 'Bearer old' } })).status, 200);
assert.equal(nativeRefreshCalls, 1);

// Request + init semantics: init forms the first effective request and retry changes only Authorization.
const initRequests: Request[] = [];
const initInterceptor = createApiFetchInterceptor(async (request) => { initRequests.push((request as Request).clone()); return initRequests.length === 1 ? new Response('', { status: 401 }) : new Response('ok'); }, baseDependencies({ refreshWeb: async () => 'fresh' }));
const source = new Request(`${origin}/api/topics`, { method: 'POST', body: 'source', credentials: 'omit' });
const controller = new AbortController();
await initInterceptor(source, { method: 'PUT', body: 'override', credentials: 'include', signal: controller.signal, headers: { 'X-Test': 'present' } });
assert.equal(initRequests.length, 2);
for (const request of initRequests) { assert.equal(request.method, 'PUT'); assert.equal(await request.text(), 'override'); assert.equal(request.credentials, 'include'); assert.equal(request.signal.aborted, false); assert.equal(request.headers.get('x-test'), 'present'); }
controller.abort();
for (const request of initRequests) assert.equal(request.signal.aborted, true);
assert.equal(initRequests[1].headers.get('authorization'), 'Bearer fresh');

// Failure has one expiry action and a response is retried at most once.
let expireCalls = 0; let failedRefreshCalls = 0; let retryCalls = 0;
const failedInterceptor = createApiFetchInterceptor(async () => { retryCalls += 1; return new Response('', { status: 401 }); }, baseDependencies({ refreshWeb: async () => { failedRefreshCalls += 1; return null; }, expireSession: () => { expireCalls += 1; } }));
await Promise.all([failedInterceptor(`${origin}/api/topics`), failedInterceptor(`${origin}/api/topics`)]);
assert.equal(failedRefreshCalls, 2); assert.equal(expireCalls, 1); assert.equal(retryCalls, 2);
const singleRetry = createApiFetchInterceptor(async () => { retryCalls += 1; return new Response('', { status: 401 }); }, baseDependencies({ refreshWeb: async () => 'fresh' }));
await singleRetry(`${origin}/api/topics`); assert.equal(retryCalls, 4);

// V1, auth endpoints and external origins must remain outside this recovery boundary.
let excludedRefreshes = 0;
const excluded = createApiFetchInterceptor(async () => new Response('', { status: 401 }), baseDependencies({ refreshWeb: async () => { excludedRefreshes += 1; return 'never'; } }));
for (const path of [`${origin}/api/v1/users`, `${origin}/api/auth/login`, `${origin}/api/auth/logout`, `${origin}/api/auth/refresh`, `${origin}/api/v1/auth/refresh`, 'https://external.test/api/topics']) await excluded(path);
assert.equal(excludedRefreshes, 0);

// Exact URL.origin comparison rejects lookalikes, ports and protocol downgrades without leaking a fresh bearer.
const hostileRequests: Request[] = []; let hostileRefreshes = 0; let hostileUpdates = 0; let hostileExpires = 0;
const hostileWeb = createApiFetchInterceptor(async (request) => { hostileRequests.push((request as Request).clone()); return new Response('', { status: 401 }); }, baseDependencies({ refreshWeb: async () => { hostileRefreshes += 1; return 'fresh-token'; }, updateAccessToken: () => { hostileUpdates += 1; }, expireSession: () => { hostileExpires += 1; } }));
for (const url of ['https://xmt.test.evil/api/topics', 'https://xmt.test.attacker.com/api/topics', 'https://xmt.test:444/api/topics', 'http://xmt.test/api/topics']) await hostileWeb(url);
assert.equal(hostileRefreshes, 0); assert.equal(hostileUpdates, 0); assert.equal(hostileExpires, 0);
assert.ok(hostileRequests.every((request) => request.headers.get('authorization') !== 'Bearer fresh-token' && request.headers.get('authorization') !== 'Bearer new-web-token'));

const nativeOrigin = 'https://lanyaomedia.com'; const nativeHostileRequests: Request[] = []; let nativeHostileRefreshes = 0;
const hostileNative = createApiFetchInterceptor(async (request) => { nativeHostileRequests.push((request as Request).clone()); return new Response('', { status: 401 }); }, baseDependencies({ native: () => true, apiBaseUrl: () => `${nativeOrigin}/api`, refreshNative: async () => { nativeHostileRefreshes += 1; return 'native-fresh'; } }));
for (const url of ['https://lanyaomedia.com.evil/api/topics', 'https://lanyaomedia.com:444/api/topics', 'http://lanyaomedia.com/api/topics']) await hostileNative(url);
assert.equal(nativeHostileRefreshes, 0);
assert.ok(nativeHostileRequests.every((request) => request.headers.get('authorization') !== 'Bearer native-fresh'));
const nativeExact = createApiFetchInterceptor(async (request) => (request as Request).headers.get('authorization') === 'Bearer native-fresh' ? new Response('ok') : new Response('', { status: 401 }), baseDependencies({ native: () => true, apiBaseUrl: () => `${nativeOrigin}/api`, refreshNative: async () => 'native-fresh' }));
assert.equal((await nativeExact(`${nativeOrigin}/api/topics`)).status, 200);
console.log('Auth 401 recovery behavior tests passed');
