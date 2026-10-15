import assert from 'node:assert/strict';
import test from 'node:test';
import { startOrResumeTopicProduction, type TopicProductionHandoffDependencies } from '../../src/utils/topicProductionHandoff';

test('approved topic advances before reusing its existing production draft', async () => {
  const calls: string[] = [];
  const dependencies: TopicProductionHandoffDependencies = {
    advanceTopic: async (topicId, status) => { calls.push(`advance:${topicId}:${status}`); },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return [{ id: 42 }]; },
    createDraft: async () => { calls.push('create'); return { productionId: 99 }; },
  };

  const result = await startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies);

  assert.deepEqual(result, { productionId: 42, created: false, advanced: true });
  assert.deepEqual(calls, ['advance:7:production', 'list:7']);
});

test('approved topic transition failure never creates a detached draft', async () => {
  let listCalls = 0;
  let createCalls = 0;
  const dependencies: TopicProductionHandoffDependencies = {
    advanceTopic: async () => { throw new Error('阶段推进失败'); },
    listProductions: async () => { listCalls += 1; return []; },
    createDraft: async () => { createCalls += 1; return { productionId: 99 }; },
  };

  await assert.rejects(
    startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies),
    /阶段推进失败/,
  );
  assert.equal(listCalls, 0);
  assert.equal(createCalls, 0);
});

test('production-stage topic with a legacy missing child is repaired without a second stage transition', async () => {
  const calls: string[] = [];
  const dependencies: TopicProductionHandoffDependencies = {
    advanceTopic: async () => { calls.push('advance'); },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return []; },
    createDraft: async (input) => {
      calls.push(`create:${input.topic_id}:${input.content}:${input.status}:${input.origin_type}`);
      return { productionId: 43 };
    },
  };

  const result = await startOrResumeTopicProduction({ id: 8, status: 'production', outline: '既有选题大纲' }, dependencies);

  assert.deepEqual(result, { productionId: 43, created: true, advanced: false });
  assert.deepEqual(calls, ['list:8', 'create:8:既有选题大纲:draft:topic_outline']);
});

test('topics outside the production handoff stages are rejected before any write', async () => {
  let writes = 0;
  const dependencies: TopicProductionHandoffDependencies = {
    advanceTopic: async () => { writes += 1; },
    listProductions: async () => [],
    createDraft: async () => { writes += 1; return { productionId: 99 }; },
  };

  await assert.rejects(
    startOrResumeTopicProduction({ id: 9, status: 'shooting' }, dependencies),
    /只有已通过或创作中的选题可以开始创作/,
  );
  assert.equal(writes, 0);
});
