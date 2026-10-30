import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearDesktopPasswordChangeRecovery,
  clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin,
  normalizePendingDesktopPasswordChangeRecovery,
  persistDesktopPasswordChangeRecovery,
  readDesktopPasswordChangeRecovery,
  type DesktopPasswordChangeRecoveryStorage,
  type PendingDesktopPasswordChangeRecovery,
} from '../../src/lib/desktopPasswordChangeRecovery';

class MemoryStorage implements DesktopPasswordChangeRecoveryStorage {
  values = new Map<string, string>();
  dropWrites = false;
  retainOnRemove = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (!this.dropWrites) this.values.set(key, value); }
  removeItem(key: string) { if (!this.retainOnRemove) this.values.delete(key); }
}

const recovery: PendingDesktopPasswordChangeRecovery = {
  version: 1,
  actorId: 73,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
};

test('desktop password recovery persists an actor-scoped request marker', () => {
  const storage = new MemoryStorage();
  assert.equal(persistDesktopPasswordChangeRecovery(recovery, storage), true);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'valid', recovery });
  assert.deepEqual(readDesktopPasswordChangeRecovery(74, storage), { state: 'none' });
});

test('desktop password recovery rejects malformed and cross-account markers', () => {
  assert.equal(normalizePendingDesktopPasswordChangeRecovery({ ...recovery, actorId: 74 }, 73), null);
  assert.equal(normalizePendingDesktopPasswordChangeRecovery({ ...recovery, requestId: 'bad-id' }, 73), null);
  assert.equal(normalizePendingDesktopPasswordChangeRecovery({ ...recovery, password: 'secret' }, 73), null);
  const storage = new MemoryStorage();
  storage.values.set('xmt:desktop-password-change-recovery:v1:actor:73', '{');
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'invalid' });
});

test('a silently dropped password recovery marker prevents the request prerequisite', () => {
  const storage = new MemoryStorage();
  storage.dropWrites = true;
  assert.equal(persistDesktopPasswordChangeRecovery(recovery, storage), false);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'none' });
});

test('desktop password recovery clears only its owning request and verifies removal', () => {
  const storage = new MemoryStorage();
  assert.equal(persistDesktopPasswordChangeRecovery(recovery, storage), true);
  const otherRequest = { ...recovery, requestId: '123e4567-e89b-42d3-a456-426614174001' };
  assert.equal(clearDesktopPasswordChangeRecovery(otherRequest, storage), false);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'valid', recovery });
  storage.retainOnRemove = true;
  assert.equal(clearDesktopPasswordChangeRecovery(recovery, storage), false);
  storage.retainOnRemove = false;
  assert.equal(clearDesktopPasswordChangeRecovery(recovery, storage), true);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'none' });
});

test('a successful actor re-login clears only that actor recovery marker', () => {
  const storage = new MemoryStorage();
  assert.equal(persistDesktopPasswordChangeRecovery(recovery, storage), true);
  assert.equal(clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin(74, storage), true);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'valid', recovery });
  assert.equal(clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin(73, storage), true);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'none' });
});

test('a successful actor re-login removes a malformed recovery marker and verifies cleanup', () => {
  const storage = new MemoryStorage();
  storage.values.set('xmt:desktop-password-change-recovery:v1:actor:73', '{');
  assert.equal(clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin(73, storage), true);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'none' });
  storage.values.set('xmt:desktop-password-change-recovery:v1:actor:73', '{');
  storage.retainOnRemove = true;
  assert.equal(clearDesktopPasswordChangeRecoveryAfterSuccessfulLogin(73, storage), false);
  assert.deepEqual(readDesktopPasswordChangeRecovery(73, storage), { state: 'invalid' });
});
