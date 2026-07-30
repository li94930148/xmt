import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import express, { type Request, type Response } from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-v1-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'auth-v1.test.db');
process.env.JWT_SECRET = 'auth-v1-test-secret';
process.env.JWT_V1_ISSUER = 'xmt-auth-v1-test';
process.env.JWT_V1_AUDIENCE = 'xmt-auth-v1-test-clients';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { requestId } = await import('../../api/middleware/request-id.js');
const { createAuthV1Module, isAuthV1Enabled } = await import('../../api/modules/auth/v1/index.js');
const { sendV1Error } = await import('../../api/utils/response.js');
const { default: legacyAuthRoutes } = await import('../../api/routes/auth.js');
const {
  loginV1ResponseSchema,
  refreshResponseSchema,
  sessionResponseSchema,
} = await import('../../shared/schema/auth.schema.js');
const { apiErrorSchema } = await import('../../shared/schema/error.schema.js');
const { verifyAccessTokenV1, verifyToken } = await import('../../api/modules/auth/token.service.js');

await initDatabase();

const password = 'auth-v1-password';
const passwordHash = await bcrypt.hash(password, 10);
const userId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['auth-v1-user', passwordHash, 'auth-v1@example.invalid', 'member', 'Auth V1 User', 1, 0],
);

function startApp(authV1Enabled: boolean) {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/auth', legacyAuthRoutes);
  if (authV1Enabled) {
    app.use('/api/v1/auth', createAuthV1Module('auth-v1-refresh-pepper').router);
  }
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api/v1/')) {
      return sendV1Error(req, res, { code: 'RESOURCE_NOT_FOUND', message: 'API 不存在' }, 404);
    }
    return res.status(404).json({ success: false, error: 'API not found' });
  });
  return app.listen(0, '127.0.0.1');
}

async function listen(server: ReturnType<typeof startApp>) {
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof startApp>) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function postJson(url: string, body: Record<string, unknown>, accessToken?: string) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'auth-v1-test-request',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

let disabledServer: ReturnType<typeof startApp> | null = null;
let enabledServer: ReturnType<typeof startApp> | null = null;

try {
  assert.equal(isAuthV1Enabled({ XMT_AUTH_V1_ENABLED: undefined, NODE_ENV: 'test' }), false);
  assert.equal(isAuthV1Enabled({ XMT_AUTH_V1_ENABLED: 'true', NODE_ENV: 'test' }), true);
  assert.equal(isAuthV1Enabled({ XMT_AUTH_V1_ENABLED: 'true', NODE_ENV: 'production' }), false);

  disabledServer = startApp(false);
  const disabledBaseUrl = await listen(disabledServer);
  const disabled = await postJson(`${disabledBaseUrl}/api/v1/auth/login`, {
    username: 'auth-v1-user',
    password,
    client: { type: 'web' },
  });
  assert.equal(disabled.status, 404);
  assert.equal(apiErrorSchema.parse(await disabled.json()).error.code, 'RESOURCE_NOT_FOUND');
  await close(disabledServer);
  disabledServer = null;

  enabledServer = startApp(true);
  const baseUrl = await listen(enabledServer);
  const loginResponse = await postJson(`${baseUrl}/api/v1/auth/login`, {
    username: 'auth-v1-user',
    password,
    client: { type: 'web', deviceName: 'V1 Test Browser', appVersion: '2.13.6' },
  });
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.headers.get('cache-control'), 'no-store');
  const login = loginV1ResponseSchema.parse(await loginResponse.json());
  assert.equal(login.meta?.requestId, 'auth-v1-test-request');
  assert.equal(login.data.user.id, userId);
  assert.equal(login.data.session.current, true);
  assert.equal(login.data.expiresIn, 900);
  assert(verifyAccessTokenV1(login.data.accessToken));

  const persisted = await queryOne<Record<string, unknown>>(
    `SELECT token_hash FROM auth_refresh_tokens WHERE session_id = ? AND generation = 0`,
    [login.data.session.id],
  );
  assert(persisted);
  assert.notEqual(persisted.token_hash, login.data.refreshToken);

  const refreshResponse = await postJson(`${baseUrl}/api/v1/auth/refresh`, {
    refreshToken: login.data.refreshToken,
  });
  assert.equal(refreshResponse.status, 200);
  const refresh = refreshResponseSchema.parse(await refreshResponse.json());
  assert.notEqual(refresh.data.refreshToken, login.data.refreshToken);
  assert.equal(refresh.data.session.id, login.data.session.id);
  assert(verifyAccessTokenV1(refresh.data.accessToken));

  const reuseResponse = await postJson(`${baseUrl}/api/v1/auth/refresh`, {
    refreshToken: login.data.refreshToken,
  });
  assert.equal(reuseResponse.status, 401);
  assert.equal(apiErrorSchema.parse(await reuseResponse.json()).error.code, 'AUTH_REFRESH_REUSED');

  const secondLoginResponse = await postJson(`${baseUrl}/api/v1/auth/login`, {
    username: 'auth-v1-user',
    password,
    client: { type: 'ios', deviceName: 'V1 Test Phone' },
  });
  const secondLogin = loginV1ResponseSchema.parse(await secondLoginResponse.json());
  const sessionsResponse = await fetch(`${baseUrl}/api/v1/auth/sessions`, {
    headers: {
      authorization: `Bearer ${secondLogin.data.accessToken}`,
      'x-request-id': 'auth-v1-sessions-request',
    },
  });
  assert.equal(sessionsResponse.status, 200);
  const sessions = sessionResponseSchema.parse(await sessionsResponse.json());
  assert.equal(sessions.data.length, 1);
  assert.equal(sessions.data[0]?.id, secondLogin.data.session.id);
  assert.equal(sessions.data[0]?.current, true);
  assert.equal(JSON.stringify(sessions).includes('token_hash'), false);
  assert.equal(JSON.stringify(sessions).includes('userAgentSummary'), false);

  const logoutResponse = await postJson(
    `${baseUrl}/api/v1/auth/logout`,
    {},
    secondLogin.data.accessToken,
  );
  assert.equal(logoutResponse.status, 200);
  assert.deepEqual(await logoutResponse.json(), {
    success: true,
    data: null,
    meta: { requestId: 'auth-v1-test-request' },
  });
  const revokedSession = await queryOne<Record<string, unknown>>(
    'SELECT revoked_at, revoke_reason FROM auth_sessions WHERE id = ?',
    [secondLogin.data.session.id],
  );
  assert.equal(typeof revokedSession?.revoked_at, 'string');
  assert.equal(revokedSession?.revoke_reason, 'logout');

  const afterLogout = await fetch(`${baseUrl}/api/v1/auth/sessions`, {
    headers: { authorization: `Bearer ${secondLogin.data.accessToken}` },
  });
  assert.equal(afterLogout.status, 401);
  assert.equal(apiErrorSchema.parse(await afterLogout.json()).error.code, 'AUTH_SESSION_REVOKED');

  const legacyLogin = await postJson(`${baseUrl}/api/auth/login`, {
    username: 'auth-v1-user',
    password,
  });
  assert.equal(legacyLogin.status, 200);
  const legacy = await legacyLogin.json() as { token: string };
  const legacyPayload = verifyToken(legacy.token) as { exp?: number; iat?: number; sid?: string } | null;
  assert(legacyPayload);
  assert.equal((legacyPayload.exp ?? 0) - (legacyPayload.iat ?? 0), 7 * 24 * 60 * 60);
  assert.equal(legacyPayload.sid, undefined);

  console.log('Auth v1 experimental HTTP tests passed');
} finally {
  if (disabledServer) await close(disabledServer);
  if (enabledServer) await close(enabledServer);
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
