import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-stages-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow.db');
process.env.JWT_SECRET = 'workflow-stage-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');

await initDatabase();
const director = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'director'");
assert(director);
await execute('UPDATE users SET force_change_password = 0 WHERE id = ?', [director.id]);
const memberId = await executeInsert(`INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?,?)`, ['stage-member', 'unused', '', 'member', 'Stage Member', 1, 0]);
await execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='member'`, [memberId]);
const topicId = await executeInsert(`INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`, ['阶段回归', '', 'douyin', director.id, director.id, 'shooting']);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headers = (id: number) => ({ authorization: `Bearer ${signToken({ userId: id })}`, 'content-type': 'application/json' });

try {
  const denied = await fetch(`${base}/shooting`, { method: 'POST', headers: headers(memberId), body: JSON.stringify({ topic_id: topicId }) });
  assert.equal(denied.status, 403);

  const shootingCreated = await fetch(`${base}/shooting`, { method: 'POST', headers: headers(director.id), body: JSON.stringify({ topic_id: topicId, plan_date: '2026-09-23', location: '演播室' }) });
  const shootingPayload = await shootingCreated.json() as { shootingId?: number; message?: string };
  assert.equal(shootingCreated.status, 200, JSON.stringify(shootingPayload));
  const shootingId = Number(shootingPayload.shootingId);
  const persistedShooting = await queryOne<{ id: number }>('SELECT id FROM shooting WHERE topic_id = ?', [topicId]);
  assert(persistedShooting);
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, { method: 'PUT', headers: headers(director.id), body: JSON.stringify({ status: 'completed', script_content: '定稿' }) })).status, 200);

  const autoPublishing = await queryOne<{ id: number }>('SELECT id FROM publishing WHERE topic_id = ?', [topicId]);
  assert(autoPublishing);
  assert.equal((await fetch(`${base}/publishing/${autoPublishing.id}`, { method: 'PUT', headers: headers(director.id), body: JSON.stringify({ platform: 'douyin', publish_time: '2026-09-23 12:00:00', status: 'scheduled' }) })).status, 200);
  assert.equal((await fetch(`${base}/publishing/${autoPublishing.id}`, { method: 'DELETE', headers: headers(director.id) })).status, 200);
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, { method: 'DELETE', headers: headers(director.id) })).status, 200);
  assert.equal(shootingId === 0 || Number.isSafeInteger(shootingId), true);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Workflow shooting and publishing CRUD tests passed');
