import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-submit-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'anonymous-feedback.db');
process.env.JWT_SECRET = 'anonymous-feedback-submit-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: anonymousFeedbackRouter, anonymousFeedbackAdminRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/anonymous-feedback.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('anonymous_feedback_submit_admin','unused','admin','匿名意见测试管理员',1)",
);
const app = express();
app.use(express.json());
app.use('/api/anonymous-feedback', anonymousFeedbackRouter);
app.use('/api/admin/anonymous-feedback', anonymousFeedbackAdminRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/anonymous-feedback`;
const adminUrl = `http://127.0.0.1:${address.port}/api/admin/anonymous-feedback`;
const headers = { Authorization: `Bearer ${signToken({ userId: actorId })}`, 'Content-Type': 'application/json' };
const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a62';
const payload = { type: 'process', content: '响应丢失恢复测试意见', needReply: true };
const fingerprint = (value: typeof payload) => createHash('sha256').update(JSON.stringify([value.type, value.content, value.needReply]), 'utf8').digest('hex');
const { createHash } = await import('node:crypto');

try {
  const first = await fetch(baseUrl, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, client_request_id: requestId }),
  });
  assert.equal(first.status, 201, 'the first keyed submit creates one feedback row');
  assert.deepEqual(await first.json(), { success: true, idempotent_replay: false });

  const feedback = await database.queryOne<{ id: number; content: string; need_reply: number }>(
    'SELECT id,content,need_reply FROM anonymous_feedback WHERE content=?', [payload.content],
  );
  assert(feedback, 'the anonymous feedback was created');
  assert.deepEqual({ content: feedback.content, need_reply: feedback.need_reply }, { content: payload.content, need_reply: 1 });
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_submission_request_keys WHERE client_request_id=?', [requestId],
  ).then((row) => row?.count)), 1, 'the receipt is committed with the feedback');

  const recovered = await fetch(`${baseUrl}/submission-requests/${requestId}?request_fingerprint=${fingerprint(payload)}`, { headers });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get('cache-control'), 'no-store');
  const recoveredBody = await recovered.json() as { data: { state: string }; [key: string]: unknown };
  assert.deepEqual(recoveredBody, { data: { state: 'processed' } });
  assert.equal(JSON.stringify(recoveredBody).includes(payload.content), false, 'the status endpoint never returns feedback content');

  const replay = await fetch(baseUrl, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, client_request_id: requestId }),
  });
  assert.equal(replay.status, 200, 'same request ID and payload safely replay');
  assert.deepEqual(await replay.json(), { success: true, idempotent_replay: true });
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback WHERE content=?', [payload.content],
  ).then((row) => row?.count)), 1, 'replay does not create a duplicate feedback row');

  const changedPayload = { ...payload, content: '不同载荷不可复用编号' };
  const conflict = await fetch(baseUrl, {
    method: 'POST', headers, body: JSON.stringify({ ...changedPayload, client_request_id: requestId }),
  });
  assert.equal(conflict.status, 409, 'the request ID cannot be rebound to another payload');
  const conflictStatus = await fetch(`${baseUrl}/submission-requests/${requestId}?request_fingerprint=${fingerprint(changedPayload)}`, { headers });
  assert.deepEqual(await conflictStatus.json(), { data: { state: 'conflict' } });

  const absentId = 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a63';
  const absentStatus = await fetch(`${baseUrl}/submission-requests/${absentId}?request_fingerprint=${fingerprint(payload)}`, { headers });
  assert.equal(absentStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await absentStatus.json(), { data: { state: 'not_found' } });
  const unauthenticatedStatus = await fetch(`${baseUrl}/submission-requests/${absentId}?request_fingerprint=${fingerprint(payload)}`);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store', 'unauthenticated responses are not cacheable');
  const malformedStatus = await fetch(`${baseUrl}/submission-requests/${absentId}?request_fingerprint=bad`, { headers });
  assert.equal(malformedStatus.status, 400);
  assert.equal(malformedStatus.headers.get('cache-control'), 'no-store');

  const rollbackId = 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a64';
  await database.execute(`CREATE TRIGGER anonymous_feedback_submit_receipt_failure
    BEFORE INSERT ON anonymous_feedback_submission_request_keys
    WHEN NEW.client_request_id='${rollbackId}'
    BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END`);
  const failedAtomicSubmit = await fetch(baseUrl, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, content: '必须整体回滚', client_request_id: rollbackId }),
  });
  assert.equal(failedAtomicSubmit.status, 500, 'receipt failure reports an uncertain server error');
  assert.equal(await database.queryOne('SELECT id FROM anonymous_feedback WHERE content=?', ['必须整体回滚']), null,
    'feedback creation rolls back if the permanent receipt cannot be written');
  await database.execute('DROP TRIGGER anonymous_feedback_submit_receipt_failure');

  const unkeyedLegacy = await fetch(baseUrl, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, content: '旧客户端无编号提交' }),
  });
  assert.equal(unkeyedLegacy.status, 201, 'legacy clients without a request ID remain supported');

  const deleted = await fetch(`${adminUrl}/${feedback.id}`, {
    method: 'DELETE', headers, body: JSON.stringify({ client_request_id: 'e01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a65' }),
  });
  assert.equal(deleted.status, 200, 'admin can delete the associated feedback');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM anonymous_feedback_submission_request_keys WHERE client_request_id=?', [requestId],
  ).then((row) => row?.count)), 0, 'deleting feedback removes its submission receipt');
  const afterDelete = await fetch(`${baseUrl}/submission-requests/${requestId}?request_fingerprint=${fingerprint(payload)}`, { headers });
  assert.deepEqual(await afterDelete.json(), { data: { state: 'not_found' } }, 'deleted feedback clears its recoverable receipt');

  console.log('Anonymous-feedback submit recovery HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
