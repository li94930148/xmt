import assert from 'node:assert/strict';
import test from 'node:test';
import { douyinDataNormalizer } from '../api/services/douyinDataNormalizer.js';
import { analyzeDouyinWorks, calculateDouyinAccountHealth } from '../api/services/douyinOperationsAnalytics.js';
import { paginateWorkList } from '../agent/core/network/work-list-pagination.js';

const work = (id: number) => ({ aweme_id: String(id), desc: `work-${id}`, statistics: { play_count: 100 + id, digg_count: 10, comment_count: 2, share_count: 1 } });
const page = (start: number, count: number, cursor: string, hasMore: boolean) => ({ data: { aweme_list: Array.from({ length: count }, (_, index) => work(start + index)), max_cursor: cursor, has_more: hasMore } });

test('missing fans_count remains unavailable instead of becoming a real zero', () => {
  const missing = douyinDataNormalizer.normalizeContractV2102({ snapshot_id: 'missing-fans', account: { uid: 'u1' }, works: [work(1)] }, 'fallback');
  const explicitZero = douyinDataNormalizer.normalizeContractV2102({ snapshot_id: 'zero-fans', account: { uid: 'u1', fans_count: 0 }, works: [work(1)] }, 'fallback');
  assert.equal(missing.account.fans_count_available, false);
  assert.equal(explicitZero.account.fans_count_available, true);
});

test('cursor pagination reaches the final page without duplicating works', async () => {
  const fixtures: Record<string, unknown> = { c1: page(12, 12, 'c2', true), c2: page(24, 7, 'done', false) };
  const result = await paginateWorkList(page(0, 12, 'c1', true), async cursor => fixtures[cursor]);
  const normalized = douyinDataNormalizer.normalize({ raw_records: result.responses.map(response => ({ response })) }, 'u1');
  assert.equal(result.stop_reason, 'completed');
  assert.equal(result.page_count, 3);
  assert.equal(normalized.works.length, 31);
  assert.equal(new Set(normalized.works.map(item => item.aweme_id)).size, 31);
});

test('health excludes unavailable fan growth and recomputes from available dimensions', () => {
  const metrics = [1, 2].map((id) => ({ id, play_count: 100 + id, like_count: 10, comment_count: 2, share_count: 1, collect_count: 0, completion_rate: 0, publish_time: new Date().toISOString() }));
  const works = analyzeDouyinWorks(metrics).works;
  const health = calculateDouyinAccountHealth({ last_sync_time: new Date().toISOString() }, works, [
    { snapshot_date: '2026-07-24', fans_count: 0, fans_count_available: 0 },
    { snapshot_date: '2026-07-25', fans_count: 0, fans_count_available: 0 },
  ]);
  assert.equal(health.dimensions.fan_growth.score, null);
  assert.equal(health.available_weight, 75);
  const earned = health.dimensions.data_freshness.score + health.dimensions.content_activity.score + health.dimensions.engagement_quality.score;
  assert.equal(health.score, Number((earned / health.available_weight * 100).toFixed(1)));
});
