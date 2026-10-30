import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearNotificationPreferenceRecovery,
  normalizePendingNotificationPreferenceRecovery,
  persistNotificationPreferenceRecovery,
  readNotificationPreferenceRecovery,
  type NotificationPreferenceRecoveryStorage,
  type PendingNotificationPreferenceRecovery,
} from '../../src/pages/notificationPreferenceRecovery';

class MemoryStorage implements NotificationPreferenceRecoveryStorage {
  values = new Map<string, string>();
  dropWrites = false;
  retainOnRemove = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (!this.dropWrites) this.values.set(key, value); }
  removeItem(key: string) { if (!this.retainOnRemove) this.values.delete(key); }
}

const recovery: PendingNotificationPreferenceRecovery = {
  version: 1,
  actorId: 73,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  draft: [{ channel: 'email', event_type: 'review', enabled: false, config: null }],
};

test('notification recovery persists a normalized account-scoped draft', () => {
  const storage = new MemoryStorage();
  assert.equal(persistNotificationPreferenceRecovery(recovery, storage), true);
  assert.deepEqual(readNotificationPreferenceRecovery(73, storage), { state: 'valid', recovery });
  assert.deepEqual(readNotificationPreferenceRecovery(74, storage), { state: 'none' });
});

test('notification recovery rejects malformed, mismatched, and unknown data', () => {
  assert.equal(normalizePendingNotificationPreferenceRecovery({ ...recovery, actorId: 74 }, 73), null);
  assert.equal(normalizePendingNotificationPreferenceRecovery({ ...recovery, requestId: 'bad-id' }, 73), null);
  assert.equal(normalizePendingNotificationPreferenceRecovery({ ...recovery, draft: [{ ...recovery.draft[0], enabled: 'false' }] }, 73), null);
  const storage = new MemoryStorage();
  storage.values.set('xmt:notification-preferences-recovery:v1:actor:73', '{');
  assert.deepEqual(readNotificationPreferenceRecovery(73, storage), { state: 'invalid' });
});

test('a silently dropped notification recovery marker prevents its PUT prerequisite', () => {
  const storage = new MemoryStorage();
  storage.dropWrites = true;
  assert.equal(persistNotificationPreferenceRecovery(recovery, storage), false);
  assert.deepEqual(readNotificationPreferenceRecovery(73, storage), { state: 'none' });
});

test('notification recovery clears only the owning request and verifies removal', () => {
  const storage = new MemoryStorage();
  assert.equal(persistNotificationPreferenceRecovery(recovery, storage), true);
  const otherRequest = { ...recovery, requestId: '123e4567-e89b-42d3-a456-426614174001' };
  assert.equal(clearNotificationPreferenceRecovery(otherRequest, storage), false);
  assert.deepEqual(readNotificationPreferenceRecovery(73, storage), { state: 'valid', recovery });
  storage.retainOnRemove = true;
  assert.equal(clearNotificationPreferenceRecovery(recovery, storage), false);
  storage.retainOnRemove = false;
  assert.equal(clearNotificationPreferenceRecovery(recovery, storage), true);
  assert.deepEqual(readNotificationPreferenceRecovery(73, storage), { state: 'none' });
});
