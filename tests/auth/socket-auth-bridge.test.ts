import assert from 'node:assert/strict';
import { createSocketAuthMiddleware, readSocketAuthBridgeEnabled } from '../../api/modules/auth/socket/socket-auth.middleware.js';
import { SocketAuthService } from '../../api/modules/auth/socket/socket-auth.service.js';

const future = Math.floor(Date.now() / 1000) + 600;
const session = { id: 'bridge-session', userId: 9 } as never;
let legacyCalls = 0;
let v1Calls = 0;
const service = new SocketAuthService({
  verifyLegacyToken: (token) => { legacyCalls += 1; return token === 'legacy' ? ({ userId: 9, iat: future - 600, exp: future } as never) : null; },
  verifyAccessTokenV1: (token) => { v1Calls += 1; return token === 'access' ? { sub: '9', sid: 'bridge-session', iat: future - 600, exp: future } : null; },
  findUserById: async () => ({ id: 9, username: 'bridge', name: 'Bridge', role: 'member', enabled: 1 }),
  sessionService: { getSession: async () => ({ state: 'ACTIVE' as const, session }) },
});

function socket(token: string, mode?: string) {
  return { handshake: { auth: { token, ...(mode ? { mode } : {}) }, headers: {} }, data: {} } as never;
}

async function runMiddleware(target: ReturnType<typeof socket>, enabled: boolean) {
  let error: Error | undefined;
  await new Promise<void>((resolve) => {
    void createSocketAuthMiddleware(service, { enabled })(target, (nextError) => { error = nextError; resolve(); });
  });
  return { error, data: target.data };
}

assert.equal(readSocketAuthBridgeEnabled({ XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'false', NODE_ENV: 'test' }), false);
assert.equal(readSocketAuthBridgeEnabled({ XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'true', NODE_ENV: 'test' }), true);
assert.equal(readSocketAuthBridgeEnabled({ XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'true', NODE_ENV: 'production' }), false);

const disabled = socket('legacy', 'v1-web');
assert.equal((await runMiddleware(disabled, false)).error, undefined, 'disabled bridge preserves legacy behavior');
assert.equal(disabled.data.auth.authMode, 'legacy');
assert.equal(disabled.data.auth.sessionId, null);

const legacy = socket('legacy', 'legacy');
assert.equal((await runMiddleware(legacy, true)).error, undefined);
assert.equal(legacy.data.auth.tokenType, 'legacy');

const v1 = socket('access', 'v1-web');
assert.equal((await runMiddleware(v1, true)).error, undefined);
assert.equal(v1.data.auth.tokenType, 'access');
assert.equal(v1.data.auth.sessionId, 'bridge-session');

const failedV1 = socket('legacy', 'v1-web');
const failedResult = await runMiddleware(failedV1, true);
assert.ok(failedResult.error);
assert.equal(v1Calls > 0, true);
assert.equal(legacyCalls >= 2, true);

console.log('Socket Auth Bridge tests passed');
