import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-create-service-'));
process.env.XMT_DB_PATH = path.join(directory, 'topics.db');
process.env.JWT_SECRET = 'topic-create-service-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { SqliteTopicRepository } = await import('../../api/modules/topics/topics.sqlite-repository.js');
const { TopicService } = await import('../../api/modules/topics/topics.service.js');
const { TopicServiceError } = await import('../../api/modules/topics/topics.types.js');
const { currentTopicPolicy } = await import('../../api/modules/topics/topics.policy.js');

await initDatabase();

const createActor = async (username: string) => {
  const id = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
     VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', '', 'member', username],
  );
  return { id, role: 'member' };
};

const actor = await createActor('topic-create-owner');
const otherActor = await createActor('topic-create-other');
const notifications: unknown[] = [];
const broadcasts: Array<{ room: string; event: string }> = [];
const service = new TopicService({
  repository: new SqliteTopicRepository(),
  policy: currentTopicPolicy,
  notify: (message) => notifications.push(message),
  broadcast: (room, event) => broadcasts.push({ room, event }),
});
const requestId = 'b0122334-4556-4788-899a-bbccddeeff02';
const input = { title: '结果不明后安全恢复', description: '隔离服务测试', platform: 'douyin', deadline: '2026-11-01' };

try {
  const first = await service.createTopic(actor, input, requestId);
  const countsAfterCreate = {
    topics: await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topics WHERE id=?', [first.topicId]),
    history: await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='created'", [first.topicId]),
    activity: await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND target='topic' AND detail=?", [actor.id, `创建选题: ${input.title}`]),
  };
  assert.equal(countsAfterCreate.topics?.count, 1);
  assert.equal(countsAfterCreate.history?.count, 1);
  assert.equal(countsAfterCreate.activity?.count, 1);
  const notificationCount = notifications.length;
  const broadcastCount = broadcasts.length;

  const replay = await service.createTopic(actor, input, requestId);
  assert.deepEqual(replay, first, 'same actor, request ID, and payload replay the original topic ID');
  assert.equal(notifications.length, notificationCount, 'replay does not send notifications again');
  assert.equal(broadcasts.length, broadcastCount, 'replay does not broadcast topic:created again');
  assert.deepEqual(await service.getTopicCreateRequestStatus(actor, requestId), { state: 'created', topicId: first.topicId });
  assert.deepEqual(await service.getTopicCreateRequestStatus(otherActor, requestId), { state: 'not_found' }, 'another actor cannot inspect the receipt');

  await assert.rejects(
    () => service.createTopic(actor, { ...input, title: '不同载荷不可复用请求编号' }, requestId),
    (error) => error instanceof TopicServiceError && error.code === 'TOPIC_CREATE_REQUEST_CONFLICT',
  );
  await assert.rejects(
    () => service.createTopic(otherActor, input, requestId),
    (error) => error instanceof TopicServiceError && error.code === 'TOPIC_CREATE_REQUEST_CONFLICT',
  );
  assert.equal(notifications.length, notificationCount);
  assert.equal(broadcasts.length, broadcastCount);

  const rollbackRequestId = 'b0122334-4556-4788-899a-bbccddeeff03';
  const beforeRollback = {
    topics: Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topics'))?.count ?? 0),
    histories: Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topic_history'))?.count ?? 0),
    activities: Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM activity_log WHERE target='topic'"))?.count ?? 0),
  };
  await execute(`CREATE TRIGGER fail_topic_create_receipt BEFORE INSERT ON topic_create_request_keys
    BEGIN SELECT RAISE(ABORT, 'isolated receipt failure'); END`);
  await assert.rejects(() => service.createTopic(actor, { ...input, title: '回执故障必须整体回滚' }, rollbackRequestId));
  await execute('DROP TRIGGER fail_topic_create_receipt');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topics'))?.count ?? 0), beforeRollback.topics,
    'receipt failure rolls back the topic row');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM topic_history'))?.count ?? 0), beforeRollback.histories,
    'receipt failure rolls back topic history');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM activity_log WHERE target='topic'"))?.count ?? 0), beforeRollback.activities,
    'receipt failure rolls back activity history');
  assert.deepEqual(await service.getTopicCreateRequestStatus(actor, rollbackRequestId), { state: 'not_found' },
    'receipt failure leaves no recoverable false success');

  console.log('Topic create idempotency service tests passed.');
} finally {
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
