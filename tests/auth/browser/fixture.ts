import { AuthRuntime } from '../../../src/auth/runtime/auth-runtime';
import { ApiClient } from '../../../packages/api-client/client';
import { AuthV1Client } from '../../../packages/api-client/auth-client';
import type { AuthV1User } from '../../../shared/schema/auth.schema';

const USER_CACHE_KEY = 'xmt_auth_browser_fixture_user';
const rawClient = new ApiClient({ baseURL: '/api/v1' });
const rawAuthClient = new AuthV1Client(rawClient);
let refreshCount = 0;
let csrfOverride: string | null = null;
let lastSessionId: string | null = null;

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const value = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function readCachedUser(): AuthV1User | null {
  const value = localStorage.getItem(USER_CACHE_KEY);
  return value ? JSON.parse(value) as AuthV1User : null;
}

function clearCachedUser() {
  localStorage.removeItem(USER_CACHE_KEY);
}

const runtime = new AuthRuntime({
  refreshAccessToken: async () => {
    refreshCount += 1;
    try {
      const csrfToken = csrfOverride ?? readCookie('__Host-xmt_csrf');
      if (!csrfToken) throw new Error('Missing CSRF token');
      const result = await rawAuthClient.refreshV1(csrfToken);
      lastSessionId = result.session.id;
      return result.accessToken;
    } catch (error) {
      clearCachedUser();
      throw error;
    }
  },
});

const protectedClient = new ApiClient({
  baseURL: '/api/v1',
  getAccessToken: () => runtime.getAccessToken(),
  shouldRefreshAccessToken: () => runtime.isV1WebMode(),
  refreshAccessToken: () => runtime.refresh(),
});
const protectedAuthClient = new AuthV1Client(protectedClient);

function render() {
  const state = runtime.getState();
  const status = document.querySelector('#status');
  if (status) status.textContent = `${state.mode}:${state.status}`;
}

async function login() {
  const result = await rawAuthClient.loginV1({
    username: 'auth-browser-user',
    password: 'auth-browser-password',
    client: { type: 'web', deviceName: 'Playwright Browser' },
  });
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(result.user));
  lastSessionId = result.session.id;
  runtime.authenticate(result.user, result.accessToken);
  render();
  return state();
}

async function coldBoot() {
  runtime.clear();
  runtime.bootstrap('v1-web');
  const cachedUser = readCachedUser();
  const token = await runtime.refresh();
  if (token && cachedUser) runtime.authenticate(cachedUser, token);
  render();
  return state();
}

async function refreshNow() {
  const token = await runtime.refresh();
  render();
  return { token, state: state() };
}

async function parallelSessions(count: number) {
  const before = refreshCount;
  const results = await Promise.all(
    Array.from({ length: count }, () => protectedAuthClient.getSessionsV1()),
  );
  render();
  return { refreshes: refreshCount - before, resultCount: results.length, state: state() };
}

async function logout() {
  const csrfToken = readCookie('__Host-xmt_csrf');
  if (!csrfToken) throw new Error('Missing CSRF token');
  await protectedAuthClient.logoutV1(csrfToken);
  runtime.clear();
  clearCachedUser();
  render();
  return state();
}

async function accessAfterLogout() {
  try {
    await protectedAuthClient.getSessionsV1();
    return 'unexpected-success';
  } catch {
    return 'authentication-required';
  }
}

function state() {
  const runtimeState = runtime.getState();
  const token = runtime.getAccessToken();
  const storageValues = [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage),
  ];
  return {
    ...runtimeState,
    token,
    user: runtimeState.user,
    lastSessionId,
    refreshCount,
    refreshCookieVisible: document.cookie.includes('__Host-xmt_refresh='),
    csrfCookieVisible: document.cookie.includes('__Host-xmt_csrf='),
    accessTokenPersisted: Boolean(token && storageValues.includes(token)),
  };
}

window.authFixture = {
  login,
  coldBoot,
  refreshNow,
  parallelSessions,
  logout,
  accessAfterLogout,
  state,
  expireAccess() {
    const user = readCachedUser();
    if (!user) throw new Error('Missing cached user');
    runtime.authenticate(user, 'invalid-access-token');
    render();
  },
  setCsrfOverride(value: string | null) {
    csrfOverride = value;
  },
};

render();

declare global {
  interface Window {
    authFixture: {
      login(): Promise<ReturnType<typeof state>>;
      coldBoot(): Promise<ReturnType<typeof state>>;
      refreshNow(): Promise<{ token: string | null; state: ReturnType<typeof state> }>;
      parallelSessions(count: number): Promise<{
        refreshes: number;
        resultCount: number;
        state: ReturnType<typeof state>;
      }>;
      logout(): Promise<ReturnType<typeof state>>;
      accessAfterLogout(): Promise<string>;
      state(): ReturnType<typeof state>;
      expireAccess(): void;
      setCsrfOverride(value: string | null): void;
    };
  }
}
