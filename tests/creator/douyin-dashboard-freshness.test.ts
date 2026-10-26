import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-douyin-dashboard-freshness-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'dashboard-freshness.db');
process.env.NODE_ENV = 'test';

const originalDashboardMode = process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE;
const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { getDouyinDashboard, getDouyinReportData, getDouyinTrends } = await import('../../api/services/douyinDataCenter.js');

async function createAccount(uid: string, lastSyncAt: string, fansCount: number, withSnapshots: boolean) {
  const userId = Number((await queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1'))?.id);
  const creatorAccountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', ?, ?)`,
    [userId, uid, uid],
  );
  const accountId = await executeInsert(
    `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,fans_count,fans_count_available,last_sync_time)
     VALUES(?, '', ?, ?, ?, 1, ?)`,
    [uid, uid, creatorAccountId, fansCount, lastSyncAt],
  );
  if (withSnapshots) {
    await execute(
      `INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,fans_count_available,works_count,play_count,like_count,comment_count,share_count)
       VALUES(?, '2026-10-07', 100, 1, 1, 1000, 100, 10, 5),
             (?, '2026-10-14', ?, 1, 2, 2000, 180, 20, 10)`,
      [accountId, accountId, fansCount],
    );
  }
  return creatorAccountId;
}

const shanghaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDate = (date: string, offset: number) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
};
const expected90dDates = () => {
  const today = shanghaiToday();
  return Array.from({ length: 90 }, (_, index) => shiftDate(today, index - 89));
};

async function insertOfficialPeriodFacts(
  accountId: number,
  period: '7d' | '30d',
  endDate: string,
  collectedAt: string,
  sourceHash: string,
  options: { omitMetric?: { date: string; code: string }; nullMetric?: { date: string; code: string } } = {},
) {
  const periodDays = period === '7d' ? 7 : 30;
  const dates = Array.from({ length: periodDays }, (_, index) => shiftDate(endDate, index - periodDays + 1));
  const rows: Array<[number, string, string, string, string, number | null, string, string, string, string]> = [];
  dates.forEach((date, index) => {
    const metrics = { posts: index === periodDays - 1 ? 1 : 0, views: index === 0 ? 100 : index === periodDays - 1 ? 200 : 0, likes: index === periodDays - 1 ? 7 : 0, comments: index === 0 ? -1 : 0, shares: index === periodDays - 1 ? 2 : 0 };
    for (const [code, value] of Object.entries(metrics)) {
      if (options.omitMetric?.date === date && options.omitMetric.code === code) continue;
      const valueNumber = options.nullMetric?.date === date && options.nullMetric.code === code ? null : value;
      rows.push([accountId, date, period, code, valueNumber == null ? '' : String(valueNumber), valueNumber, 'count', sourceHash, 'fixture-v3', collectedAt]);
    }
    if (options.nullMetric?.date === date && options.nullMetric.code === 'five_second_completion_rate') {
      rows.push([accountId, date, period, 'five_second_completion_rate', '', null, 'ratio', sourceHash, 'fixture-v3', collectedAt]);
    }
  });
  for (let index = 0; index < rows.length; index += 30) {
    const chunk = rows.slice(index, index + 30);
    const valuesSql = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
    await execute(`INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at) VALUES${valuesSql}`, chunk.flat());
  }
}

async function insertOfficialContentBaseline(accountId: number, collectedAt: string, sourceHash: string) {
  await execute(
    `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
     VALUES(?, 'official-work', '2026-10-14', 'views', '900', 900, 'count', 'official_export', ?, 'fixture-v1', ?)`,
    [accountId, sourceHash, collectedAt],
  );
}

async function insertOfficial90dFacts(accountId: number, dates: string[], options: { omitDate?: string; omitMetric?: { date: string; code: string }; invalidDate?: string } = {}) {
  const requiredMetrics = ['posts', 'views', 'likes', 'comments', 'shares'] as const;
  const rows: Array<[number | string, string, string, string, number, string]> = [];
  dates.forEach((date, index) => {
    if (date === options.omitDate) return;
    const batchIndex = Math.floor(index / 30);
    const sourceHash = String.fromCharCode(97 + batchIndex).repeat(64);
    const metrics = { posts: index === 89 ? 1 : 0, views: index + 10, likes: index % 5, comments: index === 0 ? -1 : 0, shares: index % 2 };
    for (const code of requiredMetrics) {
      if (options.omitMetric?.date === date && options.omitMetric.code === code) continue;
      rows.push([date, '30d', code, String(metrics[code]), metrics[code], sourceHash]);
    }
  });
  if (options.invalidDate) rows.push([options.invalidDate, '30d', 'posts', '7', 7, 'd'.repeat(64)]);
  for (let index = 0; index < rows.length; index += 35) {
    const chunk = rows.slice(index, index + 35);
    const valuesSql = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = chunk.flatMap(([metricDate, period, code, valueText, valueNumber, sourceHash]) => {
      const dateIndex = dates.indexOf(String(metricDate));
      const batchIndex = dateIndex < 0 ? 3 : Math.floor(dateIndex / 30);
      const collectedOn = dates[Math.min((batchIndex + 1) * 30 - 1, dates.length - 1)] || dates[dates.length - 1];
      const collectedAt = new Date(`${collectedOn}T12:00:00+08:00`).toISOString();
      return [accountId, metricDate, period, code, valueText, valueNumber, 'count', sourceHash, 'fixture-v3', collectedAt];
    });
    await execute(`INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at) VALUES${valuesSql}`, values);
  }
}

try {
  await initDatabase();
  const officialUid = 'freshness-official-account';
  const officialAccountId = await createAccount(officialUid, '2026-10-14T09:00:00.000Z', 120, true);
  const contentCollectedAt = '2026-10-15T10:00:00.000Z';
  const dailyCollectedAt = '2026-10-14T03:30:00.000Z';

  await execute(
    `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
     VALUES(?, 'official-work', '2026-10-14', 'views', '900', 900, 'count', 'official_export', ?, 'fixture-v1', ?)`,
    [officialAccountId, 'a'.repeat(64), contentCollectedAt],
  );
  await insertOfficialPeriodFacts(officialAccountId, '7d', '2026-10-14', dailyCollectedAt, 'b'.repeat(64), {
    nullMetric: { date: '2026-10-08', code: 'five_second_completion_rate' },
  });

  process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE = 'official_preferred';
  const officialDashboard = await getDouyinDashboard(officialAccountId);
  assert(officialDashboard);
  assert.equal(officialDashboard.data_source, 'douyin_official_export');
  assert.equal(officialDashboard.growth_7d?.collected_at, dailyCollectedAt, 'weekly flow carries the timestamp from its own official daily dataset');
  assert.equal(officialDashboard.growth_7d?.observed_through_date, '2026-10-14', 'weekly flow carries its last actual metric date');
  assert.notEqual(officialDashboard.growth_7d?.collected_at, officialDashboard.last_success_at, 'account sync time is not used as the official daily dataset time');
  assert.notEqual(officialDashboard.growth_7d?.collected_at, officialDashboard.official_snapshot_at, 'content export time is not substituted for the official daily dataset time');
  assert.equal(officialDashboard.metrics.fans_observed_on, '2026-10-14', 'fans date comes from the latest snapshot that actually observed fans');
  const complete7dTrend = await getDouyinTrends(officialAccountId, '7d');
  assert.equal(complete7dTrend.data_status, 'ready', 'valid five-metric daily windows remain ready');
  assert.equal(complete7dTrend.snapshots[0].comment_count, -1, 'negative platform comment corrections remain intact');
  await assert.rejects(
    execute(`INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at)
      VALUES(?, '2026-10-08', '7d', 'views', '1', 1, 'count', ?, 'fixture-v3', ?)`, [officialAccountId, 'b'.repeat(64), dailyCollectedAt]),
    /UNIQUE constraint failed/,
    'the current composite key prevents duplicate metric rows for one official date',
  );

  await execute("UPDATE creator_official_daily_metrics SET collected_at='' WHERE account_id=?", [officialAccountId]);
  const officialDashboardWithoutTimestamp = await getDouyinDashboard(officialAccountId);
  assert.equal(officialDashboardWithoutTimestamp?.growth_7d?.collected_at, null, 'an empty collected_at remains unknown rather than falling back to another timestamp');

  await execute('UPDATE creator_official_daily_metrics SET collected_at=? WHERE account_id=?', [dailyCollectedAt, officialAccountId]);
  await execute("UPDATE creator_official_daily_metrics SET metric_date='2026-02-30' WHERE account_id=? AND metric_date='2026-10-08'", [officialAccountId]);
  const invalidWindowDashboard = await getDouyinDashboard(officialAccountId);
  assert.equal(invalidWindowDashboard?.growth_7d?.plays, null, 'an invalid historical official date must not produce a trusted dashboard period summary');
  assert(invalidWindowDashboard?.missing_fields.includes('growth_7d'));
  assert.equal(invalidWindowDashboard?.growth_7d?.observed_through_date, null, 'an invalid date set must not expose its apparent period end as a trusted observation');
  const invalidWindowTrends = await getDouyinTrends(officialAccountId, '7d');
  assert.equal(invalidWindowTrends.source, 'creator_official_daily_metrics', 'an invalid official hash must not silently fall back to cumulative snapshots');
  assert.deepEqual(invalidWindowTrends.snapshots, []);
  assert.equal(invalidWindowTrends.data_status, 'partial');
  assert(invalidWindowTrends.missing_fields.includes('period_daily_metrics'));
  const invalidWindowReport = await getDouyinReportData(officialAccountId, 'weekly');
  assert.equal(invalidWindowReport?.growth.plays, null, 'an invalid official historical hash must not produce a trusted report period summary');
  assert.equal(invalidWindowReport?.growth.interactions, null);
  assert(invalidWindowReport?.data_coverage.missing_fields.includes('period_play_growth'));
  assert.equal(invalidWindowReport?.data_coverage.period_start, null);
  assert.equal(invalidWindowReport?.data_coverage.period_end, null);

  const missing7dMetricAccountId = await createAccount('official-7-day-missing-metric', '2026-10-14T09:00:00.000Z', 121, true);
  const missing7dMetricHash = 'e'.repeat(64);
  await insertOfficialContentBaseline(missing7dMetricAccountId, contentCollectedAt, missing7dMetricHash);
  await insertOfficialPeriodFacts(missing7dMetricAccountId, '7d', '2026-10-14', dailyCollectedAt, 'f'.repeat(64), {
    omitMetric: { date: '2026-10-11', code: 'likes' },
  });
  const missing7dMetricDashboard = await getDouyinDashboard(missing7dMetricAccountId);
  assert.equal(missing7dMetricDashboard?.growth_7d?.plays, null, 'a full date window missing one core metric must not produce a dashboard period summary');
  assert.equal(missing7dMetricDashboard?.growth_7d?.interactions, null);
  assert(missing7dMetricDashboard?.missing_fields.includes('growth_7d'));
  const missing7dMetricTrend = await getDouyinTrends(missing7dMetricAccountId, '7d');
  assert.equal(missing7dMetricTrend.data_status, 'partial', '7-day trends with a missing core daily metric are partial');
  assert.equal(missing7dMetricTrend.source, 'creator_official_daily_metrics');
  assert.deepEqual(missing7dMetricTrend.snapshots, [], 'missing daily likes are not coerced to zero or included in trend totals');
  const missing7dMetricWeeklyReport = await getDouyinReportData(missing7dMetricAccountId, 'weekly');
  assert.equal(missing7dMetricWeeklyReport?.growth.plays, null, 'weekly reports do not summarize an incomplete official daily file');
  assert.equal(missing7dMetricWeeklyReport?.growth.interactions, null);
  assert(missing7dMetricWeeklyReport?.data_coverage.missing_fields.includes('period_play_growth'));

  const null30dMetricAccountId = await createAccount('official-30-day-null-metric', '2026-10-19T09:00:00.000Z', 122, true);
  const null30dMetricHash = '1'.repeat(64);
  const monthlyCollectedAt = '2026-10-19T03:30:00.000Z';
  await insertOfficialContentBaseline(null30dMetricAccountId, monthlyCollectedAt, null30dMetricHash);
  await insertOfficialPeriodFacts(null30dMetricAccountId, '30d', '2026-10-19', monthlyCollectedAt, '2'.repeat(64), {
    nullMetric: { date: '2026-10-05', code: 'comments' },
  });
  const null30dMetricDashboard = await getDouyinDashboard(null30dMetricAccountId);
  assert.equal(null30dMetricDashboard?.growth_30d?.plays, null, 'a NULL core metric in a full 30-day date window closes the dashboard summary');
  assert.equal(null30dMetricDashboard?.growth_30d?.interactions, null);
  assert(null30dMetricDashboard?.missing_fields.includes('growth_30d'));
  const null30dMetricTrend = await getDouyinTrends(null30dMetricAccountId, '30d');
  assert.equal(null30dMetricTrend.data_status, 'partial', '30-day trends with a NULL core metric are partial');
  assert.deepEqual(null30dMetricTrend.snapshots, [], 'NULL comments are not coerced to zero or included in trend totals');
  const null30dMetricMonthlyReport = await getDouyinReportData(null30dMetricAccountId, 'monthly');
  assert.equal(null30dMetricMonthlyReport?.growth.plays, null, 'monthly reports do not summarize a NULL official daily metric');
  assert.equal(null30dMetricMonthlyReport?.growth.interactions, null);
  assert(null30dMetricMonthlyReport?.data_coverage.missing_fields.includes('period_play_growth'));

  const snapshotUid = 'freshness-snapshot-account';
  const snapshotAccountId = await createAccount(snapshotUid, '2026-10-16T12:00:00.000Z', 140, true);
  process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE = 'existing_only';
  const snapshotDashboard = await getDouyinDashboard(snapshotAccountId);
  assert(snapshotDashboard);
  assert.equal(snapshotDashboard.data_source, 'douyin_creator_center_collection');
  assert.equal(snapshotDashboard.growth_7d?.collected_at, null, 'legacy daily snapshots have no precise collection time');
  assert.equal(snapshotDashboard.growth_7d?.observed_through_date, '2026-10-14', 'legacy daily snapshots expose only their stored date');
  assert.equal(snapshotDashboard.metrics.fans_observed_on, '2026-10-14');

  const unknownUid = 'freshness-unknown-account';
  const unknownAccountId = await createAccount(unknownUid, '2026-10-16T12:00:00.000Z', 150, false);
  const unknownDashboard = await getDouyinDashboard(unknownAccountId);
  assert.equal(unknownDashboard?.metrics.fans_observed_on, null, 'a fans total without a dated observation remains undated');
  assert.equal(unknownDashboard?.growth_7d, null, 'no snapshot baseline means no fabricated weekly observation date');

  const dates90d = expected90dDates();
  const validTrendAccountId = await createAccount('official-90-day-complete', '2026-10-19T00:00:00.000Z', 99, false);
  await insertOfficial90dFacts(validTrendAccountId, dates90d);
  const validTrend = await getDouyinTrends(validTrendAccountId, '90d');
  assert.equal(validTrend.data_status, 'ready', 'a complete Beijing-time 90-day date window is ready');
  assert.equal(validTrend.snapshots.length, 90);
  assert.equal(validTrend.snapshots[0].snapshot_date, dates90d[0]);
  assert.equal(validTrend.snapshots[89].snapshot_date, shanghaiToday(), 'the 90-day window includes today in Beijing time');
  assert.equal(validTrend.snapshots[0].comment_count, -1, 'official negative comment corrections remain unchanged');

  const gapTrendAccountId = await createAccount('official-90-day-gap', '2026-10-19T00:00:00.000Z', 99, true);
  await insertOfficial90dFacts(gapTrendAccountId, dates90d, { omitDate: dates90d[45] });
  const gapTrend = await getDouyinTrends(gapTrendAccountId, '90d');
  assert.equal(gapTrend.data_status, 'partial');
  assert.equal(gapTrend.source, 'creator_official_daily_metrics', 'an incomplete official window must not fall back to cumulative legacy snapshots');
  assert.deepEqual(gapTrend.snapshots, [], 'incomplete dates are not included in trend values or totals');
  assert(gapTrend.missing_fields.includes('period_daily_metrics'));

  const missingMetricAccountId = await createAccount('official-90-day-metric-gap', '2026-10-19T00:00:00.000Z', 99, false);
  await insertOfficial90dFacts(missingMetricAccountId, dates90d, { omitMetric: { date: dates90d[30], code: 'likes' } });
  const missingMetricTrend = await getDouyinTrends(missingMetricAccountId, '90d');
  assert.equal(missingMetricTrend.data_status, 'partial', 'a missing required daily metric does not become zero');
  assert.deepEqual(missingMetricTrend.snapshots, [], 'days with incomplete required metrics are excluded from totals');

  const invalidDateAccountId = await createAccount('official-90-day-invalid-date', '2026-10-19T00:00:00.000Z', 99, false);
  await insertOfficial90dFacts(invalidDateAccountId, dates90d, { invalidDate: `${shanghaiToday()}x` });
  const invalidDateTrend = await getDouyinTrends(invalidDateAccountId, '90d');
  assert.equal(invalidDateTrend.data_status, 'partial', 'a malformed date inside the 90-day window is not trusted');
  assert.deepEqual(invalidDateTrend.snapshots, []);

  const legacyTrendAccountId = await createAccount('legacy-90-day-window', '2026-10-19T00:00:00.000Z', 99, true);
  const legacyDouyinId = Number((await queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE creator_account_id=?', [legacyTrendAccountId]))?.id);
  const today90d = shanghaiToday();
  const before90d = shiftDate(dates90d[0], -1);
  const after90d = shiftDate(today90d, 1);
  await execute(
    `INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,fans_count_available,works_count,play_count,like_count,comment_count,share_count)
     VALUES(?,?,100,1,1,100,10,1,1),(?,?,100,1,1,100,10,1,1),(?,?,100,1,1,100,10,1,1),(?,?,100,1,1,100,10,1,1)`,
    [legacyDouyinId, before90d, legacyDouyinId, dates90d[0], legacyDouyinId, today90d, legacyDouyinId, after90d],
  );
  const legacyTrend = await getDouyinTrends(legacyTrendAccountId, '90d');
  const legacyDates = legacyTrend.snapshots.map(point => point.snapshot_date);
  assert.equal(legacyTrend.source, 'douyin_daily_snapshots', 'no official history preserves the legacy cumulative snapshot fallback');
  assert.equal(legacyTrend.data_status, 'ready');
  assert(legacyDates.includes(dates90d[0]), 'the Beijing-time start date is included');
  assert(legacyDates.includes(today90d), 'the current Beijing date is included');
  assert(!legacyDates.includes(before90d), 'the date before the 90-day window is excluded');
  assert(!legacyDates.includes(after90d), 'future snapshot dates are excluded');

  const partialLegacyTrendAccountId = await createAccount('legacy-90-day-partial', '2026-10-19T00:00:00.000Z', 99, false);
  const partialLegacyDouyinId = Number((await queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE creator_account_id=?', [partialLegacyTrendAccountId]))?.id);
  await execute(
    `INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,fans_count_available,works_count,play_count,like_count,comment_count,share_count)
     VALUES(?,?,100,1,1,100,10,1,1)`,
    [partialLegacyDouyinId, today90d],
  );
  const partialLegacyTrend = await getDouyinTrends(partialLegacyTrendAccountId, '90d');
  assert.equal(partialLegacyTrend.source, 'douyin_daily_snapshots');
  assert.equal(partialLegacyTrend.data_status, 'partial', 'legacy data keeps its existing partial/ready threshold');
  assert.equal(partialLegacyTrend.snapshots.length, 1);

  console.log('Douyin dashboard freshness tests passed: source dates, Beijing-time 90-day continuity, required metrics, and partial-state handling.');
} finally {
  if (originalDashboardMode === undefined) delete process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE;
  else process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE = originalDashboardMode;
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best-effort temporary test cleanup */ }
}
