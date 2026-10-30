import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeCrossModuleMetrics } from '../../src/lib/homeCrossModuleOverview';

const summary = {
  scope: 'personal' as const,
  counts: { overdue: 1, due_soon: 2, stalled: 3, stage_time_unknown: 0, total: 5 },
  today_publishing: { total: 0, tasks: [] },
  sync_anomalies: { available: true, total: 0, tasks: [] },
  production_reviews: { available: true, total: 2, tasks: [] },
  topic_stages: { pending: { total: 4, topics: [] } },
};

test('home cross-module overview keeps exact zero counts and follows existing permissions', () => {
  const metrics = buildHomeCrossModuleMetrics(summary, {
    isManagementRole: true,
    hasTopicAudit: true,
    hasPublishingAccess: true,
    actionableMessageCount: 0,
  });

  assert.deepEqual(metrics.map(({ id, count }) => [id, count]), [
    ['topic-attention', 5],
    ['topic-review', 4],
    ['production-review', 2],
    ['today-publishing', 0],
    ['sync-anomalies', 0],
    ['actionable-messages', 0],
  ]);
  assert.equal(metrics.find((metric) => metric.id === 'production-review')?.path, '/production');
  assert.equal(metrics.find((metric) => metric.id === 'actionable-messages')?.path, '/messages?filter=actionable');
});

test('home cross-module overview omits queues outside the current role or permission scope', () => {
  const restrictedSummary = {
    ...summary,
    sync_anomalies: { available: false, total: 0, tasks: [] },
    production_reviews: { available: false, total: 0, tasks: [] },
  };
  const metrics = buildHomeCrossModuleMetrics(restrictedSummary, {
    isManagementRole: false,
    hasTopicAudit: false,
    hasPublishingAccess: false,
    actionableMessageCount: null,
  });

  assert.deepEqual(metrics.map(({ id }) => id), ['topic-attention']);
  assert.deepEqual(buildHomeCrossModuleMetrics(null, {
    isManagementRole: true,
    hasTopicAudit: true,
    hasPublishingAccess: true,
    actionableMessageCount: 9,
  }), [], 'an unavailable summary is not presented as zero work');
});
