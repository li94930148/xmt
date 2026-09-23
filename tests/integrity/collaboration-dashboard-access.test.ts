import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-collaboration-dashboard-'));
process.env.XMT_DB_PATH = path.join(directory, 'dashboard.db');
process.env.JWT_SECRET = 'collaboration-dashboard-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: dashboardRouter } = await import('../../api/routes/collaboration-dashboard.js');

await initDatabase();
const ownerId = await executeInsert(`INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?,?)`, ['dashboard-owner', 'unused', '', 'member', 'Owner', 1, 0]);
const outsiderId = await executeInsert(`INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?,?)`, ['dashboard-outsider', 'unused', '', 'member', 'Outsider', 1, 0]);
for (const id of [ownerId, outsiderId]) await execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='member'`, [id]);
await execute(`INSERT OR IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code='member' AND p.code='analytics:view'`);
const topicId = await executeInsert(`INSERT INTO topics(title,description,platform,creator_id,status) VALUES(?,?,?,?,?)`, ['协作看板权限', '', 'douyin', ownerId, 'production']);
const productionId = await executeInsert(`INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)`, [topicId, 'v1.0', '', 'draft', ownerId]);

const app = express();
app.use('/api/collaboration-dashboard', dashboardRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const request = (userId: number) => fetch(`http://127.0.0.1:${address.port}/api/collaboration-dashboard/timeline/${encodeURIComponent(`production:${productionId}`)}`, { headers: { authorization: `Bearer ${signToken({ userId })}` } });

try {
  assert.equal((await request(ownerId)).status, 200);
  assert.equal((await request(outsiderId)).status, 403);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Collaboration dashboard document access tests passed');
