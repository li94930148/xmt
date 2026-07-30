import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-session-service-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'session-service.test.db');
process.env.JWT_SECRET = 'session-service-legacy-secret';
process.env.JWT_V1_ISSUER = 'xmt-session-test';
process.env.JWT_V1_AUDIENCE = 'xmt-session-test-clients';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { SqliteRefreshTokenRepository } = await import(
  '../../api/modules/auth/refresh/refresh-token.sqlite-repository.js'
);
const { RefreshTokenService } = await import('../../api/modules/auth/refresh/refresh-token.service.js');
const { SqliteSessionRepository } = await import(
  '../../api/modules/auth/session/session.sqlite-repository.js'
);
const { SessionService } = await import('../../api/modules/auth/session/session.service.js');
const { createAccessTokenV1, verifyAccessTokenV1, signToken, verifyToken } = await import(
  '../../api/modules/auth/token.service.js'
);

await initDatabase();

const userId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled)
   VALUES (?, ?, ?, ?, ?, ?)`,
  ['session-service-user', 'unused-password-hash', 'session@example.invalid', 'member', 'Session User', 1],
);

const fixedNow = new Date('2026-07-30T08:00:00.000Z');
let now = fixedNow;
let sessionCounter = 0;
let refreshCounter = 0;
const sessionRepository = new SqliteSessionRepository();
const refreshRepository = new SqliteRefreshTokenRepository();
const sessionService = new SessionService({
  repository: sessionRepository,
  now: () => now,
  idGenerator: () => `session-${++sessionCounter}`,
});
const refreshTokenService = new RefreshTokenService({
  repository: refreshRepository,
  peppers: { 1: 'previous-pepper', 2: 'current-pepper' },
  currentPepperVersion: 2,
  now: () => now,
  idGenerator: () => `refresh-${++refreshCounter}`,
});

try {
  const sessionId = await sessionService.createSession({
    userId,
    clientType: 'web',
    deviceName: 'Service Test Browser',
    userAgentSummary: 'test-agent',
    appVersion: '2.13.5',
    lastIpPrefix: '192.0.2.0/24',
  });
  assert.equal(sessionId, 'session-1');

  const activeSession = await sessionService.getSession(sessionId);
  assert.equal(activeSession.state, 'ACTIVE');
  assert.equal(activeSession.session?.userId, userId);
  assert.equal(activeSession.session?.clientType, 'web');

  assert.equal(await sessionService.revokeSession(sessionId, 'logout'), 1);
  assert.equal((await sessionService.getSession(sessionId)).state, 'REVOKED');

  const refreshSessionId = await sessionService.createSession({ userId, clientType: 'web' });
  const absoluteExpiresAt = (await sessionService.getSession(refreshSessionId)).session?.absoluteExpiresAt;
  assert(absoluteExpiresAt);

  const originalRefreshToken = await refreshTokenService.createRefreshToken({
    sessionId: refreshSessionId,
    generation: 0,
    expiresAt: absoluteExpiresAt,
  });
  assert.equal(Buffer.from(originalRefreshToken, 'base64url').byteLength, 32);

  const originalHash = refreshTokenService.hashRefreshToken(originalRefreshToken);
  assert.equal(originalHash, refreshTokenService.hashRefreshToken(originalRefreshToken));
  assert.notEqual(originalHash, refreshTokenService.hashRefreshToken(originalRefreshToken, 1));

  const storedOriginal = await queryOne<Record<string, unknown>>(
    'SELECT * FROM auth_refresh_tokens WHERE token_hash = ?',
    [originalHash],
  );
  assert(storedOriginal);
  assert.equal(storedOriginal.token_hash, originalHash);
  assert.notEqual(storedOriginal.token_hash, originalRefreshToken);
  assert.equal(Object.hasOwn(storedOriginal, 'token'), false);

  now = new Date('2026-07-30T08:05:00.000Z');
  const consumed = await refreshTokenService.consumeRefreshToken(originalRefreshToken, absoluteExpiresAt);
  assert.equal(consumed.status, 'SUCCESS');
  assert(consumed.status === 'SUCCESS');
  assert.equal(consumed.sessionId, refreshSessionId);
  assert.equal(consumed.generation, 1);
  assert.notEqual(consumed.refreshToken, originalRefreshToken);

  const consumedOriginal = await queryOne<Record<string, unknown>>(
    'SELECT used_at, replaced_by_id FROM auth_refresh_tokens WHERE token_hash = ?',
    [originalHash],
  );
  assert.equal(typeof consumedOriginal?.used_at, 'string');
  assert.equal(consumedOriginal?.replaced_by_id, 'refresh-2');

  const replacementHash = refreshTokenService.hashRefreshToken(consumed.refreshToken);
  const replacement = await queryOne<Record<string, unknown>>(
    'SELECT id, session_id, generation, token_hash FROM auth_refresh_tokens WHERE id = ?',
    ['refresh-2'],
  );
  assert.deepEqual(replacement, {
    id: 'refresh-2',
    session_id: refreshSessionId,
    generation: 1,
    token_hash: replacementHash,
  });

  const reuse = await refreshTokenService.consumeRefreshToken(originalRefreshToken, absoluteExpiresAt);
  assert.equal(reuse.status, 'SECURITY_EVENT');
  assert(reuse.status === 'SECURITY_EVENT');
  assert.deepEqual(reuse.event, {
    type: 'REFRESH_TOKEN_REUSE',
    sessionId: refreshSessionId,
    tokenId: 'refresh-1',
  });
  assert.equal((await sessionService.getSession(refreshSessionId)).state, 'REVOKED');
  assert.notEqual(
    (await refreshTokenService.consumeRefreshToken(consumed.refreshToken, absoluteExpiresAt)).status,
    'SUCCESS',
  );

  const revokedSessionId = await sessionService.createSession({ userId, clientType: 'ios' });
  const revokedAbsoluteExpiresAt = (await sessionService.getSession(revokedSessionId)).session?.absoluteExpiresAt;
  assert(revokedAbsoluteExpiresAt);
  const revokedSessionToken = await refreshTokenService.createRefreshToken({
    sessionId: revokedSessionId,
    generation: 0,
    expiresAt: revokedAbsoluteExpiresAt,
  });
  assert.equal(await sessionService.revokeUserSessions(userId, 'account_disabled'), 1);
  assert.equal(
    (await refreshTokenService.consumeRefreshToken(revokedSessionToken, revokedAbsoluteExpiresAt)).status,
    'SESSION_INVALID',
  );

  const rollbackSessionId = await sessionService.createSession({ userId, clientType: 'android' });
  const rollbackSession = (await sessionService.getSession(rollbackSessionId)).session;
  assert(rollbackSession);
  const rollbackToken = await refreshTokenService.createRefreshToken({
    sessionId: rollbackSessionId,
    generation: 0,
    expiresAt: rollbackSession.absoluteExpiresAt,
  });
  const rollbackHash = refreshTokenService.hashRefreshToken(rollbackToken);
  await assert.rejects(() => refreshRepository.rotateRefreshToken({
    currentTokenHash: rollbackHash,
    usedAt: '2026-07-30 16:10:00',
    nextIdleExpiresAt: '2026-08-06 16:10:00',
    replacement: {
      id: 'refresh-2',
      sessionId: rollbackSessionId,
      tokenHash: 'rollback-replacement-hash',
      pepperVersion: 2,
      generation: 1,
      createdAt: '2026-07-30 16:10:00',
      expiresAt: rollbackSession.absoluteExpiresAt,
      usedAt: null,
      replacedById: null,
      revokedAt: null,
      revokeReason: null,
    },
  }));
  const rolledBackToken = await queryOne<Record<string, unknown>>(
    'SELECT used_at, replaced_by_id FROM auth_refresh_tokens WHERE token_hash = ?',
    [rollbackHash],
  );
  assert.deepEqual(rolledBackToken, { used_at: null, replaced_by_id: null });
  assert.equal((await sessionService.getSession(rollbackSessionId)).session?.lastSeenAt, rollbackSession.lastSeenAt);

  const legacyToken = signToken({ userId, username: 'session-service-user', role: 'member' });
  const legacyPayload = verifyToken(legacyToken);
  assert(legacyPayload);
  assert.equal(legacyPayload.userId, userId);
  assert.equal(Object.hasOwn(legacyPayload, 'sid'), false);

  const v1AccessToken = createAccessTokenV1({ userId, sessionId: revokedSessionId });
  const v1Payload = verifyAccessTokenV1(v1AccessToken);
  assert(v1Payload);
  assert.equal(v1Payload.sub, String(userId));
  assert.equal(v1Payload.sid, revokedSessionId);
  assert.equal(v1Payload.type, 'access');
  assert.equal(v1Payload.iss, 'xmt-session-test');
  assert.equal(v1Payload.aud, 'xmt-session-test-clients');
  assert.equal(v1Payload.exp - v1Payload.iat, 15 * 60);
  assert.equal(verifyAccessTokenV1(legacyToken), null);

  console.log('Auth session service tests passed');
} finally {
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
