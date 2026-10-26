import assert from 'node:assert/strict';
import test from 'node:test';
import { startOrResumeTopicProduction, type TopicProductionHandoffDependencies } from '../../src/utils/topicProductionHandoff';

test('approved topic advances before reusing its existing production draft', async () => {
  const calls: string[] = [];
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async (topicId) => { calls.push(`verify:${topicId}`); return 'approved'; },
    advanceTopic: async (topicId, status) => { calls.push(`advance:${topicId}:${status}`); },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return [{ id: 42 }]; },
    createDraft: async () => { calls.push('create'); return { productionId: 99 }; },
  };

  const result = await startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies);

  assert.deepEqual(result, { productionId: 42, created: false, advanced: true });
  assert.deepEqual(calls, ['verify:7', 'advance:7:production', 'list:7']);
});

test('failed transition confirmed unchanged is not replayed and keeps an explicit retry path', async () => {
  let listCalls = 0;
  let createCalls = 0;
  let advanceCalls = 0;
  let statusReads = 0;
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async () => { statusReads += 1; return 'approved'; },
    advanceTopic: async () => { advanceCalls += 1; throw new Error('阶段推进失败'); },
    listProductions: async () => { listCalls += 1; return []; },
    createDraft: async () => { createCalls += 1; return { productionId: 99 }; },
  };

  await assert.rejects(
    startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies),
    /可重新点击“开始创作”明确重试/,
  );
  assert.equal(statusReads, 2);
  assert.equal(advanceCalls, 1);
  assert.equal(listCalls, 0);
  assert.equal(createCalls, 0);
});

test('committed transition with a lost response is verified and safely continues to create the draft', async () => {
  const calls: string[] = [];
  let statusReads = 0;
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async (topicId) => {
      statusReads += 1;
      calls.push(`verify:${topicId}:${statusReads}`);
      return statusReads === 1 ? 'approved' : 'production';
    },
    advanceTopic: async (topicId, status) => {
      calls.push(`advance:${topicId}:${status}`);
      throw new Error('response lost after commit');
    },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return []; },
    createDraft: async (input) => {
      calls.push(`create:${input.topic_id}:${input.content}`);
      return { productionId: 99 };
    },
  };

  const result = await startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies);

  assert.deepEqual(result, { productionId: 99, created: true, advanced: true });
  assert.deepEqual(calls, ['verify:7:1', 'advance:7:production', 'verify:7:2', 'list:7', 'create:7:大纲']);
});

test('unavailable status verification stops without listing or creating a draft', async () => {
  let statusReads = 0;
  let advanceCalls = 0;
  let listCalls = 0;
  let createCalls = 0;
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async () => {
      statusReads += 1;
      if (statusReads === 1) return 'approved';
      throw new Error('GET unavailable');
    },
    advanceTopic: async () => { advanceCalls += 1; throw new Error('POST response lost'); },
    listProductions: async () => { listCalls += 1; return []; },
    createDraft: async () => { createCalls += 1; return { productionId: 99 }; },
  };

  await assert.rejects(
    startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies),
    /结果暂时无法确认/,
  );
  assert.equal(statusReads, 2);
  assert.equal(advanceCalls, 1);
  assert.equal(listCalls, 0);
  assert.equal(createCalls, 0);
});

test('a later explicit attempt recognizes a transition already committed by an earlier uncertain request', async () => {
  const calls: string[] = [];
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async (topicId) => { calls.push(`verify:${topicId}`); return 'production'; },
    advanceTopic: async () => { calls.push('advance'); },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return [{ id: 42 }]; },
    createDraft: async () => { calls.push('create'); return { productionId: 99 }; },
  };

  const result = await startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, dependencies);

  assert.deepEqual(result, { productionId: 42, created: false, advanced: true });
  assert.deepEqual(calls, ['verify:7', 'list:7']);
});

test('production-stage topic with a legacy missing child is repaired without a second stage transition', async () => {
  const calls: string[] = [];
  const dependencies: TopicProductionHandoffDependencies = {
    getTopicStatus: async () => 'production',
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
    getTopicStatus: async () => 'approved',
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
