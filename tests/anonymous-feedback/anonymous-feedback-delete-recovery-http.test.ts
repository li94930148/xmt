import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-delete-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'anonymous-feedback.db');
process.env.JWT_SECRET = 'anonymous-feedback-delete-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { anonymousFeedbackAdminRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/anonymous-feedback.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_delete_admin','unused','admin','匿名意见删除管理员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_delete_admin_2','unused','admin','匿名意见删除管理员二',1)",
);
const readerId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_delete_reader','unused','analyst','匿名意见删除只读用户',1)",
);
const feedbackId = await database.executeInsert(
  `INSERT INTO anonymous_feedback(type,content,need_reply,status,is_public,created_at,updated_at)
   VALUES('process','隔离删除测试意见',0,'pending',1,'2026-10-23 10:00:00','2026-10-23 10:00:00')`,
);
const otherFeedbackId = await database.executeInsert(
  `INSERT INTO anonymous_feedback(type,content,need_reply,status,is_public,created_at,updated_at)
   VALUES('feature','另一条待保留意见',0,'pending',1,'2026-10-23 10:01:00','2026-10-23 10:01:00')`,
);

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
const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';

try {
  const deleteResponse = await fetch(`${baseUrl}/${feedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: requestId }),
  });
  assert.equal(deleteResponse.status, 200, 'admin can delete feedback with a recovery request key');
  assert.deepEqual(await deleteResponse.json(), { success: true, idempotent_replay: false });
  assert.equal(await database.queryOne('SELECT id FROM anonymous_feedback WHERE id=?', [feedbackId]), null, 'feedback is physically deleted');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_delete_request_keys WHERE client_request_id=?',
    [requestId],
  ).then((row) => row?.count)), 1, 'the result tombstone is written with the deletion');

  const committedState = await fetch(`${baseUrl}/${feedbackId}/delete-requests/${requestId}`, { headers: actorHeaders });
  assert.equal(committedState.status, 200);
  assert.equal(committedState.headers.get('cache-control'), 'no-store', 'delete status responses are never cached');
  assert.deepEqual((await committedState.json() as { data: unknown }).data, { state: 'committed' });
  const replay = await fetch(`${baseUrl}/${feedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: requestId }),
  });
  assert.equal(replay.status, 200, 'same actor, request ID, and target is idempotent');
  assert.deepEqual(await replay.json(), { success: true, idempotent_replay: true });
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_delete_request_keys WHERE client_request_id=?',
    [requestId],
  ).then((row) => row?.count)), 1, 'replay does not create a second ledger entry');

  const foreignActorState = await fetch(`${baseUrl}/${feedbackId}/delete-requests/${requestId}`, { headers: secondActorHeaders });
  assert.deepEqual((await foreignActorState.json() as { data: unknown }).data, { state: 'not_found' }, 'another actor cannot observe the tombstone');
  const foreignActorDelete = await fetch(`${baseUrl}/${otherFeedbackId}`, {
    method: 'DELETE',
    headers: secondActorHeaders,
    body: JSON.stringify({ client_request_id: requestId }),
  });
  assert.equal(foreignActorDelete.status, 409, 'a foreign actor cannot reuse the UUID to delete another row');
  assert.ok(await database.queryOne('SELECT id FROM anonymous_feedback WHERE id=?', [otherFeedbackId]), 'the other feedback row remains unchanged');

  const sameActorOtherTargetState = await fetch(`${baseUrl}/${otherFeedbackId}/delete-requests/${requestId}`, { headers: actorHeaders });
  assert.deepEqual((await sameActorOtherTargetState.json() as { data: unknown }).data, { state: 'conflict' }, 'same actor cannot rebind a UUID to another target');
  const sameActorOtherTargetDelete = await fetch(`${baseUrl}/${otherFeedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: requestId }),
  });
  assert.equal(sameActorOtherTargetDelete.status, 409);
  assert.ok(await database.queryOne('SELECT id FROM anonymous_feedback WHERE id=?', [otherFeedbackId]), 'conflicting target remains unchanged');

  const unknownState = await fetch(`${baseUrl}/${otherFeedbackId}/delete-requests/00112233-4455-4677-8899-aabbccddeeff`, { headers: actorHeaders });
  assert.deepEqual((await unknownState.json() as { data: unknown }).data, { state: 'not_found' }, 'not_found is returned when no current actor/target tombstone exists');
  const unauthenticatedState = await fetch(`${baseUrl}/${feedbackId}/delete-requests/${requestId}`);
  assert.equal(unauthenticatedState.status, 401, 'status lookup requires authentication');
  assert.equal(unauthenticatedState.headers.get('cache-control'), 'no-store', 'unauthenticated status responses are never cached');
  const unauthorizedState = await fetch(`${baseUrl}/${feedbackId}/delete-requests/${requestId}`, { headers: readerHeaders });
  assert.equal(unauthorizedState.status, 403, 'status lookup requires admin role');
  assert.equal(unauthorizedState.headers.get('cache-control'), 'no-store', 'non-admin status responses are never cached');

  const rollbackRequestId = 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  await database.execute(`CREATE TRIGGER anonymous_feedback_delete_ledger_failure
    BEFORE INSERT ON anonymous_feedback_delete_request_keys
    WHEN NEW.client_request_id='${rollbackRequestId}'
    BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END`);
  const failedAtomicDelete = await fetch(`${baseUrl}/${otherFeedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: rollbackRequestId }),
  });
  assert.equal(failedAtomicDelete.status, 500, 'ledger write failure fails the whole transaction');
  assert.ok(await database.queryOne('SELECT id FROM anonymous_feedback WHERE id=?', [otherFeedbackId]), 'the row deletion rolls back if its tombstone cannot be committed');
  const rollbackState = await fetch(`${baseUrl}/${otherFeedbackId}/delete-requests/${rollbackRequestId}`, { headers: actorHeaders });
  assert.deepEqual((await rollbackState.json() as { data: unknown }).data, { state: 'not_found' });
  await database.execute('DROP TRIGGER anonymous_feedback_delete_ledger_failure');

  const legacyDelete = await fetch(`${baseUrl}/${otherFeedbackId}`, { method: 'DELETE', headers: actorHeaders });
  assert.equal(legacyDelete.status, 200, 'legacy unkeyed admin clients retain the existing delete behavior');
  const legacyMissing = await fetch(`${baseUrl}/${otherFeedbackId}`, { method: 'DELETE', headers: actorHeaders });
  assert.equal(legacyMissing.status, 404);

  const alreadyMissingRequestId = 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  const keyedDeleteAfterLegacyDelete = await fetch(`${baseUrl}/${otherFeedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: alreadyMissingRequestId }),
  });
  assert.equal(keyedDeleteAfterLegacyDelete.status, 404, 'a missing target is not reported as a successful keyed deletion');
  assert.deepEqual(await keyedDeleteAfterLegacyDelete.json(), {
    message: '意见不存在',
    code: 'ANONYMOUS_FEEDBACK_DELETE_TARGET_MISSING',
  });
  const missingTargetState = await fetch(`${baseUrl}/${otherFeedbackId}/delete-requests/${alreadyMissingRequestId}`, { headers: actorHeaders });
  assert.equal(missingTargetState.headers.get('cache-control'), 'no-store', 'terminal target-missing status cannot become stale in a cache');
  assert.deepEqual((await missingTargetState.json() as { data: unknown }).data, { state: 'target_missing' }, 'an externally deleted target has an explicit terminal state');
  const missingTargetReplay = await fetch(`${baseUrl}/${otherFeedbackId}`, {
    method: 'DELETE',
    headers: actorHeaders,
    body: JSON.stringify({ client_request_id: alreadyMissingRequestId }),
  });
  assert.equal(missingTargetReplay.status, 404, 'retrying a target-missing request still does not claim success');
  const missingTargetReplayState = await fetch(`${baseUrl}/${otherFeedbackId}/delete-requests/${alreadyMissingRequestId}`, { headers: actorHeaders });
  assert.deepEqual((await missingTargetReplayState.json() as { data: unknown }).data, { state: 'target_missing' }, 'retries converge to the same terminal state without a new migration');
  console.log('Anonymous-feedback delete recovery HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
