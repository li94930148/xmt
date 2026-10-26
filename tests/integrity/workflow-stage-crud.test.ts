import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-stages-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow.db');
process.env.JWT_SECRET = 'workflow-stage-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');
const { default: workflowTemplatesRouter } = await import('../../api/routes/workflow-templates.js');

await initDatabase();
const director = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'director'");
assert(director);
await execute('UPDATE users SET force_change_password = 0 WHERE id = ?', [director.id]);
const memberId = await executeInsert(`INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?,?)`, ['stage-member', 'unused', '', 'member', 'Stage Member', 1, 0]);
await execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='member'`, [memberId]);
const topicId = await executeInsert(`INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`, ['阶段回归', '', 'douyin', director.id, director.id, 'shooting']);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRouter);
app.use('/api/workflow-templates', workflowTemplatesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const workflowTemplatesBase = `http://127.0.0.1:${address.port}/api/workflow-templates`;
const headers = (id: number) => ({ authorization: `Bearer ${signToken({ userId: id })}`, 'content-type': 'application/json' });

function createProduction(topicId: number, status = 'draft') {
  return fetch(`${base}/production`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: topicId, content: '阶段测试创作稿', status }),
  });
}

async function createApprovalFixture(fromStatus: string, toStatus: string, title: string) {
  const workflowTemplateId = await executeInsert(
    'INSERT INTO workflow_templates(name,description,creator_id) VALUES(?,?,?)',
    [`${title}审批流`, '', director.id],
  );
  const nodeId = await executeInsert(
    `INSERT INTO workflow_nodes(template_id,name,node_order,status_from,status_to,approver_type,approver_value,is_required)
     VALUES(?,?,?,?,?,?,?,?)`,
    [workflowTemplateId, `${fromStatus}到${toStatus}`, 1, fromStatus, toStatus, 'role', 'director', 1],
  );
  const approvalTopicId = await executeInsert(
    `INSERT INTO topics(title,description,outline,outline_markdown,outline_json,platform,creator_id,assignee_id,status,workflow_template_id)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [title, '', '选题大纲', 'Markdown 大纲', '{"outline":"json"}', 'douyin', director.id, director.id, fromStatus, workflowTemplateId],
  );
  return { workflowTemplateId, nodeId, topicId: approvalTopicId };
}

function postWorkflowApproval(topicId: number, nodeId: number, userId = director.id, status = 'approved') {
  return fetch(`${workflowTemplatesBase}/topic/${topicId}/approve`, {
    method: 'POST',
    headers: headers(userId),
    body: JSON.stringify({ node_id: nodeId, status, comment: '隔离审批回归' }),
  });
}

try {
  const invalidTemplateName = '拒绝非法状态转换模板';
  const invalidTemplateCreate = await fetch(workflowTemplatesBase, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({
      name: invalidTemplateName,
      description: '',
      nodes: [{ name: '非法跳级', status_from: 'pending', status_to: 'shooting', approver_type: 'role', approver_value: 'director' }],
    }),
  });
  assert.equal(invalidTemplateCreate.status, 400, 'workflow template creation rejects a transition outside the shared Topic state machine');
  assert.equal(await queryOne('SELECT id FROM workflow_templates WHERE name=?', [invalidTemplateName]), null,
    'an invalid transition cannot create a workflow template');

  const validTemplateCreate = await fetch(workflowTemplatesBase, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({
      name: '状态机合法转换模板',
      description: '',
      nodes: [{ name: '通过审核', status_from: 'pending', status_to: 'approved', approver_type: 'role', approver_value: 'director' }],
    }),
  });
  assert.equal(validTemplateCreate.status, 200, 'workflow template creation continues to accept a valid transition');
  const validTemplate = await validTemplateCreate.json() as { id: number };
  const invalidTemplateUpdate = await fetch(`${workflowTemplatesBase}/${validTemplate.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ nodes: [{ name: '非法跳级', status_from: 'pending', status_to: 'completed', approver_type: 'role', approver_value: 'director' }] }),
  });
  assert.equal(invalidTemplateUpdate.status, 400, 'workflow template updates reject a transition outside the shared Topic state machine');
  assert.deepEqual(
    await queryOne<{ status_from: string; status_to: string }>(
      'SELECT status_from,status_to FROM workflow_nodes WHERE template_id=? ORDER BY node_order LIMIT 1',
      [validTemplate.id],
    ),
    { status_from: 'pending', status_to: 'approved' },
    'an invalid template update leaves the previously valid transition intact',
  );

  const invalidApprovalOutcome = await createApprovalFixture('pending', 'approved', '拒绝未知审批结果');
  const invalidApprovalOutcomeResponse = await postWorkflowApproval(
    invalidApprovalOutcome.topicId,
    invalidApprovalOutcome.nodeId,
    director.id,
    'completed',
  );
  assert.equal(invalidApprovalOutcomeResponse.status, 400, 'approval actions accept only approved or rejected outcomes');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [invalidApprovalOutcome.topicId]))?.status, 'pending',
    'an invalid approval outcome cannot advance the Topic');
  assert.equal(await queryOne('SELECT id FROM approval_records WHERE topic_id=?', [invalidApprovalOutcome.topicId]), null,
    'an invalid approval outcome cannot create an approval record');

  const invalidProductionCreateTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['拒绝未知创作状态的选题', '', 'douyin', director.id, director.id, 'approved'],
  );
  const invalidProductionCreate = await createProduction(invalidProductionCreateTopicId, 'completed');
  assert.equal(invalidProductionCreate.status, 400, 'production creation rejects a Topic-stage status that is not a valid production sub-state');
  assert.equal(await queryOne('SELECT id FROM production WHERE topic_id=?', [invalidProductionCreateTopicId]), null,
    'an invalid production status cannot create a child record');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [invalidProductionCreateTopicId]))?.status, 'approved',
    'an invalid production status cannot advance its parent Topic');
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='status_production'`,
    [invalidProductionCreateTopicId],
  ))?.count || 0), 0, 'an invalid production status cannot leave a stage history record');

  const invalidProductionUpdateTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['拒绝未知创作更新状态的选题', '', 'douyin', director.id, director.id, 'production'],
  );
  const invalidProductionUpdateId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)`,
    [invalidProductionUpdateTopicId, 'v1.0', '状态边界稿', 'draft', director.id],
  );
  const invalidProductionUpdate = await fetch(`${base}/production/${invalidProductionUpdateId}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: invalidProductionUpdateTopicId, version: 'v1.0', content: '不应被写入', status: 'completed' }),
  });
  assert.equal(invalidProductionUpdate.status, 400, 'production updates reject a Topic-stage status that is not a valid production sub-state');
  assert.equal((await queryOne<{ status: string; content: string }>('SELECT status,content FROM production WHERE id=?', [invalidProductionUpdateId]))?.status, 'draft',
    'invalid production status updates leave the child status unchanged');
  assert.equal((await queryOne<{ content: string }>('SELECT content FROM production WHERE id=?', [invalidProductionUpdateId]))?.content, '状态边界稿',
    'invalid production status updates leave the child content unchanged');
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='production_status_changed'`,
    [invalidProductionUpdateTopicId],
  ))?.count || 0), 0, 'an invalid production status cannot leave a child-state audit record');

  const strictShootingStatusTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['成片状态类型校验选题', '', 'douyin', director.id, director.id, 'shooting'],
  );
  const arrayShootingStatusCreate = await fetch(`${base}/shooting`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: strictShootingStatusTopicId, status: ['planned'] }),
  });
  assert.equal(arrayShootingStatusCreate.status, 400, 'shooting creation rejects arrays that coerce to a valid status string');
  assert.equal(await queryOne('SELECT id FROM shooting WHERE topic_id=?', [strictShootingStatusTopicId]), null,
    'a non-string shooting status cannot create a child record');
  const strictShootingStatusId = await executeInsert(
    `INSERT INTO shooting(topic_id,status,operator_id) VALUES(?,?,?)`,
    [strictShootingStatusTopicId, 'planned', director.id],
  );
  const arrayShootingStatusUpdate = await fetch(`${base}/shooting/${strictShootingStatusId}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: ['in_progress'] }),
  });
  assert.equal(arrayShootingStatusUpdate.status, 400, 'shooting updates reject arrays that coerce to a valid status string');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [strictShootingStatusId]))?.status, 'planned',
    'a non-string shooting status cannot update the stored state');

  const strictPublishingStatusTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['发布状态类型校验选题', '', 'douyin', director.id, director.id, 'publishing'],
  );
  const arrayPublishingStatusCreate = await fetch(`${base}/publishing`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: strictPublishingStatusTopicId, status: ['pending'], publish_time: '2026-10-22 12:00:00' }),
  });
  assert.equal(arrayPublishingStatusCreate.status, 400, 'publishing creation rejects arrays that coerce to a valid status string');
  assert.equal(await queryOne('SELECT id FROM publishing WHERE topic_id=?', [strictPublishingStatusTopicId]), null,
    'a non-string publishing status cannot create a child record');
  const strictPublishingStatusId = await executeInsert(
    `INSERT INTO publishing(topic_id,status,operator_id) VALUES(?,?,?)`,
    [strictPublishingStatusTopicId, 'pending', director.id],
  );
  const arrayPublishingStatusUpdate = await fetch(`${base}/publishing/${strictPublishingStatusId}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: ['failed'] }),
  });
  assert.equal(arrayPublishingStatusUpdate.status, 400, 'publishing updates reject arrays that coerce to a valid status string');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM publishing WHERE id=?', [strictPublishingStatusId]))?.status, 'pending',
    'a non-string publishing status cannot update the stored state');

  const approvedProductionTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['创建已通过创作稿', '', 'douyin', director.id, director.id, 'approved'],
  );
  const approvedProductionResponse = await createProduction(approvedProductionTopicId, 'approved');
  assert.equal(approvedProductionResponse.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [approvedProductionTopicId]))?.status, 'production');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM production WHERE topic_id=?', [approvedProductionTopicId]))?.status, 'approved');
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='status_production'`,
    [approvedProductionTopicId],
  ))?.count || 0), 1, 'approved record creation and topic handoff are recorded together');

  const rejectedProductionTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['不允许越级创建已通过稿', '', 'douyin', director.id, director.id, 'pending'],
  );
  const rejectedProductionResponse = await createProduction(rejectedProductionTopicId, 'approved');
  assert.equal(rejectedProductionResponse.status, 409);
  assert.equal(await queryOne('SELECT id FROM production WHERE topic_id=?', [rejectedProductionTopicId]), null);

  const rollbackProductionTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['创作创建失败回滚阶段', '', 'douyin', director.id, director.id, 'approved'],
  );
  const blockApprovedProduction = `block_approved_production_${rollbackProductionTopicId}`;
  await execute(
    `CREATE TRIGGER ${blockApprovedProduction} BEFORE INSERT ON production
     WHEN NEW.topic_id=${rollbackProductionTopicId}
     BEGIN SELECT RAISE(ABORT, 'blocked by isolated regression test'); END`,
  );
  try {
    const rollbackResponse = await createProduction(rollbackProductionTopicId, 'approved');
    assert.equal(rollbackResponse.status, 500);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [rollbackProductionTopicId]))?.status, 'approved');
    assert.equal(await queryOne('SELECT id FROM production WHERE topic_id=?', [rollbackProductionTopicId]), null);
    assert.equal(Number((await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='status_production'`,
      [rollbackProductionTopicId],
    ))?.count || 0), 0, 'failed child record creation must rollback the topic stage history');
  } finally {
    await execute(`DROP TRIGGER IF EXISTS ${blockApprovedProduction}`);
  }

  const topicApproval = await createApprovalFixture('pending', 'approved', '审批通过后准备创作稿');
  assert.equal((await postWorkflowApproval(topicApproval.topicId, topicApproval.nodeId)).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicApproval.topicId]))?.status, 'approved');
  assert.deepEqual(
    await queryOne<{ status: string; content: string }>('SELECT status,content FROM production WHERE topic_id=?', [topicApproval.topicId]),
    { status: 'draft', content: '选题大纲' },
  );
  assert.equal(
    (await queryOne<{ source_content_snapshot: string }>(
      'SELECT source_content_snapshot FROM production_origin_snapshots WHERE production_id=(SELECT id FROM production WHERE topic_id=?)',
      [topicApproval.topicId],
    ))?.source_content_snapshot,
    '选题大纲',
    'workflow approval preserves the exact outline used to create the initial manuscript',
  );
  const topicApprovalHistory = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='approved'`,
    [topicApproval.topicId],
  );
  assert.equal(topicApprovalHistory?.operator_id, director.id);
  assert.match(topicApprovalHistory?.comment || '', /pending到approved.*已通过/);

  const invalidJumpApproval = await createApprovalFixture('pending', 'shooting', '审批状态机拒绝越级');
  const invalidJumpResponse = await postWorkflowApproval(invalidJumpApproval.topicId, invalidJumpApproval.nodeId);
  assert.equal(invalidJumpResponse.status, 400, 'custom approval cannot bypass the shared Topic transition matrix');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [invalidJumpApproval.topicId]))?.status, 'pending');
  assert.equal(await queryOne('SELECT id FROM shooting WHERE topic_id=?', [invalidJumpApproval.topicId]), null);
  assert.equal(await queryOne('SELECT id FROM approval_records WHERE topic_id=?', [invalidJumpApproval.topicId]), null);

  const unknownTargetApproval = await createApprovalFixture('pending', 'archived', '审批状态机拒绝未知状态');
  const unknownTargetResponse = await postWorkflowApproval(unknownTargetApproval.topicId, unknownTargetApproval.nodeId);
  assert.equal(unknownTargetResponse.status, 400, 'unknown Topic stages cannot be persisted through custom approval');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [unknownTargetApproval.topicId]))?.status, 'pending');
  assert.equal(await queryOne('SELECT id FROM approval_records WHERE topic_id=?', [unknownTargetApproval.topicId]), null);

  const productionApproval = await createApprovalFixture('approved', 'production', '审批创建创作稿');
  const unassignedApproval = await postWorkflowApproval(productionApproval.topicId, productionApproval.nodeId, memberId);
  assert.equal(unassignedApproval.status, 403);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [productionApproval.topicId]))?.status, 'approved');
  assert.equal(await queryOne('SELECT id FROM production WHERE topic_id=?', [productionApproval.topicId]), null);

  const productionApprovalResponse = await postWorkflowApproval(productionApproval.topicId, productionApproval.nodeId);
  assert.equal(productionApprovalResponse.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [productionApproval.topicId]))?.status, 'production');
  assert.deepEqual(
    await queryOne<{ version: string; content: string; content_markdown: string; content_json: string; status: string; operator_id: number }>(
      'SELECT version,content,content_markdown,content_json,status,operator_id FROM production WHERE topic_id=?',
      [productionApproval.topicId],
    ),
    { version: 'v1.0', content: '选题大纲', content_markdown: 'Markdown 大纲', content_json: '{"outline":"json"}', status: 'draft', operator_id: director.id },
  );
  assert.equal(
    (await queryOne<{ source_content_snapshot: string }>(
      'SELECT source_content_snapshot FROM production_origin_snapshots WHERE production_id=(SELECT id FROM production WHERE topic_id=?)',
      [productionApproval.topicId],
    ))?.source_content_snapshot,
    '选题大纲',
    'stage creation stores the canonical outline snapshot, not transitional markdown/json mirrors',
  );
  const productionStageHistory = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='status_production'`,
    [productionApproval.topicId],
  );
  assert.equal(productionStageHistory?.action, 'status_production');
  assert.match(productionStageHistory?.comment || '', /审批流节点.*流转为.*创作中/);
  assert.equal(productionStageHistory?.operator_id, director.id);
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM activity_log WHERE target='topic' AND detail LIKE ?`, ['%审批创建创作稿%']))?.count,
    1,
  );

  const existingDraftTopicId = await executeInsert(
    `INSERT INTO topics(title,description,outline,platform,creator_id,assignee_id,status,workflow_template_id)
     VALUES(?,?,?,?,?,?,?,?)`,
    ['审批保留既有草稿', '', '新大纲', 'douyin', director.id, director.id, 'approved', productionApproval.workflowTemplateId],
  );
  const existingDraftId = await executeInsert(
    'INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)',
    [existingDraftTopicId, 'v1.0', '既有草稿内容', 'draft', director.id],
  );
  assert.equal((await postWorkflowApproval(existingDraftTopicId, productionApproval.nodeId)).status, 200);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM production WHERE topic_id=?', [existingDraftTopicId]))?.count, 1);
  assert.equal((await queryOne<{ content: string }>('SELECT content FROM production WHERE id=?', [existingDraftId]))?.content, '既有草稿内容');

  const shootingApproval = await createApprovalFixture('production', 'shooting', '审批创建成片记录');
  assert.equal((await postWorkflowApproval(shootingApproval.topicId, shootingApproval.nodeId)).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [shootingApproval.topicId]))?.status, 'shooting');
  assert.deepEqual(
    await queryOne<{ status: string; operator_id: number }>('SELECT status,operator_id FROM shooting WHERE topic_id=?', [shootingApproval.topicId]),
    { status: 'planned', operator_id: director.id },
  );

  const publishingApproval = await createApprovalFixture('shooting', 'publishing', '审批创建发布记录');
  assert.equal((await postWorkflowApproval(publishingApproval.topicId, publishingApproval.nodeId)).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [publishingApproval.topicId]))?.status, 'publishing');
  assert.deepEqual(
    await queryOne<{ platform: string; status: string; operator_id: number }>('SELECT platform,status,operator_id FROM publishing WHERE topic_id=?', [publishingApproval.topicId]),
    { platform: '', status: 'pending', operator_id: director.id },
  );

  const blockedCompletion = await createApprovalFixture('publishing', 'completed', '审批未处理发布记录');
  await execute('INSERT INTO publishing(topic_id,platform,status,operator_id) VALUES(?,?,?,?)', [blockedCompletion.topicId, '抖音', 'pending', director.id]);
  const blockedCompletionResponse = await postWorkflowApproval(blockedCompletion.topicId, blockedCompletion.nodeId);
  assert.equal(blockedCompletionResponse.status, 409);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [blockedCompletion.topicId]))?.status, 'publishing');
  assert.equal(await queryOne('SELECT id FROM approval_records WHERE topic_id=?', [blockedCompletion.topicId]), null);

  const failedCompletion = await createApprovalFixture('publishing', 'completed', '审批确认发布异常处理完');
  await execute('INSERT INTO publishing(topic_id,platform,status,operator_id) VALUES(?,?,?,?)', [failedCompletion.topicId, '抖音', 'failed', director.id]);
  assert.equal((await postWorkflowApproval(failedCompletion.topicId, failedCompletion.nodeId)).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [failedCompletion.topicId]))?.status, 'completed');
  assert.match(
    (await queryOne<{ comment: string }>(`SELECT comment FROM topic_history WHERE topic_id=? AND action='status_completed'`, [failedCompletion.topicId]))?.comment || '',
    /发布异常计作已处理/,
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM approval_records WHERE topic_id=?', [failedCompletion.topicId]))?.count, 1);

  const denied = await fetch(`${base}/shooting`, { method: 'POST', headers: headers(memberId), body: JSON.stringify({ topic_id: topicId }) });
  assert.equal(denied.status, 403);

  const shootingCreated = await fetch(`${base}/shooting`, { method: 'POST', headers: headers(director.id), body: JSON.stringify({ topic_id: topicId, plan_date: '2026-09-23', location: '演播室' }) });
  const shootingPayload = await shootingCreated.json() as { shootingId?: number; message?: string };
  assert.equal(shootingCreated.status, 200, JSON.stringify(shootingPayload));
  const shootingId = Number(shootingPayload.shootingId);
  const persistedShooting = await queryOne<{ id: number }>('SELECT id FROM shooting WHERE topic_id = ?', [topicId]);
  assert(persistedShooting);
  const deniedShootingStatusChange = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(memberId),
    body: JSON.stringify({ status: 'in_progress' }),
  });
  assert.equal(deniedShootingStatusChange.status, 403);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [persistedShooting.id]))?.status, 'planned');
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='shooting_status_changed'`, [topicId]))?.count,
    0,
  );
  await execute(`CREATE TRIGGER block_shooting_audit_test BEFORE INSERT ON activity_log
    WHEN NEW.target='shooting' BEGIN SELECT RAISE(ABORT, 'simulated shooting audit failure'); END`);
  const failedShootingAudit = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'in_progress' }),
  });
  assert.equal(failedShootingAudit.status, 500);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [persistedShooting.id]))?.status, 'planned');
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='shooting_status_changed'`, [topicId]))?.count,
    0,
  );
  await execute('DROP TRIGGER block_shooting_audit_test');
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'in_progress' }),
  })).status, 200);
  const shootingStatusAudit = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='shooting_status_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(shootingStatusAudit?.action, 'shooting_status_changed');
  assert.match(shootingStatusAudit?.comment || '', /成片记录 #\d+ 状态由「计划中」更正为「制作中」/);
  assert.equal(shootingStatusAudit?.operator_id, director.id);
  const shootingActivityAudit = await queryOne<{ target: string; detail: string; user_id: number }>(
    `SELECT target,detail,user_id FROM activity_log WHERE target='shooting' AND user_id=? AND detail LIKE ? ORDER BY id DESC LIMIT 1`,
    [director.id, `%成片记录 #${persistedShooting.id} 状态由「计划中」更正为「制作中」%`],
  );
  assert.equal(shootingActivityAudit?.target, 'shooting');
  assert.equal(shootingActivityAudit?.user_id, director.id);
  assert.match(shootingActivityAudit?.detail || '', /计划中.*更正为.*制作中/);
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'in_progress', location: '已更新拍摄地点' }),
  })).status, 200);
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='shooting_status_changed'`, [topicId]))?.count,
    1,
  );
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, { method: 'PUT', headers: headers(director.id), body: JSON.stringify({ status: 'completed', script_content: '定稿' }) })).status, 200);
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='shooting_status_changed'`, [topicId]))?.count,
    2,
  );

  const autoPublishing = await queryOne<{ id: number }>('SELECT id FROM publishing WHERE topic_id = ?', [topicId]);
  assert(autoPublishing);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'publishing');
  const secondPlatformPublishingId = await executeInsert(
    'INSERT INTO publishing(topic_id,platform,status,operator_id) VALUES(?,?,?,?)',
    [topicId, '小红书', 'pending', director.id],
  );
  assert.equal((await fetch(`${base}/publishing/${autoPublishing.id}`, { method: 'PUT', headers: headers(director.id), body: JSON.stringify({ platform: 'douyin', publish_time: '2026-09-23 12:00:00', status: 'scheduled' }) })).status, 200);
  const scheduledStatusAudit = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_status_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(scheduledStatusAudit?.action, 'publishing_status_changed');
  assert.match(scheduledStatusAudit?.comment || '', /待发布.*更正为.*已定时/);
  assert.equal(scheduledStatusAudit?.operator_id, director.id);
  const scheduledActivityAudit = await queryOne<{ target: string; detail: string; user_id: number }>(
    `SELECT target,detail,user_id FROM activity_log WHERE target='publishing' AND user_id=? AND detail LIKE ? ORDER BY id DESC LIMIT 1`,
    [director.id, `%发布记录 #${autoPublishing.id} 状态由「待发布」更正为「已定时」%`],
  );
  assert.equal(scheduledActivityAudit?.target, 'publishing');
  assert.equal(scheduledActivityAudit?.user_id, director.id);
  assert.match(scheduledActivityAudit?.detail || '', /待发布.*更正为.*已定时/);

  await execute(`UPDATE publishing SET script_content='发布侧定稿' WHERE id=?`, [autoPublishing.id]);
  const repeatedShootingCompletion = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'completed', script_content: '后来修改的成片稿' }),
  });
  assert.equal(repeatedShootingCompletion.status, 200);
  assert.equal(
    (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='shooting_status_changed'`, [topicId]))?.count,
    2,
  );
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'publishing');
  assert.equal(
    await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='status_publishing'`, [topicId]).then((row) => row?.count),
    1,
  );
  assert.deepEqual(
    await queryOne<{ status: string; script_content: string }>('SELECT status,script_content FROM publishing WHERE id=?', [autoPublishing.id]),
    { status: 'scheduled', script_content: '发布侧定稿' },
  );

  const completedShootingRegression = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'in_progress' }),
  });
  assert.equal(completedShootingRegression.status, 409);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [persistedShooting.id]))?.status, 'completed');

  const invalidShootingUpdate = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'paused' }),
  });
  assert.equal(invalidShootingUpdate.status, 400);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [persistedShooting.id]))?.status, 'completed');

  const invalidShootingCreate = await fetch(`${base}/shooting`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: topicId, status: 'paused' }),
  });
  assert.equal(invalidShootingCreate.status, 400);
  assert.equal(await queryOne('SELECT id FROM shooting WHERE topic_id=? AND status=?', [topicId, 'paused']), null);

  const reassignmentTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['完成记录重挂目标', '', 'douyin', director.id, director.id, 'shooting'],
  );
  const completedShootingReassignment = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: reassignmentTopicId }),
  });
  assert.equal(completedShootingReassignment.status, 409);
  assert.equal((await queryOne<{ topic_id: number }>('SELECT topic_id FROM shooting WHERE id=?', [persistedShooting.id]))?.topic_id, topicId);
  assert.equal(await queryOne('SELECT id FROM shooting WHERE topic_id=?', [reassignmentTopicId]), null);

  const completedShootingContentEdit = await fetch(`${base}/shooting/${persistedShooting.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ script_content: '完成后仍可修正文案' }),
  });
  assert.equal(completedShootingContentEdit.status, 200);
  assert.equal((await queryOne<{ script_content: string }>('SELECT script_content FROM shooting WHERE id=?', [persistedShooting.id]))?.script_content, '完成后仍可修正文案');

  await execute(`UPDATE topics SET status='shooting' WHERE id=?`, [topicId]);
  const skippedPublishing = await fetch(`${base}/publishing/${autoPublishing.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'published' }),
  });
  assert.equal(skippedPublishing.status, 409);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM publishing WHERE id=?', [autoPublishing.id]))?.status, 'scheduled');

  await execute(`UPDATE topics SET status='publishing' WHERE id=?`, [topicId]);
  const published = await fetch(`${base}/publishing/${autoPublishing.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'published' }),
  });
  assert.equal(published.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'completed');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM publishing WHERE id=?', [secondPlatformPublishingId]))?.status, 'pending');
  assert.equal(
    await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='status_completed'`, [topicId]).then((row) => row?.count),
    1,
  );
  const archiveBeforeCorrection = await queryOne<{ id: number; content: string }>(
    `SELECT id,content FROM resources WHERE category='已完成' AND file_path=?`,
    [`archive/topic-${topicId}`],
  );
  assert(archiveBeforeCorrection, 'a published record should create the topic archive snapshot');
  const archiveSnapshot = JSON.parse(archiveBeforeCorrection.content) as {
    publishing?: { status?: string };
    archived_at?: string;
  };
  assert.equal(archiveSnapshot.publishing?.status, 'published');
  assert.ok(archiveSnapshot.archived_at);

  const correctedAfterPublish = await fetch(`${base}/publishing/${autoPublishing.id}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'scheduled' }),
  });
  assert.equal(correctedAfterPublish.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM publishing WHERE id=?', [autoPublishing.id]))?.status, 'scheduled');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'completed');
  assert.deepEqual(
    await queryOne<{ id: number; content: string }>(
      `SELECT id,content FROM resources WHERE category='已完成' AND file_path=?`,
      [`archive/topic-${topicId}`],
    ),
    archiveBeforeCorrection,
    'correcting the current publishing status should preserve its prior archive snapshot',
  );
  const publishedCorrectionAudit = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_status_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(publishedCorrectionAudit?.action, 'publishing_status_changed');
  assert.match(publishedCorrectionAudit?.comment || '', /已发布.*更正为.*已定时/);
  assert.equal(publishedCorrectionAudit?.operator_id, director.id);

  const failedPlatformsTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['多平台异常完成', '', 'douyin', director.id, director.id, 'publishing'],
  );
  const failedPlatformIds = await Promise.all([
    executeInsert('INSERT INTO publishing(topic_id,platform,status,operator_id) VALUES(?,?,?,?)', [failedPlatformsTopicId, '平台甲', 'failed', director.id]),
    executeInsert('INSERT INTO publishing(topic_id,platform,status,operator_id) VALUES(?,?,?,?)', [failedPlatformsTopicId, '平台乙', 'scheduled', director.id]),
  ]);
  const unresolvedFailure = await fetch(`${base}/publishing/${failedPlatformIds[0]}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'failed' }),
  });
  assert.equal(unresolvedFailure.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [failedPlatformsTopicId]))?.status, 'publishing');
  const finishFirstFailure = await fetch(`${base}/publishing/${failedPlatformIds[1]}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ status: 'failed' }),
  });
  assert.equal(finishFirstFailure.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [failedPlatformsTopicId]))?.status, 'completed');
  const failedCompletionHistory = await queryOne<{ comment: string; operator_id: number }>(
    `SELECT comment,operator_id FROM topic_history WHERE topic_id=? AND action='status_completed' ORDER BY id DESC LIMIT 1`,
    [failedPlatformsTopicId],
  );
  assert.match(failedCompletionHistory?.comment || '', /所有发布任务均已处理.*发布异常计作已处理/);
  assert.equal(failedCompletionHistory?.operator_id, director.id);
  assert.equal(await queryOne('SELECT id FROM resources WHERE category=? AND file_path=?', ['已完成', `archive/topic-${failedPlatformsTopicId}`]), null);

  const failedOnCreateTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['新增时发布异常', '', 'douyin', director.id, director.id, 'publishing'],
  );
  const failedOnCreate = await fetch(`${base}/publishing`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: failedOnCreateTopicId, platform: '视频号', status: 'failed', publish_time: '2026-09-30' }),
  });
  assert.equal(failedOnCreate.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [failedOnCreateTopicId]))?.status, 'completed');
  assert.match(
    (await queryOne<{ comment: string }>(`SELECT comment FROM topic_history WHERE topic_id=? AND action='status_completed'`, [failedOnCreateTopicId]))?.comment || '',
    /发布异常计作已处理/,
  );

  const skippedPublishCreateTopic = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['越级发布', '', 'douyin', director.id, director.id, 'production'],
  );
  const skippedShootingCreate = await fetch(`${base}/shooting`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: skippedPublishCreateTopic, status: 'completed' }),
  });
  assert.equal(skippedShootingCreate.status, 409);
  assert.equal(await queryOne('SELECT id FROM shooting WHERE topic_id=?', [skippedPublishCreateTopic]), null);

  const skippedPublishCreate = await fetch(`${base}/publishing`, {
    method: 'POST',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: skippedPublishCreateTopic, status: 'published', publish_time: '2026-09-23' }),
  });
  assert.equal(skippedPublishCreate.status, 409);
  assert.equal(await queryOne('SELECT id FROM publishing WHERE topic_id=?', [skippedPublishCreateTopic]), null);

  const approvalTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,?)`,
    ['创作审批交接', '', 'douyin', director.id, director.id, 'production'],
  );
  const productionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)`,
    [approvalTopicId, 'v1.0', '审批稿', 'draft', director.id],
  );
  const completedShootingId = await executeInsert(
    `INSERT INTO shooting(topic_id,status,operator_id) VALUES(?,?,?)`,
    [approvalTopicId, 'completed', director.id],
  );
  const approveProduction = await fetch(`${base}/production/${productionId}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: approvalTopicId, version: 'v1.0', content: '审批稿', status: 'approved', version_action: 'none' }),
  });
  assert.equal(approveProduction.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [approvalTopicId]))?.status, 'shooting');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [completedShootingId]))?.status, 'completed');

  await execute(`UPDATE topics SET status='publishing' WHERE id=?`, [approvalTopicId]);
  const repeatedProductionSave = await fetch(`${base}/production/${productionId}`, {
    method: 'PUT',
    headers: headers(director.id),
    body: JSON.stringify({ topic_id: approvalTopicId, version: 'v1.0', content: '审批稿续写', status: 'approved', version_action: 'none' }),
  });
  assert.equal(repeatedProductionSave.status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [approvalTopicId]))?.status, 'publishing');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM shooting WHERE id=?', [completedShootingId]))?.status, 'completed');

  assert.equal((await fetch(`${base}/publishing/${autoPublishing.id}`, { method: 'DELETE', headers: headers(director.id) })).status, 200);
  assert.equal((await fetch(`${base}/shooting/${persistedShooting.id}`, { method: 'DELETE', headers: headers(director.id) })).status, 200);
  assert.equal(shootingId === 0 || Number.isSafeInteger(shootingId), true);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('Workflow shooting and publishing CRUD tests passed');
