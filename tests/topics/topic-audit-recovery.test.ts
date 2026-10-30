import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSameTopicAuditRecovery,
  persistTopicAuditRecovery,
  readTopicAuditRecovery,
  removeTopicAuditRecovery,
  resolveTopicAuditRecovery,
  topicAuditRecoveryKey,
  type PendingTopicAuditWrite,
  type TopicAuditRecoveryStorage,
} from '../../src/pages/topicAuditRecovery';
import type { Topic } from '../../src/types';

class MemoryStorage implements TopicAuditRecoveryStorage {
  values = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  getItem(key: string) {
    if (this.failGet) throw new Error('storage read denied');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failSet) throw new Error('storage write denied');
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (this.failRemove) throw new Error('storage remove denied');
    this.values.delete(key);
  }
}

const pending: PendingTopicAuditWrite = {
  kind: 'write',
  version: 1,
  requestId: 'request-934-1',
  userId: 93,
  topicId: 934,
  beforeStatus: 'pending',
  beforeAssigneeId: 0,
  baselineHistoryId: 12,
  target: 'approved',
  comment: '选题结构清楚',
  assigneeId: 96,
  createdAt: 1_798_000_000_000,
};

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: pending.topicId,
    title: '恢复审核验收',
    description: '',
    status: 'pending',
    platform: '抖音',
    deadline: '2026-10-31',
    creator_id: pending.userId,
    assignee_id: pending.beforeAssigneeId,
    created_at: '2026-10-29 09:00:00',
    updated_at: '2026-10-29 09:00:00',
    history: [{ id: pending.baselineHistoryId, topic_id: pending.topicId, action: 'created', comment: '', operator_id: pending.userId }],
    ...overrides,
  };
}

test('audit recovery persists and reads back the exact actor, topic, operation and comment', () => {
  const storage = new MemoryStorage();
  persistTopicAuditRecovery(storage, pending);

  const restored = readTopicAuditRecovery(storage, pending.userId, pending.topicId);
  assert.ok(restored?.kind === 'write');
  assert.equal(isSameTopicAuditRecovery(restored, pending), true);
  assert.equal(readTopicAuditRecovery(storage, pending.userId + 1, pending.topicId), null);
  assert.equal(readTopicAuditRecovery(storage, pending.userId, pending.topicId + 1), null);
});

test('audit recovery marker write/read-back failure fails closed before a caller can submit', () => {
  const blockedStorage = new MemoryStorage();
  blockedStorage.failSet = true;
  assert.throws(() => persistTopicAuditRecovery(blockedStorage, pending), /storage write denied/);

  const unreadableStorage = new MemoryStorage();
  unreadableStorage.getItem = () => { throw new Error('storage read denied'); };
  assert.throws(() => persistTopicAuditRecovery(unreadableStorage, pending), /未能完整保存/);
  assert.equal(unreadableStorage.values.has(topicAuditRecoveryKey(pending.userId, pending.topicId)), true);
});

test('audit recovery recognizes only a new matching audit history record as applied', () => {
  assert.equal(resolveTopicAuditRecovery(pending, topic({
    status: 'approved',
    assignee_id: pending.assigneeId,
    history: [{ id: pending.baselineHistoryId + 1, topic_id: pending.topicId, action: 'approved', comment: pending.comment, operator_id: pending.userId }],
  })), 'applied');

  assert.equal(resolveTopicAuditRecovery(pending, topic()), 'unchanged');
  assert.equal(resolveTopicAuditRecovery(pending, topic({ status: 'rejected' })), 'changed');
  assert.equal(resolveTopicAuditRecovery(pending, topic({ history: undefined })), 'changed', 'missing history is not safe grounds for retry');
  assert.equal(resolveTopicAuditRecovery(pending, topic({ history: [{ id: 13, topic_id: pending.topicId, action: 'updated', comment: '并发修改', operator_id: 93 }] })), 'changed');
});

test('audit recovery removes only the marker for the completed request', () => {
  const storage = new MemoryStorage();
  persistTopicAuditRecovery(storage, pending);
  const replacement = { ...pending, requestId: 'request-replacement' };
  storage.values.set(topicAuditRecoveryKey(pending.userId, pending.topicId), JSON.stringify(replacement));
  assert.equal(removeTopicAuditRecovery(storage, pending), false);
  assert.equal(readTopicAuditRecovery(storage, pending.userId, pending.topicId)?.kind, 'write');

  storage.values.set(topicAuditRecoveryKey(pending.userId, pending.topicId), JSON.stringify(pending));
  assert.equal(removeTopicAuditRecovery(storage, pending), true);
  assert.equal(readTopicAuditRecovery(storage, pending.userId, pending.topicId), null);
});
