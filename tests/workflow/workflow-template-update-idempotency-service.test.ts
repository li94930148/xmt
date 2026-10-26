import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-template-update-service-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow-template-update-service.db');
process.env.JWT_SECRET = 'workflow-template-update-service-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryAll, queryOne } = await import('../../api/database/utils.js');
const {
  createWorkflowTemplateBaseFingerprint,
  createWorkflowTemplateUpdateFingerprint,
  createWorkflowTemplateUpdateRequestFingerprint,
  getWorkflowTemplateUpdateRequestStatus,
  WorkflowTemplateUpdateBaseConflictError,
  WorkflowTemplateUpdateRequestConflictError,
  updateWorkflowTemplateWithRequest,
} = await import('../../api/services/workflowTemplateUpdate.js');

await initDatabase();

try {
  const templateId = await executeInsert(
    'INSERT INTO workflow_templates(name,description) VALUES(?,?)', ['服务层初始模板', '初始说明'],
  );
  const secondTemplateId = await executeInsert(
    'INSERT INTO workflow_templates(name,description) VALUES(?,?)', ['服务层另一模板', '另一说明'],
  );
  await execute(
    `INSERT INTO workflow_nodes(template_id,name,node_order,status_from,status_to) VALUES(?,?,?,?,?)`,
    [templateId, '旧节点', 1, 'pending', 'approved'],
  );
  const initialBaseFingerprint = createWorkflowTemplateBaseFingerprint({
    name: '服务层初始模板', description: '初始说明',
    nodes: [{ name: '旧节点', status_from: 'pending', status_to: 'approved', is_required: true }],
  });

  const requestId = '943f8a15-26cf-4f91-9dd6-244041e141c4';
  const payload = {
    name: '服务层更新后的模板',
    description: '保留原子提交',
    nodes: [{ name: '负责人审核', status_from: 'pending', status_to: 'approved', approver_type: 'role', approver_value: 'director', is_required: true }],
  };
  const first = await updateWorkflowTemplateWithRequest(templateId, 71, payload, requestId, initialBaseFingerprint);
  assert.deepEqual(first, { templateId, replayed: false });
  const firstNodes = await queryAll<{ id: number; name: string; node_order: number }>(
    'SELECT id,name,node_order FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
  );
  assert.equal(firstNodes.length, 1);

  const status = await getWorkflowTemplateUpdateRequestStatus(71, templateId, requestId,
    createWorkflowTemplateUpdateRequestFingerprint(payload, initialBaseFingerprint));
  assert.deepEqual(status, { state: 'updated', templateId });
  assert.deepEqual(await getWorkflowTemplateUpdateRequestStatus(71, secondTemplateId, requestId, '0'.repeat(64)), { state: 'not_found' });
  assert.deepEqual(await getWorkflowTemplateUpdateRequestStatus(72, templateId, requestId, '0'.repeat(64)), { state: 'not_found' });

  assert.deepEqual(await updateWorkflowTemplateWithRequest(
    templateId, 71, payload, requestId, initialBaseFingerprint,
  ), { templateId, replayed: true });
  assert.deepEqual(await queryAll<{ id: number; name: string; node_order: number }>(
    'SELECT id,name,node_order FROM workflow_nodes WHERE template_id=? ORDER BY node_order', [templateId],
  ), firstNodes, 'a replay does not delete/reinsert the node set');
  await assert.rejects(
    updateWorkflowTemplateWithRequest(templateId, 71, { ...payload, name: '改动过的载荷' }, requestId, initialBaseFingerprint),
    WorkflowTemplateUpdateRequestConflictError,
  );
  await assert.rejects(
    updateWorkflowTemplateWithRequest(templateId, 72, payload, requestId, initialBaseFingerprint),
    WorkflowTemplateUpdateRequestConflictError,
  );
  await assert.rejects(
    updateWorkflowTemplateWithRequest(secondTemplateId, 71, payload, requestId, initialBaseFingerprint),
    WorkflowTemplateUpdateRequestConflictError,
  );

  const currentBaseFingerprint = createWorkflowTemplateUpdateFingerprint(payload);
  const staleRequestId = '943f8a15-26cf-4f91-9dd6-244041e141c6';
  await assert.rejects(
    updateWorkflowTemplateWithRequest(
      templateId, 71, { ...payload, name: '过期基线不能写入' }, staleRequestId, initialBaseFingerprint,
    ),
    WorkflowTemplateUpdateBaseConflictError,
  );
  assert.equal(await queryOne('SELECT client_request_id FROM workflow_template_update_request_keys WHERE client_request_id=?', [staleRequestId]), null,
    'a stale baseline conflict writes no receipt');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM workflow_templates WHERE id=?', [templateId]))?.name, payload.name,
    'a stale baseline conflict leaves template data untouched');

  const concurrentId = '943f8a15-26cf-4f91-9dd6-244041e141c5';
  const concurrent = await Promise.all([
    updateWorkflowTemplateWithRequest(templateId, 71, payload, concurrentId, currentBaseFingerprint),
    updateWorkflowTemplateWithRequest(templateId, 71, payload, concurrentId, currentBaseFingerprint),
  ]);
  assert.deepEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys WHERE client_request_id=?', [concurrentId],
  ))?.count || 0), 1, 'concurrent same-key calls create one receipt');
  assert.equal((await queryAll('SELECT id FROM workflow_nodes WHERE template_id=?', [templateId])).length, 1,
    'concurrent same-key calls leave one node set');

  const raceBaseFingerprint = createWorkflowTemplateUpdateFingerprint(payload);
  const racePayloads = [
    { ...payload, name: '服务层竞态甲', nodes: [{ ...payload.nodes[0], name: '服务层节点甲' }] },
    { ...payload, name: '服务层竞态乙', nodes: [{ ...payload.nodes[0], name: '服务层节点乙' }] },
  ];
  const raceIds = ['943f8a15-26cf-4f91-9dd6-244041e141c7', '943f8a15-26cf-4f91-9dd6-244041e141c8'];
  const raceResults = await Promise.allSettled(racePayloads.map((racePayload, index) => updateWorkflowTemplateWithRequest(
    templateId, 71, racePayload, raceIds[index], raceBaseFingerprint,
  )));
  assert.equal(raceResults.filter((result) => result.status === 'fulfilled').length, 1,
    'compare-and-swap allows one different-key update from the same baseline');
  assert.equal(raceResults.filter((result) => result.status === 'rejected'
    && result.reason instanceof WorkflowTemplateUpdateBaseConflictError).length, 1,
  'the concurrent loser receives an explicit stale-baseline conflict');
  const raceWinnerIndex = raceResults.findIndex((result) => result.status === 'fulfilled');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM workflow_templates WHERE id=?', [templateId]))?.name,
    racePayloads[raceWinnerIndex].name, 'the stale request cannot overwrite template fields');
  assert.equal((await queryOne<{ name: string }>(
    'SELECT name FROM workflow_nodes WHERE template_id=? ORDER BY node_order,id LIMIT 1', [templateId],
  ))?.name, racePayloads[raceWinnerIndex].nodes[0].name, 'the stale request cannot replace nodes');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workflow_template_update_request_keys WHERE client_request_id IN (?,?)', raceIds,
  ))?.count || 0), 1, 'the CAS loser writes no receipt');

  console.log('Workflow-template update idempotency service tests passed.');
} finally {
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
