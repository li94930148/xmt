import assert from 'node:assert/strict';
import { SocketAuthError } from '../../api/modules/auth/socket/socket-auth.errors.js';
import { SocketAuthService } from '../../api/modules/auth/socket/socket-auth.service.js';

const future = Math.floor(Date.now() / 1000) + 600;
const user = { id: 7, username: 'socket-user', name: 'Socket User', role: 'director', enabled: 1 };
const session = {
  id: 'session-7', userId: 7, clientType: 'web', deviceName: null, userAgentSummary: null, appVersion: null,
  createdAt: '2026-08-01 10:00:00', lastSeenAt: '2026-08-01 10:00:00',
  idleExpiresAt: '2099-08-01 10:00:00', absoluteExpiresAt: '2099-08-01 10:00:00',
  revokedAt: null, revokeReason: null, lastIpPrefix: null,
};

const service = new SocketAuthService({
  verifyLegacyToken: (token) => token === 'legacy-token' ? ({ userId: 7, iat: future - 600, exp: future } as never) : null,
  verifyAccessTokenV1: (token) => token === 'access-token'
    ? { sub: '7', sid: 'session-7', iat: future - 600, exp: future }
    : null,
  findUserById: async () => user,
  sessionService: { getSession: async (sessionId: string) => sessionId === session.id
    ? { state: 'ACTIVE' as const, session }
    : { state: 'NOT_FOUND' as const, session: null } },
});

const legacy = await service.authenticate({ token: 'legacy-token', mode: 'legacy' });
assert.deepEqual(legacy.auth, {
  userId: 7, sessionId: null, tokenType: 'legacy', authMode: 'legacy', issuedAt: future - 600, expiresAt: future,
});
assert.equal(legacy.user.role, 'director', 'role comes from the current database user');

const access = await service.authenticate({ token: 'access-token', mode: 'v1-web' });
assert.equal(access.auth.sessionId, 'session-7');
assert.equal(access.auth.tokenType, 'access');
assert.equal(access.auth.authMode, 'v1-web');

async function rejects(code: string, input: unknown) {
  await assert.rejects(() => service.authenticate(input), (error: unknown) => error instanceof SocketAuthError && error.code === code);
}

await rejects('AUTH_INVALID', { token: 'access-token', mode: 'legacy' });
await rejects('AUTH_INVALID', { token: 'legacy-token', mode: 'v1-web' });
await rejects('AUTH_INVALID', { token: 'refresh-token-raw', mode: 'v1-web' });

const disabledService = new SocketAuthService({
  verifyLegacyToken: () => ({ userId: 7, iat: future - 600, exp: future } as never),
  verifyAccessTokenV1: () => null,
  findUserById: async () => ({ ...user, enabled: 0 }),
  sessionService: { getSession: async () => ({ state: 'ACTIVE' as const, session }) },
});
await assert.rejects(() => disabledService.authenticate({ token: 'legacy-token', mode: 'legacy' }), (error: unknown) => error instanceof SocketAuthError && error.code === 'USER_DISABLED');

const revokedService = new SocketAuthService({
  verifyLegacyToken: () => null,
  verifyAccessTokenV1: () => ({ sub: '7', sid: 'session-7', iat: future - 600, exp: future }),
  findUserById: async () => user,
  sessionService: { getSession: async () => ({ state: 'REVOKED' as const, session: { ...session, revokedAt: '2026-08-01 11:00:00' } }) },
});
await assert.rejects(() => revokedService.authenticate({ token: 'access-token', mode: 'v1-web' }), (error: unknown) => error instanceof SocketAuthError && error.code === 'SESSION_INACTIVE');

console.log('Socket Auth contract tests passed');
