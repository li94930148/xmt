import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-template-create-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow-template-create.db');
process.env.JWT_SECRET = 'workflow-template-create-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowTemplatesRouter } = await import('../../api/routes/workflow-templates.js');

await initDatabase();

async function createUser(username: string, roleCode: string, withRolePermissions = true) {
  const userId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, roleCode, username],
  );
  if (withRolePermissions) {
    await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, roleCode]);
  }
  return userId;
}

const creatorId = await createUser('workflow-template-create-admin', 'admin');
const otherCreatorId = await createUser('workflow-template-create-other-admin', 'admin');
const readOnlyId = await createUser('workflow-template-create-read-only', 'member', false);
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/workflow-templates', workflowTemplatesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow-templates`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
const statusUrl = (id: string, fingerprint: string) => `${base}/create-requests/${id}?fingerprint=${encodeURIComponent(fingerprint)}`;

const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a56';
const payload = {
  name: '可安全重放的审批流',
  description: '同一请求不重复创建模板和节点',
  nodes: [{
    name: '负责人审核',
    status_from: 'pending',
    status_to: 'approved',
    approver_type: 'role',
    approver_value: 'director',
    is_required: true,
  }],
};
const keyedCreate = (userId: number, body: unknown) => fetch(base, {
  method: 'POST',
  headers: headers(userId),
  body: JSON.stringify(body),
});

try {
  const unauthenticatedStatus = await fetch(`${base}/create-requests/${requestId}`);
  assert.equal(unauthenticatedStatus.status, 401, 'request-status lookup requires authentication');
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store');

  const invalidRequestId = await fetch(`${base}/create-requests/not-a-uuid`, { headers: headers(readOnlyId) });
  assert.equal(invalidRequestId.status, 400);
  assert.equal(invalidRequestId.headers.get('cache-control'), 'no-store');

  const missingFingerprint = await fetch(`${base}/create-requests/${requestId}`, { headers: headers(creatorId) });
  assert.equal(missingFingerprint.status, 400, 'status lookup requires a fingerprint');
  assert.equal(missingFingerprint.headers.get('cache-control'), 'no-store');
  const invalidFingerprint = await fetch(statusUrl(requestId, 'not-a-sha256'), { headers: headers(creatorId) });
  assert.equal(invalidFingerprint.status, 400, 'status lookup rejects non-64-digit fingerprints');
  assert.equal(invalidFingerprint.headers.get('cache-control'), 'no-store');

  const missingStatus = await fetch(statusUrl(requestId, 'a'.repeat(64)), { headers: headers(creatorId) });
  assert.equal(missingStatus.status, 404);
  assert.equal(missingStatus.headers.get('cache-control'), 'no-store');

  const explicitNullRequestKey = await keyedCreate(creatorId, { ...payload, client_request_id: null });
  assert.equal(explicitNullRequestKey.status, 400, 'an explicitly null key is rejected instead of bypassing the idempotent create path');

  const deniedCreate = await keyedCreate(readOnlyId, { ...payload, client_request_id: requestId });
  assert.equal(deniedCreate.status, 403, 'adding request recovery does not weaken system:template write permission');

  const first = await keyedCreate(creatorId, { ...payload, client_request_id: requestId });
  assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
  const firstResult = await first.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(firstResult.idempotent_replay, false);
  const ledger = await queryOne<{ request_fingerprint: string }>(
    'SELECT request_fingerprint FROM workflow_template_create_request_keys WHERE client_request_id=?', [requestId],
  );
  assert(ledger?.request_fingerprint, 'the create request stores the payload fingerprint needed for recovery');
  const fingerprint = ledger.request_fingerprint;

  const confirmedStatus = await fetch(statusUrl(requestId, fingerprint), { headers: headers(creatorId) });
  assert.equal(confirmedStatus.status, 200);
  assert.equal(confirmedStatus.headers.get('cache-control'), 'no-store');
  assert.equal((await confirmedStatus.json() as { templateId: number }).templateId, firstResult.id);

  const mismatchedFingerprint = fingerprint === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  const payloadConflictStatus = await fetch(statusUrl(requestId, mismatchedFingerprint), { headers: headers(creatorId) });
  assert.equal(payloadConflictStatus.status, 409, 'the owner receives a conflict when the supplied payload fingerprint differs');
  assert.equal(payloadConflictStatus.headers.get('cache-control'), 'no-store');

  const hiddenStatus = await fetch(statusUrl(requestId, mismatchedFingerprint), { headers: headers(otherCreatorId) });
  assert.equal(hiddenStatus.status, 404, 'another actor cannot discover a template-create result');
  assert.equal(hiddenStatus.headers.get('cache-control'), 'no-store');
  const readOnlyStatus = await fetch(statusUrl(requestId, fingerprint), { headers: headers(readOnlyId) });
  assert.equal(readOnlyStatus.status, 404, 'authenticated users can use the read-only query without gaining write access');

  const replay = await keyedCreate(creatorId, { ...payload, client_request_id: requestId });
  assert.equal(replay.status, 200);
  const replayResult = await replay.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(replayResult.id, firstResult.id);
  assert.equal(replayResult.idempotent_replay, true);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_templates WHERE name=?', [payload.name],
  ))?.count || 0), 1, 'same-key replay creates one template');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_nodes WHERE template_id=?', [firstResult.id],
  ))?.count || 0), 1, 'same-key replay preserves one node set');

  const concurrentRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a58';
  const concurrentPayload = {
    ...payload,
    name: '并发请求只创建一次的审批流',
    client_request_id: concurrentRequestId,
  };
  // Start both HTTP mutations before awaiting either response to exercise the
  // unique-key/transaction behavior under overlapping same-actor requests.
  const concurrentResponses = await Promise.all([
    keyedCreate(creatorId, concurrentPayload),
    keyedCreate(creatorId, concurrentPayload),
  ]);
  assert.deepEqual(concurrentResponses.map((response) => response.status), [200, 200],
    'concurrent identical requests both succeed; the later transaction replays instead of conflicting');
  const concurrentResults = await Promise.all(concurrentResponses.map((response) => response.json() as Promise<{
    id: number;
    idempotent_replay?: boolean;
  }>));
  assert.equal(concurrentResults[0].id, concurrentResults[1].id,
    'concurrent same-key responses identify the same template');
  assert.deepEqual(concurrentResults.map((result) => result.idempotent_replay).sort(), [false, true],
    'one overlapping request creates and the other replays the committed result, with no 409 conflict');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_templates WHERE name=?', [concurrentPayload.name],
  ))?.count || 0), 1, 'concurrent same-key requests create exactly one template');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_nodes WHERE template_id=?', [concurrentResults[0].id],
  ))?.count || 0), 1, 'concurrent same-key requests create exactly one node set');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_create_request_keys WHERE client_request_id=?', [concurrentRequestId],
  ))?.count || 0), 1, 'concurrent same-key requests record exactly one request key');

  const payloadConflict = await keyedCreate(creatorId, {
    ...payload,
    name: '不可复用请求编号的其他审批流',
    client_request_id: requestId,
  });
  assert.equal(payloadConflict.status, 409, 'a request key cannot be reused for a different payload');
  const actorConflict = await keyedCreate(otherCreatorId, { ...payload, client_request_id: requestId });
  assert.equal(actorConflict.status, 409, 'a request key cannot be replayed by another actor');

  const invalidKeyCreate = await keyedCreate(creatorId, { ...payload, client_request_id: 'bad-key' });
  assert.equal(invalidKeyCreate.status, 400, 'keyed creates reject malformed request IDs');

  const legacyCreate = await keyedCreate(creatorId, { ...payload, name: '旧客户端审批流' });
  assert.equal(legacyCreate.status, 200, 'legacy clients may continue creating without a request ID');
  const legacyResult = await legacyCreate.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(typeof legacyResult.id, 'number');
  assert.equal('idempotent_replay' in legacyResult, false, 'the legacy response shape remains compatible');

  const rollbackRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  await execute(`CREATE TRIGGER reject_workflow_template_create_request_key
    BEFORE INSERT ON workflow_template_create_request_keys
    WHEN NEW.client_request_id = '${rollbackRequestId}'
    BEGIN SELECT RAISE(ABORT, 'injected workflow template request ledger failure'); END`);
  const failedLedgerWrite = await keyedCreate(creatorId, {
    ...payload,
    name: '账本失败时必须回滚的审批流',
    client_request_id: rollbackRequestId,
  });
  assert.equal(failedLedgerWrite.status, 500, 'a failed request-ledger insert fails the whole mutation');
  assert.equal(await queryOne('SELECT id FROM workflow_templates WHERE name=?', ['账本失败时必须回滚的审批流']), null,
    'the template row rolls back when its request result cannot be recorded');
  assert.equal(await queryOne('SELECT client_request_id FROM workflow_template_create_request_keys WHERE client_request_id=?', [rollbackRequestId]), null);
  await execute('DROP TRIGGER reject_workflow_template_create_request_key');

  const deleted = await fetch(`${base}/${firstResult.id}`, { method: 'DELETE', headers: headers(creatorId) });
  assert.equal(deleted.status, 200, 'creator retains the existing template delete path');
  const deletedStatus = await fetch(statusUrl(requestId, fingerprint), { headers: headers(creatorId) });
  assert.equal(deletedStatus.status, 410, 'the status query reports a deleted template without clearing its tombstone');
  assert.equal(deletedStatus.headers.get('cache-control'), 'no-store');
  const deletedReplay = await keyedCreate(creatorId, { ...payload, client_request_id: requestId });
  assert.equal(deletedReplay.status, 410, 'late replay cannot resurrect a deleted template');
  assert.equal(await queryOne('SELECT id FROM workflow_templates WHERE id=?', [firstResult.id]), null);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Workflow-template create idempotency HTTP tests passed.');
