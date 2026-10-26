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
  const reportBoundaryWorks = [
    ['before-yesterday', '昨天前一日', '2026-09-15T23:59:59+08:00'],
    ['yesterday-start', '昨天起点', '2026-09-16T00:00:00+08:00'],
    ['yesterday-end', '昨天终点', '2026-09-16T23:59:59+08:00'],
    ['after-yesterday', '昨天之后', '2026-09-17T00:00:00+08:00'],
    ['before-week', '近七天前一日', '2026-09-10T23:59:59+08:00'],
    ['week-start', '近七天起点', '2026-09-11T00:00:00+08:00'],
    ['week-end', '近七天终点', '2026-09-17T23:59:59+08:00'],
    ['after-week', '近七天之后', '2026-09-18T00:00:00+08:00'],
    ['before-month', '近三十天前一日', '2026-08-18T23:59:59+08:00'],
    ['month-start', '近三十天起点', '2026-08-19T00:00:00+08:00'],
  ] as const;
  for (const [id, title, publishTime] of reportBoundaryWorks) await execute(
    `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count,collect_count)
     VALUES(?,?,?,?,0,0,0,0,0)`,
    [douyinAccountId, `boundary-${id}`, title, publishTime],
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
  const officialDates = (endDate: string, count: number) => Array.from({ length: count }, (_, index) => {
    const [year, month, day] = endDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + index - count + 1)).toISOString().slice(0, 10);
  });
  const dailyMetricRows = [
    ...officialDates('2026-09-16', 1).map(date => [date, 'yesterday'] as const),
    ...officialDates('2026-09-17', 7).map(date => [date, '7d'] as const),
    ...officialDates('2026-09-17', 30).map(date => [date, '30d'] as const),
  ];
  for (const [date, period] of dailyMetricRows) {
    const values = date === '2026-09-15'
      ? { posts: 1, views: 100, likes: 10, comments: -2, shares: 3 }
      : date === '2026-09-16'
        ? { posts: 0, views: 200, likes: 20, comments: 4, shares: 5 }
        : { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 };
    for (const [metric, value] of Object.entries(values)) await execute(
      `INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [creatorAccountId, date, period, metric, String(value), value, 'count', period === 'yesterday' ? 'd'.repeat(64) : period === '7d' ? 'c'.repeat(64) : 'e'.repeat(64), 'douyin-export-v3', '2026-09-17T08:00:00.000Z'],
    );
  }

  const dashboard = await getDouyinDashboard(creatorAccountId);
  assert(dashboard);
  assert.equal(dashboard.metrics.play_count, 1600, 'dashboard must prefer the latest official Creator Center export');
  assert.equal(dashboard.metrics.works_count, 3, 'official works without a views metric row must still count as works');
  assert.equal(dashboard.metrics.interaction_count, 193, 'official likes, comments, shares and favorites must use one source');
  assert.equal(dashboard.data_source, 'douyin_official_export');
  assert.equal(dashboard.metrics.fans_count, 130, 'dashboard must retain the last real fans value when a later snapshot omits that field');
  assert.equal(dashboard.growth_7d?.fans, 30);
  assert.equal(dashboard.growth_7d?.plays, 300, '7-day official daily flows must be summed without snapshot differencing');
  assert.equal(dashboard.growth_7d?.interactions, 40, 'official daily interactions must preserve signed platform corrections');

  const report = await creatorAnalyticsService.generateReport(creatorAccountId, 'weekly');
  assert.equal(report.report_version, 2);
  assert.equal(report.account_performance.current.play_count, 1600, 'reports must use the same official total as the dashboard');
  assert.equal(report.account_performance.current.fans_count, 130, 'a newer snapshot without fans must not hide the last real unified account value');
  assert.equal(report.growth.plays, 300, 'reports must use the exact 7-day official file');
  assert.equal(report.growth.fans, 30);
  assert.equal(report.growth.interactions, 40);
  assert.equal(report.work_performance.total, 3);
  assert.equal(report.work_performance.published, 8, 'weekly published works must use the inclusive Beijing-date window from Sep 11 through Sep 17');
  assert.equal(report.data_coverage.period_start, '2026-09-11');
  assert.equal(report.data_coverage.period_end, '2026-09-17');
  assert.equal(report.data_coverage.source, 'douyin_official_export');
  assert(!report.data_coverage.missing_fields.includes('period_play_growth'));
  assert(report.excellent_works.every((work) => work.level === 'viral' || work.level === 'excellent'));
  assert(report.low_efficiency_works.every((work) => work.level === 'low'));
  assert.equal(new Set([...report.excellent_works, ...report.low_efficiency_works].map((work) => work.id)).size, report.excellent_works.length + report.low_efficiency_works.length, 'excellent and low-efficiency lists must not overlap');

  const dailyReport = await creatorAnalyticsService.generateReport(creatorAccountId, 'daily');
  assert.equal(dailyReport.work_performance.published, 2, 'daily published works must use yesterday only, with both Beijing-midnight endpoints included');
  assert.equal(dailyReport.data_coverage.period_start, '2026-09-16');
  assert.equal(dailyReport.data_coverage.period_end, '2026-09-16');

  const monthlyReport = await creatorAnalyticsService.generateReport(creatorAccountId, 'monthly');
  assert.equal(monthlyReport.work_performance.published, 10, 'monthly published works must use the inclusive Beijing-date window from Aug 19 through Sep 17');
  assert.equal(monthlyReport.data_coverage.period_start, '2026-08-19');
  assert.equal(monthlyReport.data_coverage.period_end, '2026-09-17');

  await assert.rejects(
    creatorAnalyticsService.deleteReport(otherAccountId, Number(report.id)),
    /不在当前账号范围内/,
    'a report must not be deleted through another account scope',
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_reports WHERE id=?', [report.id]))?.count), 1);

  await creatorAnalyticsService.deleteReport(creatorAccountId, Number(report.id));
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_reports WHERE id=?', [report.id]))?.count), 0);

  await execute("UPDATE douyin_daily_snapshots SET fans_count_available=0 WHERE account_id=? AND snapshot_date='2026-09-09'", [douyinAccountId]);
  const withoutFanBaseline = await getDouyinDashboard(creatorAccountId);
  assert.equal(withoutFanBaseline?.growth_7d?.fans, null, '没有真实期初粉丝观测时不得推断 7 天粉丝增长');
  assert.equal(withoutFanBaseline?.growth_7d?.plays, 300, '粉丝基线缺失不得遮挡可计算的官方播放量');
  assert(withoutFanBaseline?.missing_fields.includes('fan_growth_7d'));
  assert.equal(withoutFanBaseline?.data_status, 'partial');

  console.log('Unified Douyin report tests passed: official totals, exact-period daily flows, fans, stale-silo isolation, scoped deletion.');
} finally {
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best-effort temporary test cleanup */ }
}
