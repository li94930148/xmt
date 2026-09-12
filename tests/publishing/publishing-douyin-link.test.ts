import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-publishing-douyin-link-'));
process.env.XMT_DB_PATH = path.join(directory, 'publishing-douyin.db');
process.env.JWT_SECRET = 'publishing-douyin-link-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: workflowRoutes } = await import('../../api/routes/workflow.js');
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
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-link-admin', 'unused', 'publishing-link@example.invalid', 'admin', 'Publishing Link Admin'],
);
const restrictedUserId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['publishing-link-restricted', 'unused', 'publishing-link-restricted@example.invalid', 'member', 'Restricted User'],
);
const topicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'publishing')`,
  ['东平湖', 'test', 'other', adminId, adminId],
);
const publishingId = await executeInsert(
  `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'其他平台','pending',NULL,?)`,
  [topicId, adminId],
);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,3,2,1,4,'2026-01-01')`, [topicId]);
const accountId = await executeInsert(
  `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,user_id,last_sync_time) VALUES('测试账号','https://example.invalid/douyin','test-publishing-link',?,?)`,
  [adminId, '2026-09-12 10:00:00'],
);
const workId = await executeInsert(
  `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
   VALUES(?,'work-east-lake','东平湖｜秋日航拍 #山东','2026-09-10T02:00:00.000Z',1200,88,19,7)`,
  [accountId],
);

const reconciliation = await reconcilePublishingDouyinLinks({ createdBy: adminId });
assert.equal(reconciliation.linked, 1);
assert.deepEqual(
  await queryOne('SELECT publishing_id,douyin_work_id,match_method FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]),
  { publishing_id: publishingId, douyin_work_id: workId, match_method: 'exact' },
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

try {
  const listResponse = await fetch(`${base}/publishing`, { headers });
  assert.equal(listResponse.status, 200);
  const linked = (await listResponse.json()).data[0];
  assert.equal(linked.data_source, 'douyin');
  assert.equal(linked.platform, '抖音');
  assert.equal(linked.status, 'published');
  assert.equal(linked.publish_time, '2026-09-10T02:00:00.000Z');
  assert.deepEqual([linked.views, linked.likes, linked.comments, linked.shares], [1200, 88, 19, 7]);

  await execute('UPDATE douyin_works SET play_count=1500,like_count=99 WHERE id=?', [workId]);
  const refreshed = (await (await fetch(`${base}/publishing`, { headers })).json()).data[0];
  assert.deepEqual([refreshed.views, refreshed.likes], [1500, 99], 'publishing reads current Douyin metrics');

  const candidatesResponse = await fetch(`${base}/publishing/${publishingId}/douyin-candidates`, { headers });
  assert.equal(candidatesResponse.status, 200);
  assert.equal((await candidatesResponse.json()).candidates[0].linked_publishing_id, publishingId);
  const oversizedQueryResponse = await fetch(`${base}/publishing/${publishingId}/douyin-candidates?query=${'a'.repeat(201)}`, { headers });
  assert.equal(oversizedQueryResponse.status, 400);
  assert.equal((await fetch(`${base}/publishing/${publishingId}/douyin-candidates`, { headers: restrictedHeaders })).status, 403);
  assert.equal((await fetch(`${base}/publishing/douyin/reconcile`, { method: 'POST', headers: restrictedHeaders })).status, 403);

  const unlinkResponse = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: null }),
  });
  assert.equal(unlinkResponse.status, 200);
  const fallback = (await (await fetch(`${base}/publishing`, { headers })).json()).data[0];
  assert.equal(fallback.data_source, 'publishing');
  assert.equal(fallback.platform, '其他平台');
  assert.equal(fallback.status, 'pending');
  assert.deepEqual([fallback.views, fallback.likes, fallback.comments, fallback.shares], [3, 2, 4, 1]);

  const manualResponse = await fetch(`${base}/publishing/${publishingId}/douyin-link`, {
    method: 'PUT', headers, body: JSON.stringify({ douyin_work_id: workId }),
  });
  assert.equal(manualResponse.status, 200);
  assert.equal((await queryOne<{ match_method: string }>('SELECT match_method FROM publishing_douyin_links WHERE publishing_id=?', [publishingId]))?.match_method, 'manual');

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('publishing Douyin linkage tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
