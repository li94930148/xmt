import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-douyin-report-publish-window-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'publish-window.db');
process.env.NODE_ENV = 'test';

const originalTz = process.env.TZ;
const originalDashboardMode = process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE;
const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { creatorAnalyticsService } = await import('../../api/services/creatorAnalytics.js');
const { getDouyinReportData } = await import('../../api/services/douyinDataCenter.js');

const asOf = new Date('2026-10-20T12:00:00.000Z'); // 北京时间 2026-10-20 20:00
const publishFixtures = [
  ['before-yesterday', '2026-10-18 23:59:59'],
  ['yesterday-start', '2026-10-19 00:00:00'],
  ['yesterday-end', '2026-10-19T23:59:59+08:00'],
  ['today-start', '2026-10-20T00:00:00+08:00'],
  ['today-end', '2026-10-20T23:59:59+08:00'],
  ['after-today', '2026-10-21T00:00:00+08:00'],
  ['before-week', '2026-10-13 23:59:59'],
  ['week-start', '2026-10-14 00:00:00'],
  ['week-end', '2026-10-20T23:59:59+08:00'],
  ['after-week', '2026-10-21 00:00:00'],
  ['before-month', '2026-09-20T23:59:59+08:00'],
  ['month-start', '2026-09-21 00:00:00'],
] as const;

async function createAccount(uid: string, includeInvalidWeeklyFile = false, includeValidDailyFile = false, includeInvalidDailyFile = false) {
  const userId = Number((await queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1'))?.id);
  const creatorAccountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', ?, ?)`,
    [userId, uid, uid],
  );
  const douyinAccountId = await executeInsert(
    `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,fans_count,fans_count_available,last_sync_time)
     VALUES(?, '', ?, ?, 100, 1, '2026-10-14T08:00:00.000Z')`,
    [uid, uid, creatorAccountId],
  );
  await execute(
    `INSERT INTO douyin_daily_snapshots(account_id,snapshot_date,fans_count,fans_count_available,works_count,play_count,like_count,comment_count,share_count)
     VALUES(?, '2026-10-07', 90, 1, 1, 1000, 100, 10, 5),
            (?, '2026-10-14', 100, 1, 2, 2000, 180, 20, 10)`,
    [douyinAccountId, douyinAccountId],
  );
  await execute(
    `INSERT INTO creator_official_metrics(account_id,source_item_key,metric_date,metric_code,value_text,value_number,unit,source_type,source_file_sha256,parser_version,collected_at)
     VALUES(?, 'official-work', '2026-10-14', 'views', '900', 900, 'count', 'official_export', ?, 'fixture-v1', ?)`,
    [creatorAccountId, 'a'.repeat(64), '2026-10-20T12:00:00.000Z'],
  );
  if (includeInvalidWeeklyFile) {
    await execute(
      `INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at)
       VALUES(?, '2026-10-20', '7d', 'views', '1', 1, 'count', ?, 'fixture-v3', ?)`,
      [creatorAccountId, 'b'.repeat(64), '2026-10-20T12:00:00.000Z'],
    );
  }
  if (includeValidDailyFile) {
    for (const [metricCode, value] of [['posts', 1], ['views', 20], ['likes', 2], ['comments', 1], ['shares', 1]] as const) {
      await execute(
        `INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at)
         VALUES(?, '2026-10-19', 'yesterday', ?, ?, ?, 'count', ?, 'fixture-v3', ?)`,
        [creatorAccountId, metricCode, String(value), value, 'c'.repeat(64), '2026-10-20T12:00:00.000Z'],
      );
    }
  }
  if (includeInvalidDailyFile) {
    await execute(
      `INSERT INTO creator_official_daily_metrics(account_id,metric_date,source_period,metric_code,value_text,value_number,unit,source_file_sha256,parser_version,collected_at)
       VALUES(?, '2026-10-20', 'yesterday', 'views', '1', 1, 'count', ?, 'fixture-v3', ?)`,
      [creatorAccountId, 'd'.repeat(64), '2026-10-20T12:00:00.000Z'],
    );
  }
  for (const [key, publishTime] of publishFixtures) {
    await execute(
      `INSERT INTO douyin_works(account_id,aweme_id,title,publish_time,play_count,like_count,comment_count,share_count,collect_count)
       VALUES(?,?,?,?,0,0,0,0,0)`,
      [douyinAccountId, `publish-${key}`, key, publishTime],
    );
  }
  return creatorAccountId;
}

function workPerformance(report: Record<string, unknown>) {
  const performance = report.work_performance as { published: number; published_period_start: string; published_period_end: string };
  return {
    published: performance.published,
    published_period_start: performance.published_period_start,
    published_period_end: performance.published_period_end,
  };
}

try {
  await initDatabase();
  process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE = 'official_preferred';
  const missingFileAccountId = await createAccount('publish-window-missing-period-file');
  const invalidFileAccountId = await createAccount('publish-window-invalid-period-file', true);
  const validDailyFileAccountId = await createAccount('publish-window-valid-daily-file', false, true);
  const invalidDailyFileAccountId = await createAccount('publish-window-invalid-daily-file', false, false, true);

  const resultByTimezone = [];
  try {
    for (const timezone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      const daily = await getDouyinReportData(missingFileAccountId, 'daily', asOf);
      const weekly = await creatorAnalyticsService.generateReport(missingFileAccountId, 'weekly', asOf);
      const monthly = await getDouyinReportData(missingFileAccountId, 'monthly', asOf);
      const invalidWeekly = await getDouyinReportData(invalidFileAccountId, 'weekly', asOf);
      const validDaily = await getDouyinReportData(validDailyFileAccountId, 'daily', asOf);
      const invalidDaily = await getDouyinReportData(invalidDailyFileAccountId, 'daily', asOf);
      assert(daily && monthly && invalidWeekly && validDaily && invalidDaily);
      resultByTimezone.push({
        daily: workPerformance(daily),
        weekly: workPerformance(weekly),
        monthly: workPerformance(monthly),
        invalidWeekly: workPerformance(invalidWeekly),
        validDaily: workPerformance(validDaily),
        invalidDaily: workPerformance(invalidDaily),
      });
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }

  assert.deepEqual(resultByTimezone[1], resultByTimezone[0], 'publication counts must not depend on the host timezone');
  assert.deepEqual(resultByTimezone[2], resultByTimezone[0], 'publication counts must not depend on the host timezone');
  assert.deepEqual(resultByTimezone[0].daily, { published: 3, published_period_start: '2026-10-20', published_period_end: '2026-10-20' }, 'daily fallback counts the report-generation Beijing date, including both endpoints and excluding the following date');
  assert.deepEqual(resultByTimezone[0].validDaily, { published: 2, published_period_start: '2026-10-19', published_period_end: '2026-10-19' }, 'a complete official yesterday file remains authoritative for the daily publication window');
  assert.deepEqual(resultByTimezone[0].invalidDaily, resultByTimezone[0].daily, 'an invalid official daily file falls back to the inclusive Beijing report date');
  assert.deepEqual(resultByTimezone[0].weekly, { published: 7, published_period_start: '2026-10-14', published_period_end: '2026-10-20' }, 'weekly report counts the current inclusive 7-day Beijing window despite a missing official period file and stale snapshots');
  assert.deepEqual(resultByTimezone[0].monthly, { published: 9, published_period_start: '2026-09-21', published_period_end: '2026-10-20' }, 'monthly report counts the current inclusive 30-day Beijing window despite a missing official period file');
  assert.deepEqual(resultByTimezone[0].invalidWeekly, resultByTimezone[0].weekly, 'an invalid official weekly file does not block the separately source-backed publication count');

  console.log('Douyin report publication windows passed: missing/invalid official periods, daily/7d/30d Beijing report-date boundaries and TZ invariance.');
} finally {
  if (originalDashboardMode === undefined) delete process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE;
  else process.env.XMT_CREATOR_OFFICIAL_DASHBOARD_MODE = originalDashboardMode;
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* isolated temporary database cleanup */ }
}
