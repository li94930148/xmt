import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-create-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'topics.db');
process.env.JWT_SECRET = 'topic-create-http-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { requestId } = await import('../../api/middleware/request-id.js');
const { SqliteTopicRepository } = await import('../../api/modules/topics/topics.sqlite-repository.js');
const { TopicService } = await import('../../api/modules/topics/topics.service.js');
const { TopicController } = await import('../../api/modules/topics/topics.controller.js');
const { currentTopicPolicy } = await import('../../api/modules/topics/topics.policy.js');
const { createLegacyTopicsRouter, createV1TopicsRouter } = await import('../../api/modules/topics/topics.routes.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { generateOpenApiDocument } = await import('../../api/openapi.js');

await initDatabase();

async function createUser(username: string, role: 'admin' | 'member') {
  const userId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
     VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, role, username],
  );
  if (role === 'admin') {
    await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, role]);
  }
  return userId;
}

const creatorId = await createUser('topic-create-http-admin', 'admin');
const otherActorId = await createUser('topic-create-http-other', 'member');
const notifications: unknown[] = [];
const broadcasts: Array<{ room: string; event: string }> = [];
const service = new TopicService({
  repository: new SqliteTopicRepository(),
  policy: currentTopicPolicy,
  notify: (message) => notifications.push(message),
  broadcast: (room, event) => broadcasts.push({ room, event }),
});
const lostRequestId = 'b0122334-4556-4788-899a-bbccddeeff04';
let droppedResponse = false;

const app = express();
app.use(requestId);
app.use(express.json());
app.use((req, res, next) => {
  if (!droppedResponse
    && req.method === 'POST'
    && req.originalUrl.startsWith('/api/topics')
    && req.body?.client_request_id === lostRequestId) {
    droppedResponse = true;
    res.end = (() => {
      res.socket?.destroy();
      return res;
    }) as typeof res.end;
  }
  next();
});
const controller = new TopicController(service);
app.use('/api/topics', createLegacyTopicsRouter(controller));
app.use('/api/v1/topics', createV1TopicsRouter(controller));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const authHeaders = (userId: number) => ({
  authorization: `Bearer ${signToken({ userId })}`,
  'content-type': 'application/json',
});
const payload = {
  title: 'HTTP 提报响应丢失恢复',
  description: '仅在临时测试数据库中创建',
  platform: 'douyin',
  deadline: '2026-11-02',
};

try {
  const openApiDocument = generateOpenApiDocument();
  assert.ok(openApiDocument.paths['/api/v1/topics/create-requests/{requestId}']?.get, 'OpenAPI documents the read-only recovery endpoint');
  const topicCreateSchema = openApiDocument.components?.schemas?.TopicCreateRequest as {
    properties?: Record<string, { format?: string }>;
    required?: string[];
  } | undefined;
  assert.equal(topicCreateSchema?.properties?.client_request_id?.format, 'uuid');
  assert.equal(topicCreateSchema?.required?.includes('client_request_id') ?? false, false, 'request ID stays optional for old clients');

  await assert.rejects(
    () => fetch(`${base}/api/topics`, {
      method: 'POST',
      headers: authHeaders(creatorId),
      body: JSON.stringify({ ...payload, client_request_id: lostRequestId }),
    }),
    undefined,
    'the fixture drops the successful response after the service transaction commits',
  );
  assert.equal(droppedResponse, true);

  const statusResponse = await fetch(`${base}/api/topics/create-requests/${lostRequestId}`, {
    headers: authHeaders(creatorId),
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get('Cache-Control'), 'no-store');
  const status = await statusResponse.json() as { state: string; topicId?: number };
  assert.equal(status.state, 'created');
  assert(Number.isSafeInteger(status.topicId));
  assert.deepEqual(Object.keys(status).sort(), ['state', 'topicId'], 'status reveals only state and the created topic ID');

  const createdTopicId = Number(status.topicId);
  const countsBeforeReplay = {
    topics: (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topics WHERE id=?', [createdTopicId]))?.count,
    history: (await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='created'", [createdTopicId]))?.count,
    activity: (await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND target='topic' AND detail=?", [creatorId, `创建选题: ${payload.title}`]))?.count,
  };
  const notificationCount = notifications.length;
  const broadcastCount = broadcasts.length;

  const replayResponse = await fetch(`${base}/api/topics`, {
    method: 'POST',
    headers: authHeaders(creatorId),
    body: JSON.stringify({ ...payload, client_request_id: lostRequestId }),
  });
  assert.equal(replayResponse.status, 200);
  const replayBody = await replayResponse.json() as { data: { topicId: number } };
  assert.equal(replayBody.data.topicId, createdTopicId);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topics WHERE id=?', [createdTopicId]))?.count, countsBeforeReplay.topics);
  assert.equal((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='created'", [createdTopicId]))?.count, countsBeforeReplay.history);
  assert.equal((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND target='topic' AND detail=?", [creatorId, `创建选题: ${payload.title}`]))?.count, countsBeforeReplay.activity);
  assert.equal(notifications.length, notificationCount, 'replaying does not duplicate messages');
  assert.equal(broadcasts.length, broadcastCount, 'replaying does not duplicate topic:created');

  const otherActorStatus = await fetch(`${base}/api/topics/create-requests/${lostRequestId}`, {
    headers: authHeaders(otherActorId),
  });
  assert.equal(otherActorStatus.status, 200);
  assert.deepEqual(await otherActorStatus.json(), { state: 'not_found' }, 'another authenticated actor cannot discover the topic ID');
  assert.equal((await fetch(`${base}/api/topics/create-requests/not-a-uuid`, { headers: authHeaders(creatorId) })).status, 400);
  assert.equal((await fetch(`${base}/api/topics/create-requests/${lostRequestId}`)).status, 401);
  assert.equal((await fetch(`${base}/api/topics/create-requests/${lostRequestId}`)).headers.get('Cache-Control'), 'no-store');

  const conflictingPayload = await fetch(`${base}/api/topics`, {
    method: 'POST',
    headers: authHeaders(creatorId),
    body: JSON.stringify({ ...payload, title: '相同编号但不同选题', client_request_id: lostRequestId }),
  });
  assert.equal(conflictingPayload.status, 409, 'a same-actor request key cannot be reused with changed content');
  const conflictingActor = await fetch(`${base}/api/topics`, {
    method: 'POST',
    headers: authHeaders(otherActorId),
    body: JSON.stringify({ ...payload, client_request_id: lostRequestId }),
  });
  assert.equal(conflictingActor.status, 403, 'the existing topic:create permission remains required');
  assert.equal((await fetch(`${base}/api/topics`, {
    method: 'POST',
    headers: authHeaders(creatorId),
    body: JSON.stringify({ ...payload, client_request_id: 'invalid-uuid' }),
  })).status, 400);

  const missingRequestId = 'b0122334-4556-4788-899a-bbccddeeff05';
  const missingStatus = await fetch(`${base}/api/topics/create-requests/${missingRequestId}`, {
    headers: authHeaders(creatorId),
  });
  assert.deepEqual(await missingStatus.json(), { state: 'not_found' });

  const legacyCreateResponse = await fetch(`${base}/api/topics`, {
    method: 'POST',
    headers: authHeaders(creatorId),
    body: JSON.stringify({ ...payload, title: '舊客戶無编号创建' }),
  });
  assert.equal(legacyCreateResponse.status, 200, 'old clients without a request ID retain the existing create path');
  const legacyCreateBody = await legacyCreateResponse.json() as { data: { topicId: number } };
  assert(Number.isSafeInteger(legacyCreateBody.data.topicId));

  const v1RequestId = 'b0122334-4556-4788-899a-bbccddeeff06';
  const v1CreateResponse = await fetch(`${base}/api/v1/topics`, {
    method: 'POST',
    headers: authHeaders(creatorId),
    body: JSON.stringify({ ...payload, title: 'v1 选题创建回执', client_request_id: v1RequestId }),
  });
  assert.equal(v1CreateResponse.status, 200);
  const v1Created = await v1CreateResponse.json() as { success: boolean; data: { topicId: number } };
  assert.equal(v1Created.success, true);
  const v1StatusResponse = await fetch(`${base}/api/v1/topics/create-requests/${v1RequestId}`, {
    headers: { authorization: `Bearer ${signToken({ userId: creatorId })}` },
  });
  assert.equal(v1StatusResponse.headers.get('Cache-Control'), 'no-store');
  const v1Status = await v1StatusResponse.json() as { success: boolean; data: { state: string; topicId: number } };
  assert.equal(v1Status.success, true);
  assert.deepEqual(v1Status.data, { state: 'created', topicId: v1Created.data.topicId });

  console.log('Topic create idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
