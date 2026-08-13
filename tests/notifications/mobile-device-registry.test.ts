import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-mobile-device-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'mobile-device.test.db');
process.env.JWT_SECRET = 'mobile-device-registry-test-secret';
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { default: notificationsRouter } = await import('../../api/routes/notifications.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const userId = await executeInsert("INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)", ['mobile-device-user', 'hash', 'member', 'Mobile Device User']);
const app = express();
app.use(express.json());
app.use('/api/notifications', notificationsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/notifications`;
const authorization = { authorization: `Bearer ${signToken({ userId })}` };

try {
  const created = await fetch(`${baseUrl}/mobile-devices`, { method: 'POST', headers: { 'content-type': 'application/json', ...authorization }, body: JSON.stringify({ platform: 'android', deviceId: 'device-1', pushToken: 'token-one', appVersion: '2.19.0' }) });
  assert.equal(created.status, 204);
  const stored = await queryOne<Record<string, unknown>>('SELECT push_token, app_version, revoked_at FROM mobile_devices WHERE user_id = ? AND device_id = ?', [userId, 'device-1']);
  assert.deepEqual({ pushToken: stored?.push_token, appVersion: stored?.app_version, revokedAt: stored?.revoked_at }, { pushToken: 'token-one', appVersion: '2.19.0', revokedAt: null });
  const updated = await fetch(`${baseUrl}/mobile-devices`, { method: 'POST', headers: { 'content-type': 'application/json', ...authorization }, body: JSON.stringify({ platform: 'android', deviceId: 'device-1', pushToken: 'token-two', appVersion: '2.19.1' }) });
  assert.equal(updated.status, 204);
  assert.equal((await queryOne<Record<string, unknown>>('SELECT push_token FROM mobile_devices WHERE user_id = ? AND device_id = ?', [userId, 'device-1']))?.push_token, 'token-two');
  const revoked = await fetch(`${baseUrl}/mobile-devices/device-1`, { method: 'DELETE', headers: authorization });
  assert.equal(revoked.status, 204);
  assert.equal(typeof (await queryOne<Record<string, unknown>>('SELECT revoked_at FROM mobile_devices WHERE user_id = ? AND device_id = ?', [userId, 'device-1']))?.revoked_at, 'string');
  console.log('Mobile device registry contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
