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

  const page = await repository.list({ page: 1, limit: 10, actorId: testUserId, viewAll: true, search: 'Repository' });
  assert.equal(page.total, 1);
  assert.equal(page.topics[0]?.id, topicId);

  await repository.updateTopic(topicId, { title: 'Repository 更新' });
  assert.equal((await repository.findById(topicId))?.title, 'Repository 更新');
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
      updateTopic: async () => undefined,
      addHistory: async () => undefined,
      addActivity: async () => undefined,
      productionExists: async () => false,
      createInitialProduction: async () => undefined,
      shootingExists: async () => false,
      createInitialShooting: async () => undefined,
      publishingExists: async () => false,
      createInitialPublishing: async () => undefined,
    }),
    updateTopic: async () => undefined,
    deleteLegacyRelations: async () => undefined,
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
}

async function apiTests() {
  await execute(
    `INSERT INTO topics (title, description, platform, creator_id, status)
     VALUES (?, ?, ?, ?, ?)`,
    ['API 契约', 'legacy/v1', 'douyin', testUserId, 'pending'],
  );
  const service = new TopicService({
    repository,
    policy: currentTopicPolicy,
    notify: () => undefined,
    broadcast: () => undefined,
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
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

try {
  await repositoryTests();
  await serviceTests();
  await apiTests();
  assert.ok(await queryOne('SELECT id FROM topics LIMIT 1'));
  console.log('Topic module tests passed');
} finally {
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
