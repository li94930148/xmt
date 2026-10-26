import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-create-idempotency-'));
process.env.XMT_DB_PATH = path.join(directory, 'production-create.db');
process.env.JWT_SECRET = 'production-create-idempotency-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRoutes } = await import('../../api/routes/workflow.js');

await initDatabase();
const director = await queryOne<{ id: number }>("SELECT id FROM users WHERE username='director'");
assert(director);
await execute('UPDATE users SET force_change_password=0 WHERE id=?', [director.id]);
const memberId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['production-create-member', 'unused', '', 'member', 'Production Create Member'],
);
await execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='member'`, [memberId]);
const topicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'approved')`,
  ['创作创建幂等回归', '', 'other', director.id, director.id],
);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
const payload = {
  topic_id: topicId,
  version: 'v1.1',
  content: '隔离测试创作正文',
  status: 'draft',
  client_request_id: requestId,
};

try {
  const createdResponse = await fetch(`${base}/production`, { method: 'POST', headers: headers(director.id), body: JSON.stringify(payload) });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json() as { productionId: number; idempotent_replay?: boolean };
  assert(Number.isSafeInteger(created.productionId));
  assert.equal(created.idempotent_replay, false);

  const replayResponse = await fetch(`${base}/production`, { method: 'POST', headers: headers(director.id), body: JSON.stringify(payload) });
  assert.equal(replayResponse.status, 200);
  assert.deepEqual(await replayResponse.json(), {
    message: '创作记录添加成功',
    productionId: created.productionId,
    idempotent_replay: true,
  });
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM production WHERE topic_id=?', [topicId]))?.count, 1,
    'retrying the same create request returns the original record without duplicate production rows');

  const readBackResponse = await fetch(`${base}/production/create-request/${requestId}`, { headers: headers(director.id) });
  assert.equal(readBackResponse.status, 200);
  assert.deepEqual(await readBackResponse.json(), { productionId: created.productionId });
  assert.equal((await fetch(`${base}/production/create-request/${requestId}`, { headers: headers(memberId) })).status, 404,
    'create status lookup does not disclose another user\'s request key');
  assert.equal((await fetch(`${base}/production/create-request/not-a-uuid`, { headers: headers(director.id) })).status, 400);
  assert.equal((await fetch(`${base}/production/create-request/11111111-1111-4111-8111-111111111111`, { headers: headers(director.id) })).status, 404);

  assert.equal((await fetch(`${base}/production`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ ...payload, content: '其他正文' }),
  })).status, 409, 'a request key cannot be reused with a different payload');
  assert.equal((await fetch(`${base}/production`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ ...payload, client_request_id: 'not-a-uuid' }),
  })).status, 400);

  await execute('DELETE FROM production WHERE id=?', [created.productionId]);
  assert.equal((await fetch(`${base}/production/create-request/${requestId}`, { headers: headers(director.id) })).status, 410,
    'a deleted record remains a terminal replay tombstone');
  assert.equal((await fetch(`${base}/production`, { method: 'POST', headers: headers(director.id), body: JSON.stringify(payload) })).status, 410,
    'retry cannot recreate a record after its idempotent create was later deleted');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM production WHERE topic_id=?', [topicId]))?.count, 0);

  const legacyTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'approved')`,
    ['旧客户端创作创建兼容', '', 'other', director.id, director.id],
  );
  const legacyResponse = await fetch(`${base}/production`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: legacyTopicId, version: 'v1.0', content: '无幂等键的兼容创建', status: 'draft' }),
  });
  assert.equal(legacyResponse.status, 200, 'older clients without a request key remain compatible');
  console.log('Production create idempotency API test passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
