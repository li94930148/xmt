import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-creator-analytics-bjt-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'analytics.db');
process.env.NODE_ENV = 'test';

const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { creatorAnalyticsService } = await import('../../api/services/creatorAnalytics.js');

const shiftDate = (dateKey: string, offset: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
};
const localTime = (dateKey: string, time: string) => `${dateKey}T${time}+08:00`;

try {
  await initDatabase();
  const ownerId = Number((await queryOne<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1'))?.id);
  assert(ownerId > 0, 'isolated test database must contain a seeded user');
  const accountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', 'creator-analytics-window-main', '日期窗口隔离账号')`,
    [ownerId],
  );
  const missingBaselineAccountId = await executeInsert(
    `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname)
     VALUES(?, 'douyin', 'creator-analytics-window-missing', '缺少粉丝基线隔离账号')`,
    [ownerId],
  );

  const asOf = new Date('2026-10-20T15:59:59.000Z'); // 北京时间 2026-10-20 23:59:59
  const end = '2026-10-20';
  const start7 = shiftDate(end, -6);
  const start30 = shiftDate(end, -29);
  const start90 = shiftDate(end, -89);
  const publishDates = [
    ['before-7d', shiftDate(start7, -1), '23:59:59'],
    ['start-7d', start7, '00:00:00'],
    ['before-30d', shiftDate(start30, -1), '23:59:59'],
    ['start-30d', start30, '00:00:00'],
    ['before-90d', shiftDate(start90, -1), '23:59:59'],
    ['start-90d', start90, '00:00:00'],
    ['end-today', end, '23:59:59'],
    ['after-today', shiftDate(end, 1), '00:00:00'],
  ] as const;
  for (const [key, dateKey, time] of publishDates) {
    await execute(
      `INSERT INTO creator_content_items(account_id,platform,platform_item_id,title,publish_time,raw_json)
       VALUES(?, 'douyin', ?, ?, ?, '{}')`,
      [accountId, `publish-${key}`, key, localTime(dateKey, time)],
    );
  }

  const metricSnapshots: Array<[string, number | null]> = [
    [localTime(shiftDate(start90, -1), '23:59:59'), 50],
    [localTime(start90, '00:00:00'), 80],
    [localTime(shiftDate(start30, -1), '23:59:59'), 90],
    [localTime(start30, '00:00:00'), 100],
    [localTime(shiftDate(start7, -1), '23:59:59'), 115],
    [localTime(start7, '00:00:00'), 120],
    [localTime(shiftDate(end, -1), '12:00:00'), null],
    [localTime(end, '23:59:59'), 130],
    [localTime(shiftDate(end, 1), '00:00:00'), 9999],
  ];
  for (const [snapshotTime, fans] of metricSnapshots) {
    await execute(
      `INSERT INTO creator_account_metrics(account_id,snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json,raw_json)
       VALUES(?,?,?,?,?,?,?,?)`,
      [accountId, snapshotTime, fans, 100, 10, 2, '{}', '{}'],
    );
  }

  const workId = Number((await queryOne<{ id: number }>(
    `SELECT id FROM creator_content_items WHERE account_id=? AND platform_item_id='publish-end-today'`,
    [accountId],
  ))?.id);
  for (const [key, dateKey, time] of [
    ['before-window', shiftDate(start7, -1), '23:59:59'],
    ['window-start', start7, '00:00:00'],
    ['missing-observation', shiftDate(end, -1), '12:00:00'],
    ['window-end', end, '23:59:59'],
    ['future', shiftDate(end, 1), '00:00:00'],
  ] as const) {
    await execute(
      `INSERT INTO creator_content_metrics(content_id,snapshot_time,play_count,like_count,comment_count,share_count,favorite_count,raw_json)
       VALUES(?,?,?,?,?,?,?,?)`,
      [workId, localTime(dateKey, time), key === 'missing-observation' ? null : 100, 10, 2, 3, key === 'missing-observation' ? null : 1, JSON.stringify(key === 'missing-observation' ? {} : { fans_gained: key === 'window-end' ? 4 : 1 })],
    );
  }

  await execute(
    `INSERT INTO creator_account_metrics(account_id,snapshot_time,fans_count,play_count,interaction_count,profile_visit_count,growth_json,raw_json)
     VALUES(?, ?, 40, 10, 1, 0, '{}', '{}'), (?, ?, NULL, 20, 2, 0, '{}', '{}'), (?, ?, 500, 30, 3, 0, '{}', '{}')`,
    [
      missingBaselineAccountId,
      localTime(shiftDate(start90, -1), '12:00:00'),
      missingBaselineAccountId,
      localTime(end, '12:00:00'),
      missingBaselineAccountId,
      localTime(shiftDate(end, 1), '00:00:00'),
    ],
  );

  const originalTz = process.env.TZ;
  const results: Array<{ overview: unknown; trend7: unknown; trend30: unknown; trend90: unknown; workTrend: unknown; missingFans: unknown }> = [];
  try {
    for (const timezone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      const overview = await creatorAnalyticsService.overview(accountId, asOf);
      const trend7 = await creatorAnalyticsService.trends(accountId, '7d', asOf);
      const trend30 = await creatorAnalyticsService.trends(accountId, '30d', asOf);
      const trend90 = await creatorAnalyticsService.trends(accountId, '90d', asOf);
      const workTrend = await creatorAnalyticsService.work(accountId, workId, '7d', asOf);
      const missingFans = await creatorAnalyticsService.overview(missingBaselineAccountId, asOf);
      results.push({ overview, trend7, trend30, trend90, workTrend: workTrend?.trend, missingFans: (missingFans.health as { fan_growth_rate: number | null }).fan_growth_rate });
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
  assert.deepEqual(results[1], results[0], 'window boundaries and values must not depend on the host timezone');
  assert.deepEqual(results[2], results[0], 'window boundaries and values must not depend on the host timezone');

  const overview = results[0].overview as { health: { content_activity: number; fan_growth_rate: number | null; basis: Record<string, string> } };
  assert.equal(overview.health.content_activity, 33.3, '30-day activity includes exactly the start/end Beijing dates and excludes the adjacent dates');
  assert.equal(overview.health.fan_growth_rate, 30, '30-day fan growth uses only real in-window endpoint observations and excludes the future snapshot');
  assert.match(overview.health.basis.content_activity, /近30天发布 4 条/);
  assert.match(overview.health.basis.fan_growth_rate, /2026-09-21 至 2026-10-20/);

  const expectedDates = {
    '7d': [start7, end],
    '30d': [start30, shiftDate(start7, -1), start7, end],
    '90d': [start90, shiftDate(start30, -1), start30, shiftDate(start7, -1), start7, end],
  };
  for (const [period, value] of [['7d', results[0].trend7], ['30d', results[0].trend30], ['90d', results[0].trend90]] as const) {
    const series = (value as { series: Record<string, Array<{ time: string; value: number }>> }).series;
    const publishDates = series.publishes.map(row => row.time.slice(0, 10));
    assert.deepEqual(publishDates, expectedDates[period], `${period} publish trend includes only actual rows inside the Beijing date window`);
    assert(!Object.values(series).flat().some(row => row.time.startsWith(shiftDate(end, 1))), `${period} trend excludes future snapshots and dates`);
    assert(!Object.values(series).flat().some(row => row.time.startsWith(shiftDate(period === '7d' ? start7 : period === '30d' ? start30 : start90, -1))), `${period} trend excludes the preceding Beijing date`);
  }
  const trend7 = results[0].trend7 as { series: Record<string, Array<{ time: string; value: number }>> };
  assert.deepEqual(trend7.series.fans.map(row => row.time.slice(0, 10)), [start7, end], 'a NULL fan observation remains absent rather than becoming zero');
  const workTrend = results[0].workTrend as Array<{ time: string; plays: number | null; interactions: number | null; fans: number | null }>;
  assert.deepEqual(workTrend.map(row => row.time), [localTime(start7, '00:00:00'), localTime(shiftDate(end, -1), '12:00:00'), localTime(end, '23:59:59')], 'single-work 7-day trend includes the Beijing boundary dates and excludes prior/future snapshots');
  assert.deepEqual(workTrend[1], { time: localTime(shiftDate(end, -1), '12:00:00'), plays: null, interactions: null, fans: null }, 'missing per-work metrics remain unknown instead of being coerced to zero');
  assert.equal(results[0].missingFans, null, 'an older snapshot cannot stand in for a missing 30-day fan baseline');

  console.log('Creator Analytics Beijing windows passed: 7/30/90-day bounds, future exclusion, missing fan baseline and TZ invariance.');
} finally {
  db.close();
  try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* isolated temporary database cleanup */ }
}
