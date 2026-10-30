import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRetroTransitionRecovery,
  persistRetroTransitionRecovery,
  readRetroTransitionRecovery,
  retroTransitionRecoveryKey,
  type PendingRetroTransitionRecovery,
} from '../../src/components/retrospectives/retroTransitionRecovery';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const marker: PendingRetroTransitionRecovery = {
  version: 1,
  actorId: 12,
  retroId: 34,
  operation: 'publish',
  originalStatus: 'draft',
  targetStatus: 'published',
  requestId: 'd7335cdf-e48c-47f3-bc09-6aa95d77d020',
};

test('transition recovery is scoped to the current account and retrospective', () => {
  const storage = new MemoryStorage();
  assert.equal(readRetroTransitionRecovery(12, 34, storage).state, 'none');
  assert.equal(persistRetroTransitionRecovery(marker, storage), true);
  assert.deepEqual(readRetroTransitionRecovery(12, 34, storage), { state: 'valid', marker });
  assert.equal(readRetroTransitionRecovery(13, 34, storage).state, 'none');
  assert.equal(readRetroTransitionRecovery(12, 35, storage).state, 'none');
});

test('invalid status pairs, request ids, extra fields and malformed records fail closed', () => {
  const storage = new MemoryStorage();
  const key = retroTransitionRecoveryKey(12, 34);
  for (const raw of [
    '{',
    JSON.stringify({ ...marker, targetStatus: 'archived' }),
    JSON.stringify({ ...marker, requestId: 'not-a-uuid' }),
    JSON.stringify({ ...marker, token: 'unexpected' }),
  ]) {
    storage.setItem(key, raw);
    assert.equal(readRetroTransitionRecovery(12, 34, storage).state, 'invalid');
  }
});

test('writing requires exact readback and never overwrites another unresolved request', () => {
  const storage = new MemoryStorage();
  const key = retroTransitionRecoveryKey(12, 34);
  assert.equal(persistRetroTransitionRecovery(marker, storage), true);
  assert.equal(persistRetroTransitionRecovery({ ...marker, requestId: '6b0392df-7bf4-4007-a839-933ad6274530' }, storage), false);
  assert.equal(storage.getItem(key), JSON.stringify(marker));
});

test('clear only removes the matching request and verifies removal', () => {
  const storage = new MemoryStorage();
  const key = retroTransitionRecoveryKey(12, 34);
  assert.equal(persistRetroTransitionRecovery(marker, storage), true);
  assert.equal(clearRetroTransitionRecovery({ ...marker, requestId: '6b0392df-7bf4-4007-a839-933ad6274530' }, storage), false);
  assert.notEqual(storage.getItem(key), null);
  assert.equal(clearRetroTransitionRecovery(marker, storage), true);
  assert.equal(storage.getItem(key), null);
});

test('storage failures fail closed', () => {
  const storage = {
    getItem() { throw new Error('read blocked'); },
    setItem() { throw new Error('write blocked'); },
    removeItem() { throw new Error('remove blocked'); },
  };
  assert.equal(readRetroTransitionRecovery(12, 34, storage).state, 'unavailable');
  assert.equal(persistRetroTransitionRecovery(marker, storage), false);
  assert.equal(clearRetroTransitionRecovery(marker, storage), false);
});
