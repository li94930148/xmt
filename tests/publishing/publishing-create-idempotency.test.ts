import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-publishing-create-idempotency-'));
process.env.XMT_DB_PATH = path.join(directory, 'publishing-create.db');
process.env.JWT_SECRET = 'publishing-create-idempotency-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRoutes } = await import('../../api/routes/workflow.js');

await initDatabase();
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-create-admin', 'unused', 'publishing-create-admin@example.invalid', 'admin', '发布创建幂等验收'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
const otherAdminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-create-other-admin', 'unused', 'publishing-create-other@example.invalid', 'admin', '另一位管理员'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [otherAdminId, 'admin']);
const topicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'publishing')`,
  ['发布创建幂等选题', '同一请求不得重复登记', 'douyin', adminId, adminId],
);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headers = { Authorization: `Bearer ${signToken({ userId: adminId })}`, 'Content-Type': 'application/json' };
const otherHeaders = { Authorization: `Bearer ${signToken({ userId: otherAdminId })}`, 'Content-Type': 'application/json' };
const requestId = 'a01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
const payload = {
  topic_id: topicId,
  platform: '测试平台',
  url: 'https://example.invalid/publishing-create',
  status: 'pending',
  publish_time: '2026-10-20',
  views: 123,
  likes: 12,
  shares: null,
  comments: 3,
  client_request_id: requestId,
};

async function postCreate(body: Record<string, unknown>, requestHeaders = headers) {
  return fetch(`${base}/publishing`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

try {
  const invalidKey = await postCreate({ ...payload, client_request_id: 'not-a-uuid' });
  assert.equal(invalidKey.status, 400, 'invalid request ids are rejected before writing');

  const created = await postCreate(payload);
  assert.equal(created.status, 200);
  const createdBody = await created.json() as { publishingId: number; idempotent_replay: boolean };
  assert.ok(Number.isInteger(createdBody.publishingId) && createdBody.publishingId > 0);
  assert.equal(createdBody.idempotent_replay, false);
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id=?', [topicId]))?.total), 1);

  const [replay, replayAgain, replayConcurrentA, replayConcurrentB] = await Promise.all([
    postCreate(payload),
    postCreate(payload),
    postCreate(payload),
    postCreate(payload),
  ]);
  for (const response of [replay, replayAgain, replayConcurrentA, replayConcurrentB]) {
    assert.equal(response.status, 200, 'same-key concurrent retries return the original successful result');
    const body = await response.json() as { publishingId: number; idempotent_replay: boolean };
    assert.equal(body.publishingId, createdBody.publishingId);
    assert.equal(body.idempotent_replay, true);
  }
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id=?', [topicId]))?.total), 1,
    'replaying the create request never creates duplicate publication rows');

  const changedPayload = await postCreate({ ...payload, platform: '其他平台' });
  assert.equal(changedPayload.status, 409, 'a request id cannot be reused with a different payload');
  assert.equal((await fetch(`${base}/publishing/create-request/not-a-uuid`, { headers })).status, 400);

  const verified = await fetch(`${base}/publishing/create-request/${requestId}`, { headers });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { publishingId: createdBody.publishingId });
  assert.equal(
    (await fetch(`${base}/publishing/create-request/${requestId}`, { headers: otherHeaders })).status,
    404,
    'another user cannot read the request key or learn the publication id',
  );
  assert.equal((await postCreate(payload, otherHeaders)).status, 409, 'a request key remains bound to its original creator');

  const deleted = await fetch(`${base}/publishing/${createdBody.publishingId}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 200);
  assert.equal((await fetch(`${base}/publishing/create-request/${requestId}`, { headers })).status, 410,
    'the create request ledger records a tombstone after the publication is deleted');
  assert.equal((await postCreate(payload)).status, 410, 'a delayed retry cannot resurrect a deleted publication');
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id=?', [topicId]))?.total), 0);
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing_create_request_keys WHERE client_request_id=?', [requestId]))?.total), 1,
    'deleting a publication retains its request key');

  const legacyClient = await postCreate({ ...payload, client_request_id: undefined });
  assert.equal(legacyClient.status, 200, 'older clients without an idempotency key remain compatible');
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id=?', [topicId]))?.total), 1);
  console.log('Publishing create idempotency HTTP contract passed.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
