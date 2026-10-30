import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearTopicResourceRecovery,
  createTopicResourceRecoveryRequestId,
  normalizePendingTopicResourceRecovery,
  persistTopicResourceRecovery,
  readTopicResourceRecoveries,
  type PendingTopicResourceRecovery,
  type TopicResourceRecoveryStorage,
} from '../../src/components/topic/topicResourceRecovery';

class MemoryStorage implements TopicResourceRecoveryStorage {
  values = new Map<string, string>();
  dropWrites = false;
  alterWrite = false;
  retainOnRemove = false;
  throwOnRead = false;
  throwOnWrite = false;

  getItem(key: string) {
    if (this.throwOnRead) throw new Error('storage read failed');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.throwOnWrite) throw new Error('storage write failed');
    if (this.dropWrites) return;
    if (this.alterWrite) {
      const parsed = JSON.parse(value) as { recoveries: PendingTopicResourceRecovery[] };
      this.values.set(key, JSON.stringify({ ...parsed, recoveries: parsed.recoveries.map((entry) => ({ ...entry, resource: { ...entry.resource, title: '被篡改的资料名' } })) }));
      return;
    }
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (!this.retainOnRemove) this.values.delete(key);
  }
}

const first: PendingTopicResourceRecovery = {
  version: 1,
  actorId: 93,
  topicId: 931,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  resource: { id: 991, title: '隔离验收资料' },
  mutation: 'unlink',
};

const second: PendingTopicResourceRecovery = {
  ...first,
  requestId: '123e4567-e89b-42d3-a456-426614174001',
  resource: { id: 992, title: '另一项资料' },
  mutation: 'link',
};

test('topic resource recovery is scoped by actor and topic and stores only the exact snapshot', () => {
  const storage = new MemoryStorage();
  assert.equal(persistTopicResourceRecovery(first, storage), true);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'valid', recoveries: [first] });
  assert.deepEqual(readTopicResourceRecoveries(94, 931, storage), { state: 'none' });
  assert.deepEqual(readTopicResourceRecoveries(93, 932, storage), { state: 'none' });

  const [key, serialized] = Array.from(storage.values.entries())[0];
  assert.match(key, /actor:93:topic:931$/);
  assert.deepEqual(JSON.parse(serialized), { version: 1, actorId: 93, topicId: 931, recoveries: [first] });
  assert.doesNotMatch(serialized, /token|password|secret/i);
});

test('malformed, cross-scope, duplicate-resource and unexpected-field snapshots are rejected', () => {
  assert.equal(normalizePendingTopicResourceRecovery({ ...first, actorId: 94 }, 93, 931), null);
  assert.equal(normalizePendingTopicResourceRecovery({ ...first, topicId: 932 }, 93, 931), null);
  assert.equal(normalizePendingTopicResourceRecovery({ ...first, requestId: 'not-a-uuid' }, 93, 931), null);
  assert.equal(normalizePendingTopicResourceRecovery({ ...first, token: 'must-not-be-stored' }, 93, 931), null);
  assert.equal(normalizePendingTopicResourceRecovery({ ...first, resource: { ...first.resource, password: 'unsafe' } }, 93, 931), null);

  const storage = new MemoryStorage();
  storage.values.set('xmt:topic-resource-recovery:v1:actor:93:topic:931', '{');
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'invalid' });

  storage.values.set('xmt:topic-resource-recovery:v1:actor:93:topic:931', JSON.stringify({
    version: 1,
    actorId: 93,
    topicId: 931,
    recoveries: [first, { ...first, requestId: second.requestId }],
  }));
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'invalid' });
});

test('silently dropped or altered markers fail exact read-back verification', () => {
  const dropped = new MemoryStorage();
  dropped.dropWrites = true;
  assert.equal(persistTopicResourceRecovery(first, dropped), false);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, dropped), { state: 'none' });

  const altered = new MemoryStorage();
  altered.alterWrite = true;
  assert.equal(persistTopicResourceRecovery(first, altered), false);
  const alteredRead = readTopicResourceRecoveries(93, 931, altered);
  assert.equal(alteredRead.state, 'valid');
  if (alteredRead.state === 'valid') assert.notDeepEqual(alteredRead.recoveries, [first], 'the caller can detect that read-back differs from the exact submitted snapshot');
});

test('pending resources coexist, while a resource cannot be overwritten by another request', () => {
  const storage = new MemoryStorage();
  assert.equal(persistTopicResourceRecovery(first, storage), true);
  assert.equal(persistTopicResourceRecovery(second, storage), true);
  const replacement = { ...first, requestId: '123e4567-e89b-42d3-a456-426614174002' };
  assert.equal(persistTopicResourceRecovery(replacement, storage), false);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'valid', recoveries: [first, second] });
});

test('clear requires the exact resource request and preserves other pending entries', () => {
  const storage = new MemoryStorage();
  assert.equal(persistTopicResourceRecovery(first, storage), true);
  assert.equal(persistTopicResourceRecovery(second, storage), true);
  assert.equal(clearTopicResourceRecovery({ ...first, requestId: '123e4567-e89b-42d3-a456-426614174099' }, storage), false);
  assert.equal(clearTopicResourceRecovery(first, storage), true);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'valid', recoveries: [second] });
  assert.equal(clearTopicResourceRecovery(second, storage), true);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, storage), { state: 'none' });
  assert.equal(clearTopicResourceRecovery(second, storage), true, 'an already verified absent list is safely clear');
});

test('storage read, write and failed removal all fail closed', () => {
  const noStorage = readTopicResourceRecoveries(93, 931, null);
  assert.deepEqual(noStorage, { state: 'unavailable' });

  const readFailure = new MemoryStorage();
  readFailure.throwOnRead = true;
  assert.deepEqual(readTopicResourceRecoveries(93, 931, readFailure), { state: 'unavailable' });
  assert.equal(persistTopicResourceRecovery(first, readFailure), false);

  const writeFailure = new MemoryStorage();
  writeFailure.throwOnWrite = true;
  assert.equal(persistTopicResourceRecovery(first, writeFailure), false);

  const removeFailure = new MemoryStorage();
  assert.equal(persistTopicResourceRecovery(first, removeFailure), true);
  removeFailure.retainOnRemove = true;
  assert.equal(clearTopicResourceRecovery(first, removeFailure), false);
  assert.deepEqual(readTopicResourceRecoveries(93, 931, removeFailure), { state: 'valid', recoveries: [first] });
});

test('request identifiers are UUIDs and distinct', () => {
  const firstId = createTopicResourceRecoveryRequestId();
  const secondId = createTopicResourceRecoveryRequestId();
  assert.match(firstId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(firstId, secondId);
});
