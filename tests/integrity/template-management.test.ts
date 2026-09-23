import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-template-integrity-'));
process.env.XMT_DB_PATH = path.join(directory, 'templates.db');
process.env.JWT_SECRET = 'template-integrity-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: templatesRouter } = await import('../../api/routes/templates.js');

await initDatabase();
const memberId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('template-member','unused','member@example.invalid','member','Member',1,0)");
const adminId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('template-admin','unused','admin@example.invalid','admin','Admin',1,0)");
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [memberId, 'member']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code = ?', [adminId, 'admin']);

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/api/templates', templatesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/templates`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });

try {
  const denied = await fetch(base, { method: 'POST', headers: headers(memberId), body: JSON.stringify({ name: '无权限模板', template_data: '正文' }) });
  assert.equal(denied.status, 403);
  const invalid = await fetch(base, { method: 'POST', headers: headers(adminId), body: JSON.stringify({ name: '   ', template_data: '正文' }) });
  assert.equal(invalid.status, 400);
  const created = await fetch(base, { method: 'POST', headers: headers(adminId), body: JSON.stringify({ name: ' 短视频模板 ', platform: ' 抖音 ', description: ' 验收 ', template_data: { title: '标题' } }) });
  assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
  const templateId = (await created.json() as { id: number }).id;
  const list = await fetch(base, { headers: headers(memberId) });
  assert.equal(list.status, 200);
  const rows = (await list.json() as { data: Array<{ id: number; name: string; platform: string; template_data: string }> }).data;
  const saved = rows.find((row) => row.id === templateId);
  assert(saved);
  assert.equal(saved.name, '短视频模板');
  assert.equal(saved.platform, '抖音');
  assert.equal(saved.template_data, '{"title":"标题"}');
  const updated = await fetch(`${base}/${templateId}`, { method: 'PUT', headers: headers(adminId), body: JSON.stringify({ name: '更新模板', template_data: '新版正文' }) });
  assert.equal(updated.status, 200);
  const removed = await fetch(`${base}/${templateId}`, { method: 'DELETE', headers: headers(adminId) });
  assert.equal(removed.status, 200);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}
