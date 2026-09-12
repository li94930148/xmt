import assert from 'node:assert/strict';
import { buildHomeDashboardMetrics } from '../../src/components/xmt-ui/homeDashboardMetrics.js';
import type { Production, Publishing, Topic } from '../../src/types/index.js';

const topics = [
  { id: 1, status: 'pending' },
  { id: 2, status: 'production' },
  { id: 3, status: 'shooting' },
  { id: 4, status: 'publishing' },
] as Topic[];
const productions = [
  { id: 10, topic_id: 2, status: 'draft' },
  { id: 11, topic_id: 3, status: 'approved' },
] as Production[];
const publishing = [
  { id: 20, topic_id: 4, status: 'pending' },
  { id: 21, topic_id: 3, status: 'published' },
] as Publishing[];

assert.deepEqual(buildHomeDashboardMetrics(topics, productions, publishing), {
  pendingTopics: 1,
  inProduction: 1,
  toPublish: 1,
  completedContent: 1,
  productionIndex: 56,
});

assert.deepEqual(buildHomeDashboardMetrics([], [], []), {
  pendingTopics: 0,
  inProduction: 0,
  toPublish: 0,
  completedContent: 0,
  productionIndex: 0,
});

console.log('home dashboard metrics tests passed');
