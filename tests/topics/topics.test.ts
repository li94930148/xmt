import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topics-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'topics.test.db');
process.env.JWT_SECRET = 'topics-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { SqliteTopicRepository } = await import('../../api/modules/topics/topics.sqlite-repository.js');
const { TopicService } = await import('../../api/modules/topics/topics.service.js');
const { TopicServiceError } = await import('../../api/modules/topics/topics.types.js');
const { createLegacyTopicsRouter, createV1TopicsRouter } = await import('../../api/modules/topics/topics.routes.js');
const { TopicController } = await import('../../api/modules/topics/topics.controller.js');
const { currentTopicPolicy } = await import('../../api/modules/topics/topics.policy.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { requestId } = await import('../../api/middleware/request-id.js');

await initDatabase();

const repository = new SqliteTopicRepository();
const testUserId = await executeInsert(
  `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ['topic-test-user', 'unused', 'topic-test@example.invalid', 'admin', 'Topic Test', 1, 0],
);
await execute('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [testUserId, 'admin']);

async function withTopicDetailUnavailable<T>(work: () => Promise<T>) {
  await execute('ALTER TABLE users RENAME TO users_unavailable_for_topic_readback');
  try {
    return await work();
  } finally {
    await execute('ALTER TABLE users_unavailable_for_topic_readback RENAME TO users');
  }
}

async function repositoryTests() {
  const topicId = await repository.withTransaction((tx) => tx.createTopic({
    title: 'Repository 创建',
    description: '初始描述',
    outline: null,
    outlineMarkdown: null,
    outlineJson: null,
    platform: 'douyin',
    deadline: '2026-08-01',
    creatorId: testUserId,
    assigneeId: null,
  }));
  const created = await repository.findById(topicId);
  assert.equal(created?.title, 'Repository 创建');
  assert.equal(created?.status, 'pending');
  assert.ok(typeof created?.stage_entered_at === 'string' && created.stage_entered_at.length > 0, 'new topics record their first stage entry time');

  const page = await repository.list({ page: 1, limit: 10, actorId: testUserId, viewAll: true, search: 'Repository' });
  assert.equal(page.total, 1);
  assert.equal(page.topics[0]?.id, topicId);

  await repository.updateTopic(topicId, { title: 'Repository 更新' });
  const afterContentUpdate = await repository.findById(topicId);
  assert.equal(afterContentUpdate?.title, 'Repository 更新');
  assert.equal(afterContentUpdate?.stage_entered_at, created?.stage_entered_at, 'ordinary content edits do not reset stage duration');
  await execute('UPDATE topics SET stage_entered_at = ? WHERE id = ?', ['2000-01-01 00:00:00', topicId]);
  const beforeStageTransition = await repository.findById(topicId);
  assert.equal(await repository.withTransaction((tx) => tx.updateTopicIfStatus(topicId, 'pending', { status: 'production' })), true);
  const afterStageTransition = await repository.findById(topicId);
  assert.ok(afterStageTransition?.stage_entered_at && afterStageTransition.stage_entered_at !== beforeStageTransition?.stage_entered_at, 'a successful status transition records a new stage entry time');
  assert.equal(await repository.withTransaction((tx) => tx.updateTopicIfStatus(topicId, 'pending', { status: 'shooting' })), false);
  assert.equal((await repository.findById(topicId))?.stage_entered_at, afterStageTransition?.stage_entered_at, 'a stale transition cannot change the recorded stage entry time');
  await execute('INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)', [topicId, 'created', '保留事务历史', testUserId]);
  await execute(`CREATE TRIGGER block_topic_delete BEFORE DELETE ON topics BEGIN SELECT RAISE(ABORT, 'blocked'); END`);
  await assert.rejects(() => repository.deleteTopic(topicId));
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topic_history WHERE topic_id = ?', [topicId]))?.count, 1);
  await execute('DROP TRIGGER block_topic_delete');
  await repository.deleteTopic(topicId);
  assert.equal(await repository.findById(topicId), null);

  const feedbackTopicId = await executeInsert(
    `INSERT INTO topics (title, description, creator_id, status) VALUES (?, ?, ?, ?)`,
    ['详情读回故障时保持原值', '', testUserId, 'pending'],
  );
  const updateBroadcasts: Array<{ event: string; data: unknown }> = [];
  const updateService = new TopicService({
    repository,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: (_room, event, data) => updateBroadcasts.push({ event, data }),
  });

  await withTopicDetailUnavailable(() => assert.rejects(() => updateService.updateTopic(
      { id: testUserId, role: 'admin' },
      feedbackTopicId,
      { title: '不应部分保存' },
    )));
  assert.equal((await repository.findById(feedbackTopicId))?.title, '详情读回故障时保持原值', 'failed in-transaction readback rolls back the update');

  await updateService.updateTopic({ id: testUserId, role: 'admin' }, feedbackTopicId, { title: '恢复后保存成功' });
  assert.equal((await repository.findById(feedbackTopicId))?.title, '恢复后保存成功');
  assert.equal(updateBroadcasts.length, 1, 'broadcast happens only after the committed retry');
  assert.equal(updateBroadcasts[0]?.event, 'topic:updated');
  assert.equal((updateBroadcasts[0]?.data as { title: string }).title, '恢复后保存成功');

  const beforeCreateCount = await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM topics');
  await withTopicDetailUnavailable(() => assert.rejects(() => updateService.createTopic(
    { id: testUserId, role: 'admin' },
    { title: '详情读回失败的创建', description: '', platform: '', deadline: '' },
  )));
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM topics'))?.total, beforeCreateCount?.total, 'failed create readback rolls back the topic and its audit rows');

  const auditTopicId = await executeInsert(
    `INSERT INTO topics (title, description, creator_id, status) VALUES (?, ?, ?, ?)`,
    ['审核详情读回故障', '', testUserId, 'pending'],
  );
  await withTopicDetailUnavailable(() => assert.rejects(() => updateService.auditTopic(
    { id: testUserId, role: 'admin' },
    auditTopicId,
    { status: 'approved', comment: '临时读回故障' },
  )));
  assert.equal((await repository.findById(auditTopicId))?.status, 'pending', 'failed audit readback rolls back the status');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM production WHERE topic_id = ?', [auditTopicId]))?.total, 0, 'failed audit readback also rolls back its initial production record');

  const repairTopicId = await executeInsert(
    `INSERT INTO topics (title, description, creator_id, status) VALUES (?, ?, ?, ?)`,
    ['补建详情读回故障', '', testUserId, 'production'],
  );
  const historyBeforeRepair = await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM topic_history WHERE topic_id = ?', [repairTopicId]);
  await withTopicDetailUnavailable(() => assert.rejects(() => updateService.repairCurrentStageRecord(
    { id: testUserId, role: 'admin' },
    repairTopicId,
  )));
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM production WHERE topic_id = ?', [repairTopicId]))?.total, 0, 'failed repair readback rolls back the new stage record');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM topic_history WHERE topic_id = ?', [repairTopicId]))?.total, historyBeforeRepair?.total, 'failed repair readback rolls back its history row');

  await repository.deleteTopic(feedbackTopicId);
  await repository.deleteTopic(auditTopicId);
  await repository.deleteTopic(repairTopicId);
}
type FakeTopic = {
  id: number;
  title: string;
  status: 'pending' | 'approved';
  creator_id: number | null;
  assignee_id: number | null;
  outline: null;
  outline_markdown: null;
  outline_json: null;
};

function fakeRepository(topic: FakeTopic | null = null) {
  let nextId = 10;
  return {
    list: async () => ({ topics: topic ? [topic] : [], total: topic ? 1 : 0, page: 1, limit: 10 }),
    findById: async () => topic,
    findDetailById: async () => topic,
    findHistory: async () => [],
    findDirectorIds: async () => [],
    findParticipantIds: async () => [],
    withTransaction: async <T>(work: (tx: Record<string, (...args: never[]) => Promise<unknown>>) => Promise<T>) => work({
      createTopic: async () => nextId++,
      findDetailById: async (id) => topic ?? {
        id: Number(id), title: 'Service 创建', status: 'pending', creator_id: testUserId, assignee_id: null,
        has_production_record: 0, has_shooting_record: 0, has_publishing_record: 0,
      },
      findHistory: async () => [],
      updateTopic: async () => undefined,
      updateTopicIfStatus: async () => true,
      addHistory: async () => undefined,
      addActivity: async () => undefined,
      productionExists: async () => false,
      createInitialProduction: async () => undefined,
      shootingExists: async () => false,
      createInitialShooting: async () => undefined,
      publishingExists: async () => false,
      publishingStatuses: async () => [],
      advancePublishingTopic: async () => null,
      createInitialPublishing: async () => undefined,
    }),
    updateTopic: async () => undefined,
    deleteTopic: async () => undefined,
  };
}

async function expectServiceError(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error) => error instanceof TopicServiceError && error.code === code);
}

async function serviceTests() {
  const notifications: unknown[] = [];
  const service = new TopicService({
    repository: fakeRepository() as never,
    policy: currentTopicPolicy,
    notify: (message) => notifications.push(message),
    broadcast: () => undefined,
  });
  assert.deepEqual(await service.createTopic(
    { id: testUserId, role: 'admin' },
    { title: 'Service 创建', description: '', platform: '', deadline: '' },
  ), { topicId: 10 });
  assert.equal(notifications.length, 1);

  await expectServiceError(
    () => service.getTopic({ id: testUserId, role: 'admin' }, 404),
    'TOPIC_NOT_FOUND',
  );

  const ownedByOther: FakeTopic = {
    id: 20, title: '无权限', status: 'pending', creator_id: 999, assignee_id: null,
    outline: null, outline_markdown: null, outline_json: null,
  };
  const forbiddenService = new TopicService({
    repository: fakeRepository(ownedByOther) as never,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await expectServiceError(
    () => forbiddenService.updateTopic({ id: testUserId, role: 'director' }, 20, { title: '不能编辑' }),
    'TOPIC_FORBIDDEN',
  );

  const approved = { ...ownedByOther, status: 'approved' as const };
  const invalidStateService = new TopicService({
    repository: fakeRepository(approved) as never,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await expectServiceError(
    () => invalidStateService.auditTopic({ id: testUserId, role: 'admin' }, 20, { status: 'approved', comment: '' }),
    'TOPIC_INVALID_TRANSITION',
  );

  const pendingStateService = new TopicService({
    repository: fakeRepository({ ...ownedByOther, creator_id: testUserId }) as never,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await expectServiceError(
    () => pendingStateService.transitionTopic({ id: testUserId, role: 'admin' }, 20, { status: 'approved' }),
    'TOPIC_INVALID_TRANSITION',
  );
}

async function apiTests() {
  const topicId = await executeInsert(
    `INSERT INTO topics (title, description, platform, creator_id, status)
     VALUES (?, ?, ?, ?, ?)`,
    ['API 契约', 'legacy/v1', 'douyin', testUserId, 'pending'],
  );
  const notifications: Array<{ userId: number; title: string; content: string; link: string }> = [];
  const broadcasts: Array<{ room: string; event: string; data: unknown }> = [];
  const service = new TopicService({
    repository,
    policy: currentTopicPolicy,
    notify: (message) => notifications.push(message),
    broadcast: (room, event, data) => broadcasts.push({ room, event, data }),
  });
  const controller = new TopicController(service);
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/topics', createLegacyTopicsRouter(controller));
  app.use('/api/v1/topics', createV1TopicsRouter(controller));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const headers = { authorization: `Bearer ${signToken({ userId: testUserId })}` };
  const transition = (id: number, status: string) => fetch(`http://127.0.0.1:${address.port}/api/topics/${id}/status`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const repair = (id: number, route = '/api/topics', authorization = headers.authorization) => fetch(`http://127.0.0.1:${address.port}${route}/${id}/repair-stage-record`, {
    method: 'POST',
    headers: { authorization: authorization || '', 'content-type': 'application/json' },
  });
  const createMissingStageTopic = (title: string, status: string) => executeInsert(
    `INSERT INTO topics (title, description, platform, creator_id, assignee_id, status, outline)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, '', 'douyin', testUserId, testUserId, status, '阶段记录测试大纲'],
  );

  try {
    const legacyResponse = await fetch(`http://127.0.0.1:${address.port}/api/topics?search=API%20契约`, { headers });
    assert.equal(legacyResponse.status, 200);
    const legacy = await legacyResponse.json() as Record<string, unknown>;
    assert.equal(legacy.success, true);
    assert.ok(Array.isArray(legacy.data));
    assert.deepEqual(legacy.pagination, { page: 1, limit: 10, total: 1 });

    const v1Response = await fetch(`http://127.0.0.1:${address.port}/api/v1/topics?search=API%20契约`, { headers });
    assert.equal(v1Response.status, 200);
    const v1 = await v1Response.json() as Record<string, unknown>;
    assert.equal(v1.success, true);
    assert.deepEqual(v1.data, legacy.data);
    assert.deepEqual(v1.meta, { ...legacy.pagination as object, requestId: (v1.meta as { requestId: string }).requestId });
    assert.equal(typeof (v1.meta as { requestId: string }).requestId, 'string');

    const outsiderId = await executeInsert(
      `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['topic-repair-outsider', 'unused', 'topic-repair-outsider@example.invalid', 'member', '无归属成员', 1, 0],
    );
    await execute('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [outsiderId, 'member']);
    const outsiderHeaders = `Bearer ${signToken({ userId: outsiderId })}`;

    const productionRepairTopicId = await createMissingStageTopic('缺失创作稿记录', 'production');
    const beforeRepairResponse = await fetch(`http://127.0.0.1:${address.port}/api/topics/${productionRepairTopicId}`, { headers });
    assert.equal(beforeRepairResponse.status, 200);
    const beforeRepair = await beforeRepairResponse.json() as { data: { status: string; stage_record_presence: Record<string, boolean> } };
    assert.equal(beforeRepair.data.status, 'production');
    assert.deepEqual(beforeRepair.data.stage_record_presence, { production: false, shooting: false, publishing: false });

    const forbiddenRepair = await repair(productionRepairTopicId, '/api/topics', outsiderHeaders);
    assert.equal(forbiddenRepair.status, 403, 'must retain the topic ownership edit policy');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id = ?', [productionRepairTopicId]))?.total), 0);

    const repairedProduction = await repair(productionRepairTopicId);
    assert.equal(repairedProduction.status, 200);
    assert.deepEqual((await repairedProduction.json() as { data: { stage: string; created: boolean } }).data, { stage: 'production', created: true });
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [productionRepairTopicId]))?.status, 'production', 'repair must not change the topic stage');
    const productionDraft = await queryOne<{ content: string; content_markdown: string; content_json: string }>(
      'SELECT content, content_markdown, content_json FROM production WHERE topic_id = ?', [productionRepairTopicId],
    );
    assert.deepEqual(productionDraft, {
      content: '阶段记录测试大纲', content_markdown: '阶段记录测试大纲', content_json: '阶段记录测试大纲',
    });
    assert.equal(Number((await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='stage_record_repaired'", [productionRepairTopicId]))?.total), 1);
    assert.equal(Number((await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM activity_log WHERE target='topic' AND action='stage_record_repaired' AND detail LIKE ?", ['%缺失创作稿记录%']))?.total), 1);
    const repeatedRepair = await repair(productionRepairTopicId);
    assert.deepEqual((await repeatedRepair.json() as { data: { stage: string; created: boolean } }).data, { stage: 'production', created: false });
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id = ?', [productionRepairTopicId]))?.total), 1, 'repair must be idempotent');
    const afterRepairResponse = await fetch(`http://127.0.0.1:${address.port}/api/topics/${productionRepairTopicId}`, { headers });
    const afterRepair = await afterRepairResponse.json() as { data: { stage_record_presence: Record<string, boolean> } };
    assert.equal(afterRepair.data.stage_record_presence.production, true);

    const missingProductionSourceId = await createMissingStageTopic('缺少创作稿禁止推进', 'production');
    const blockedProductionAdvance = await transition(missingProductionSourceId, 'shooting');
    assert.equal(blockedProductionAdvance.status, 400);
    assert.match((await blockedProductionAdvance.json() as { error?: string }).error ?? '', /缺少创作稿记录，请先补齐后再推进/);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [missingProductionSourceId]))?.status, 'production');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM shooting WHERE topic_id = ?', [missingProductionSourceId]))?.total), 0);
    assert.equal(Number((await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM topic_history WHERE topic_id = ? AND action = 'status_shooting'", [missingProductionSourceId]))?.total), 0);
    assert.equal((await repair(missingProductionSourceId)).status, 200);
    assert.equal((await transition(missingProductionSourceId, 'shooting')).status, 200, 'repairing the current record allows the requested transition to be retried');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM shooting WHERE topic_id = ?', [missingProductionSourceId]))?.total), 1);

    const missingShootingSourceId = await createMissingStageTopic('缺少成片制作记录禁止推进', 'shooting');
    const blockedShootingAdvance = await transition(missingShootingSourceId, 'publishing');
    assert.equal(blockedShootingAdvance.status, 400);
    assert.match((await blockedShootingAdvance.json() as { error?: string }).error ?? '', /缺少成片制作记录，请先补齐后再推进/);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [missingShootingSourceId]))?.status, 'shooting');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id = ?', [missingShootingSourceId]))?.total), 0);
    assert.equal(Number((await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM topic_history WHERE topic_id = ? AND action = 'status_publishing'", [missingShootingSourceId]))?.total), 0);
    assert.equal((await repair(missingShootingSourceId)).status, 200);
    assert.equal((await transition(missingShootingSourceId, 'publishing')).status, 200);
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id = ?', [missingShootingSourceId]))?.total), 1);

    for (const [status, stage, table] of [
      ['shooting', 'shooting', 'shooting'],
      ['publishing', 'publishing', 'publishing'],
    ] as const) {
      const missingStageTopicId = await createMissingStageTopic(`缺失${stage}记录`, status);
      const stageRepair = await repair(missingStageTopicId);
      assert.equal(stageRepair.status, 200);
      assert.deepEqual((await stageRepair.json() as { data: { stage: string; created: boolean } }).data, { stage, created: true });
      assert.equal(Number((await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table} WHERE topic_id = ?`, [missingStageTopicId]))?.total), 1);
      assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [missingStageTopicId]))?.status, status);
    }

    const completedMissingPublishingId = await createMissingStageTopic('已完成但缺发布记录', 'completed');
    const completedRepair = await repair(completedMissingPublishingId, '/api/v1/topics');
    assert.equal(completedRepair.status, 409);
    const completedRepairPayload = await completedRepair.json() as { error?: { code?: string; details?: { domainCode?: string } } };
    assert.equal(completedRepairPayload.error?.code, 'CONFLICT');
    assert.equal(completedRepairPayload.error?.details?.domainCode, 'TOPIC_STAGE_NOT_REPAIRABLE');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id = ?', [completedMissingPublishingId]))?.total), 0, 'completed publishing history must not be fabricated');

    const rollbackRepairId = await createMissingStageTopic('补建事务完整性', 'shooting');
    const blockRepairAudit = `block_repair_audit_${rollbackRepairId}`;
    await execute(
      `CREATE TRIGGER ${blockRepairAudit} BEFORE INSERT ON activity_log
       WHEN NEW.action = 'stage_record_repaired' AND NEW.target = 'topic'
       BEGIN SELECT RAISE(ABORT, 'blocked by isolated regression test'); END`,
    );
    try {
      const failedRepair = await repair(rollbackRepairId);
      assert.equal(failedRepair.status, 500);
      assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM shooting WHERE topic_id = ?', [rollbackRepairId]))?.total), 0);
      assert.equal(Number((await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='stage_record_repaired'", [rollbackRepairId]))?.total), 0);
    } finally {
      await execute(`DROP TRIGGER IF EXISTS ${blockRepairAudit}`);
    }

    const invalidTransition = await transition(topicId, 'production');
    assert.equal(invalidTransition.status, 400);
    assert.equal((await invalidTransition.json() as { error?: string }).error, '待审核选题只能通过审核操作变更状态');
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [topicId]))?.status, 'pending');
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id = ?', [topicId]))?.total), 0);

    const notificationsBeforeAudit = notifications.length;
    const auditResponse = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/audit`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', comment: '请补充拍摄依据' }),
    });
    assert.equal(auditResponse.status, 200);
    const topicAfterAudit = await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [topicId]);
    const history = await queryOne<{ action: string; comment: string }>(
      'SELECT action, comment FROM topic_history WHERE topic_id = ? ORDER BY id DESC LIMIT 1',
      [topicId],
    );
    assert.equal(topicAfterAudit?.status, 'rejected');
    assert.deepEqual(history, { action: 'rejected', comment: '请补充拍摄依据' });
    assert.equal(notifications.length, notificationsBeforeAudit + 1);
    assert.match(notifications.at(-1)?.title ?? '', /驳回/);
    assert.match(notifications.at(-1)?.content ?? '', /请补充拍摄依据/);
    assert.equal(notifications.at(-1)?.link, `/topics/${topicId}`);
    assert.equal(broadcasts.at(-1)?.event, 'topic:audited');
    assert.equal((broadcasts.at(-1)?.data as { status: string }).status, 'rejected');

    const stageTopicId = await executeInsert(
      `INSERT INTO topics (title, description, platform, creator_id, assignee_id, status, outline, outline_markdown, outline_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['阶段推进补建', '', 'douyin', testUserId, testUserId, 'approved', '<p>完整大纲</p>', '完整大纲', '{"type":"doc","content":[]}'],
    );
    assert.equal((await transition(stageTopicId, 'production')).status, 200);
    const initialProduction = await queryOne<{ id: number; content: string; content_markdown: string; content_json: string }>(
      'SELECT id, content, content_markdown, content_json FROM production WHERE topic_id = ?',
      [stageTopicId],
    );
    assert(initialProduction?.id, '缺少创作记录时应补建初始稿件');
    assert.equal(initialProduction.content, '<p>完整大纲</p>');
    assert.equal(initialProduction.content_markdown, '完整大纲');
    assert.equal(initialProduction.content_json, '{"type":"doc","content":[]}');

    assert.equal((await transition(stageTopicId, 'shooting')).status, 200);
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM shooting WHERE topic_id = ?', [stageTopicId]))?.total), 1);
    assert.equal((await transition(stageTopicId, 'publishing')).status, 200);
    assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM publishing WHERE topic_id = ?', [stageTopicId]))?.total), 1);
    const blockedManualCompletion = await transition(stageTopicId, 'completed');
    assert.equal(blockedManualCompletion.status, 400);
    assert.match((await blockedManualCompletion.json() as { error?: string }).error || '', /发布任务待处理/);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [stageTopicId]))?.status, 'publishing');
    await execute('UPDATE publishing SET status = ? WHERE topic_id = ?', ['failed', stageTopicId]);
    assert.equal((await transition(stageTopicId, 'completed')).status, 200);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [stageTopicId]))?.status, 'completed');
    const failedManualCompletion = await queryOne<{ comment: string }>(
      `SELECT comment FROM topic_history WHERE topic_id=? AND action='status_completed' ORDER BY id DESC LIMIT 1`,
      [stageTopicId],
    );
    assert.match(failedManualCompletion?.comment || '', /发布异常计作已处理/);

    const existingStageTopicId = await executeInsert(
      `INSERT INTO topics (title, description, platform, creator_id, assignee_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['复用已有创作记录', '', 'douyin', testUserId, testUserId, 'approved'],
    );
    const existingProductionId = await executeInsert(
      'INSERT INTO production (topic_id, version, content, status, operator_id) VALUES (?, ?, ?, ?, ?)',
      [existingStageTopicId, 'v1.0', '已有正文', 'draft', testUserId],
    );
    assert.equal((await transition(existingStageTopicId, 'production')).status, 200);
    assert.deepEqual(
      await queryOne<{ id: number; content: string }>('SELECT id, content FROM production WHERE topic_id = ?', [existingStageTopicId]),
      { id: existingProductionId, content: '已有正文' },
      '已有创作记录应原样复用，不得重复创建或覆盖正文',
    );

    const failedStageTopicId = await executeInsert(
      `INSERT INTO topics (title, description, platform, creator_id, assignee_id, status, outline)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['阶段推进失败回滚', '', 'douyin', testUserId, testUserId, 'approved', '保留大纲'],
    );
    const triggerName = `block_initial_production_${failedStageTopicId}`;
    await execute(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON production
       WHEN NEW.topic_id = ${failedStageTopicId}
       BEGIN SELECT RAISE(ABORT, 'blocked by isolated regression test'); END`,
    );
    try {
      const failedTransition = await transition(failedStageTopicId, 'production');
      assert.equal(failedTransition.status, 500);
      assert.equal((await failedTransition.json() as { error?: string }).error, '更新状态失败');
      assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id = ?', [failedStageTopicId]))?.status, 'approved');
      assert.equal(Number((await queryOne<{ total: number }>(
        "SELECT COUNT(*) AS total FROM topic_history WHERE topic_id = ? AND action = 'status_production'",
        [failedStageTopicId],
      ))?.total), 0, '补建失败时状态和历史记录应一并回滚');
      assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id = ?', [failedStageTopicId]))?.total), 0);
    } finally {
      await execute(`DROP TRIGGER IF EXISTS ${triggerName}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function staleStatusTests() {
  const actor = { id: testUserId, role: 'admin' as const };
  const makeStaleReadRepository = (topicId: number, commitCompetingChange: () => Promise<void>) => {
    let injected = false;
    const staleReadRepository = Object.create(repository) as typeof repository;
    staleReadRepository.findById = async (id) => {
      const topic = await repository.findById(id);
      if (Number(id) === topicId && !injected) {
        injected = true;
        await commitCompetingChange();
      }
      return topic;
    };
    return staleReadRepository;
  };

  const auditTopicId = await executeInsert(
    `INSERT INTO topics (title, description, platform, creator_id, status, outline)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['过期审核状态保护', '', 'douyin', testUserId, 'pending', '过期审核大纲'],
  );
  const rejectFirst = () => repository.withTransaction(async (tx) => {
    await tx.updateTopic(auditTopicId, { status: 'rejected' });
    await tx.addHistory({ topicId: auditTopicId, action: 'rejected', comment: '先提交的审核', operatorId: testUserId });
    await tx.addActivity({ userId: testUserId, action: 'audit', target: 'topic', detail: '先提交审核驳回' });
  });
  const auditService = new TopicService({
    repository: makeStaleReadRepository(auditTopicId, rejectFirst),
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await expectServiceError(
    () => auditService.auditTopic(actor, auditTopicId, { status: 'approved', comment: '过期请求通过' }),
    'TOPIC_STAGE_CONFLICT',
  );
  const auditedStatus = (await repository.findById(auditTopicId))?.status;
  assert.equal(auditedStatus, 'rejected');
  assert.equal(Number((await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action IN ('approved','rejected')`,
    [auditTopicId],
  ))?.total), 1, '过期审核不得追加第二条状态历史');
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id=?', [auditTopicId]))?.total), 0, '过期审核不得留下创作记录');

  const transitionTopicId = await executeInsert(
    `INSERT INTO topics (title, description, platform, creator_id, assignee_id, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['过期阶段推进保护', '', 'douyin', testUserId, testUserId, 'approved'],
  );
  const advanceFirst = () => repository.withTransaction(async (tx) => {
    await tx.updateTopic(transitionTopicId, { status: 'production' });
    await tx.addHistory({ topicId: transitionTopicId, action: 'status_production', comment: '先提交的阶段推进', operatorId: testUserId });
    await tx.addActivity({ userId: testUserId, action: 'status_change', target: 'topic', detail: '先提交进入创作阶段' });
    await tx.createInitialProduction({
      topicId: transitionTopicId,
      content: '',
      contentMarkdown: '',
      contentJson: '',
      originOutlineSnapshot: '',
      operatorId: testUserId,
    });
  });
  const transitionService = new TopicService({
    repository: makeStaleReadRepository(transitionTopicId, advanceFirst),
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await expectServiceError(
    () => transitionService.transitionTopic(actor, transitionTopicId, { status: 'production' }),
    'TOPIC_STAGE_CONFLICT',
  );
  assert.equal((await repository.findById(transitionTopicId))?.status, 'production');
  assert.equal(Number((await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='status_production'`,
    [transitionTopicId],
  ))?.total), 1, 'only one stage transition may be recorded');
  assert.equal(Number((await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production WHERE topic_id=?', [transitionTopicId]))?.total), 1);
}

async function outlineOriginServiceTests() {
  const outline = '<p>审核通过时的大纲快照</p>';
  const topicId = await executeInsert(
    'INSERT INTO topics(title,description,platform,creator_id,status,outline) VALUES(?,?,?,?,?,?)',
    ['审核大纲来源快照', '', 'douyin', testUserId, 'pending', outline],
  );
  const service = new TopicService({
    repository,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
  });
  await service.auditTopic({ id: testUserId, role: 'admin' }, topicId, { status: 'approved', comment: '隔离快照回归' });
  const production = await queryOne<{ id: number; content: string }>(
    'SELECT id,content FROM production WHERE topic_id=?',
    [topicId],
  );
  assert.equal(production?.content, outline, 'approval copies the outline into the initial manuscript');
  assert.equal(
    (await queryOne<{ source_content_snapshot: string }>(
      'SELECT source_content_snapshot FROM production_origin_snapshots WHERE production_id=?',
      [production?.id],
    ))?.source_content_snapshot,
    outline,
    'approval atomically records the exact outline source snapshot',
  );
}

async function outlineVersionServiceTests() {
  const legacyOutline = '<p>旧选题大纲</p>';
  const topicId = await executeInsert(
    'INSERT INTO topics(title,description,platform,creator_id,status,outline) VALUES(?,?,?,?,?,?)',
    ['选题版本历史隔离测试', '', 'douyin', testUserId, 'approved', legacyOutline],
  );
  const service = new TopicService({ repository, policy: currentTopicPolicy, notify: () => undefined, broadcast: () => undefined });

  await service.updateTopic({ id: testUserId, role: 'admin' }, topicId, { outline: '<p>普通保存后的大纲</p>' });
  assert.equal((await service.getOutlineVersions({ id: testUserId, role: 'admin' }, topicId)).length, 0, 'ordinary outline saves do not create version records');

  await service.updateTopic({ id: testUserId, role: 'admin' }, topicId, {
    outline: '<p>小版本大纲</p>',
    version_action: 'minor',
    expected_content: '<p>普通保存后的大纲</p>',
  });
  let versions = await service.getOutlineVersions({ id: testUserId, role: 'admin' }, topicId);
  assert.deepEqual(versions.map((entry) => entry.version), ['baseline', 'v1.0']);
  assert.equal(versions[0].content, '<p>普通保存后的大纲</p>');
  assert.equal(versions[0].operator_id, null, 'legacy baseline does not invent an operator');
  assert.equal(versions[0].created_at, null, 'legacy baseline does not invent a timestamp');

  await assert.rejects(
    () => service.updateTopic({ id: testUserId, role: 'admin' }, topicId, {
      outline: '<p>过期大纲</p>', version_action: 'major', expected_content: legacyOutline,
    }),
    (error: unknown) => error instanceof TopicServiceError && error.code === 'TOPIC_VERSION_CONFLICT',
  );
  versions = await service.getOutlineVersions({ id: testUserId, role: 'admin' }, topicId);
  assert.deepEqual(versions.map((entry) => entry.version), ['baseline', 'v1.0'], 'a stale save cannot append a history entry');
}

try {
  await repositoryTests();
  await serviceTests();
  await apiTests();
  await staleStatusTests();
  await outlineOriginServiceTests();
  await outlineVersionServiceTests();
  assert.ok(await queryOne('SELECT id FROM topics LIMIT 1'));
  console.log('Topic module tests passed');
} finally {
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
