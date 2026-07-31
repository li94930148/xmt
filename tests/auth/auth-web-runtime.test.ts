import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthRuntime } from '../../src/auth/runtime/auth-runtime.js';
import { resolveAuthMode } from '../../src/auth/runtime/auth-mode.js';
import { MemoryAccessTokenStore } from '../../src/auth/runtime/token-memory-store.js';
import { ApiClient } from '../../packages/api-client/client.js';
import { AuthV1Client } from '../../packages/api-client/auth-client.js';
import {
  AUTH_REFRESH_COOKIE_NAME,
  clearAuthRefreshCookie,
  createAuthCookieOptions,
  setAuthRefreshCookie,
} from '../../api/modules/auth/web/auth-cookie.config.js';
import {
  isAuthWebAllowed,
  parseAuthWebAllowlist,
  readAuthWebConfig,
} from '../../api/modules/auth/web/auth-web.config.js';
import { CsrfService } from '../../api/modules/auth/web/csrf.service.js';
import type { AuthV1User } from '../../shared/schema/auth.schema.js';

const user: AuthV1User = {
  id: 7,
  username: 'runtime-user',
  name: 'Runtime User',
  email: 'runtime@example.invalid',
  role: 'member',
  forceChangePassword: false,
};

assert.equal(resolveAuthMode(), 'legacy');
assert.equal(resolveAuthMode({ webAuthEnabled: false, userId: 7, allowlistedUserIds: new Set([7]) }), 'legacy');
assert.equal(resolveAuthMode({ webAuthEnabled: true, userId: 7, allowlistedUserIds: new Set([7]) }), 'v1-web');

const allowlist = parseAuthWebAllowlist('7, 9,invalid,-1,0,7');
assert.deepEqual([...allowlist], [7, 9]);
assert.equal(readAuthWebConfig({ XMT_AUTH_WEB_ENABLED: undefined }).enabled, false);
assert.equal(isAuthWebAllowed(7, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7,9',
  NODE_ENV: 'test',
}), true);
assert.equal(isAuthWebAllowed(8, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7,9',
  NODE_ENV: 'test',
}), false);
assert.equal(isAuthWebAllowed(7, {
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
  NODE_ENV: 'production',
}), false);
assert.equal(isAuthWebAllowed(7, {
  XMT_AUTH_V1_ENABLED: 'false',
  XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
  NODE_ENV: 'test',
}), false);

const memoryStore = new MemoryAccessTokenStore();
memoryStore.setToken('memory-only-token');
assert.equal(memoryStore.getToken(), 'memory-only-token');
assert.equal(Object.keys(memoryStore).some((key) => /storage/i.test(key)), false);
memoryStore.clearToken();
assert.equal(memoryStore.getToken(), null);

let refreshCalls = 0;
const runtime = new AuthRuntime({
  tokenStore: memoryStore,
  refreshAccessToken: async () => {
    refreshCalls += 1;
    await delay(10);
    return 'refreshed-access';
  },
});
runtime.bootstrap('v1-web');
runtime.authenticate(user, 'initial-access');
const [firstRefresh, secondRefresh] = await Promise.all([runtime.refresh(), runtime.refresh()]);
assert.equal(firstRefresh, 'refreshed-access');
assert.equal(secondRefresh, 'refreshed-access');
assert.equal(refreshCalls, 1);
assert.equal(runtime.getAccessToken(), 'refreshed-access');
assert.equal(runtime.getState().status, 'authenticated');

const failedRuntime = new AuthRuntime({ refreshAccessToken: async () => { throw new Error('offline'); } });
failedRuntime.bootstrap('v1-web');
failedRuntime.authenticate(user, 'temporary-access');
assert.equal(await failedRuntime.refresh(), null);
assert.equal(failedRuntime.getState().status, 'expired');
assert.equal(failedRuntime.getAccessToken(), null);
failedRuntime.clear();
assert.deepEqual(failedRuntime.getState(), { mode: 'legacy', status: 'anonymous', user: null });

let requestCalls = 0;
let clientRefreshCalls = 0;
let currentToken = 'old-access';
const requestHeaders: string[] = [];
const apiClient = new ApiClient({
  getAccessToken: () => currentToken,
  shouldRefreshAccessToken: () => true,
  refreshAccessToken: async () => {
    clientRefreshCalls += 1;
    currentToken = 'new-access';
    return currentToken;
  },
  fetchImpl: async (_input, init) => {
    requestCalls += 1;
    requestHeaders.push(new Headers(init?.headers).get('Authorization') ?? '');
    assert.equal(init?.credentials, 'include');
    if (requestCalls === 1) {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'expired', requestId: 'request-1' },
      }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
assert.deepEqual(await apiClient.request<{ ok: boolean }>('runtime-check'), { ok: true });
assert.equal(requestCalls, 2);
assert.equal(clientRefreshCalls, 1);
assert.deepEqual(requestHeaders, ['Bearer old-access', 'Bearer new-access']);

let concurrentRequestCalls = 0;
let concurrentRefreshCalls = 0;
let concurrentToken = 'old-concurrent-access';
const concurrentClient = new ApiClient({
  getAccessToken: () => concurrentToken,
  shouldRefreshAccessToken: () => true,
  refreshAccessToken: async () => {
    concurrentRefreshCalls += 1;
    await delay(10);
    concurrentToken = 'new-concurrent-access';
    return concurrentToken;
  },
  fetchImpl: async (_input, init) => {
    concurrentRequestCalls += 1;
    const token = new Headers(init?.headers).get('Authorization');
    const unauthorized = token === 'Bearer old-concurrent-access';
    return new Response(JSON.stringify(unauthorized
      ? { success: false, error: { code: 'AUTH_REQUIRED', message: 'expired', requestId: 'request-3' } }
      : { success: true, data: { ok: true } }), {
      status: unauthorized ? 401 : 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
await Promise.all([
  concurrentClient.request('concurrent-a'),
  concurrentClient.request('concurrent-b'),
]);
assert.equal(concurrentRefreshCalls, 1);
assert.equal(concurrentRequestCalls, 4);

let persistentUnauthorizedCalls = 0;
const persistentUnauthorizedClient = new ApiClient({
  getAccessToken: () => 'access',
  shouldRefreshAccessToken: () => true,
  refreshAccessToken: async () => 'new-access',
  fetchImpl: async () => {
    persistentUnauthorizedCalls += 1;
    return new Response(JSON.stringify({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'expired', requestId: 'request-2' },
    }), { status: 401, headers: { 'content-type': 'application/json' } });
  },
});
await assert.rejects(() => persistentUnauthorizedClient.request('still-unauthorized'));
assert.equal(persistentUnauthorizedCalls, 2);

const authCalls: Array<{ url: string; method?: string; body?: string }> = [];
const authClient = new AuthV1Client(new ApiClient({
  fetchImpl: async (input, init) => {
    authCalls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
}));
assert.deepEqual(await authClient.getSessionsV1(), []);
assert.equal(authCalls[0]?.url, '/api/v1/auth/sessions');

const cookieOptions = createAuthCookieOptions({ secure: true }, 60_000);
assert.deepEqual(cookieOptions, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60_000,
});
assert.equal('domain' in cookieOptions, false);

let setCookieCall: unknown[] = [];
let clearCookieCall: unknown[] = [];
setAuthRefreshCookie({ cookie: (...args: unknown[]) => { setCookieCall = args; return undefined as never; } }, 'secret', { secure: true });
clearAuthRefreshCookie({ cookie: (...args: unknown[]) => { clearCookieCall = args; return undefined as never; } }, { secure: true });
assert.equal(setCookieCall[0], AUTH_REFRESH_COOKIE_NAME);
assert.equal(setCookieCall[1], 'secret');
assert.equal(clearCookieCall[0], AUTH_REFRESH_COOKIE_NAME);

const csrf = new CsrfService({ secret: 'csrf-test-secret' });
const csrfToken = csrf.generateToken('session-1');
assert.equal(csrf.verifyToken('session-1', csrfToken), true);
assert.equal(csrf.verifyToken('session-2', csrfToken), false);
assert.equal(csrf.verifyDoubleSubmit('session-1', csrfToken, csrfToken), true);
assert.equal(csrf.verifyDoubleSubmit('session-1', csrfToken, `${csrfToken}x`), false);
assert.equal(csrf.verifyToken('session-1', `${csrfToken}x`), false);

console.log('Auth Web Runtime and infrastructure tests passed');
