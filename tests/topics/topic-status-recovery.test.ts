import assert from 'node:assert/strict';
import test from 'node:test';
import { completeTopicStatusRecovery, isSameTopicStatusRecovery, type TopicStatusRecoveryIdentity } from '../../src/pages/topicStatusRecovery';

test('completion of topic A recovery preserves topic B pending marker and lock', () => {
  const topicA: TopicStatusRecoveryIdentity = {
    kind: 'write', topicId: 101, userId: 7, before: 'shooting', target: 'publishing', createdAt: 1001,
  };
  const topicB: TopicStatusRecoveryIdentity = {
    kind: 'write', topicId: 102, userId: 7, before: 'production', target: 'shooting', createdAt: 1002,
  };
  const persisted = new Map([[`${topicA.userId}:${topicA.topicId}`, topicA], [`${topicB.userId}:${topicB.topicId}`, topicB]]);
  let current: TopicStatusRecoveryIdentity | null = topicB;
  let currentCleared = false;

  const didClearCurrent = completeTopicStatusRecovery(
    current,
    topicA,
    (completed) => {
      const key = `${completed.userId}:${completed.topicId}`;
      const stored = persisted.get(key);
      if (stored && isSameTopicStatusRecovery(stored, completed)) persisted.delete(key);
    },
    () => {
      current = null;
      currentCleared = true;
    },
  );

  assert.equal(didClearCurrent, false, 'A completion does not clear the active recovery loaded for B');
  assert.equal(currentCleared, false, 'B remains locked while its own outcome is unresolved');
  assert.equal(current, topicB);
  assert.deepEqual([...persisted.keys()], ['7:102'], 'only A’s captured recovery marker is removed');
});

test('completion clears the active recovery only when its captured write matches', () => {
  const active: TopicStatusRecoveryIdentity = {
    kind: 'write', topicId: 201, userId: 8, before: 'shooting', target: 'publishing', createdAt: 2001,
  };
  let currentCleared = false;
  const removed: TopicStatusRecoveryIdentity[] = [];

  const didClearCurrent = completeTopicStatusRecovery(
    active,
    { ...active },
    (completed) => removed.push(completed),
    () => { currentCleared = true; },
  );

  assert.equal(didClearCurrent, true);
  assert.equal(currentCleared, true);
  assert.equal(removed.length, 1);
});
