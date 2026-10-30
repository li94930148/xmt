import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspirationPromotionRecoveryKey,
  persistInspirationPromotionRecovery,
  readAllInspirationPromotionRecoveries,
  readInspirationPromotionRecovery,
  removeInspirationPromotionRecovery,
  type InspirationPromotionStorage,
  type PendingInspirationPromotion,
} from '../../src/pages/inspirationPromotionRecovery';

class MemoryStorage implements InspirationPromotionStorage {
  private values = new Map<string, string>();
  dropNextWrite = false;
  keepNextRemovedValue = false;

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.dropNextWrite) {
      this.dropNextWrite = false;
      return;
    }
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.keepNextRemovedValue) {
      this.keepNextRemovedValue = false;
      return;
    }
    this.values.delete(key);
  }
}

const pendingA: PendingInspirationPromotion = {
  schemaVersion: 1,
  userId: 7,
  inspirationId: 901,
  operationId: '123e4567-e89b-42d3-a456-426614174000',
};

test('promotion recovery is persisted before mutation and scoped to account plus inspiration', () => {
  const storage = new MemoryStorage();
  assert.equal(persistInspirationPromotionRecovery(storage, pendingA), true);
  assert.equal(readInspirationPromotionRecovery(storage, 7, 901)?.operationId, pendingA.operationId);
  assert.equal(readInspirationPromotionRecovery(storage, 8, 901), null, 'another account cannot read the pending promotion');
  assert.equal(readInspirationPromotionRecovery(storage, 7, 902), null, 'another inspiration cannot read the pending promotion');
  assert.equal(storage.getItem(inspirationPromotionRecoveryKey(7, 901)) !== null, true);
});

test('promotion is not sent when session storage silently drops the preflight marker', () => {
  const storage = new MemoryStorage();
  storage.dropNextWrite = true;
  assert.equal(persistInspirationPromotionRecovery(storage, pendingA), false);
  assert.equal(readInspirationPromotionRecovery(storage, 7, 901), null);
});

test('refresh scan restores only markers for the active account and fails closed on corrupt markers', () => {
  const storage = new MemoryStorage();
  const pendingB = { ...pendingA, inspirationId: 902, operationId: '223e4567-e89b-42d3-a456-426614174000' };
  const otherAccount = { ...pendingA, userId: 8, inspirationId: 903, operationId: '323e4567-e89b-42d3-a456-426614174000' };
  assert.equal(persistInspirationPromotionRecovery(storage, pendingA), true);
  assert.equal(persistInspirationPromotionRecovery(storage, pendingB), true);
  assert.equal(persistInspirationPromotionRecovery(storage, otherAccount), true);
  storage.setItem(inspirationPromotionRecoveryKey(7, 904), '{broken');

  const read = readAllInspirationPromotionRecoveries(storage, 7);
  assert.equal(read.state, 'ready');
  assert.deepEqual(read.pending.map((item) => item.inspirationId), [901, 902]);
  assert.deepEqual(read.invalidIds, [904]);
});

test('clearing a resolved promotion removes only the exact operation and verifies cleanup', () => {
  const storage = new MemoryStorage();
  const replacement = { ...pendingA, operationId: '423e4567-e89b-42d3-a456-426614174000' };
  assert.equal(persistInspirationPromotionRecovery(storage, pendingA), true);
  assert.equal(removeInspirationPromotionRecovery(storage, replacement), false, 'an older completion cannot clear a newer marker');
  assert.equal(readInspirationPromotionRecovery(storage, 7, 901)?.operationId, pendingA.operationId);
  assert.equal(removeInspirationPromotionRecovery(storage, pendingA), true);
  assert.equal(readInspirationPromotionRecovery(storage, 7, 901), null);

  assert.equal(persistInspirationPromotionRecovery(storage, pendingA), true);
  storage.keepNextRemovedValue = true;
  assert.equal(removeInspirationPromotionRecovery(storage, pendingA), false, 'silent remove failure stays visible to the caller');
  assert.equal(readInspirationPromotionRecovery(storage, 7, 901)?.operationId, pendingA.operationId);
});

test('unavailable storage is reported as unavailable rather than an empty recovery set', () => {
  const storage: InspirationPromotionStorage = {
    get length() { throw new Error('storage disabled'); },
    key() { return null; },
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  assert.deepEqual(readAllInspirationPromotionRecoveries(storage, 7), { state: 'unavailable', pending: [], invalidIds: [] });
});
