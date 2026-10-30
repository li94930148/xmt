import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readTopicProductionCreateRecovery,
  startOrResumeTopicProduction,
  type TopicProductionHandoffDependencies,
  type TopicProductionRecoveryStorage,
} from '../../src/utils/topicProductionHandoff';

class MemoryStorage implements TopicProductionRecoveryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function dependencies(overrides: Partial<TopicProductionHandoffDependencies> = {}): TopicProductionHandoffDependencies {
  return {
    userId: 7,
    recoveryStorage: new MemoryStorage(),
    getTopicStatus: async () => 'approved',
    advanceTopic: async () => undefined,
    listProductions: async () => [],
    createDraft: async () => ({ productionId: 99 }),
    getCreateStatus: async () => ({ status: 'missing' }),
    getProductionById: async (productionId) => ({ id: productionId, topic_id: 7 }),
    ...overrides,
  };
}

test('approved topic advances before reusing its existing production draft', async () => {
  const calls: string[] = [];
  const deps = dependencies({
    getTopicStatus: async (topicId) => { calls.push(`verify:${topicId}`); return 'approved'; },
    advanceTopic: async (topicId, status) => { calls.push(`advance:${topicId}:${status}`); },
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return [{ id: 42, topic_id: topicId }]; },
    createDraft: async () => { calls.push('create'); return { productionId: 99 }; },
  });

  const result = await startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, deps);

  assert.deepEqual(result, { kind: 'opened', productionId: 42, created: false, advanced: true, verified: false });
  assert.deepEqual(calls, ['verify:7', 'advance:7:production', 'list:7']);
});

test('a failed stage transition confirmed unchanged is not replayed and does not create a draft', async () => {
  let listCalls = 0;
  let createCalls = 0;
  let advanceCalls = 0;
  let statusReads = 0;
  const deps = dependencies({
    getTopicStatus: async () => { statusReads += 1; return 'approved'; },
    advanceTopic: async () => { advanceCalls += 1; throw new Error('阶段推进失败'); },
    listProductions: async () => { listCalls += 1; return []; },
    createDraft: async () => { createCalls += 1; return { productionId: 99 }; },
  });

  await assert.rejects(
    startOrResumeTopicProduction({ id: 7, status: 'approved', outline: '大纲' }, deps),
    /可重新点击“开始创作”明确重试/,
  );
  assert.equal(statusReads, 2);
  assert.equal(advanceCalls, 1);
  assert.equal(listCalls, 0);
  assert.equal(createCalls, 0);
});

test('a committed draft with a lost response is resolved by status and production read only', async () => {
  const storage = new MemoryStorage();
  const calls: string[] = [];
  let createWrites = 0;
  const deps = dependencies({
    recoveryStorage: storage,
    listProductions: async (topicId) => { calls.push(`list:${topicId}`); return []; },
    createDraft: async (input, requestId) => {
      calls.push(`create:${input.topic_id}:${requestId}`);
      createWrites += 1;
      throw new TypeError('response lost after commit');
    },
    getCreateStatus: async (requestId) => { calls.push(`status:${requestId}`); return { status: 'created', productionId: 99 }; },
    getProductionById: async (productionId) => { calls.push(`read:${productionId}`); return { id: productionId, topic_id: 7 }; },
  });

  const result = await startOrResumeTopicProduction({ id: 7, status: 'production', outline: '既有选题大纲' }, deps);

  assert.deepEqual(result, { kind: 'opened', productionId: 99, created: true, advanced: false, verified: true });
  assert.equal(createWrites, 1);
  assert.deepEqual(calls.map((call) => call.split(':')[0]), ['list', 'create', 'status', 'read']);
  assert.equal(readTopicProductionCreateRecovery(7, 7, storage), null, 'the receipt marker clears only after the associated production is read');
});

test('unavailable status keeps the request locked; only an explicit retry reuses the same key', async () => {
  const storage = new MemoryStorage();
  const createRequestIds: string[] = [];
  let createCalls = 0;
  let statusCalls = 0;
  const deps = dependencies({
    recoveryStorage: storage,
    listProductions: async () => [],
    createDraft: async (_input, requestId) => {
      createCalls += 1;
      createRequestIds.push(requestId);
      if (createCalls === 1) throw new TypeError('lost response');
      return { productionId: 100 };
    },
    getCreateStatus: async () => {
      statusCalls += 1;
      if (statusCalls === 1) throw new Error('status unavailable');
      return { status: 'missing' };
    },
  });
  const topic = { id: 7, status: 'production', outline: '大纲原文' };

  const first = await startOrResumeTopicProduction(topic, deps);
  assert.equal(first.kind, 'unknown');
  assert.equal(createCalls, 1);
  assert.equal(readTopicProductionCreateRecovery(7, 7, storage)?.phase, 'unknown');

  const verification = await startOrResumeTopicProduction(topic, deps, 'verify');
  assert.equal(verification.kind, 'retryable');
  assert.equal(createCalls, 1, 'verification never resends the write');

  const explicitRetry = await startOrResumeTopicProduction(topic, deps, 'retry');
  assert.deepEqual(explicitRetry, { kind: 'opened', productionId: 100, created: true, advanced: false, verified: false });
  assert.equal(createCalls, 2);
  assert.equal(new Set(createRequestIds).size, 1, 'the explicit retry uses the persisted request key');
  assert.equal(readTopicProductionCreateRecovery(7, 7, storage), null);
});

test('an unknown result stays actor and topic scoped across refresh reads', async () => {
  const storage = new MemoryStorage();
  const deps = dependencies({
    recoveryStorage: storage,
    listProductions: async () => [],
    createDraft: async () => { throw new TypeError('network failed'); },
    getCreateStatus: async () => { throw new Error('read failed'); },
  });

  const result = await startOrResumeTopicProduction({ id: 7, status: 'production', outline: '不含账号或密码的大纲' }, deps);
  assert.equal(result.kind, 'unknown');
  assert.ok(readTopicProductionCreateRecovery(7, 7, storage));
  assert.equal(readTopicProductionCreateRecovery(8, 7, storage), null);
  assert.equal(readTopicProductionCreateRecovery(7, 8, storage), null);
});

test('recovery state must be saved before the draft POST is sent', async () => {
  const unavailableStorage: TopicProductionRecoveryStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => undefined,
  };
  let createCalls = 0;
  const deps = dependencies({
    recoveryStorage: unavailableStorage,
    listProductions: async () => [],
    createDraft: async () => { createCalls += 1; return { productionId: 99 }; },
  });

  await assert.rejects(
    startOrResumeTopicProduction({ id: 7, status: 'production', outline: '大纲' }, deps),
    /本次创作请求未发送/,
  );
  assert.equal(createCalls, 0);
});

test('a failed unknown-state storage update never exposes a retry as confirmed', async () => {
  const base = new MemoryStorage();
  let writesToStorage = 0;
  let createCalls = 0;
  let statusCalls = 0;
  const guardedStorage: TopicProductionRecoveryStorage = {
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => {
      writesToStorage += 1;
      if (writesToStorage > 3) throw new Error('quota exceeded');
      base.setItem(key, value);
    },
    removeItem: (key) => base.removeItem(key),
  };
  const deps = dependencies({
    recoveryStorage: guardedStorage,
    listProductions: async () => [],
    createDraft: async () => { createCalls += 1; throw new TypeError('lost response'); },
    getCreateStatus: async () => {
      statusCalls += 1;
      if (statusCalls === 1) return { status: 'missing' };
      throw new Error('status unavailable');
    },
  });
  const topic = { id: 7, status: 'production', outline: '大纲' };

  const initial = await startOrResumeTopicProduction(topic, deps);
  assert.equal(initial.kind, 'retryable');
  const failedVerification = await startOrResumeTopicProduction(topic, deps, 'verify');
  assert.equal(failedVerification.kind, 'unknown');
  if (failedVerification.kind === 'unknown') assert.equal(failedVerification.recovery.phase, 'unknown');
  assert.equal(createCalls, 1);

  const explicitAttempt = await startOrResumeTopicProduction(topic, deps, 'retry');
  assert.equal(explicitAttempt.kind, 'unknown');
  assert.equal(createCalls, 1, 'a retry action must pass a fresh status GET before any same-key POST');
});

test('topics outside the production handoff stages are rejected before any write', async () => {
  let writes = 0;
  const deps = dependencies({
    getTopicStatus: async () => 'approved',
    advanceTopic: async () => { writes += 1; },
    listProductions: async () => [],
    createDraft: async () => { writes += 1; return { productionId: 99 }; },
  });

  await assert.rejects(
    startOrResumeTopicProduction({ id: 9, status: 'shooting' }, deps),
    /只有已通过或创作中的选题可以开始创作/,
  );
  assert.equal(writes, 0);
});
