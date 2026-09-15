import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-analytics-write-scope-'));
process.env.XMT_DB_PATH = path.join(directory, 'analytics.db');
process.env.JWT_SECRET = 'analytics-write-scope-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: analyticsRoutes } = await import('../../api/routes/analytics.js');

await initDatabase();
const ownerId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['analytics-owner', 'unused', 'analytics-owner@example.invalid', 'admin', 'Analytics Owner'],
);
const contributorId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['analytics-contributor', 'unused', 'analytics-contributor@example.invalid', 'contractor', 'Analytics Contributor'],
);
const roleId = await executeInsert(
  `INSERT INTO roles(code,name,description,is_system) VALUES('analytics_contributor','数据录入测试','scope contract',0)`,
);
const permission = await queryOne<{ id: number }>(`SELECT id FROM permissions WHERE code='analytics:create'`);
assert(permission);
await execute(`INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)`, [roleId, permission.id]);
await execute(`INSERT INTO user_roles(user_id,role_id) VALUES(?,?)`, [contributorId, roleId]);

const ownerTopicId = await executeInsert(
  `INSERT INTO topics(title,creator_id,assignee_id,status) VALUES(?,?,?,'publishing')`,
  ['其他人的选题', ownerId, ownerId],
);
const contributorTopicId = await executeInsert(
  `INSERT INTO topics(title,creator_id,assignee_id,status) VALUES(?,?,?,'publishing')`,
  ['可录入选题', contributorId, contributorId],
);

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/analytics`;
const headers = {
  Authorization: `Bearer ${signToken({ userId: contributorId })}`,
  'Content-Type': 'application/json',
};
const payload = { views: 10, likes: 2, shares: 1, comments: 3, data_date: '2026-09-15' };

try {
  const forbidden = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, topic_id: ownerTopicId }),
  });
  assert.equal(forbidden.status, 403, 'analytics:create must not bypass topic data scope');

  const invalidMetric = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, topic_id: contributorTopicId, views: -1 }),
  });
  assert.equal(invalidMetric.status, 400);

  const created = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, topic_id: contributorTopicId }),
  });
  assert.equal(created.status, 200);
  const updated = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, topic_id: contributorTopicId, views: 25 }),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(
    await queryOne('SELECT COUNT(*) count,MAX(views) views FROM analytics WHERE topic_id=? AND data_date=?', [contributorTopicId, payload.data_date]),
    { count: 1, views: 25 },
    'same-day writes must update one canonical row',
  );
  console.log('analytics write scope and validation tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
