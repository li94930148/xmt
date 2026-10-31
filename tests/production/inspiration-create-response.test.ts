import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-create-'));
process.env.XMT_DB_PATH = path.join(directory, 'inspiration-create.test.db');
process.env.JWT_SECRET = 'inspiration-create-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: inspirationRoutes } = await import('../../api/routes/inspirations.js');

await initDatabase();
const userId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['inspiration-create-qa', 'unused', 'inspiration-create-qa@example.invalid', 'admin', '灵感创建验收'],
);

const app = express();
app.use(express.json());
app.use('/api/inspirations', inspirationRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/api/inspirations`;
const headers = {
  authorization: `Bearer ${signToken({ userId })}`,
  'content-type': 'application/json',
};

try {
  const clientRequestId = 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const createPayload = { title: '已确认的灵感', description: '直接返回保存结果', category: '故事', client_request_id: clientRequestId };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(createPayload),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    id: number;
    message: string;
    inspiration: { id: number; title: string; description: string; category: string; creator_id: number; creator_name: string; votes: number; voted: number; comment_count: number };
    idempotent_replay: boolean;
  };
  assert.equal(body.message, '灵感创建成功');
  assert.ok(body.id > 0);
  assert.equal(body.inspiration.id, body.id, 'the response identifies the persisted row');
  assert.equal(body.inspiration.title, '已确认的灵感');
  assert.equal(body.inspiration.description, '直接返回保存结果');
  assert.equal(body.inspiration.category, '故事');
  assert.equal(body.inspiration.creator_id, userId);
  assert.equal(body.inspiration.creator_name, '灵感创建验收');
  assert.equal(Number(body.inspiration.votes), 0);
  assert.equal(Number(body.inspiration.voted), 0);
  assert.equal(Number(body.inspiration.comment_count), 0);
  assert.equal(body.idempotent_replay, false);

  const repeated = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(createPayload) });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json() as typeof body;
  assert.equal(repeatedBody.id, body.id, 'the same request key returns the previously created inspiration');
  assert.equal(repeatedBody.idempotent_replay, true);
  const conflict = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...createPayload, title: '不同内容不能共用请求编号' }),
  });
  assert.equal(conflict.status, 409, 'a request key cannot be repurposed for different content');

  const readBack = await fetch(`${endpoint}/create-request/${clientRequestId}`, { headers });
  assert.equal(readBack.status, 200);
  assert.equal(readBack.headers.get('Cache-Control'), 'no-store', 'confirmed create status must not be cached');
  const readBackBody = await readBack.json() as { id: number; inspiration: { id: number; title: string } };
  assert.equal(readBackBody.id, body.id, 'read-only request lookup identifies the original saved row');
  assert.equal(readBackBody.inspiration.title, '已确认的灵感');

  const missingReadBack = await fetch(`${endpoint}/create-request/00112233-4455-4677-8899-aabbccddeeff`, { headers });
  assert.equal(missingReadBack.status, 404);
  assert.equal(missingReadBack.headers.get('Cache-Control'), 'no-store', 'missing create status must not be cached');
  const invalidReadBack = await fetch(`${endpoint}/create-request/not-a-uuid`, { headers });
  assert.equal(invalidReadBack.status, 400);
  assert.equal(invalidReadBack.headers.get('Cache-Control'), 'no-store', 'invalid create status must not be cached');
  const unauthenticatedReadBack = await fetch(`${endpoint}/create-request/${clientRequestId}`);
  assert.equal(unauthenticatedReadBack.status, 401);
  assert.equal(unauthenticatedReadBack.headers.get('Cache-Control'), 'no-store', 'authentication failures must not be cached');

  const persisted = await queryOne<{ id: number; title: string }>('SELECT id, title FROM inspirations WHERE id = ?', [body.id]);
  assert.deepEqual(persisted, { id: body.id, title: '已确认的灵感' }, 'the returned record is already persisted');
  const requestKeys = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM inspiration_create_request_keys WHERE client_request_id = ?', [clientRequestId]);
  assert.equal(Number(requestKeys?.total), 1, 'retrying an accepted create keeps one request ledger row');
  const matchingRows = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM inspirations WHERE title = ?', ['已确认的灵感']);
  assert.equal(Number(matchingRows?.total), 1, 'retrying an accepted create does not insert another inspiration');

  const deletion = await fetch(`${endpoint}/${body.id}`, { method: 'DELETE', headers });
  assert.equal(deletion.status, 200);
  const replayAfterDeletion = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(createPayload) });
  assert.equal(replayAfterDeletion.status, 410, 'a delayed retry cannot recreate an inspiration deleted after its original commit');
  const deletedReadBack = await fetch(`${endpoint}/create-request/${clientRequestId}`, { headers });
  assert.equal(deletedReadBack.status, 410, 'read-back preserves the distinction between not-yet-created and already-deleted');
  assert.equal(deletedReadBack.headers.get('Cache-Control'), 'no-store', 'deleted create status must not be cached');

  const concurrentRequestId = 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a51';
  const concurrentPayload = { title: '并发重放灵感', description: '同一编号同时到达', category: '故事', client_request_id: concurrentRequestId };
  const concurrentResponses = await Promise.all(Array.from({ length: 4 }, () => fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(concurrentPayload),
  })));
  assert.ok(concurrentResponses.every((item) => item.status === 200), 'concurrent deliveries of the same idempotency key all resolve successfully');
  const concurrentBodies = await Promise.all(concurrentResponses.map((item) => item.json() as Promise<typeof body>));
  assert.equal(new Set(concurrentBodies.map((item) => item.id)).size, 1, 'concurrent retries all identify one inspiration');
  const concurrentRows = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM inspirations WHERE title = ?', ['并发重放灵感']);
  assert.equal(Number(concurrentRows?.total), 1, 'concurrent retries persist one inspiration row');

  const legacyRequest = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ title: '旧客户端兼容创建', description: '', category: '故事' }) });
  assert.equal(legacyRequest.status, 200, 'older clients may continue creating without an idempotency key');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('inspiration-create response tests passed');
