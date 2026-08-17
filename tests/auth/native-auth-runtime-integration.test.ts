import assert from 'node:assert/strict';
import { adaptLoginResponse } from '../../src/auth/web/login-response-adapter.ts';
import { createNativeAuthRuntime, readAccessTokenExpiry } from '../../src/auth/native/native-auth-runtime.ts';
import { useAuthStore } from '../../src/store/index.ts';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });

class Clock {
  now = 0;
  private next = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  set = (callback: () => void, delay: number) => {
    const id = ++this.next;
    this.timers.set(id, { at: this.now + delay, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clear = (id: ReturnType<typeof setTimeout>) => this.timers.delete(id as unknown as number);
  async advance(ms: number) {
    this.now += ms;
    const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= this.now);
    for (const [id, timer] of due) { this.timers.delete(id); timer.callback(); }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  get size() { return this.timers.size; }
}

const jwt = (exp: number, padding = '') => `${Buffer.from(JSON.stringify({ alg: 'HS256', padding })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: '40', sid: 'session', jti: 'id', type: 'access', iss: 'xmt', aud: 'xmt-client', iat: exp - 900, exp, padding })).toString('base64url')}.signature`;
assert.equal(readAccessTokenExpiry(jwt(900, 'a')), 900_000, 'base64url JWT expiry supports unpadded payloads');
assert.equal(readAccessTokenExpiry(jwt(900, 'padding-length-variation')), 900_000, 'JWT expiry supports varied payload lengths');

const response = {
  success: true,
  data: {
    user: { id: 40, username: 'mobile', name: 'Mobile', email: '', role: 'member', forceChangePassword: false },
    accessToken: jwt(900), refreshToken: 'r'.repeat(48), expiresIn: 900,
    session: { id: 'session', clientType: 'android', deviceName: 'XMT Android', appVersion: '2.19.9', createdAt: '2026-01-01', lastSeenAt: '2026-01-01', idleExpiresAt: '2026-01-02', absoluteExpiresAt: '2026-01-31', current: true },
  },
};
const login = adaptLoginResponse(response);
assert.equal(login.expiresIn, 900, 'real V1 envelope preserves expiresIn');

useAuthStore.setState({ user: null, token: null, isLoggedIn: false, persistence: 'memory', authMode: 'legacy' });
const clock = new Clock();
let refreshCalls = 0;
let refreshCredential = response.data.refreshToken;
const runtime = createNativeAuthRuntime({
  getAccessToken: () => useAuthStore.getState().token,
  getUser: () => useAuthStore.getState().user,
  getRefreshToken: async () => refreshCredential,
  setRefreshToken: async (value) => { refreshCredential = value; },
  clearRefreshToken: async () => { refreshCredential = ''; },
  clearUser: () => undefined,
  login: (user, token) => useAuthStore.getState().loginV1(user, token),
  logout: () => useAuthStore.getState().logout(),
  refreshRequest: async () => {
    refreshCalls += 1;
    return { accessToken: jwt(Math.floor(clock.now / 1000) + 900), refreshToken: `rotated-${refreshCalls}`, expiresIn: 900 };
  },
  now: () => clock.now, setTimer: clock.set, clearTimer: clock.clear, refreshLeadMs: 60_000,
});

runtime.start();
assert.equal(runtime.getTraceSnapshot().schedulerArmed, false, 'no-token bootstrap has no scheduler');
useAuthStore.getState().loginV1(login.user, login.accessToken);
runtime.onTokenIssued({ expiresInSeconds: login.expiresIn! }, 'login');
assert.equal(runtime.getTraceSnapshot().expirySource, 'server_expires_in');
assert.equal(runtime.getTraceSnapshot().schedulerArmed, true, 'real store login explicitly arms scheduler');
assert.equal(runtime.getTraceSnapshot().refreshDueAt, 840_000);

await clock.advance(839_000);
assert.equal(refreshCalls, 0, 'first lifecycle does not refresh early');
await clock.advance(1_000);
assert.equal(refreshCalls, 1, 'first lifecycle refreshes exactly once');
assert.equal(refreshCredential, 'rotated-1', 'refresh credential rotates');
assert.equal(runtime.getTraceSnapshot().successfulRefreshCount, 1);
assert.equal(runtime.getTraceSnapshot().schedulerArmed, true, 'first refresh arms next lifetime');

await clock.advance(840_000);
assert.equal(refreshCalls, 2, 'second lifecycle refreshes exactly once');
assert.equal(runtime.getTraceSnapshot().successfulRefreshCount, 2);

await clock.advance(840_000);
await Promise.all([runtime.onResume(), runtime.onNetworkOnline(), runtime.onResume()]);
assert.equal(refreshCalls, 3, 'delayed timer, resume, and network recovery remain single-flight');

runtime.stop();
await clock.advance(900_000);
assert.equal(refreshCalls, 3, 'cleanup prevents an old timer from refreshing');
assert.equal(runtime.getTraceSnapshot().schedulerArmed, false);
console.log('native auth runtime integration tests passed');
