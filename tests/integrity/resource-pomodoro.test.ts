import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-integrity-'));
process.env.XMT_DB_PATH = path.join(directory, 'integrity.db');
process.env.JWT_SECRET = 'integrity-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: resourcesRouter } = await import('../../api/routes/resources.js');
const { default: pomodoroRouter } = await import('../../api/routes/pomodoro.js');

await initDatabase();
assert.equal((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id WHERE u.username='admin' AND r.code='admin'"))?.count, 1);
const memberId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('integrity-member','unused','member@example.invalid','member','Member',1,0)");
const adminId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('integrity-admin','unused','admin@example.invalid','admin','Admin',1,0)");
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [memberId, 'member']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [adminId, 'admin']);

const app = express();
app.use(express.json());
app.use('/api/resources', resourcesRouter);
app.use('/api/pomodoro', pomodoroRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });

try {
  const denied = await fetch(`${base}/resources`, { method: 'POST', headers: headers(memberId), body: JSON.stringify({ name: '无权限资料' }) });
  assert.equal(denied.status, 403);
  const unsafePath = await fetch(`${base}/resources`, { method: 'POST', headers: headers(adminId), body: JSON.stringify({ name: '不安全路径', file_path: 'javascript:alert(1)' }) });
  assert.equal(unsafePath.status, 400, JSON.stringify(await unsafePath.json()));
  const created = await fetch(`${base}/resources`, { method: 'POST', headers: headers(adminId), body: JSON.stringify({ name: '安全资料', file_path: '/uploads/file.pdf' }) });
  assert.equal(created.status, 200);

  const started = await fetch(`${base}/pomodoro/start`, { method: 'POST', headers: headers(memberId), body: '{}' });
  assert.equal(started.status, 200);
  const { sessionId } = await started.json() as { sessionId: number };
  assert(Number.isSafeInteger(sessionId));
  const cancelled = await fetch(`${base}/pomodoro/${sessionId}/cancel`, { method: 'POST', headers: headers(memberId) });
  assert.equal(cancelled.status, 200);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pomodoro_sessions WHERE id = ?', [sessionId]))?.count, 0);
  const restarted = await fetch(`${base}/pomodoro/start`, { method: 'POST', headers: headers(memberId), body: '{}' });
  assert.equal(restarted.status, 200);
  const secondId = (await restarted.json() as { sessionId: number }).sessionId;
  assert.equal((await fetch(`${base}/pomodoro/${secondId}/complete`, { method: 'POST', headers: headers(memberId) })).status, 200);
  const stats = await fetch(`${base}/pomodoro/stats`, { headers: headers(memberId) });
  assert.equal((await stats.json() as { today: number }).today, 1);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}
