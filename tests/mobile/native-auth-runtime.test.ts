import assert from 'node:assert/strict';
import { MobileRefreshError } from '../../src/api/auth.ts';
import { createNativeAuthRuntime, readAccessTokenExpiry } from '../../src/auth/native/native-auth-runtime.ts';

const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const tokenWithExpiry = `${encoded({ alg: 'none' })}.${encoded({ exp: 1_800_000_000 })}.signature`;

assert.equal(readAccessTokenExpiry(tokenWithExpiry), 1_800_000_000_000);
assert.equal(readAccessTokenExpiry('invalid'), null);

let currentAccessToken: string | null = 'expired-access-token';
let storedRefreshToken: string | null = 'refresh-before-rotation';
let refreshCalls = 0;
let loginCalls = 0;
let logoutCalls = 0;
let clearCalls = 0;

const runtime = createNativeAuthRuntime({
  getAccessToken: () => currentAccessToken,
  getUser: () => ({ id: 1, name: '移动测试用户' }) as never,
  getRefreshToken: async () => storedRefreshToken,
  setRefreshToken: async (token) => { storedRefreshToken = token; },
  clearRefreshToken: async () => { storedRefreshToken = null; clearCalls += 1; },
  clearUser: () => { clearCalls += 1; },
  login: (_user, token) => { currentAccessToken = token; loginCalls += 1; },
  logout: () => { logoutCalls += 1; },
  refreshRequest: async () => {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { accessToken: tokenWithExpiry, refreshToken: 'refresh-after-rotation', expiresIn: 900 };
  },
  now: () => 0,
});

const [firstRefresh, secondRefresh] = await Promise.all([runtime.refresh(), runtime.refresh()]);
assert.equal(firstRefresh, tokenWithExpiry);
assert.equal(secondRefresh, tokenWithExpiry);
assert.equal(refreshCalls, 1, '并发恢复必须只轮换一次 refresh credential');
assert.equal(storedRefreshToken, 'refresh-after-rotation');
assert.equal(loginCalls, 1);
assert.equal(runtime.getExpiresAt(), 900_000);
assert.equal(runtime.getTraceSnapshot().expirySource, 'server_expires_in');
assert.equal(runtime.getTraceSnapshot().status, 'authenticated');
runtime.stop();

const invalidRuntime = createNativeAuthRuntime({
  getAccessToken: () => null,
  getUser: () => ({ id: 1, name: '移动测试用户' }) as never,
  getRefreshToken: async () => 'revoked-refresh',
  setRefreshToken: async () => undefined,
  clearRefreshToken: async () => { clearCalls += 1; },
  clearUser: () => { clearCalls += 1; },
  login: () => { throw new Error('失效会话不得重新登录'); },
  logout: () => { logoutCalls += 1; },
  refreshRequest: async () => { throw new MobileRefreshError('refresh revoked', true, 401, 'AUTH_REFRESH_INVALID'); },
});

assert.equal(await invalidRuntime.refresh(), null);
assert.equal(logoutCalls, 1);
assert.equal(clearCalls, 2, '失效 refresh 必须清除凭据与本地资料');
console.log('native auth runtime tests passed');
