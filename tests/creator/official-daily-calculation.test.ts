import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeOfficialDaily, type OfficialDailyPoint } from '../../api/services/douyinDataCenter.js';

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
