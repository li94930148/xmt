import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import express, { type Request, type Response } from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-web-cookie-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'auth-web-cookie.test.db');
process.env.JWT_SECRET = 'auth-web-cookie-legacy-secret';
process.env.JWT_V1_ISSUER = 'xmt-auth-web-cookie-test';
process.env.JWT_V1_AUDIENCE = 'xmt-auth-web-cookie-clients';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { requestId } = await import('../../api/middleware/request-id.js');
const { createAuthV1Module } = await import('../../api/modules/auth/v1/index.js');
const { SqliteAuthWebLoginRepository } = await import('../../api/modules/auth/web/auth-web-login.sqlite-repository.js');
const { sendV1Error } = await import('../../api/utils/response.js');

await initDatabase();

const password = 'web-cookie-password';
const passwordHash = await bcrypt.hash(password, 10);
const userId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['web-cookie-user', passwordHash, 'web-cookie@example.invalid', 'member', 'Web Cookie User', 1, 0],
);

const webOrigin = 'https://web.test';
const app = express();
app.use(requestId);
app.use(express.json());
app.use('/api/v1/auth', createAuthV1Module('web-cookie-refresh-pepper', {
  webConfig: {
    enabled: true,
    allowlistedUserIds: new Set([userId]),
    allowedOrigins: new Set([webOrigin]),
    csrfSecret: 'web-cookie-csrf-secret',
    secureCookies: true,
  },
}).router);
app.use((req: Request, res: Response) => sendV1Error(
  req,
  res,
  { code: 'RESOURCE_NOT_FOUND', message: 'API 不存在' },
  404,
));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

function cookieValue(header: string, name: string): string {
  const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
  assert(match?.[1], `Missing cookie ${name}`);
  return decodeURIComponent(match[1]);
}

function cookieHeader(setCookie: string): string {
  return [
    `__Host-xmt_refresh=${encodeURIComponent(cookieValue(setCookie, '__Host-xmt_refresh'))}`,
    `__Host-xmt_csrf=${encodeURIComponent(cookieValue(setCookie, '__Host-xmt_csrf'))}`,
  ].join('; ');
}

async function login() {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({
      username: 'web-cookie-user',
      password,
      client: { type: 'web', deviceName: 'Test Browser' },
    }),
  });
}

try {
  const loginResponse = await login();
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.headers.get('cache-control'), 'no-store');
  const loginBody = await loginResponse.json() as {
    success: boolean;
    data: { accessToken: string; [key: string]: unknown };
  };
  assert.equal(loginBody.success, true);
  assert.equal(typeof loginBody.data.accessToken, 'string');
  assert.equal('refreshToken' in loginBody.data, false);

  const loginSetCookie = loginResponse.headers.get('set-cookie') ?? '';
  assert.match(loginSetCookie, /__Host-xmt_refresh=/);
  assert.match(loginSetCookie, /HttpOnly/i);
  assert.match(loginSetCookie, /Secure/i);
  assert.match(loginSetCookie, /SameSite=Lax/i);
  assert.match(loginSetCookie, /Path=\//i);
  assert.doesNotMatch(loginSetCookie, /Domain=/i);
  assert.match(loginSetCookie, /__Host-xmt_csrf=/);

  const firstRefreshToken = cookieValue(loginSetCookie, '__Host-xmt_refresh');
  const firstCsrfToken = cookieValue(loginSetCookie, '__Host-xmt_csrf');
  const firstCookieHeader = cookieHeader(loginSetCookie);

  const bodyTokenRejected = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ refreshToken: firstRefreshToken }),
  });
  assert.equal(bodyTokenRejected.status, 400);

  const csrfRejected = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin, cookie: firstCookieHeader },
    body: '{}',
  });
  assert.equal(csrfRejected.status, 403);

  const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: webOrigin,
      cookie: firstCookieHeader,
      'x-xmt-csrf': firstCsrfToken,
    },
    body: '{}',
  });
  assert.equal(refreshResponse.status, 200);
  assert.equal(refreshResponse.headers.get('cache-control'), 'no-store');
  const refreshBody = await refreshResponse.json() as {
    success: boolean;
    data: { [key: string]: unknown };
  };
  assert.equal(refreshBody.success, true);
  assert.equal('refreshToken' in refreshBody.data, false);
  const refreshSetCookie = refreshResponse.headers.get('set-cookie') ?? '';
  assert.notEqual(cookieValue(refreshSetCookie, '__Host-xmt_refresh'), firstRefreshToken);

  const reusedResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: webOrigin,
      cookie: firstCookieHeader,
      'x-xmt-csrf': firstCsrfToken,
    },
    body: '{}',
  });
  assert.equal(reusedResponse.status, 401);
  const reusedBody = await reusedResponse.json() as { error: { code: string } };
  assert.equal(reusedBody.error.code, 'AUTH_REFRESH_REUSED');

  const logoutLoginResponse = await login();
  const logoutLoginBody = await logoutLoginResponse.json() as { data: { accessToken: string } };
  const logoutSetCookie = logoutLoginResponse.headers.get('set-cookie') ?? '';
  const logoutCsrf = cookieValue(logoutSetCookie, '__Host-xmt_csrf');
  const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${logoutLoginBody.data.accessToken}`,
      origin: webOrigin,
      cookie: cookieHeader(logoutSetCookie),
      'x-xmt-csrf': logoutCsrf,
    },
  });
  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutResponse.headers.get('cache-control'), 'no-store');
  const logoutCookie = logoutResponse.headers.get('set-cookie') ?? '';
  assert.match(logoutCookie, /__Host-xmt_refresh=;/);
  assert.match(logoutCookie, /Max-Age=0/i);
  assert.match(logoutCookie, /Path=\//i);

  const existingToken = await queryOne<Record<string, unknown>>(
    'SELECT id FROM auth_refresh_tokens ORDER BY created_at LIMIT 1',
  );
  assert(existingToken?.id);
  const rollbackSessionId = 'rollback-session';
  const activityBefore = await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM activity_log WHERE user_id = ?',
    [userId],
  );
  const loginRepository = new SqliteAuthWebLoginRepository();
  await assert.rejects(() => loginRepository.createLogin({
    user: { id: userId, name: 'Web Cookie User' },
    session: {
      id: rollbackSessionId,
      userId,
      clientType: 'web',
      deviceName: null,
      userAgentSummary: null,
      appVersion: null,
      createdAt: '2026-07-31 09:00:00',
      lastSeenAt: '2026-07-31 09:00:00',
      idleExpiresAt: '2026-08-07 09:00:00',
      absoluteExpiresAt: '2026-08-30 09:00:00',
      revokedAt: null,
      revokeReason: null,
      lastIpPrefix: null,
    },
    refreshToken: {
      id: String(existingToken.id),
      sessionId: rollbackSessionId,
      tokenHash: 'rollback-token-hash',
      pepperVersion: 1,
      generation: 0,
      createdAt: '2026-07-31 09:00:00',
      expiresAt: '2026-08-30 09:00:00',
      usedAt: null,
      replacedById: null,
      revokedAt: null,
      revokeReason: null,
    },
  }));
  assert.equal(await queryOne('SELECT id FROM auth_sessions WHERE id = ?', [rollbackSessionId]), null);
  const activityAfter = await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM activity_log WHERE user_id = ?',
    [userId],
  );
  assert.equal(Number(activityAfter?.count), Number(activityBefore?.count));

  console.log('Auth Web Cookie and CSRF HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
