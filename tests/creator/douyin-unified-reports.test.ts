import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-douyin-reports-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'reports.db');
process.env.NODE_ENV = 'test';

const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { creatorAnalyticsService } = await import('../../api/services/creatorAnalytics.js');
const { getDouyinDashboard } = await import('../../api/services/douyinDataCenter.js');

try {
  await initDatabase();
  const ownerId = Number((await queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1'))?.id);
  assert(ownerId > 0, 'test database must contain a seeded user');

  const creatorAccountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', 'unified-report-account', '统一报告账号')`,
    [ownerId],
  );
  const otherAccountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', 'other-report-account', '其他账号')`,
    [ownerId],
  );
  const douyinAccountId = await executeInsert(
    `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,fans_count,fans_count_available,last_sync_time)
     VALUES('统一报告账号','', 'unified-report-account',?,130,1,'2026-09-15T08:00:00.000Z')`,
    [creatorAccountId],
  );

  await execute(
    `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count,collect_count)
     VALUES(?, 'work-a', '作品 A', '2026-09-12T08:00:00.000Z', 600, 60, 6, 3, 2),
           (?, 'work-b', '作品 B', '2026-09-14T08:00:00.000Z', 900, 90, 9, 4, 3)`,
    [douyinAccountId, douyinAccountId],
  );
  await execute(
    `INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,fans_count_available,works_count,play_count,like_count,comment_count,share_count)
     VALUES(?, '2026-09-01', 100, 1, 1, 1000, 100, 10, 5),
           (?, '2026-09-09', 100, 1, 1, 1000, 100, 10, 5),
           (?, '2026-09-15', 130, 1, 2, 2000, 180, 20, 10),
           (?, '2026-09-16', 0, 0, 2, 2100, 190, 21, 11)`,
    [douyinAccountId, douyinAccountId, douyinAccountId, douyinAccountId],
  );

  // Deliberately insert stale legacy zeros: reports must ignore this old silo.
  await execute(
    `INSERT INTO creator_account_metrics(account_id,snapshot_time,fans_count,play_count,interaction_count,growth_json,raw_json)
     VALUES(?, '2026-09-15T08:00:00.000Z', 0, 0, 0, '{}', '{}')`,
    [creatorAccountId],
  );
  for (const [sourceKey, date, values] of [
    ['official-a', '2026-09-12', { views: 650, likes: 65, comments: 7, shares: 4, favorites: 3 }],
    ['official-b', '2026-09-14', { views: 950, likes: 95, comments: 10, shares: 5, favorites: 4 }],
  ] as const) {
    for (const [metric, value] of Object.entries(values)) await execute(
      `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [creatorAccountId, sourceKey, date, metric, String(value), value, 'count', 'official_export', 'a'.repeat(64), 'douyin-export-v2', '2026-09-16T08:00:00.000Z'],
    );
  }
  await execute(
    `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [creatorAccountId, 'no-longer-in-latest-export', '2026-09-01', 'views', '999999', 999999, 'count', 'official_export', 'b'.repeat(64), 'douyin-export-v1', '2026-09-15T08:00:00.000Z'],
  );
  await execute(
    `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [creatorAccountId, 'official-zero-view-work', '2026-09-14', 'likes', '0', 0, 'count', 'official_export', 'a'.repeat(64), 'douyin-export-v2', '2026-09-16T08:00:00.000Z'],
  );

  const dashboard = await getDouyinDashboard(creatorAccountId);
  assert(dashboard);
  assert.equal(dashboard.metrics.play_count, 1600, 'dashboard must prefer the latest official Creator Center export');
  assert.equal(dashboard.metrics.works_count, 3, 'official works without a views metric row must still count as works');
  assert.equal(dashboard.metrics.interaction_count, 193, 'official likes, comments, shares and favorites must use one source');
  assert.equal(dashboard.data_source, 'douyin_official_export');
  assert.equal(dashboard.metrics.fans_count, 130, 'dashboard must retain the last real fans value when a later snapshot omits that field');
  assert.equal(dashboard.growth_7d?.fans, 30);

  const report = await creatorAnalyticsService.generateReport(creatorAccountId, 'weekly');
  assert.equal(report.report_version, 2);
  assert.equal(report.account_performance.current.play_count, 1600, 'reports must use the same official total as the dashboard');
  assert.equal(report.account_performance.current.fans_count, 130, 'a newer snapshot without fans must not hide the last real unified account value');
  assert.equal(report.growth.plays, 1100, 'period growth must be the latest snapshot minus the boundary snapshot');
  assert.equal(report.growth.fans, 30);
  assert.equal(report.work_performance.total, 3);
  assert.equal(report.data_coverage.source, 'douyin_official_export');
  assert(report.excellent_works.every((work) => work.level === 'viral' || work.level === 'excellent'));
  assert(report.low_efficiency_works.every((work) => work.level === 'low'));
  assert.equal(new Set([...report.excellent_works, ...report.low_efficiency_works].map((work) => work.id)).size, report.excellent_works.length + report.low_efficiency_works.length, 'excellent and low-efficiency lists must not overlap');

  await assert.rejects(
    creatorAnalyticsService.deleteReport(otherAccountId, Number(report.id)),
    /不在当前账号范围内/,
    'a report must not be deleted through another account scope',
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_reports WHERE id=?', [report.id]))?.count), 1);

  await creatorAnalyticsService.deleteReport(creatorAccountId, Number(report.id));
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_reports WHERE id=?', [report.id]))?.count), 0);

  console.log('Unified Douyin report tests passed: current totals, snapshot deltas, fans, stale-silo isolation, scoped deletion.');
} finally {
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best-effort temporary test cleanup */ }
}
