import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-template-update-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow-template-update.db');
process.env.JWT_SECRET = 'workflow-template-update-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryAll, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowTemplatesRouter } = await import('../../api/routes/workflow-templates.js');
const {
  createWorkflowTemplateBaseFingerprint,
  createWorkflowTemplateUpdateFingerprint,
  createWorkflowTemplateUpdateRequestFingerprint,
} = await import('../../api/services/workflowTemplateUpdate.js');

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

const editorId = await createUser('workflow-template-update-editor', 'admin');
const otherEditorId = await createUser('workflow-template-update-other-editor', 'admin');
const readOnlyId = await createUser('workflow-template-update-read-only', 'member', false);
clearPermissionCache();

const templateId = await executeInsert(
  'INSERT INTO workflow_templates(name,description,creator_id) VALUES(?,?,?)',
  ['更新前名称', '更新前说明', editorId],
);
await execute(
  `INSERT INTO workflow_nodes(template_id,name,node_order,status_from,status_to,approver_type,approver_value,is_required)
   VALUES(?,?,?,?,?,?,?,?)`,
  [templateId, '旧审核节点', 1, 'pending', 'approved', 'role', 'director', 1],
);
await execute(
  `INSERT INTO workflow_nodes(template_id,name,node_order,status_from,status_to,approver_type,approver_value,is_required)
   VALUES(?,?,?,?,?,?,?,?)`,
  [templateId, '并列旧节点', 1, 'pending', 'rejected', 'role', 'director', 1],
);
const otherTemplateId = await executeInsert(
  'INSERT INTO workflow_templates(name,description,creator_id) VALUES(?,?,?)',
  ['另一审批流', '另一说明', otherEditorId],
);

const app = express();
app.use(express.json());
app.use('/api/workflow-templates', workflowTemplatesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow-templates`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
const requestId = '8c5613f9-6d04-48d2-a11a-c54cb10b91f1';
const statusUrl = (id: number, key: string, fingerprint: string) => `${base}/${id}/update-requests/${key}?fingerprint=${encodeURIComponent(fingerprint)}`;
const payload = {
  name: '安全恢复后的审批流',
  description: '节点配置原子提交',
  nodes: [{
    name: '负责人审核', status_from: 'pending', status_to: 'approved',
    approver_type: 'role', approver_value: 'director', is_required: true,
  }],
};
const keyedUpdate = (userId: number, id: number, body: unknown, baseFingerprint: string) => fetch(`${base}/${id}`, {
  method: 'PUT', headers: headers(userId),
  body: JSON.stringify({ ...(body as Record<string, unknown>), base_fingerprint: baseFingerprint }),
});

try {
  const unauthenticatedStatus = await fetch(statusUrl(templateId, requestId, 'a'.repeat(64)));
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store');

  const invalidIdStatus = await fetch(`${base}/not-an-id/update-requests/${requestId}?fingerprint=${'a'.repeat(64)}`, { headers: headers(readOnlyId) });
  assert.equal(invalidIdStatus.status, 400);
  assert.equal(invalidIdStatus.headers.get('cache-control'), 'no-store');
  const invalidKeyStatus = await fetch(`${base}/${templateId}/update-requests/not-a-uuid?fingerprint=${'a'.repeat(64)}`, { headers: headers(readOnlyId) });
  assert.equal(invalidKeyStatus.status, 400);
  assert.equal(invalidKeyStatus.headers.get('cache-control'), 'no-store');
  const missingStatus = await fetch(`${base}/${templateId}/update-requests/${requestId}`, { headers: headers(editorId) });
  assert.equal(missingStatus.status, 400, 'status lookup requires a valid SHA-256 fingerprint');
  assert.equal(missingStatus.headers.get('cache-control'), 'no-store');

  const initialDetailResponse = await fetch(`${base}/${templateId}`, { headers: headers(editorId) });
  assert.equal(initialDetailResponse.status, 200);
  const initialDetail = await initialDetailResponse.json() as {
    name: string;
    description: string | null;
    base_fingerprint: string;
    nodes: Array<{ name: string; status_from: string; status_to: string; approver_type?: string | null; approver_value?: string | null; is_required?: boolean | number | null }>;
  };
  assert.match(initialDetail.base_fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(initialDetail.nodes.map((node) => node.name), ['旧审核节点', '并列旧节点'],
    'detail ordering is stable for nodes with equal node_order');
  assert.equal(initialDetail.base_fingerprint, createWorkflowTemplateBaseFingerprint(initialDetail));
  const initialBaseFingerprint = initialDetail.base_fingerprint;

  const missingBase = await fetch(`${base}/${templateId}`, {
    method: 'PUT', headers: headers(editorId),
    body: JSON.stringify({ ...payload, client_request_id: '8c5613f9-6d04-48d2-a11a-c54cb10b91f7' }),
  });
  assert.equal(missingBase.status, 400, 'keyed updates require the baseline fingerprint');

  const denied = await keyedUpdate(readOnlyId, templateId, { ...payload, client_request_id: requestId }, initialBaseFingerprint);
  assert.equal(denied.status, 403, 'idempotency does not bypass system:template');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys WHERE client_request_id=?', [requestId],
  ))?.count || 0), 0, 'permission rejection creates no receipt');

  const firstResponse = await keyedUpdate(editorId, templateId, { ...payload, client_request_id: requestId }, initialBaseFingerprint);
  assert.equal(firstResponse.status, 200, JSON.stringify(await firstResponse.clone().json()));
  assert.deepEqual(await firstResponse.json(), { message: '审批流模板更新成功', idempotent_replay: false });
  const fingerprint = createWorkflowTemplateUpdateRequestFingerprint(payload, initialBaseFingerprint);
  const firstNodeRows = await queryAll<{ id: number; name: string; node_order: number }>(
    'SELECT id,name,node_order FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
  );
  assert.equal(firstNodeRows.length, 1);
  assert.equal(firstNodeRows[0].name, payload.nodes[0].name);

  const recoveredStatus = await fetch(statusUrl(templateId, requestId, fingerprint), { headers: headers(editorId) });
  assert.equal(recoveredStatus.status, 200);
  assert.equal(recoveredStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await recoveredStatus.json(), { state: 'updated', templateId });
  const unknownStatus = await fetch(statusUrl(templateId, '8c5613f9-6d04-48d2-a11a-c54cb10b91f2', fingerprint), { headers: headers(editorId) });
  assert.equal(unknownStatus.status, 200);
  assert.equal(unknownStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unknownStatus.json(), { state: 'not_found' });
  const hiddenStatus = await fetch(statusUrl(templateId, requestId, fingerprint), { headers: headers(otherEditorId) });
  assert.equal(hiddenStatus.status, 200, 'read-only lookup never exposes another actor receipt');
  assert.deepEqual(await hiddenStatus.json(), { state: 'not_found' });
  const wrongTargetStatus = await fetch(statusUrl(otherTemplateId, requestId, fingerprint), { headers: headers(editorId) });
  assert.deepEqual(await wrongTargetStatus.json(), { state: 'not_found' }, 'status is scoped to the target template');
  const mismatchStatus = await fetch(statusUrl(templateId, requestId, 'f'.repeat(64)), { headers: headers(editorId) });
  assert.equal(mismatchStatus.status, 409);
  assert.equal(mismatchStatus.headers.get('cache-control'), 'no-store');

  const replay = await keyedUpdate(editorId, templateId, { ...payload, client_request_id: requestId }, initialBaseFingerprint);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { message: '审批流模板更新成功', idempotent_replay: true });
  assert.deepEqual(
    await queryAll<{ id: number; name: string; node_order: number }>(
      'SELECT id,name,node_order FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
    ),
    firstNodeRows,
    'same-key replay returns the stored result without deleting and recreating nodes',
  );

  const payloadConflict = await keyedUpdate(editorId, templateId, {
    ...payload,
    nodes: [{ ...payload.nodes[0], name: '复用编号的不同节点' }],
    client_request_id: requestId,
  }, initialBaseFingerprint);
  assert.equal(payloadConflict.status, 409);
  assert.equal((await payloadConflict.json() as { code: string }).code, 'WORKFLOW_TEMPLATE_UPDATE_REQUEST_CONFLICT',
    'UUID reuse conflicts remain distinct from a confirmed stale baseline');
  const actorConflict = await keyedUpdate(otherEditorId, templateId, { ...payload, client_request_id: requestId }, initialBaseFingerprint);
  assert.equal(actorConflict.status, 409);
  const targetConflict = await keyedUpdate(editorId, otherTemplateId, { ...payload, client_request_id: requestId }, initialBaseFingerprint);
  assert.equal(targetConflict.status, 409);
  assert.deepEqual(
    await queryAll<{ id: number; name: string; node_order: number }>(
      'SELECT id,name,node_order FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
    ),
    firstNodeRows,
    'conflicting key reuse cannot alter the original target',
  );

  const concurrentId = '8c5613f9-6d04-48d2-a11a-c54cb10b91f3';
  const concurrentPayload = { ...payload, name: '同编号并发更新' };
  const currentBaseFingerprint = createWorkflowTemplateUpdateFingerprint(payload);
  const concurrent = await Promise.all([
    keyedUpdate(editorId, templateId, { ...concurrentPayload, client_request_id: concurrentId }, currentBaseFingerprint),
    keyedUpdate(editorId, templateId, { ...concurrentPayload, client_request_id: concurrentId }, currentBaseFingerprint),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200]);
  const concurrentResults = await Promise.all(concurrent.map((response) => response.json() as Promise<{ idempotent_replay: boolean }>));
  assert.deepEqual(concurrentResults.map((result) => result.idempotent_replay).sort(), [false, true]);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys WHERE client_request_id=?', [concurrentId],
  ))?.count || 0), 1, 'concurrent same-key updates commit one receipt');
  const concurrentNodes = await queryAll<{ id: number; name: string }>(
    'SELECT id,name FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
  );
  assert.equal(concurrentNodes.length, 1);
  assert.equal(concurrentNodes[0].name, payload.nodes[0].name);

  const raceBaseFingerprint = createWorkflowTemplateUpdateFingerprint(concurrentPayload);
  const racePayloads = [
    { ...concurrentPayload, name: '竞态更新甲', nodes: [{ ...payload.nodes[0], name: '竞态节点甲' }] },
    { ...concurrentPayload, name: '竞态更新乙', nodes: [{ ...payload.nodes[0], name: '竞态节点乙' }] },
  ];
  const raceIds = ['8c5613f9-6d04-48d2-a11a-c54cb10b91f5', '8c5613f9-6d04-48d2-a11a-c54cb10b91f6'];
  const raceResponses = await Promise.all(racePayloads.map((racePayload, index) => keyedUpdate(
    editorId, templateId, { ...racePayload, client_request_id: raceIds[index] }, raceBaseFingerprint,
  )));
  const raceResults = await Promise.all(raceResponses.map(async (response) => ({ status: response.status, body: await response.json() as Record<string, unknown> })));
  assert.deepEqual(raceResults.map((result) => result.status).sort(), [200, 409],
    'two different request IDs with the same baseline cannot both replace the template');
  const raceWinnerIndex = raceResults.findIndex((result) => result.status === 200);
  const raceConflictIndex = raceResults.findIndex((result) => result.status === 409);
  assert.equal(raceResults[raceConflictIndex].body.code, 'WORKFLOW_TEMPLATE_UPDATE_BASE_CONFLICT');
  assert.match(String(raceResults[raceConflictIndex].body.base_fingerprint), /^[0-9a-f]{64}$/);
  assert.deepEqual(
    await queryOne<{ name: string }>('SELECT name FROM workflow_templates WHERE id=?', [templateId]),
    { name: racePayloads[raceWinnerIndex].name },
    'the losing stale request cannot overwrite the winning template fields',
  );
  assert.deepEqual(
    await queryOne<{ name: string }>('SELECT name FROM workflow_nodes WHERE template_id=? ORDER BY node_order LIMIT 1', [templateId]),
    { name: racePayloads[raceWinnerIndex].nodes[0].name },
    'the losing stale request cannot replace the winning node set',
  );
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys WHERE client_request_id IN (?,?)', raceIds,
  ))?.count || 0), 1, 'only the successful compare-and-swap request writes a receipt');

  const receiptCountBeforeLegacyUpdate = Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys',
  ))?.count || 0);
  const legacyUpdate = await fetch(`${base}/${templateId}`, {
    method: 'PUT', headers: headers(editorId),
    body: JSON.stringify({ nodes: payload.nodes }),
  });
  assert.equal(legacyUpdate.status, 200, 'legacy clients continue using the unkeyed partial-update path');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM workflow_templates WHERE id=?', [templateId]))?.name,
    racePayloads[raceWinnerIndex].name, 'a legacy node-only update leaves template fields unchanged');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys',
  ))?.count || 0), receiptCountBeforeLegacyUpdate, 'legacy updates remain unkeyed and do not create receipts');

  const rollbackId = '8c5613f9-6d04-48d2-a11a-c54cb10b91f4';
  const rollbackDetail = await fetch(`${base}/${templateId}`, { headers: headers(editorId) }).then((response) => response.json()) as { base_fingerprint: string };
  await execute(`CREATE TRIGGER reject_workflow_template_update_receipt
    BEFORE INSERT ON workflow_template_update_request_keys
    WHEN NEW.client_request_id='${rollbackId}'
    BEGIN SELECT RAISE(ABORT, 'injected workflow template update receipt failure'); END`);
  const beforeRollback = await queryOne<{ name: string }>('SELECT name FROM workflow_templates WHERE id=?', [templateId]);
  const beforeRollbackNodes = await queryAll<{ id: number; name: string }>(
    'SELECT id,name FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
  );
  const failedReceipt = await keyedUpdate(editorId, templateId, {
    ...payload, name: '回执失败需要回滚', client_request_id: rollbackId,
  }, rollbackDetail.base_fingerprint);
  assert.equal(failedReceipt.status, 500);
  assert.deepEqual(await queryOne('SELECT name FROM workflow_templates WHERE id=?', [templateId]), beforeRollback);
  assert.deepEqual(await queryAll('SELECT id,name FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId]), beforeRollbackNodes);
  assert.equal(await queryOne('SELECT client_request_id FROM workflow_template_update_request_keys WHERE client_request_id=?', [rollbackId]), null);
  await execute('DROP TRIGGER reject_workflow_template_update_receipt');

  console.log('Workflow-template update idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
