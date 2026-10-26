import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-home-dashboard-'));
process.env.XMT_DB_PATH = path.join(directory, 'home-dashboard.test.db');
process.env.JWT_SECRET = 'home-dashboard-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { default: homeDashboardRoutes } = await import('../../api/routes/home-dashboard.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { beijingToday, beijingNow } = await import('../../api/database/utils.js');

await initDatabase();

function shiftedDate(days: number) {
  const base = new Date(`${beijingToday()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

async function createUser(username: string, role: string) {
  return executeInsert(
    `INSERT INTO users (username,password,email,role,name,enabled,force_change_password)
     VALUES (?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, role, username],
  );
}

async function createTopic(input: {
  title: string;
  creatorId: number;
  assigneeId: number;
  status: string;
  deadline: string;
  stageEnteredAt: string | null;
}) {
  return executeInsert(
    `INSERT INTO topics (title,creator_id,assignee_id,status,deadline,stage_entered_at)
     VALUES (?,?,?,?,?,?)`,
    [input.title, input.creatorId, input.assigneeId, input.status, input.deadline, input.stageEnteredAt],
  );
}

async function createPublishing(topicId: number, operatorId: number, platform: string, status: string, publishTime: string) {
  return executeInsert(
    `INSERT INTO publishing (topic_id,operator_id,platform,status,publish_time)
     VALUES (?,?,?,?,?)`,
    [topicId, operatorId, platform, status, publishTime],
  );
}

async function createProduction(topicId: number, operatorId: number, status: string, version = 'v1.0') {
  return executeInsert(
    `INSERT INTO production (topic_id,operator_id,status,version,content)
     VALUES (?,?,?,?,?)`,
    [topicId, operatorId, status, version, '测试稿件正文不应出现在首页摘要'],
  );
}

async function createRetrospective(input: {
  title: string;
  periodStart: string;
  status: string;
  ownerId?: number | null;
  createdBy?: number | null;
}) {
  return executeInsert(
    `INSERT INTO retrospectives (title,scope_type,period_start,period_end,status,summary_md,owner_id,created_by,updated_at)
     VALUES (?,'team',?,?,?,'private test body',?,?,?)`,
    [input.title, input.periodStart, input.periodStart, input.status, input.ownerId ?? null, input.createdBy ?? null, `${input.periodStart} 12:00:00`],
  );
}

async function createCreatorPlatformAccount(userId: number, platformUid: string, nickname: string) {
  return executeInsert(
    `INSERT INTO creator_platform_accounts (user_id,platform,platform_uid,nickname,account_name,status)
     VALUES (?,'douyin',?,?,?,'active')`,
    [userId, platformUid, nickname, nickname],
  );
}

async function createSyncTask(account: string, status: string, startTime: string, failedCount = 1, successCount = 0) {
  return executeInsert(
    `INSERT INTO creator_sync_tasks (agent_id,task_id,start_time,platform,account,status,success_count,failed_count)
     VALUES (NULL,?,?, 'douyin',?,?,?,?)`,
    [`home-sync-${account}-${status}-${startTime}`, startTime, account, status, successCount, failedCount],
  );
}

const directorId = await createUser('home-dashboard-director', 'director');
const customId = await createUser('home-dashboard-custom', 'custom');
const otherId = await createUser('home-dashboard-other', 'custom');
const unprivilegedDirectorId = await createUser('home-dashboard-unprivileged-director', 'director');
const retroPermissionViewerId = await createUser('home-dashboard-retro-permission', 'custom');
const retroPersonalId = await createUser('home-dashboard-retro-personal', 'custom');
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [directorId, 'director']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [customId, 'member']);
await execute('INSERT INTO role_permissions (role_id,permission_id) SELECT roles.id,permissions.id FROM roles,permissions WHERE roles.code=? AND permissions.code=?', ['member', 'production:update']);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [retroPermissionViewerId, 'member']);
const publicRetroId = await createRetrospective({ title: '已发布可见复盘', periodStart: '2026-09-10', status: 'published', createdBy: otherId });
await createRetrospective({ title: '本人负责草稿', periodStart: '2026-08-15', status: 'draft', ownerId: retroPersonalId, createdBy: directorId });
await createRetrospective({ title: '本人创建草稿', periodStart: '2026-08-20', status: 'draft', createdBy: retroPersonalId });
const actionOwnedRetroId = await createRetrospective({ title: '本人行动项复盘', periodStart: '2026-08-25', status: 'draft', createdBy: directorId });
await execute(
  `INSERT INTO retro_actions (retro_id,title,owner_id,created_by) VALUES (?, '本人负责行动项', ?, ?)`,
  [actionOwnedRetroId, retroPersonalId, directorId],
);
await createRetrospective({ title: '团队内部草稿', periodStart: '2026-09-01', status: 'draft', ownerId: directorId, createdBy: directorId });
await createRetrospective({ title: '负责人私有复盘', periodStart: '2026-08-30', status: 'draft', ownerId: directorId, createdBy: directorId });
for (let index = 1; index <= 4; index += 1) {
  await createRetrospective({ title: `较早归档复盘 ${index}`, periodStart: `2026-07-0${index}`, status: 'archived', ownerId: directorId, createdBy: directorId });
}
const now = beijingNow();
const oldStage = `${shiftedDate(-4)} 09:00:00`;
const twoDaysOldStage = `${shiftedDate(-3)} 09:00:00`;
function formatBeijingTimestamp(epochMs: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}
const exactlyTwoDaysAgo = Date.parse(`${now.replace(' ', 'T')}+08:00`) - 2 * 24 * 60 * 60 * 1000;

await createTopic({ title: '团队逾期且卡点', creatorId: directorId, assigneeId: directorId, status: 'production', deadline: shiftedDate(-3), stageEnteredAt: oldStage });
await createTopic({ title: '团队即将截止', creatorId: directorId, assigneeId: directorId, status: 'pending', deadline: shiftedDate(1), stageEnteredAt: now });
await createTopic({ title: '团队阶段卡点', creatorId: directorId, assigneeId: directorId, status: 'shooting', deadline: shiftedDate(30), stageEnteredAt: twoDaysOldStage });
await createTopic({ title: '两天阈值前30秒不算卡点', creatorId: directorId, assigneeId: directorId, status: 'shooting', deadline: shiftedDate(30), stageEnteredAt: formatBeijingTimestamp(exactlyTwoDaysAgo + 30_000) });
await createTopic({ title: '超过两天30秒算卡点', creatorId: directorId, assigneeId: directorId, status: 'shooting', deadline: shiftedDate(30), stageEnteredAt: formatBeijingTimestamp(exactlyTwoDaysAgo - 30_000) });
await createTopic({ title: '其他成员的事项', creatorId: otherId, assigneeId: otherId, status: 'production', deadline: shiftedDate(-1), stageEnteredAt: twoDaysOldStage });
await createTopic({ title: '已完成的旧事项', creatorId: directorId, assigneeId: directorId, status: 'completed', deadline: shiftedDate(-20), stageEnteredAt: `${shiftedDate(-30)} 09:00:00` });
await createTopic({ title: '已退回且已逾期', creatorId: directorId, assigneeId: directorId, status: 'rejected', deadline: shiftedDate(-1), stageEnteredAt: now });
await createTopic({ title: '已退回且临近截止', creatorId: directorId, assigneeId: directorId, status: 'rejected', deadline: shiftedDate(1), stageEnteredAt: now });
await createTopic({ title: '个人逾期事项', creatorId: customId, assigneeId: customId, status: 'production', deadline: shiftedDate(-5), stageEnteredAt: now });
await createTopic({ title: '团队阶段时间待确认', creatorId: directorId, assigneeId: directorId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: null });
await createTopic({ title: '个人阶段时间待确认', creatorId: customId, assigneeId: customId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: null });
await createTopic({ title: '范围外阶段时间待确认', creatorId: otherId, assigneeId: otherId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: null });
await createTopic({ title: '无效阶段时间待确认', creatorId: directorId, assigneeId: directorId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: 'not-a-date' });
await createTopic({ title: '已完成阶段时间待确认', creatorId: directorId, assigneeId: directorId, status: 'completed', deadline: shiftedDate(30), stageEnteredAt: null });
await createTopic({ title: '已退回阶段时间待确认', creatorId: directorId, assigneeId: directorId, status: 'rejected', deadline: shiftedDate(30), stageEnteredAt: null });
const todayPublishingTopicId = await createTopic({ title: '今日多平台发布', creatorId: directorId, assigneeId: directorId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
await createPublishing(todayPublishingTopicId, directorId, '抖音', 'pending', `${beijingToday()} 13:00:00`);
await createPublishing(todayPublishingTopicId, directorId, '小红书', 'scheduled', `${beijingToday()} 18:00:00`);
const anyPublishedTopicId = await createTopic({ title: '已有平台发布即完成', creatorId: directorId, assigneeId: directorId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
await createPublishing(anyPublishedTopicId, directorId, '抖音', 'published', `${beijingToday()} 09:00:00`);
await createPublishing(anyPublishedTopicId, directorId, '视频号', 'pending', `${beijingToday()} 17:00:00`);
const allFailedTopicId = await createTopic({ title: '全部异常已处理', creatorId: directorId, assigneeId: directorId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
await createPublishing(allFailedTopicId, directorId, '抖音', 'failed', `${beijingToday()} 10:00:00`);
const futurePublishingTopicId = await createTopic({ title: '未来发布不算今日', creatorId: directorId, assigneeId: directorId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
await createPublishing(futurePublishingTopicId, directorId, '小红书', 'pending', `${shiftedDate(1)} 10:00:00`);
const operatorPublishingTopicId = await createTopic({ title: '发布操作人个人范围', creatorId: otherId, assigneeId: otherId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
await createPublishing(operatorPublishingTopicId, customId, '视频号', 'scheduled', `${beijingToday()} 20:00:00`);
const reviewTopicOwnedByDirector = await createTopic({ title: '负责人范围的待审稿件', creatorId: directorId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
await createProduction(reviewTopicOwnedByDirector, otherId, 'review', 'v2.0');
const reviewTopicOperatedByDirector = await createTopic({ title: '负责人参与的待审稿件', creatorId: otherId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
await createProduction(reviewTopicOperatedByDirector, directorId, 'review');
const reviewTopicOwnedByCustom = await createTopic({ title: '成员范围的待审稿件', creatorId: customId, assigneeId: customId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
await createProduction(reviewTopicOwnedByCustom, customId, 'review');
const reviewTopicOutsideDirectorScope = await createTopic({ title: '其他成员待审稿件', creatorId: otherId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
await createProduction(reviewTopicOutsideDirectorScope, otherId, 'review');
for (let index = 0; index < 10; index += 1) {
  const reviewTopicId = await createTopic({ title: `负责人待审稿件 ${index + 1}`, creatorId: directorId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
  await createProduction(reviewTopicId, otherId, 'review');
}
for (let index = 0; index < 10; index += 1) {
  const hour = String(14 + index).padStart(2, '0');
  const topicId = await createTopic({ title: `列表上限发布 ${index + 1}`, creatorId: directorId, assigneeId: directorId, status: 'publishing', deadline: shiftedDate(30), stageEnteredAt: now });
  await createPublishing(topicId, directorId, '抖音', 'pending', `${beijingToday()} ${hour}:00:00`);
}

const syncEpoch = Date.parse(`${now.replace(' ', 'T')}+08:00`);
const syncTimestamp = (secondsAgo: number) => formatBeijingTimestamp(syncEpoch - secondsAgo * 1000);
await createCreatorPlatformAccount(directorId, 'sync-failed-account', '失败账号甲');
await createCreatorPlatformAccount(otherId, 'sync-partial-account', '部分成功账号乙');
await createSyncTask('sync-failed-account', 'success', syncTimestamp(3600), 0, 5);
await createSyncTask('sync-failed-account', 'failed', syncTimestamp(10), 5, 0);
await createSyncTask('sync-partial-account', 'partial_success', syncTimestamp(20), 2, 3);
await createSyncTask('sync-running-account', 'failed', syncTimestamp(300), 4, 0);
await createSyncTask('sync-running-account', 'running', syncTimestamp(5), 0, 0);
await createSyncTask('sync-recovered-account', 'failed', syncTimestamp(600), 2, 0);
await createSyncTask('sync-recovered-account', 'success', syncTimestamp(30), 0, 4);
for (let index = 0; index < 8; index += 1) {
  await createSyncTask(`sync-extra-${index}`, 'failed', syncTimestamp(40 + index), 1, 0);
}

const activityOwnedTopicId = await createTopic({ title: '最近变化范围内选题', creatorId: customId, assigneeId: customId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
const activityOwnedProductionId = await createProduction(activityOwnedTopicId, customId, 'draft', 'v1.1');
await execute(
  `INSERT INTO production_history (production_id,version,content,status,change_type,operator_id,version_state,created_at)
   VALUES (?,?,?,'draft','minor',?,'historical',?)`,
  [activityOwnedProductionId, 'v1.0', 'PRIVATE_MANUSCRIPT_BODY', customId, '2026-10-13 12:01:00'],
);
const activityThreadId = await executeInsert(
  `INSERT INTO production_review_threads (production_id,version,kind,anchor_quote,anchor_context,anchor_from,anchor_to,summary,proposed_text,author_id,created_at)
   VALUES (?,'v1.1','comment','PRIVATE_ANCHOR','',0,1,'PRIVATE_REVIEW_SUMMARY',NULL,?,'2026-10-13 12:02:00')`,
  [activityOwnedProductionId, customId],
);
await executeInsert(
  `INSERT INTO production_review_replies (thread_id,content,author_id,created_at) VALUES (?,'PRIVATE_REPLY_BODY',?,'2026-10-13 12:03:00')`,
  [activityThreadId, customId],
);
await executeInsert(
  `INSERT INTO topic_history (topic_id,action,comment,operator_id,created_at) VALUES (?,'status_production','PRIVATE_TOPIC_COMMENT',?,'2026-10-13 12:04:00')`,
  [activityOwnedTopicId, customId],
);
const activityOperatorTopicId = await createTopic({ title: '操作人参与的最近变化', creatorId: otherId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
const activityOperatorProductionId = await createProduction(activityOperatorTopicId, customId, 'draft');
await execute(
  `INSERT INTO production_history (production_id,version,content,status,change_type,operator_id,version_state,created_at)
   VALUES (?,?,'PRIVATE_OUTSIDE_MANUSCRIPT','draft','major',?,'superseded','2026-10-13 12:05:00')`,
  [activityOperatorProductionId, 'v1.0', customId],
);
const activityOutsideTopicId = await createTopic({ title: '范围外最近变化', creatorId: otherId, assigneeId: otherId, status: 'production', deadline: shiftedDate(30), stageEnteredAt: now });
const activityOutsideProductionId = await createProduction(activityOutsideTopicId, otherId, 'draft');
await execute(
  `INSERT INTO production_history (production_id,version,content,status,change_type,operator_id,version_state,created_at)
   VALUES (?,?,'PRIVATE_OUTSIDE_MANUSCRIPT','draft','minor',?,'historical','2026-10-13 12:06:00')`,
  [activityOutsideProductionId, 'v1.0', otherId],
);
for (let index = 1; index <= 15; index += 1) {
  const recentTopicId = await createTopic({
    title: `较新的他人操作稿件 ${index}`,
    creatorId: customId,
    assigneeId: customId,
    status: 'completed',
    deadline: shiftedDate(30),
    stageEnteredAt: now,
  });
  await createProduction(recentTopicId, otherId, 'draft');
}

const app = express();
app.use('/api/dashboard', homeDashboardRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/dashboard/home-attention`;
const activityBase = `http://127.0.0.1:${address.port}/api/dashboard/home-activity`;

try {
  const unauthenticated = await fetch(base);
  assert.equal(unauthenticated.status, 401, 'home attention requires authentication');
  const unauthenticatedActivity = await fetch(activityBase);
  assert.equal(unauthenticatedActivity.status, 401, 'home activity requires authentication');

  const approvedPipelineTopicId = await createTopic({ title: '首页内容流已通过待创作', creatorId: directorId, assigneeId: directorId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: now });
  await execute("UPDATE topics SET created_at = '2090-01-01 12:00:00' WHERE id = ?", [approvedPipelineTopicId]);

  const directorResponse = await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: directorId })}` } });
  assert.equal(directorResponse.status, 200);
  const director = await directorResponse.json() as {
    scope: string;
    counts: { overdue: number; due_soon: number; stalled: number; stage_time_unknown: number; total: number };
    topics: Array<{ title: string; is_overdue: boolean; is_due_soon: boolean; is_stalled: boolean }>;
    today_publishing: { total: number; tasks: Array<{ topic_title: string; platform: string; status: string }> };
    sync_anomalies: { available: boolean; total: number; tasks: Array<{ account_name: string; account_uid: string; status: string; failed_count: number; owner_name: string | null }> };
    production_reviews: { available: boolean; total: number; tasks: Array<{ id: number; topic_title: string; version: string | null; operator_name: string | null; assignee_name: string | null; content?: string }> };
    retrospectives: { available: boolean; total: number; tasks: Array<{ id: number; title: string; period_start: string; period_end: string; status: string; updated_at: string; summary_md?: string }> };
    topic_stages: Record<string, { total: number; topics: Array<{ id: number; title: string; status: string; created_at: string; stage_entered_at: string | null; creator_name: string | null; assignee_name: string | null; content?: string }> }>;
    my_drafts: { tasks: Array<{ id: number; topic_id: number | null; topic_title: string | null; status: string; version: string | null; updated_at: string; content?: string }> };
  };
  assert.equal(director.scope, 'all-visible-content');
  assert.deepEqual(director.counts, { overdue: 3, due_soon: 1, stalled: 4, stage_time_unknown: 4, total: 6 }, 'manager counts include all visible active items without double-counting topics, while keeping null or invalid stage time separate');
  assert.ok(director.topics.length <= 8, 'home response remains bounded');
  assert.ok(director.topics.some((topic) => topic.title === '团队逾期且卡点' && topic.is_overdue && topic.is_stalled));
  assert.ok(director.topics.some((topic) => topic.title === '团队即将截止' && topic.is_due_soon));
  assert.ok(director.topics.some((topic) => topic.title === '超过两天30秒算卡点' && topic.is_stalled));
  assert.ok(!director.topics.some((topic) => topic.title === '两天阈值前30秒不算卡点'), 'a topic still short of the stalled threshold is excluded');
  assert.ok(!director.topics.some((topic) => topic.title === '已完成的旧事项'), 'completed work is excluded from attention');
  assert.ok(!director.topics.some((topic) => topic.title === '已退回且已逾期' || topic.title === '已退回且临近截止'), 'rejected topics are excluded from overdue and due-soon attention rows');
  assert.equal(director.today_publishing.total, 13, 'today publishing count is per actionable platform record');
  assert.equal(director.today_publishing.tasks.length, 8, 'today publishing previews are bounded without truncating the total count');
  assert.deepEqual(director.today_publishing.tasks.slice(0, 2).map((task) => [task.topic_title, task.platform, task.status]), [
    ['今日多平台发布', '抖音', 'pending'],
    ['列表上限发布 1', '抖音', 'pending'],
  ], 'today tasks are returned in scheduled time order');
  assert.ok(!director.today_publishing.tasks.some((task) => task.topic_title === '已有平台发布即完成' || task.topic_title === '全部异常已处理' || task.topic_title === '未来发布不算今日'), 'today tasks exclude published topics, handled failures, and future dates');
  assert.equal(director.sync_anomalies.available, true, 'directors with creator data visibility can see sync results');
  assert.equal(director.sync_anomalies.total, 10, 'sync anomaly count uses the latest task for each account');
  assert.equal(director.sync_anomalies.tasks.length, 8, 'sync anomaly previews are bounded separately from the exact total');
  assert.deepEqual(director.sync_anomalies.tasks.slice(0, 2).map((task) => [task.account_name, task.status]), [
    ['失败账号甲', 'failed'],
    ['部分成功账号乙', 'partial_success'],
  ], 'sync anomalies are ordered newest first and use safe account labels');
  assert.equal(director.sync_anomalies.tasks[0]?.account_uid, 'sync-failed-account', 'the exact account identifier is available only for the protected in-app deep link');
  assert.equal(director.sync_anomalies.tasks[0]?.owner_name, 'home-dashboard-director');
  assert.equal(director.sync_anomalies.tasks[0]?.failed_count, 5);
  assert.ok(!director.sync_anomalies.tasks.some((task) => task.account_uid === 'sync-running-account' || task.account_uid === 'sync-recovered-account'), 'newer running or successful tasks suppress an old failure');
  assert.equal(director.production_reviews.available, true, 'users with the existing production:update permission receive review tasks');
  assert.equal(director.production_reviews.total, 12, 'production review count follows the same creator/assignee/operator edit scope and remains exact');
  assert.equal(director.production_reviews.tasks.length, 8, 'production review previews remain bounded without truncating the exact count');
  assert.deepEqual(director.production_reviews.tasks.slice(0, 2).map((task) => task.topic_title), ['负责人范围的待审稿件', '负责人参与的待审稿件']);
  assert.equal(director.production_reviews.tasks[0]?.version, 'v2.0');
  assert.ok(director.production_reviews.tasks.every((task) => !('content' in task)), 'home review summaries never expose manuscript content');
  assert.ok(!director.production_reviews.tasks.some((task) => task.topic_title === '其他成员待审稿件' || task.topic_title === '成员范围的待审稿件'), 'users never receive review rows outside their edit scope');
  assert.equal(director.retrospectives.available, true);
  assert.equal(director.retrospectives.total, 10, 'manager summary counts all visible retrospective states');
  assert.equal(director.retrospectives.tasks.length, 3, 'home retrospective previews are bounded independently from the exact total');
  assert.deepEqual(director.retrospectives.tasks.map((retro) => retro.title), ['已发布可见复盘', '团队内部草稿', '负责人私有复盘']);
  assert.ok(director.retrospectives.tasks.every((retro) => !('summary_md' in retro)), 'home previews expose no retrospective body');
  assert.ok(director.retrospectives.tasks.every((retro) => retro.period_start === retro.period_end));
  assert.ok(director.retrospectives.tasks.some((retro) => retro.id === publicRetroId));
  assert.equal(director.topic_stages.pending.total, 1, 'the stage summary returns an exact count independent from the preview limit');
  assert.deepEqual(director.topic_stages.pending.topics.map((topic) => topic.title), ['团队即将截止']);
  assert.ok(director.topic_stages.production.total > 3, 'the stage total is not truncated to the three preview rows');
  assert.equal(director.topic_stages.production.topics.length, 3, 'each topic stage returns at most three preview rows');
  assert.equal(director.topic_stages.production.topics[0]?.id, approvedPipelineTopicId, 'the creation stage preview includes the newest approved topic');
  assert.equal(director.topic_stages.production.topics[0]?.status, 'approved', 'creation-stage previews preserve the actual approved status');
  assert.ok(director.topic_stages.production.topics.every((topic) => !('content' in topic)), 'stage previews return only bounded topic metadata');
  assert.deepEqual(director.my_drafts.tasks, [], 'a manager with no personally-operated drafts receives an empty personal draft summary');

  const personalResponse = await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: customId })}` } });
  assert.equal(personalResponse.status, 200);
  const personal = await personalResponse.json() as {
    scope: string;
    counts: { overdue: number; due_soon: number; stalled: number; stage_time_unknown: number; total: number };
    topics: Array<{ title: string }>;
    today_publishing: { total: number; tasks: Array<{ topic_title: string; platform: string }> };
    sync_anomalies: { available: boolean; total: number; tasks: Array<unknown> };
    production_reviews: { available: boolean; total: number; tasks: Array<{ topic_title: string }> };
    retrospectives: { available: boolean; total: number; tasks: Array<{ title: string }> };
    topic_stages: Record<string, { total: number; topics: Array<{ title: string }> }>;
    my_drafts: { tasks: Array<{ topic_title: string | null; status: string }> };
  };
  assert.equal(personal.scope, 'personal');
  assert.deepEqual(personal.counts, { overdue: 1, due_soon: 0, stalled: 0, stage_time_unknown: 1, total: 1 });
  assert.equal(personal.counts.stalled, 0, 'a topic with unknown stage time is not inferred to be stalled');
  assert.equal(personal.counts.stage_time_unknown, 1, 'the current user sees only unknown stage times in their existing topic scope');
  assert.deepEqual(personal.topics.map((topic) => topic.title), ['个人逾期事项'], 'personal response contains only topics owned or assigned to the caller');
  assert.equal(personal.today_publishing.total, 1, 'personal publishing scope also includes records operated by the caller');
  assert.deepEqual(personal.today_publishing.tasks.map((task) => [task.topic_title, task.platform]), [['发布操作人个人范围', '视频号']]);
  assert.equal(personal.sync_anomalies.available, false, 'non-management users never receive team sync status');
  assert.equal(personal.sync_anomalies.total, 0);
  assert.deepEqual(personal.sync_anomalies.tasks, []);
  assert.equal(personal.production_reviews.available, true, 'the existing production:update permission remains the review entry gate');
  assert.equal(personal.production_reviews.total, 1, 'members with the permission see only associated manuscript reviews');
  assert.deepEqual(personal.production_reviews.tasks.map((task) => task.topic_title), ['成员范围的待审稿件']);
  assert.equal(personal.retrospectives.available, true);
  assert.equal(personal.retrospectives.total, 10, 'the member full-view permission preserves existing retrospective list visibility');
  assert.equal(personal.topic_stages.production.total, 4, 'personal creation-stage totals include approved topics and use the same creator/assignee visibility boundary as topic lists');
  assert.deepEqual(personal.topic_stages.production.topics.map((topic) => topic.title).sort(), ['个人阶段时间待确认', '最近变化范围内选题', '成员范围的待审稿件'].sort(), 'creation-stage previews combine approved/production topics and stay within the caller-owned or assigned scope');
  assert.ok(!personal.topic_stages.production.topics.some((topic) => topic.title === '团队逾期且卡点' || topic.title === '其他成员的事项'));
  assert.ok(personal.my_drafts.tasks.some((task) => task.topic_title === '最近变化范围内选题' && task.status === 'draft'));
  assert.ok(personal.my_drafts.tasks.some((task) => task.topic_title === '操作人参与的最近变化' && task.status === 'draft'), 'the personal draft summary preserves the existing production-operator access path');
  assert.ok(!personal.my_drafts.tasks.some((task) => task.topic_title === '范围外最近变化'), 'the personal draft summary excludes records operated by another user');
  assert.equal(personal.my_drafts.tasks.length, 2, 'recent unrelated draft rows do not crowd the caller-owned draft summary out of the first page');
  assert.ok(personal.my_drafts.tasks.every((task) => !('content' in task)), 'personal draft previews never expose manuscript bodies');

  const personalActivityResponse = await fetch(activityBase, { headers: { authorization: `Bearer ${signToken({ userId: customId })}` } });
  assert.equal(personalActivityResponse.status, 200);
  const personalActivity = await personalActivityResponse.json() as {
    scope: string;
    events: Array<{ id: string; kind: string; label: string; title: string; detail: string; occurred_at: string; path: string }>;
  };
  assert.equal(personalActivity.scope, 'personal');
  assert.ok(personalActivity.events.length <= 12, 'home activity is bounded');
  assert.ok(personalActivity.events.some((event) => event.kind === 'version' && event.title === '最近变化范围内选题' && event.detail === '小修 · 基于 v1.0'));
  assert.ok(personalActivity.events.some((event) => event.kind === 'review' && event.title === '最近变化范围内选题' && event.path === `/production/${activityOwnedProductionId}?version=v1.1`));
  assert.ok(personalActivity.events.some((event) => event.kind === 'reply' && event.title === '最近变化范围内选题'));
  assert.ok(personalActivity.events.some((event) => event.kind === 'topic_status' && event.detail === '阶段更新至创作中' && event.path === `/topics/${activityOwnedTopicId}`));
  assert.ok(personalActivity.events.some((event) => event.kind === 'version' && event.title === '操作人参与的最近变化'), 'production operator remains within the existing production visibility scope');
  assert.ok(!personalActivity.events.some((event) => event.title === '范围外最近变化'));
  const serializedPersonalActivity = JSON.stringify(personalActivity.events);
  for (const privateValue of ['PRIVATE_MANUSCRIPT_BODY', 'PRIVATE_REVIEW_SUMMARY', 'PRIVATE_ANCHOR', 'PRIVATE_REPLY_BODY', 'PRIVATE_TOPIC_COMMENT', 'PRIVATE_OUTSIDE_MANUSCRIPT']) {
    assert.ok(!serializedPersonalActivity.includes(privateValue), `home activity must not expose ${privateValue}`);
  }
  assert.ok(personalActivity.events.every((event) => Object.keys(event).sort().join(',') === 'detail,id,kind,label,occurred_at,path,title'), 'home events return only allowlisted metadata fields');

  const directorActivityResponse = await fetch(activityBase, { headers: { authorization: `Bearer ${signToken({ userId: directorId })}` } });
  assert.equal(directorActivityResponse.status, 200);
  const directorActivity = await directorActivityResponse.json() as { scope: string; events: Array<{ title: string }> };
  assert.equal(directorActivity.scope, 'all-visible-content');
  assert.ok(directorActivity.events.some((event) => event.title === '范围外最近变化'), 'managers retain the established all-content visibility scope');

  const retroPersonalResponse = await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: retroPersonalId })}` } });
  assert.equal(retroPersonalResponse.status, 200);
  const retroPersonal = await retroPersonalResponse.json() as { retrospectives: { total: number; tasks: Array<{ title: string }> } };
  assert.equal(retroPersonal.retrospectives.total, 4, 'members without the full-view permission see published retrospectives plus only retrospectives they own, created, or have an assigned action in');
  assert.deepEqual(retroPersonal.retrospectives.tasks.map((retro) => retro.title), ['已发布可见复盘', '本人行动项复盘', '本人创建草稿']);
  assert.ok(!retroPersonal.retrospectives.tasks.some((retro) => retro.title === '团队内部草稿' || retro.title === '负责人私有复盘'));

  const retroPermissionResponse = await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: retroPermissionViewerId })}` } });
  assert.equal(retroPermissionResponse.status, 200);
  const retroPermission = await retroPermissionResponse.json() as { retrospectives: { total: number; tasks: Array<{ title: string }> } };
  assert.equal(retroPermission.retrospectives.total, 10, 'analytics:retro:view keeps the existing full-list visibility semantics');
  assert.equal(retroPermission.retrospectives.tasks.length, 3);

  const unprivilegedDirectorResponse = await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: unprivilegedDirectorId })}` } });
  assert.equal(unprivilegedDirectorResponse.status, 200);
  const unprivilegedDirector = await unprivilegedDirectorResponse.json() as {
    sync_anomalies: { available: boolean; total: number; tasks: Array<unknown> };
    production_reviews: { available: boolean; total: number; tasks: Array<unknown> };
  };
  assert.equal(unprivilegedDirector.sync_anomalies.available, false, 'management role alone is insufficient without creator data visibility');
  assert.equal(unprivilegedDirector.sync_anomalies.total, 0);
  assert.deepEqual(unprivilegedDirector.sync_anomalies.tasks, []);
  assert.equal(unprivilegedDirector.production_reviews.available, false, 'review items are hidden without production:update');
  assert.equal(unprivilegedDirector.production_reviews.total, 0);
  assert.deepEqual(unprivilegedDirector.production_reviews.tasks, []);
  const beforeActive = await (await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: customId })}` } })).json();
  const newActiveIds: number[] = [];
  for (let index = 0; index < 35; index += 1) {
    const id = await createTopic({ title: `完整进行中统计 ${index}`, creatorId: customId, assigneeId: otherId, status: index === 34 ? 'approved' : 'pending', deadline: shiftedDate(30), stageEnteredAt: now });
    await execute("UPDATE topics SET created_at = '2090-01-01 12:00:00' WHERE id = ?", [id]);
    newActiveIds.push(id);
  }
  const outsideId = await createTopic({ title: '范围外进行中预览', creatorId: otherId, assigneeId: otherId, status: 'approved', deadline: shiftedDate(30), stageEnteredAt: now });
  await execute("UPDATE topics SET created_at = '2091-01-01 12:00:00' WHERE id = ?", [outsideId]);
  for (const status of ['completed', 'rejected']) {
    const id = await createTopic({ title: `不计入进行中 ${status}`, creatorId: customId, assigneeId: customId, status, deadline: shiftedDate(30), stageEnteredAt: now });
    await execute("UPDATE topics SET created_at = '2092-01-01 12:00:00' WHERE id = ?", [id]);
  }
  const activePersonal = await (await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: customId })}` } })).json();
  assert.equal(activePersonal.active_topics.total, beforeActive.active_topics.total + 35, 'the active count is exact beyond one page and excludes completed/rejected topics');
  assert.deepEqual(activePersonal.active_topics.topics.map((topic: { id: number }) => topic.id), newActiveIds.slice(-3).reverse(), 'the latest three active previews use stable id ordering for tied timestamps');
  assert.equal(activePersonal.active_topics.topics[0].status, 'approved', 'approved topics remain active even though the five-stage strip omits them');
  assert.ok(activePersonal.active_topics.topics.every((topic: object) => Object.keys(topic).sort().join(',') === 'id,status,title'), 'active previews contain only allowlisted navigation metadata');
  const activeTeam = await (await fetch(base, { headers: { authorization: `Bearer ${signToken({ userId: directorId })}` } })).json();
  assert.equal(activeTeam.active_topics.topics[0].id, outsideId, 'the existing team visibility scope remains unchanged');
  assert.ok(activeTeam.active_topics.total > activePersonal.active_topics.total);
  console.log('Home dashboard attention and activity API tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
