import assert from 'node:assert/strict';
import {
  clearTopicCreateRecovery,
  normalizeTopicCreateRecovery,
  persistTopicCreateRecovery,
  persistTopicCreateRejection,
  readTopicCreateRecovery,
  topicCreateRecoveryStorageKey,
  type TopicCreateRecovery,
} from '../../src/utils/topicCreateRecovery.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failSet = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { if (this.failSet) throw new Error('storage quota exceeded'); this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
const rejectionStorage = new MemoryStorage();
const requestId = '9a1b3e22-74a7-4d6f-9c12-45dd8a670b21';
const recovery: TopicCreateRecovery = {
  version: 1,
  actorId: 17,
  requestId,
  payload: {
    title: '保留用户原始标题 ',
    description: '【项目背景】\n原始背景\n\n【目标受众】\n目标人群',
    outline: '<p>原始大纲</p>',
    platform: '抖音',
    deadline: '2026-11-02',
    assignee_id: 23,
    creator_suggestion_source: { account_uid: 'creator-account', suggestion_id: 'a'.repeat(20), evidence_id: 'b'.repeat(32) },
  },
  draftId: 'topic-draft-17-original',
  draftSnapshot: {
    title: '保留用户原始标题 ',
    platform: '抖音',
    deadline: '2026-11-02',
    assignee_id: '23',
    projectBackground: '原始背景',
    targetAudience: '目标人群',
    expectedGoal: '',
    budget: '',
    outline: '<p>原始大纲</p>',
  },
};

assert.equal(topicCreateRecoveryStorageKey(17), 'xmt:topic-create-pending:v1:actor:17');
persistTopicCreateRecovery(recovery, storage);
assert.deepEqual(readTopicCreateRecovery(17, storage), { state: 'valid', recovery });
assert.deepEqual(readTopicCreateRecovery(18, storage), { state: 'none' }, 'recovery is isolated by actor scope');

const stored = JSON.parse(storage.getItem(topicCreateRecoveryStorageKey(17)) || 'null') as TopicCreateRecovery;
assert.deepEqual(stored.payload, recovery.payload, 'the exact original submitted payload is stored for a safe replay');
assert.equal(normalizeTopicCreateRecovery(stored, 18), null, 'a marker cannot be read under a different actor identity');

const conflicting = { ...recovery, requestId: '3e2817b0-63f9-4517-9a3a-a0c257db9302' };
assert.throws(() => persistTopicCreateRecovery(conflicting, storage), /尚未核实/);
assert.equal(clearTopicCreateRecovery(17, conflicting.requestId, storage), false, 'a stale completion cannot remove a different request marker');
assert.equal(readTopicCreateRecovery(17, storage).state, 'valid');
assert.equal(clearTopicCreateRecovery(17, requestId, storage), true);
assert.deepEqual(readTopicCreateRecovery(17, storage), { state: 'none' });

persistTopicCreateRecovery(recovery, storage);
storage.failSet = true;
const rejectedRecovery = { ...recovery, rejectionStatus: 403 };
assert.equal(persistTopicCreateRejection(rejectedRecovery, storage, rejectionStorage), true, 'a rejected request uses durable fallback storage when replacing the session marker fails');
assert.deepEqual(readTopicCreateRecovery(17, storage, rejectionStorage), { state: 'valid', recovery: rejectedRecovery });
assert.equal(clearTopicCreateRecovery(17, requestId, storage, rejectionStorage), true, 'explicit rejection release clears both session and fallback markers');
assert.deepEqual(readTopicCreateRecovery(17, storage, rejectionStorage), { state: 'none' });
storage.failSet = false;

storage.setItem(topicCreateRecoveryStorageKey(17), '{invalid');
assert.deepEqual(readTopicCreateRecovery(17, storage), { state: 'invalid' }, 'corrupt markers fail closed instead of permitting a new create');
assert.throws(() => persistTopicCreateRecovery(recovery, storage), /无法安全读取/);
storage.removeItem(topicCreateRecoveryStorageKey(17));

const throwingStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
  clear() {},
  key() { return null; },
  length: 0,
} as Storage;
assert.deepEqual(readTopicCreateRecovery(17, throwingStorage), { state: 'unavailable' });

console.log('Topic create recovery storage tests passed');
