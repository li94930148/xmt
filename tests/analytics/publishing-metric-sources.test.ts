import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-publishing-metric-sources-'));
process.env.XMT_DB_PATH = path.join(directory, 'publishing-metric-sources.db');
process.env.JWT_SECRET = 'publishing-metric-sources-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { beijingToday, execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: analyticsRoutes } = await import('../../api/routes/analytics.js');
const { default: exportRoutes } = await import('../../api/routes/export.js');
const { default: resourcesRoutes } = await import('../../api/routes/resources.js');
const { getLegacyAnalyticsInventory, getPublishingMetricFacts, sumPublishingMetricFacts } = await import('../../api/services/publishingMetrics.js');
const { createRetrospective, generateRetrospectiveSnapshot } = await import('../../api/services/retrospectives.js');
const { syncPublishedArchive } = await import('../../api/services/publishedArchive.js');

await initDatabase();
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['metric-source-admin', 'unused', 'metric-source-admin@example.invalid', 'admin', 'Metric Source Admin'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
const topicId = await executeInsert(
  `INSERT INTO topics(title,creator_id,assignee_id,status) VALUES(?,?,?,'publishing')`,
  ['指标来源测试选题', adminId, adminId],
);
const publishingId = await executeInsert(
  `INSERT INTO publishing(topic_id,status,publish_time,operator_id,manual_views,manual_likes) VALUES(?,'published','2026-09-10',?,700,12)`,
  [topicId, adminId],
);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,3,2,1,4,'2026-09-10')`, [topicId]);
const accountId = await executeInsert(
  `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,user_id,last_sync_time) VALUES('来源账号','https://example.invalid','metric-source-account',?,?)`,
  [adminId, '2026-09-11'],
);
const workId = await executeInsert(
  `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count) VALUES(?,'metric-source-work','指标来源测试选题','2026-09-10',900,90,90,90)`,
  [accountId],
);
await execute(
  `INSERT INTO publishing_douyin_links(publishing_id,douyin_work_id,match_method,match_score,created_by) VALUES(?,?,'manual',1,?)`,
  [publishingId, workId, adminId],
);
await execute(
  `INSERT INTO douyin_work_snapshots(work_id,snapshot_time,play_count,like_count,comment_count,share_count,source_type,has_play_count,has_like_count,has_comment_count,has_share_count)
   VALUES(?,? ,400,15,6,3,'douyin_creator_collection',1,1,1,1)`,
  [workId, '2026-09-11T08:00:00.000Z'],
);
await execute(
  `INSERT INTO douyin_work_snapshots(work_id,snapshot_time,play_count,like_count,comment_count,share_count,source_type,source_file_sha256,has_play_count,has_like_count,has_comment_count,has_share_count)
   VALUES(?,? ,500,90,90,0,'douyin_official_export',?,1,0,0,1)`,
  [workId, '2026-09-12T08:00:00.000Z', 'a'.repeat(64)],
);

const facts = await getPublishingMetricFacts({ startDate: '2026-09-01', endDate: '2026-09-30', publishedOnly: true });
assert.equal(facts.length, 1);
assert.deepEqual([facts[0].views, facts[0].likes, facts[0].shares, facts[0].comments], [500, 12, 0, 6]);
assert.deepEqual(
  [facts[0].views_source, facts[0].likes_source, facts[0].shares_source, facts[0].comments_source],
  ['douyin_official_export', 'manual', 'douyin_official_export', 'douyin_creator_collection'],
  'official fields win, manual values fill missing fields, and an explicitly observed zero remains authoritative',
);
assert.equal(facts[0].official_source_file_sha256, 'a'.repeat(64));

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/resources', resourcesRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/analytics`;
const headers = { Authorization: `Bearer ${signToken({ userId: adminId })}`, 'Content-Type': 'application/json' };

try {
  const monthlyResponse = await fetch(`${base}/monthly?year=2026&month=9`, { headers });
  assert.equal(monthlyResponse.status, 200);
  const monthly = await monthlyResponse.json();
  assert.deepEqual(
    [monthly.total_views, monthly.total_likes, monthly.total_shares, monthly.total_comments, monthly.topic_count, monthly.publication_count],
    [500, 12, 0, 6, 1, 1],
  );

  const supplementResponse = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ publishing_id: publishingId, likes: 20 }),
  });
  assert.equal(supplementResponse.status, 200);
  const refreshed = await getPublishingMetricFacts({ topicId });
  assert.deepEqual([refreshed[0].views, refreshed[0].likes, refreshed[0].likes_source], [500, 20, 'manual']);
  assert.deepEqual(sumPublishingMetricFacts(refreshed).sourceCounts, {
    douyin_official_export: 2,
    manual: 1,
    douyin_creator_collection: 1,
    douyin_legacy_current: 0,
    legacy_analytics: 0,
    unavailable: 0,
  });

  const archive = await syncPublishedArchive(topicId, adminId);
  assert.equal(archive.action, 'created');
  const archiveRow = await queryOne<{ content: string }>('SELECT content FROM resources WHERE id=?', [archive.resourceId]);
  const archivePayload = JSON.parse(String(archiveRow?.content || '{}')) as { analytics?: Record<string, unknown> };
  assert.deepEqual(archivePayload.analytics, {
    data_date: '2026-09-10', views: 500, likes: 20, shares: 0, comments: 6,
    sources: {
      views: 'douyin_official_export', likes: 'manual', shares: 'douyin_official_export', comments: 'douyin_creator_collection',
    },
  }, 'published archive carries effective publication-level values and their source, not a topic-wide analytics row');

  const admin = { id: adminId, role: 'admin', enabled: true } as never;
  const retrospective = await createRetrospective(admin, {
    title: '指标来源复盘测试', periodStart: '2026-09-01', periodEnd: '2026-09-30', scopeType: 'team', ownerId: adminId,
  } as never);
  const retroId = Number(retrospective.retrospective.id);
  const snapshotResult = await generateRetrospectiveSnapshot(admin, retroId, {} as never);
  const publishedViews = snapshotResult.snapshots.find((snapshot: { metricKey: string }) => snapshot.metricKey === 'published_views');
  assert.equal(publishedViews?.valueNum, 500);
  assert.equal((publishedViews?.sourceRefJson as Record<string, unknown>)?.table, 'publishing_metric_facts');
  assert.deepEqual(
    (publishedViews?.sourceRefJson as Record<string, unknown>)?.metricSources,
    { douyin_official_export: 1 },
    'retrospective snapshot freezes publication-grain source provenance for the selected period',
  );

  const reportEnd = beijingToday();
  const reportDaysSinceSunday = new Date(`${reportEnd}T08:00:00+08:00`).getUTCDay();
  const reportStart = new Date(Date.parse(`${reportEnd}T08:00:00+08:00`) - reportDaysSinceSunday * 86_400_000).toISOString().slice(0, 10);
  await executeInsert(
    `INSERT INTO publishing(topic_id,status,publish_time,operator_id,manual_views) VALUES(?,'published',?,?,77)`,
    [topicId, reportEnd, adminId],
  );
  const linkedPendingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'other','pending',?,?)`,
    [topicId, reportEnd, adminId],
  );
  const linkedPendingWorkId = await executeInsert(
    `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count)
     VALUES(?,'metric-source-linked-pending','linked pending publication',?,88,9,4,2)`,
    [accountId, reportEnd],
  );
  await execute(
    `INSERT INTO publishing_douyin_links(publishing_id,douyin_work_id,match_method,match_score,created_by) VALUES(?,?,'manual',1,?)`,
    [linkedPendingId, linkedPendingWorkId, adminId],
  );
  const weeklyResponse = await fetch('http://127.0.0.1:' + address.port + '/api/export/weekly-report', { headers });
  assert.equal(weeklyResponse.status, 200);
  const weekly = await weeklyResponse.json() as {
    period: { start: string; end: string };
    summary: { publishedVideos: number; totalViews: number; metricSourceCounts: Record<string, number> };
    details: { publishedVideos: Array<{ id: number; platform: string; publish_time: string }> };
  };
  assert.deepEqual(weekly.period, { start: reportStart, end: reportEnd });
  assert.deepEqual([weekly.summary.publishedVideos, weekly.summary.totalViews, weekly.summary.metricSourceCounts.manual], [2, 165, 1],
    'weekly details and metric totals include each effective published publication, including a linked Douyin work');
  assert.deepEqual(
    weekly.details.publishedVideos.find((video) => video.id === linkedPendingId),
    { id: linkedPendingId, topic_title: '指标来源测试选题', platform: 'douyin', publish_time: reportEnd },
    'weekly publication detail exposes the same effective platform and time used by metric facts',
  );

  const secondPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id) VALUES(?,'weixin','published','2026-09-10',?)`,
    [topicId, adminId],
  );
  const ambiguousFacts = await getPublishingMetricFacts({ topicId });
  const secondFact = ambiguousFacts.find((fact) => fact.id === secondPublishingId);
  assert(secondFact);
  assert.deepEqual([secondFact.views, secondFact.likes_source], [0, 'unavailable'], 'ambiguous topic-day history must not be copied to either publication');
  assert.deepEqual(await getLegacyAnalyticsInventory('2026-09-01', '2026-09-30'), { unlinked_count: 0, ambiguous_count: 1 });

  await syncPublishedArchive(topicId, adminId);
  const multiArchiveRow = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  const multiArchive = JSON.parse(String(multiArchiveRow?.content || '{}')) as {
    published_records?: Array<{ publishing_id: number; platform: string; status: string; analytics?: { views: number } }>;
  };
  assert.equal(multiArchive.published_records?.length, 4, 'topic archive retains every published publication instead of replacing siblings with only the newest one');
  assert.equal(new Set(multiArchive.published_records?.map((record) => record.publishing_id)).size, 4, 'archive contains each publishing_id once');
  const archivedLinkedPending = multiArchive.published_records?.find((record) => record.publishing_id === linkedPendingId);
  assert(archivedLinkedPending);
  assert.deepEqual(
    [archivedLinkedPending.publishing_id, archivedLinkedPending.platform, archivedLinkedPending.status, archivedLinkedPending.analytics?.views],
    [linkedPendingId, 'douyin', 'published', 88],
    'archive uses the linked record ID and its own metrics, not a topic-level legacy total',
  );
  const archiveListResponse = await fetch(`http://127.0.0.1:${address.port}/api/resources/archives`, { headers });
  assert.equal(archiveListResponse.status, 200);
  const archiveList = await archiveListResponse.json() as { data: Array<{ file_path: string; publishedRecordCount: number; publishedPlatforms: string[] }> };
  const archiveSummary = archiveList.data.find((item) => item.file_path === `archive/topic-${topicId}`);
  assert.equal(archiveSummary?.publishedRecordCount, 4,
    'archive list communicates how many publication-grain records its topic snapshot contains');
  assert.deepEqual(new Set(archiveSummary?.publishedPlatforms), new Set(['douyin', 'weixin']),
    'archive list identifies every platform represented by the snapshot without duplicates');
  const archiveId = await queryOne<{ id: number }>('SELECT id FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(archiveId);
  const archiveDetailResponse = await fetch(`http://127.0.0.1:${address.port}/api/resources/archives/${archiveId.id}`, { headers });
  assert.equal(archiveDetailResponse.status, 200);
  const archiveDetail = await archiveDetailResponse.json() as { archive?: { published_records?: Array<{ publishing_id: number }> } };
  assert.equal(archiveDetail.archive?.published_records?.length, 4, 'archive detail exposes the complete per-publication snapshot');

  const memberId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    ['metric-source-member', 'unused', 'metric-source-member@example.invalid', 'editor', 'Metric Source Member'],
  );
  const memberOwnedArchiveId = await executeInsert(
    `INSERT INTO resources(name,type,file_path,category,content,uploader_id) VALUES(?,?,?,?,?,?)`,
    ['成员自己的旧归档', 'archive', 'archive/member-owned', '已完成', JSON.stringify({ publishing: { platform: 'douyin', status: 'published' } }), memberId],
  );
  const memberHeaders = { Authorization: `Bearer ${signToken({ userId: memberId })}` };
  const memberArchiveListResponse = await fetch(`http://127.0.0.1:${address.port}/api/resources/archives`, { headers: memberHeaders });
  assert.equal(memberArchiveListResponse.status, 200);
  const memberArchiveList = await memberArchiveListResponse.json() as { data: Array<{ id: number }> };
  assert.deepEqual(memberArchiveList.data.map((item) => item.id), [memberOwnedArchiveId], 'non-privileged archive lists remain limited to the uploader own snapshots');
  const forbiddenArchiveResponse = await fetch(`http://127.0.0.1:${address.port}/api/resources/archives/${archiveId.id}`, { headers: memberHeaders });
  assert.equal(forbiddenArchiveResponse.status, 403, 'non-owners cannot inspect another uploader snapshot');
  const ownArchiveResponse = await fetch(`http://127.0.0.1:${address.port}/api/resources/archives/${memberOwnedArchiveId}`, { headers: memberHeaders });
  assert.equal(ownArchiveResponse.status, 200, 'an uploader can still inspect their own legacy archive');

  const invalidLegacyWrite = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify({ topic_id: topicId, data_date: '2026-09-10', views: 99 }),
  });
  assert.equal(invalidLegacyWrite.status, 400, 'topic/day entry no longer accepts writes');
  console.log('publishing metric source precedence and monthly aggregation tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
