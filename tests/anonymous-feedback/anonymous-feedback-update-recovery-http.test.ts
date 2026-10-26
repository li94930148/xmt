import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-update-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'anonymous-feedback.db');
process.env.JWT_SECRET = 'anonymous-feedback-update-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { anonymousFeedbackAdminRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/anonymous-feedback.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_update_admin','unused','admin','匿名意见更新管理员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_update_admin_2','unused','admin','匿名意见更新管理员二',1)",
);
const readerId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_update_reader','unused','analyst','匿名意见更新只读用户',1)",
);

async function insertFeedback(content: string) {
  return database.executeInsert(
    `INSERT INTO anonymous_feedback(type,content,need_reply,reply_content,status,is_public,created_at,updated_at)
     VALUES('process',?,1,NULL,'pending',1,'2026-10-26 10:00:00','2026-10-26 10:00:00')`,
    [content],
  );
}

const feedbackId = await insertFeedback('主测试意见：敏感内容不应由状态接口回传');
const collisionFeedbackId = await insertFeedback('另一条意见');
const competingFeedbackId = await insertFeedback('并发基线意见');
const rollbackFeedbackId = await insertFeedback('回滚触发器意见');

const app = express();
app.use(express.json());
app.use('/api/admin/anonymous-feedback', anonymousFeedbackAdminRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/admin/anonymous-feedback`;
const actorHeaders = { Authorization: `Bearer ${signToken({ userId: actorId })}`, 'Content-Type': 'application/json' };
const secondActorHeaders = { Authorization: `Bearer ${signToken({ userId: secondActorId })}`, 'Content-Type': 'application/json' };
const readerHeaders = { Authorization: `Bearer ${signToken({ userId: readerId })}`, 'Content-Type': 'application/json' };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a58';

async function list(headers = actorHeaders) {
  const response = await fetch(baseUrl, { headers });
  assert.equal(response.status, 200);
  return (await response.json() as { data: Array<Record<string, unknown>> }).data;
}

function requestFor(targetId: number, baseFingerprint: string, payload: Record<string, unknown>, id = requestId) {
  const normalizedReply = typeof payload.reply_content === 'string' ? payload.reply_content.trim() || null : null;
  const fingerprint = hash([
    targetId,
    baseFingerprint,
    payload.status ?? null,
    payload.reply_content === undefined ? null : normalizedReply,
    payload.is_public ?? null,
  ]);
  return {
    ...payload,
    client_request_id: id,
    request_fingerprint: fingerprint,
    base_fingerprint: baseFingerprint,
  };
}

async function status(targetId: number, id: string, fingerprint: string, headers = actorHeaders) {
  return fetch(`${baseUrl}/${targetId}/update-requests/${encodeURIComponent(id)}?request_fingerprint=${fingerprint}`, { headers });
}

try {
  const listed = await list();
  const before = listed.find((row) => Number(row.id) === feedbackId);
  assert(before && typeof before.base_fingerprint === 'string', 'admin list exposes server baseline fingerprint');
  const baseFingerprint = String(before.base_fingerprint);
  const payload = requestFor(feedbackId, baseFingerprint, {
    status: 'completed',
    reply_content: '  已完成回复  ',
    is_public: false,
  });

  const updated = await fetch(`${baseUrl}/${feedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(payload),
  });
  assert.equal(updated.status, 200, 'keyed PATCH updates the status/reply/visibility together');
  assert.deepEqual(await updated.json(), { success: true, idempotent_replay: false });
  const changed = await database.queryOne<{
    status: string; reply_content: string | null; is_public: number;
  }>('SELECT status,reply_content,is_public FROM anonymous_feedback WHERE id=?', [feedbackId]);
  assert.deepEqual(changed, { status: 'completed', reply_content: '已完成回复', is_public: 0 });
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_update_request_keys WHERE client_request_id=?',
    [requestId],
  ).then((row) => row?.count)), 1, 'receipt is committed with the feedback update');

  const replay = await fetch(`${baseUrl}/${feedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(payload),
  });
  assert.equal(replay.status, 200, 'same actor, target, and fingerprint safely replay');
  assert.deepEqual(await replay.json(), { success: true, idempotent_replay: true });
  const replayed = await status(feedbackId, requestId, String(payload.request_fingerprint));
  assert.equal(replayed.status, 200);
  assert.equal(replayed.headers.get('cache-control'), 'no-store');
  const replayedBody = await replayed.json() as { data: { state: string }; [key: string]: unknown };
  assert.deepEqual(replayedBody, { data: { state: 'processed' } });
  assert.equal(JSON.stringify(replayedBody).includes('敏感内容'), false, 'status response never returns feedback text');

  const absentId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a59';
  const absentFingerprint = 'c'.repeat(64);
  const notFound = await status(feedbackId, absentId, absentFingerprint);
  assert.deepEqual(await notFound.json(), { data: { state: 'not_found' } });
  const missingTarget = await status(999999, absentId, absentFingerprint);
  assert.deepEqual(await missingTarget.json(), { data: { state: 'target_missing' } });

  const hiddenActorStatus = await status(feedbackId, requestId, String(payload.request_fingerprint), secondActorHeaders);
  assert.deepEqual(await hiddenActorStatus.json(), { data: { state: 'not_found' } }, 'other actors cannot inspect a receipt');
  const readerStatus = await status(feedbackId, absentId, absentFingerprint, readerHeaders);
  assert.equal(readerStatus.status, 403);
  assert.equal(readerStatus.headers.get('cache-control'), 'no-store', 'authorization failures are not cacheable');
  const unauthenticatedStatus = await fetch(`${baseUrl}/${feedbackId}/update-requests/${absentId}?request_fingerprint=${absentFingerprint}`);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store', 'authentication failures are not cacheable');

  const wrongFingerprint = await status(feedbackId, requestId, 'd'.repeat(64));
  assert.deepEqual(await wrongFingerprint.json(), { data: { state: 'conflict' } }, 'same actor cannot reuse a request id with another fingerprint');
  const wrongTargetPayload = requestFor(collisionFeedbackId, baseFingerprint, { status: 'processing' });
  const wrongTarget = await fetch(`${baseUrl}/${collisionFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(wrongTargetPayload),
  });
  assert.equal(wrongTarget.status, 409);
  assert.equal((await wrongTarget.json() as { code: string }).code, 'ANONYMOUS_FEEDBACK_UPDATE_REQUEST_CONFLICT');

  const staleBefore = await list();
  const staleRow = staleBefore.find((row) => Number(row.id) === collisionFeedbackId);
  assert(staleRow && typeof staleRow.base_fingerprint === 'string');
  const legacyUpdate = await fetch(`${baseUrl}/${collisionFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify({ status: 'processing' }),
  });
  assert.equal(legacyUpdate.status, 200, 'unkeyed legacy clients retain their original update behavior');
  const stalePayload = requestFor(collisionFeedbackId, String(staleRow.base_fingerprint), { is_public: false }, 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a62');
  const staleResponse = await fetch(`${baseUrl}/${collisionFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(stalePayload),
  });
  assert.equal(staleResponse.status, 409, 'CAS prevents a stale explicit retry from overwriting a later update');
  assert.equal((await staleResponse.json() as { code: string }).code, 'ANONYMOUS_FEEDBACK_UPDATE_BASE_CONFLICT');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_update_request_keys WHERE client_request_id=?',
    [stalePayload.client_request_id],
  ).then((row) => row?.count)), 0, 'CAS conflict does not create a receipt');

  const competingRows = await list();
  const competingRow = competingRows.find((row) => Number(row.id) === competingFeedbackId);
  assert(competingRow && typeof competingRow.base_fingerprint === 'string');
  const competingBase = String(competingRow.base_fingerprint);
  const competingOne = requestFor(competingFeedbackId, competingBase, { status: 'processing' }, 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a63');
  const competingTwo = {
    ...requestFor(competingFeedbackId, competingBase, { is_public: false }, 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a60'),
  };
  competingTwo.request_fingerprint = hash([
    competingFeedbackId, competingBase, null, null, false,
  ]);
  const competingResults = await Promise.all([competingOne, competingTwo].map((candidate) => fetch(`${baseUrl}/${competingFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(candidate),
  })));
  assert.deepEqual(competingResults.map((response) => response.status).sort(), [200, 409], 'only one different keyed update wins a shared baseline');

  const concurrentRow = (await list()).find((row) => Number(row.id) === rollbackFeedbackId);
  assert(concurrentRow && typeof concurrentRow.base_fingerprint === 'string');
  const concurrentPayload = requestFor(rollbackFeedbackId, String(concurrentRow.base_fingerprint), { status: 'completed' }, 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a64');
  const concurrentResults = await Promise.all([0, 1].map(() => fetch(`${baseUrl}/${rollbackFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(concurrentPayload),
  })));
  assert.deepEqual(concurrentResults.map((response) => response.status), [200, 200], 'concurrent identical keyed updates converge on one receipt');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_update_request_keys WHERE client_request_id=?',
    [concurrentPayload.client_request_id],
  ).then((row) => row?.count)), 1);

  const rollbackRow = (await list()).find((row) => Number(row.id) === rollbackFeedbackId);
  assert(rollbackRow && typeof rollbackRow.base_fingerprint === 'string');
  await database.execute(`CREATE TRIGGER anonymous_feedback_update_receipt_failure
    BEFORE INSERT ON anonymous_feedback_update_request_keys
    BEGIN SELECT RAISE(ABORT, 'injected anonymous feedback update receipt failure'); END`);
  const rollbackPayload = {
    ...requestFor(rollbackFeedbackId, String(rollbackRow.base_fingerprint), { is_public: false }, 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a61'),
  };
  rollbackPayload.request_fingerprint = hash([
    rollbackFeedbackId, String(rollbackRow.base_fingerprint), null, null, false,
  ]);
  const failedAtomicUpdate = await fetch(`${baseUrl}/${rollbackFeedbackId}`, {
    method: 'PATCH', headers: actorHeaders, body: JSON.stringify(rollbackPayload),
  });
  assert.equal(failedAtomicUpdate.status, 500);
  await database.execute('DROP TRIGGER anonymous_feedback_update_receipt_failure');
  const rollbackState = await database.queryOne<{ is_public: number }>('SELECT is_public FROM anonymous_feedback WHERE id=?', [rollbackFeedbackId]);
  assert.equal(rollbackState?.is_public, 1, 'receipt failure rolls back the feedback mutation');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_update_request_keys WHERE client_request_id=?',
    [rollbackPayload.client_request_id],
  ).then((row) => row?.count)), 0);

  console.log('Anonymous-feedback update recovery HTTP test passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
