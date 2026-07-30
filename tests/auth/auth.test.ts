import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'auth.test.db');
process.env.JWT_SECRET = 'auth-freeze-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { authenticate } = await import('../../api/middleware/auth.js');
const { signToken, verifyToken } = await import('../../api/utils/jwt.js');
const { default: authRoutes } = await import('../../api/routes/auth.js');

await initDatabase();

const password = 'legacy-password';
const passwordHash = await bcrypt.hash(password, 10);
const enabledUserId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['auth-freeze-user', passwordHash, 'auth-freeze@example.invalid', 'member', 'Auth Freeze', 1, 1],
);
await execute(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['auth-disabled-user', passwordHash, 'auth-disabled@example.invalid', 'member', 'Auth Disabled', 0, 0],
);

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.get('/api/auth-freeze/protected', authenticate, (req, res) => {
  res.json({ id: req.user?.id, role: req.user?.role });
});

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

async function postLogin(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function loginSuccessTest() {
  const response = await postLogin({ username: 'auth-freeze-user', password, remember: true });
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    user: Record<string, unknown>;
    token: string;
    forceChangePassword: boolean;
  };

  assert.deepEqual(payload.user, {
    id: enabledUserId,
    username: 'auth-freeze-user',
    name: 'Auth Freeze',
    email: 'auth-freeze@example.invalid',
    role: 'member',
    force_change_password: true,
  });
  assert.equal(typeof payload.token, 'string');
  assert.ok(payload.token.length > 0);
  assert.equal(payload.forceChangePassword, true);

  const decoded = verifyToken(payload.token) as ({ exp?: number; iat?: number } & Record<string, unknown>) | null;
  assert(decoded);
  assert.equal(decoded.userId, enabledUserId);
  assert.equal(decoded.username, 'auth-freeze-user');
  assert.equal(decoded.role, 'member');
  assert.equal((decoded.exp ?? 0) - (decoded.iat ?? 0), 7 * 24 * 60 * 60);

  const loginActivity = await queryOne<Record<string, unknown>>(
    'SELECT user_id, action, target, detail FROM activity_log WHERE user_id = ? AND action = ?',
    [enabledUserId, 'login'],
  );
  assert.deepEqual(loginActivity, {
    user_id: enabledUserId,
    action: 'login',
    target: 'auth',
    detail: '用户 Auth Freeze 登录系统',
  });

  return payload.token;
}

async function loginFailureTests() {
  const wrongPassword = await postLogin({ username: 'auth-freeze-user', password: 'wrong-password' });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await wrongPassword.json(), { message: '用户名或密码错误' });

  const missingUser = await postLogin({ username: 'auth-missing-user', password });
  assert.equal(missingUser.status, 401);
  assert.deepEqual(await missingUser.json(), { message: '用户名或密码错误' });

  const disabledUser = await postLogin({ username: 'auth-disabled-user', password });
  assert.equal(disabledUser.status, 401);
  assert.deepEqual(await disabledUser.json(), { message: '账号已被禁用' });
}

async function authenticateFreezeTests(token: string) {
  const missingToken = await fetch(`${baseUrl}/api/auth-freeze/protected`);
  assert.equal(missingToken.status, 401);
  assert.deepEqual(await missingToken.json(), { message: '未登录' });

  const invalidToken = await fetch(`${baseUrl}/api/auth-freeze/protected`, {
    headers: { authorization: 'Bearer invalid-token' },
  });
  assert.equal(invalidToken.status, 401);
  assert.deepEqual(await invalidToken.json(), { message: '登录已过期，请重新登录' });

  await execute('UPDATE users SET role = ? WHERE id = ?', ['director', enabledUserId]);
  const roleChanged = await fetch(`${baseUrl}/api/auth-freeze/protected`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(roleChanged.status, 200);
  assert.deepEqual(await roleChanged.json(), { id: enabledUserId, role: 'director' });
}

async function getMeFreezeTests(token: string) {
  const valid = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(valid.status, 200);
  const payload = await valid.json() as Record<string, unknown>;
  assert.deepEqual(payload, {
    id: enabledUserId,
    username: 'auth-freeze-user',
    name: 'Auth Freeze',
    email: 'auth-freeze@example.invalid',
    role: 'director',
    enabled: true,
    force_change_password: true,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
  });
  assert.equal(typeof payload.created_at, 'string');
  assert.equal(typeof payload.updated_at, 'string');

  const invalid = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: 'Bearer invalid-token' },
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), { message: '登录已过期，请重新登录' });

  const disabledToken = signToken({
    userId: enabledUserId,
    username: 'auth-freeze-user',
    role: 'director',
  });
  await execute('UPDATE users SET enabled = 0 WHERE id = ?', [enabledUserId]);
  const disabled = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${disabledToken}` },
  });
  assert.equal(disabled.status, 401);
  assert.deepEqual(await disabled.json(), { message: '账号已被禁用' });
  await execute('UPDATE users SET enabled = 1 WHERE id = ?', [enabledUserId]);
}

async function changePasswordFreezeTests(token: string) {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const wrongOldPassword = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ oldPassword: 'wrong-password', newPassword: 'new-legacy-password' }),
  });
  assert.equal(wrongOldPassword.status, 401);
  assert.deepEqual(await wrongOldPassword.json(), { message: '旧密码错误' });

  const shortPassword = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ oldPassword: password, newPassword: '12345' }),
  });
  assert.equal(shortPassword.status, 400);
  assert.deepEqual(await shortPassword.json(), { message: '新密码至少6位' });

  const newPassword = 'new-legacy-password';
  const success = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ oldPassword: password, newPassword }),
  });
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { message: '密码修改成功' });

  const updatedUser = await queryOne<Record<string, unknown>>(
    'SELECT password, force_change_password FROM users WHERE id = ?',
    [enabledUserId],
  );
  assert(updatedUser);
  assert.equal(Number(updatedUser.force_change_password), 0);
  assert.equal(await bcrypt.compare(newPassword, String(updatedUser.password)), true);

  const activity = await queryOne<Record<string, unknown>>(
    'SELECT user_id, action, target, detail FROM activity_log WHERE user_id = ? AND action = ?',
    [enabledUserId, 'change_password'],
  );
  assert.deepEqual(activity, {
    user_id: enabledUserId,
    action: 'change_password',
    target: 'auth',
    detail: '用户修改了密码',
  });

  const oldPasswordLogin = await postLogin({ username: 'auth-freeze-user', password });
  assert.equal(oldPasswordLogin.status, 401);
  assert.deepEqual(await oldPasswordLogin.json(), { message: '用户名或密码错误' });

  const newPasswordLogin = await postLogin({ username: 'auth-freeze-user', password: newPassword });
  assert.equal(newPasswordLogin.status, 200);

  return (await newPasswordLogin.json() as { token: string }).token;
}

async function logoutFreezeTest(token: string) {
  const headers = { authorization: `Bearer ${token}` };
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { message: '登出成功' });

  const afterLogout = await fetch(`${baseUrl}/api/auth-freeze/protected`, { headers });
  assert.equal(afterLogout.status, 200);
  assert.deepEqual(await afterLogout.json(), { id: enabledUserId, role: 'director' });
}

try {
  const token = await loginSuccessTest();
  await loginFailureTests();
  await authenticateFreezeTests(token);
  await getMeFreezeTests(token);
  const tokenAfterPasswordChange = await changePasswordFreezeTests(token);
  await logoutFreezeTest(tokenAfterPasswordChange);
  console.log('Auth legacy behavior freeze tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
