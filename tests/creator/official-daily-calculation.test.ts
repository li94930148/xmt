import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedOfficialDailyDates, officialDailyWindowIsValid, summarizeOfficialDaily, type OfficialDailyPoint } from '../../api/services/douyinDataCenter.js';

const point = (metric_date: string, views: number, overrides: Partial<OfficialDailyPoint> = {}): OfficialDailyPoint => ({
  metric_date,
  posts: 1,
  views,
  likes: 2,
  comments: 1,
  shares: 1,
  five_second_completion_rate: 0.5,
  two_second_bounce_rate: 0.4,
  cover_click_rate: 0.2,
  watch_time_seconds: 10,
  ...overrides,
});

test('官方逐日计数求和，比例与时长按播放量加权', () => {
  const summary = summarizeOfficialDaily([
    point('2026-09-15', 100, { comments: -9, five_second_completion_rate: 0.2, watch_time_seconds: 5 }),
    point('2026-09-16', 300, { posts: 0, likes: 8, five_second_completion_rate: 0.6, watch_time_seconds: 15 }),
  ], '7d', '2026-09-17T00:00:00.000Z');
  assert.ok(summary);
  assert.equal(summary.days, 2);
  assert.equal(summary.views, 400);
  assert.equal(summary.comments, -8);
  assert.equal(summary.five_second_completion_rate, 0.5);
  assert.equal(summary.watch_time_seconds, 12.5);
});

test('昨天周期不做相邻快照差分', () => {
  const summary = summarizeOfficialDaily([point('2026-09-16', 3505, { posts: 0, comments: -9 })], 'yesterday', '2026-09-17T00:00:00.000Z');
  assert.equal(summary?.views, 3505);
  assert.equal(summary?.comments, -9);
  assert.equal(summary?.days, 1);
});

test('官方日期窗口按北京时间自然日且包含当天端点', () => {
  const collectedAt = '2026-10-20T15:59:59.000Z'; // 北京时间 2026-10-20 23:59:59
  assert.deepEqual(expectedOfficialDailyDates('yesterday', collectedAt), ['2026-10-19']);
  assert.deepEqual(expectedOfficialDailyDates('7d', collectedAt), [
    '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
  ]);
  assert.deepEqual(expectedOfficialDailyDates('30d', collectedAt), Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 20 - 29 + index));
    return date.toISOString().slice(0, 10);
  }));
  for (const period of ['yesterday', '7d', '30d'] as const) {
    assert.equal(officialDailyWindowIsValid(period, expectedOfficialDailyDates(period, collectedAt) || [], collectedAt), true);
  }
  assert.equal(officialDailyWindowIsValid('yesterday', ['2026-10-20'], collectedAt), false, 'yesterday is the previous Beijing date, not the collection date');
  assert.equal(officialDailyWindowIsValid('7d', ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-21'], collectedAt), false, 'the current Beijing date must not be replaced by a future date');
  assert.equal(officialDailyWindowIsValid('7d', ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'], collectedAt), false, 'a missing date closes the seven-day window');
  const thirtyDays = expectedOfficialDailyDates('30d', collectedAt) || [];
  assert.equal(officialDailyWindowIsValid('30d', [...thirtyDays.slice(0, -1), thirtyDays.at(-2)!], collectedAt), false, 'a duplicated date closes the thirty-day window');
  const atBeijingMidnight = '2026-10-20T16:00:00.000Z';
  assert.deepEqual(expectedOfficialDailyDates('yesterday', atBeijingMidnight), ['2026-10-20']);
  assert.deepEqual(expectedOfficialDailyDates('7d', atBeijingMidnight)?.slice(-1), ['2026-10-21']);
  assert.deepEqual(expectedOfficialDailyDates('30d', atBeijingMidnight)?.[0], '2026-09-22');
});
