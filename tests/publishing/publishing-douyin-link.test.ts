import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { dateKeyBjt } from '../../shared/time/index.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-publishing-douyin-link-'));
process.env.XMT_DB_PATH = path.join(directory, 'publishing-douyin.db');
process.env.JWT_SECRET = 'publishing-douyin-link-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRoutes } = await import('../../api/routes/workflow.js');
const { persistDouyinContractV2102, persistNormalizedDouyinSync } = await import('../../api/services/douyinDataCenter.js');
const {
  chooseAutomaticPublishingDouyinMatch,
  normalizePublishingTitle,
  reconcilePublishingDouyinLinks,
  scorePublishingDouyinTitle,
} = await import('../../api/services/publishingDouyinLink.js');

assert.equal(normalizePublishingTitle('《东 平湖》'), '东平湖');
assert.deepEqual(scorePublishingDouyinTitle('东平湖', '东平湖｜秋日航拍 #山东'), { score: 1, method: 'exact' });
assert.equal(scorePublishingDouyinTitle('牛山森林公园穆柯寨', '牛山森林公园：槐柯寨').method, 'fuzzy');
assert.equal(chooseAutomaticPublishingDouyinMatch('同名稿件', [
  { id: 1, account_id: 1, title: '同名稿件｜第一版' },
  { id: 2, account_id: 1, title: '同名稿件｜第二版' },
]), null, 'same-score candidates must not auto-link');

await initDatabase();
await assert.rejects(
  () => reconcilePublishingDouyinLinks({} as never),
  /必须显式指定逐条编辑范围或全库范围/,
  'service-level reconciliation fails closed when no record scope is supplied',
);
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-link-admin', 'unused', 'publishing-link@example.invalid', 'admin', 'Publishing Link Admin'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
const restrictedUserId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-link-restricted', 'unused', 'publishing-link-restricted@example.invalid', 'member', 'Restricted User'],
);
const directorId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-link-director', 'unused', 'publishing-link-director@example.invalid', 'director', 'Publishing Link Director'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [directorId, 'director']);
const topicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'publishing')`,
  ['东平湖', 'test', 'other', adminId, adminId],
);
const publishingId = await executeInsert(
  `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'其他平台','pending','2026-01-01',?)`,
  [topicId, adminId],
);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,3,2,1,4,'2026-01-01')`, [topicId]);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,999,999,999,999,'2025-12-31')`, [topicId]);
const accountId = await executeInsert(
  `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,user_id,last_sync_time) VALUES('测试账号','https://example.invalid/douyin','test-publishing-link',?,?)`,
  [adminId, '2026-09-12 10:00:00'],
);
const workId = await executeInsert(
  `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
   VALUES(?,'work-east-lake','东平湖｜秋日航拍 #山东','2026-09-10T02:00:00.000Z',1200,88,19,7)`,
  [accountId],
);
const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headers = { Authorization: `Bearer ${signToken({ userId: adminId })}`, 'Content-Type': 'application/json' };
const restrictedHeaders = { Authorization: `Bearer ${signToken({ userId: restrictedUserId })}`, 'Content-Type': 'application/json' };
const directorHeaders = { Authorization: `Bearer ${signToken({ userId: directorId })}`, 'Content-Type': 'application/json' };

try {
  await execute(`CREATE TRIGGER fail_archive_insert BEFORE INSERT ON resources
    WHEN NEW.file_path = 'archive/topic-${topicId}'
    BEGIN SELECT RAISE(ABORT, 'injected archive sync failure'); END`);
  const reconciliationResponse = await fetch(`${base}/publishing/douyin/reconcile`, { method: 'POST', headers });
  assert.equal(reconciliationResponse.status, 200);
  const reconciliationPayload = await reconciliationResponse.json();
  assert.equal(reconciliationPayload.linked, 1);
  assert.equal(reconciliationPayload.archiveSyncPending, 1, 'a failed follow-up archive is reported as partial completion');
  assert.deepEqual(
    await queryOne('SELECT publishing_id,douyin_work_id,match_method FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]),
    { publishing_id: publishingId, douyin_work_id: workId, match_method: 'exact' },
  );
  const automaticLinkHistory = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(automaticLinkHistory?.action, 'publishing_douyin_link_changed');
  assert.match(automaticLinkHistory?.comment || '', new RegExp(`发布记录 #${publishingId} 的抖音作品关联由「未关联」更正为「抖音作品 #${workId}」`));
  assert.equal(automaticLinkHistory?.operator_id, adminId, 'manual reconciliation records the actor that created the relation');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'completed',
    'a Douyin work linked during reconciliation counts as a published platform for topic completion');
  assert.equal(await queryOne('SELECT id FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]), null, 'the injected archive failure does not roll back the confirmed Douyin relation');
  await execute('DROP TRIGGER fail_archive_insert');
  const archiveRetryResponse = await fetch(`${base}/publishing/${publishingId}/archive-sync`, { method: 'POST', headers });
  assert.equal(archiveRetryResponse.status, 200);
  assert.equal((await archiveRetryResponse.json()).archiveSync, 'synced', 'the existing detail retry can recover the failed archive without repeating reconciliation');
  const linkedArchive = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(linkedArchive, 'an explicit archive retry restores the effective publication snapshot');
  const linkedArchivePayload = JSON.parse(linkedArchive.content) as { published_records?: Array<{ publishing_id: number; platform: string }> };
  assert.deepEqual(linkedArchivePayload.published_records?.map(({ publishing_id, platform }) => ({ publishing_id, platform })), [
    { publishing_id: publishingId, platform: 'douyin' },
  ]);

  const listResponse = await fetch(`${base}/publishing`, { headers });
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.total, 1, 'multiple analytics snapshots must not duplicate publishing rows');
  assert.deepEqual(listPayload.summary, { today: 0, pending: 0, published: 1, failed: 0 });
  const linked = listPayload.data[0];
  assert.equal(linked.data_source, 'douyin');
  assert.equal(linked.platform, '抖音');
  assert.equal(linked.status, 'published');
  assert.equal(linked.publish_time, '2026-09-10T02:00:00.000Z');
  assert.deepEqual([linked.views, linked.likes, linked.comments, linked.shares], [1200, 88, 19, 7]);
  assert.deepEqual([linked.views_source, linked.likes_source, linked.comments_source, linked.shares_source], Array(4).fill('douyin_legacy_current'));

  await execute('UPDATE douyin_works SET play_count=1500,like_count=99 WHERE id=?', [workId]);
  const refreshed = (await (await fetch(`${base}/publishing`, { headers })).json()).data[0];
  assert.deepEqual([refreshed.views, refreshed.likes], [1500, 99], 'publishing reads current Douyin metrics');

  const protectedUpdateResponse = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT', headers, body: JSON.stringify({ platform: '被隐藏修改的平台' }),
  });
  assert.equal(protectedUpdateResponse.status, 409, 'linked Douyin fields must also be protected by the API');
  assert.equal((await queryOne<{ platform: string }>('SELECT platform FROM publishing WHERE id=?', [publishingId]))?.platform, '其他平台');

  const candidatesResponse = await fetch(`${base}/publishing/${publishingId}/douyin-candidates`, { headers });
  assert.equal(candidatesResponse.status, 200);
  assert.equal((await candidatesResponse.json()).candidates[0].linked_publishing_id, publishingId);
  const linkedDetail = await (await fetch(`${base}/publishing/${publishingId}`, { headers })).json();
  assert.equal(linkedDetail.douyin_work_id, workId, 'publishing detail exposes the authoritative current Douyin relation for read-only recovery');
  const oversizedQueryResponse = await fetch(`${base}/publishing/${publishingId}/douyin-candidates?query=${'a'.repeat(201)}`, { headers });
  assert.equal(oversizedQueryResponse.status, 400);
  assert.equal((await fetch(`${base}/publishing/${publishingId}/douyin-candidates`, { headers: restrictedHeaders })).status, 403);
  assert.equal((await fetch(`${base}/publishing/douyin/reconcile`, { method: 'POST', headers: restrictedHeaders })).status, 403);

  const unlinkResponse = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: null }),
  });
  assert.equal(unlinkResponse.status, 200);
  const unlinkHistory = await queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(unlinkHistory?.action, 'publishing_douyin_link_changed');
  assert.match(unlinkHistory?.comment || '', new RegExp(`发布记录 #${publishingId} 的抖音作品关联由「抖音作品 #${workId}」更正为「未关联」`));
  assert.equal(unlinkHistory?.operator_id, adminId);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'completed',
    'unlinking a relation does not roll back the Topic stage that was already completed');
  const unlinkHistoryCount = Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0);
  const repeatedUnlink = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: null }),
  });
  assert.equal(repeatedUnlink.status, 200);
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0), unlinkHistoryCount, 'repeating an unlink does not add history noise');
  const unlinkedDetail = await (await fetch(`${base}/publishing/${publishingId}`, { headers })).json();
  assert.equal(unlinkedDetail.douyin_work_id, null, 'publishing detail confirms an unlinked state without a write');
  const fallback = (await (await fetch(`${base}/publishing`, { headers })).json()).data[0];
  assert.equal(fallback.data_source, 'publishing');
  assert.equal(fallback.platform, '其他平台');
  assert.equal(fallback.status, 'pending');
  assert.deepEqual([fallback.views, fallback.likes, fallback.comments, fallback.shares], [3, 2, 4, 1]);

  const partialMetricResponse = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT', headers, body: JSON.stringify({ views: 7 }),
  });
  assert.equal(partialMetricResponse.status, 200);
  assert.deepEqual(
    await queryOne('SELECT views,likes,shares,comments FROM analytics WHERE topic_id=? AND data_date=? ORDER BY id DESC LIMIT 1', [topicId, '2026-01-01']),
    { views: 3, likes: 2, shares: 1, comments: 4 },
    'editing a publication must not mutate its legacy topic-grain source row',
  );
  const manualSupplement = (await (await fetch(`${base}/publishing`, { headers })).json()).data.find((row: { id: number }) => row.id === publishingId);
  assert.deepEqual([manualSupplement.views, manualSupplement.likes, manualSupplement.shares, manualSupplement.comments], [7, 2, 1, 4]);
  assert.deepEqual([manualSupplement.views_source, manualSupplement.likes_source, manualSupplement.shares_source, manualSupplement.comments_source], ['manual', 'legacy_analytics', 'legacy_analytics', 'legacy_analytics']);
  assert.equal(
    (await queryOne<{ views: number }>('SELECT views FROM analytics WHERE topic_id=? AND data_date=?', [topicId, '2025-12-31']))?.views,
    999,
    'updating the current publishing snapshot must not overwrite older analytics history',
  );

  const manualResponse = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: workId }),
  });
  assert.equal(manualResponse.status, 200);
  assert.equal((await queryOne<{ match_method: string }>('SELECT match_method FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]))?.match_method, 'manual');
  const manualLinkHistoryCount = Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0);
  assert.equal(manualLinkHistoryCount, 3, 'automatic link, unlink, and manual link each leave one durable event');
  const repeatedManualLink = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: workId }),
  });
  assert.equal(repeatedManualLink.status, 200);
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0), manualLinkHistoryCount, 'setting the same relation again does not add history noise');

  await execute(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'视频号','scheduled',?,?)`,
    [topicId, dateKeyBjt(), adminId],
  );
  const pagedPayload = await (await fetch(`${base}/publishing?limit=1`, { headers })).json();
  assert.equal(pagedPayload.data.length, 1);
  assert.equal(pagedPayload.total, 2);
  assert.deepEqual(
    pagedPayload.summary,
    { today: 1, pending: 1, published: 1, failed: 0 },
    'summary must cover the full visible dataset rather than only the current page',
  );

  const directorScopedRecords: Array<{ topicId: number; publishingId: number; workId: number }> = [];
  let directorOutOfScope: { topicId: number; publishingId: number; workId: number } | undefined;
  const scopeFixtures = [
    { title: '海雾里的第三盏灯塔', creatorId: directorId, assigneeId: adminId, operatorId: adminId },
    { title: '蓝莓电池回收周报', creatorId: adminId, assigneeId: directorId, operatorId: adminId },
    { title: '修复青砖拱桥的第七天', creatorId: adminId, assigneeId: adminId, operatorId: directorId },
    { title: '月球背面没有芦苇', creatorId: adminId, assigneeId: adminId, operatorId: adminId },
  ];
  for (const [index, scope] of scopeFixtures.entries()) {
    const scopedTopicId = await executeInsert(
      `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,'other',?,?,'publishing')`,
      [scope.title, 'scope test', scope.creatorId, scope.assigneeId],
    );
    const scopedPublishingId = await executeInsert(
      `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'其他平台','pending','2026-01-01',?)`,
      [scopedTopicId, scope.operatorId],
    );
    const scopedWorkId = await executeInsert(
      `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
       VALUES(?,?,?,?,1200,88,19,7)`,
      [accountId, `director-scope-${index}`, scope.title, '2026-09-10T02:00:00.000Z'],
    );
    const record = { topicId: scopedTopicId, publishingId: scopedPublishingId, workId: scopedWorkId };
    if (index < 3) directorScopedRecords.push(record);
    else directorOutOfScope = record;
  }

  const scopedResponse = await fetch(`${base}/publishing/douyin/reconcile`, { method: 'POST', headers: directorHeaders });
  assert.equal(scopedResponse.status, 200, 'a director with both required permissions can run reconciliation within edit scope');
  const scopedPayload = await scopedResponse.json();
  assert.equal(scopedPayload.reviewed, directorScopedRecords.length, 'summary only counts publishing rows in the caller edit scope');
  assert.equal(scopedPayload.linked, directorScopedRecords.length, `creator, responsible person, and publishing participant records remain eligible: ${JSON.stringify(scopedPayload)}`);
  assert.equal(scopedPayload.ambiguous, 0);
  assert.equal(scopedPayload.unmatched, 0, 'summary does not expose out-of-scope rows as unmatched');
  assert.equal('topicIds' in scopedPayload, false, 'response does not expose linked topic identifiers');
  for (const record of directorScopedRecords) {
    assert.deepEqual(
      await queryOne('SELECT publishing_id,douyin_work_id,match_method FROM publishing_douyin_links WHERE publishing_id=?', [record.publishingId]),
      { publishing_id: record.publishingId, douyin_work_id: record.workId, match_method: 'exact' },
    );
  }
  assert(directorOutOfScope);
  assert.equal(await queryOne('SELECT publishing_id FROM publishing_douyin_links WHERE publishing_id=?', [directorOutOfScope.publishingId]), null,
    'director cannot create a relation for an unrelated row in another editor scope');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [directorOutOfScope.topicId]))?.status, 'publishing',
    'out-of-scope topic state is not advanced as a side effect');

  const automaticSyncFixtures = [
    { title: '自动同步不得关联无权编辑稿件', uid: 'auto-sync-scope-legacy-uid', workId: 'auto-sync-scope-legacy-work', contract: false },
    { title: '标准协议同步也不得越权关联', uid: 'auto-sync-scope-contract-uid', workId: 'auto-sync-scope-contract-work', contract: true },
  ];
  for (const [index, fixture] of automaticSyncFixtures.entries()) {
    const outOfScopeTopicId = await executeInsert(
      `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,'other',?,?,'publishing')`,
      [fixture.title, 'automatic sync scope test', adminId, adminId],
    );
    const outOfScopePublishingId = await executeInsert(
      `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'其他平台','pending','2026-01-01',?)`,
      [outOfScopeTopicId, adminId],
    );
    const agent = { id: 900 + index, user_id: directorId, platform: 'douyin', account_id: fixture.uid };
    if (fixture.contract) {
      await persistDouyinContractV2102(agent, {
        account: { douyin_uid: fixture.uid, nickname: `Contract Sync ${index}` },
        snapshot_id: `scope-snapshot-${index}`,
        collection_mode: 'full_snapshot',
        works: [{
          aweme_id: fixture.workId,
          title: fixture.title,
          cover_url: '',
          publish_time: '2026-09-10T02:00:00.000Z',
          video_url: '',
          metrics: { play_count: 1200, like_count: 88, comment_count: 19, share_count: 7 },
        }],
      }, '2026-09-10T03:00:00.000Z', `scope-task-${index}`);
    } else {
      await persistNormalizedDouyinSync(agent, {
        account: { douyin_uid: fixture.uid, nickname: `Legacy Sync ${index}` },
        contents: [{
          aweme_id: fixture.workId,
          title: fixture.title,
          publish_time: '2026-09-10T02:00:00.000Z',
          statistics: { play_count: 1200, digg_count: 88, comment_count: 19, share_count: 7 },
        }],
      }, '2026-09-10T03:00:00.000Z', `scope-task-${index}`);
    }
    assert.equal(await queryOne('SELECT publishing_id FROM publishing_douyin_links WHERE publishing_id=?', [outOfScopePublishingId]), null,
      `${fixture.contract ? 'contract' : 'legacy'} automatic account sync respects per-record edit scope`);
    assert.equal((await queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [outOfScopeTopicId]))?.status, 'publishing',
      'automatic sync does not advance an out-of-scope topic');
  }

  const globalReconcileResponse = await fetch(`${base}/publishing/douyin/reconcile`, { method: 'POST', headers });
  assert.equal(globalReconcileResponse.status, 200);
  const globalReconcilePayload = await globalReconcileResponse.json();
  assert.equal(globalReconcilePayload.reviewed, 4, 'global editor reviews every remaining record, including an unmatched record');
  assert.equal(globalReconcilePayload.linked, 3, 'admin retains full batch reconciliation for records outside another user\'s edit scope');
  assert.equal(globalReconcilePayload.unmatched, 1);
  assert.deepEqual(
    await queryOne('SELECT publishing_id,douyin_work_id,match_method FROM publishing_douyin_links WHERE publishing_id=?', [directorOutOfScope.publishingId]),
    { publishing_id: directorOutOfScope.publishingId, douyin_work_id: directorOutOfScope.workId, match_method: 'exact' },
  );

  const syncedTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,'sync history test','other',?,?,'publishing')`,
    ['同步自动关联操作者留痕', directorId, directorId],
  );
  const syncedPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'其他平台','pending','2026-01-01',?)`,
    [syncedTopicId, directorId],
  );
  const syncedWorkId = await executeInsert(
    `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
     VALUES(?,'work-sync-history','同步自动关联操作者留痕','2026-09-12T02:00:00.000Z',1200,88,19,7)`,
    [accountId],
  );
  const syncLinkResult = await reconcilePublishingDouyinLinks({ accountId, scope: 'editable', editableBy: directorId });
  assert.equal(syncLinkResult.linked, 1, 'sync reconciliation links only the scoped fixture');
  const syncLinkHistory = await queryOne<{ comment: string; operator_id: number }>(
    `SELECT comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed' ORDER BY id DESC LIMIT 1`,
    [syncedTopicId],
  );
  assert.match(syncLinkHistory?.comment || '', new RegExp(`发布记录 #${syncedPublishingId} 的抖音作品关联由「未关联」更正为「抖音作品 #${syncedWorkId}」`));
  assert.equal(syncLinkHistory?.operator_id, directorId, 'automatic sync uses the known editing user when createdBy is absent');
  const syncHistoryCount = Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [syncedTopicId],
  ))?.count || 0);
  assert.equal((await reconcilePublishingDouyinLinks({ accountId, scope: 'editable', editableBy: directorId })).linked, 0,
    'retrying automatic reconciliation does not change an already-linked relation');
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [syncedTopicId],
  ))?.count || 0), syncHistoryCount, 'repeating automatic reconciliation does not add history noise');

  const replacementWorkId = await executeInsert(
    `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
     VALUES(?,'work-east-lake-replacement','东平湖｜另一个剪辑版本','2026-09-11T02:00:00.000Z',1400,90,20,8)`,
    [accountId],
  );
  const replaceResponse = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: replacementWorkId }),
  });
  assert.equal(replaceResponse.status, 200);
  assert.deepEqual(
    await queryOne('SELECT publishing_id,douyin_work_id FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]),
    { publishing_id: publishingId, douyin_work_id: replacementWorkId },
  );
  const replacementHistory = await queryOne<{ comment: string; operator_id: number }>(
    `SELECT comment,operator_id FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.match(replacementHistory?.comment || '', new RegExp(`发布记录 #${publishingId} 的抖音作品关联由「抖音作品 #${workId}」更正为「抖音作品 #${replacementWorkId}」`));
  assert.equal(replacementHistory?.operator_id, adminId);
  const relationActivity = await queryOne<{ action: string; target: string; detail: string; user_id: number }>(
    `SELECT action,target,detail,user_id FROM activity_log WHERE target='publishing' AND user_id=? AND detail LIKE ? ORDER BY id DESC LIMIT 1`,
    [adminId, `%发布记录 #${publishingId} 的抖音作品关联由「抖音作品 #${workId}」更正为「抖音作品 #${replacementWorkId}」%`],
  );
  assert.equal(relationActivity?.action, 'update', 'changing a Douyin relation is logged as an update, not a status change');
  assert.equal(relationActivity?.target, 'publishing');
  assert.equal(relationActivity?.user_id, adminId);
  assert.match(relationActivity?.detail || '', /抖音作品 #\d+.*更正为.*抖音作品 #\d+/);

  const historyCountBeforeFailure = Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0);
  await execute(`CREATE TRIGGER fail_publishing_link_activity BEFORE INSERT ON activity_log
    WHEN NEW.target='publishing' AND NEW.detail LIKE '%发布记录 #${publishingId} 的抖音作品关联%'
    BEGIN SELECT RAISE(ABORT, 'simulated publishing link activity failure'); END`);
  const failedUnlink = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: null }),
  });
  assert.equal(failedUnlink.status, 500, 'a failed activity-history write fails the association update');
  assert.deepEqual(
    await queryOne('SELECT publishing_id,douyin_work_id FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]),
    { publishing_id: publishingId, douyin_work_id: replacementWorkId },
    'link deletion rolls back when durable history cannot be recorded',
  );
  assert.equal(Number((await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='publishing_douyin_link_changed'`,
    [topicId],
  ))?.count || 0), historyCountBeforeFailure, 'the earlier topic-history insert also rolls back with the failed activity row');
  await execute('DROP TRIGGER fail_publishing_link_activity');

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('publishing Douyin linkage tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
