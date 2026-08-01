import assert from 'node:assert/strict';
import { readSocketAuthBridgeEnabled, createSocketAuthMiddleware } from '../../api/modules/auth/socket/socket-auth.middleware.js';
import { isSocketV1EligibleUser, readSocketProductionBridgeGate } from '../../api/modules/auth/socket/socket-production-gate.js';

const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_ROLLOUT_APPROVED: 'true',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7,9',
};

assert.equal(readSocketAuthBridgeEnabled(base), false, 'production bridge stays closed without its flag');
assert.equal(readSocketAuthBridgeEnabled({ ...base, XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'true' }), false, 'approval is required');
const approved = { ...base, XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'true', XMT_SOCKET_BRIDGE_APPROVED: 'true' };
assert.equal(readSocketAuthBridgeEnabled(approved), true);
assert.deepEqual(readSocketProductionBridgeGate(approved), {
  socketBridgeEnabled: true,
  socketBridgeApproval: true,
  socketV1EligibleUserCount: 2,
  currentMode: 'allowlist',
});
assert.equal(isSocketV1EligibleUser({ id: 7, role: 'member' }, approved), true);
assert.equal(isSocketV1EligibleUser({ id: 8, role: 'member' }, approved), false);
assert.equal(isSocketV1EligibleUser({ id: 9, role: 'admin' }, approved), false);
assert.equal(isSocketV1EligibleUser({ id: 9, role: 'director' }, approved), false);

const middleware = createSocketAuthMiddleware({
  authenticate: async () => ({
    auth: { userId: 9, sessionId: 'session', tokenType: 'access', authMode: 'v1-web', issuedAt: 1, expiresAt: 2 },
    user: { id: 9, username: 'admin', name: 'Admin', role: 'admin' },
    session: null,
  }),
} as never, {
  enabled: true,
  isV1EligibleUser: (user) => isSocketV1EligibleUser(user, approved),
});
const socket = { handshake: { auth: { token: 'v1-access', mode: 'v1-web' }, headers: {} }, data: {} };
let middlewareError: Error | undefined;
await middleware(socket as never, (error?: Error) => { middlewareError = error; });
assert(middlewareError, 'protected role is rejected by the Socket bridge');

console.log('socket production gate tests passed');
