import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearResourceCreateRecovery,
  normalizeResourceCreateRecovery,
  persistResourceCreateRecovery,
  persistResourceCreateRejection,
  readResourceCreateRecovery,
  resourceCreateRecoveryStorageKey,
  type ResourceCreateRecovery,
} from '../../src/utils/resourceCreateRecovery.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  blocked = false;
  failSet = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); this.values.delete(key); }
  setItem(key: string, value: string) { if (this.blocked || this.failSet) throw new Error('storage unavailable'); this.values.set(key, String(value)); }
}

test('resource create recovery preserves exact payload and isolates actor/request identity', () => {
  const storage = new MemoryStorage();
  const recovery: ResourceCreateRecovery = {
    version: 1,
    actorId: 41,
    requestId: '67f40ad4-5e91-4d8c-9fd1-282f536f14b2',
    payload: {
      title: '原始资料标题 ',
      summary: ' 原始摘要 ',
      content_text: '原始正文\n不改写',
      library_type: 'knowledge',
      category_id: 82,
      visibility: 'private',
    },
  };

  assert.equal(resourceCreateRecoveryStorageKey(41), 'xmt:resource-create-pending:v1:actor:41');
  persistResourceCreateRecovery(recovery, storage);
  assert.deepEqual(readResourceCreateRecovery(41, storage), { state: 'valid', recovery });
  assert.deepEqual(readResourceCreateRecovery(42, storage), { state: 'none' }, 'another actor cannot read this session marker');

  const saved = JSON.parse(storage.getItem(resourceCreateRecoveryStorageKey(41)) || 'null') as ResourceCreateRecovery;
  assert.deepEqual(saved.payload, recovery.payload, 'safe retry retains the exact normalized request body');
  assert.equal(normalizeResourceCreateRecovery(saved, 42), null, 'a marker cannot be consumed by another account');
  assert.equal(clearResourceCreateRecovery(41, 'ad5f5aa9-72bf-4f9b-a8f5-6b61bcd481c1', storage), false, 'a stale completion cannot clear a newer request');
  assert.equal(readResourceCreateRecovery(41, storage).state, 'valid');

  const rejected = { ...recovery, rejectionStatus: 403, rejectionCode: 'FORBIDDEN' };
  storage.setItem(resourceCreateRecoveryStorageKey(41), JSON.stringify(rejected));
  assert.deepEqual(readResourceCreateRecovery(41, storage), { state: 'valid', recovery: rejected }, 'definite rejection state survives refresh without exposing same-key retry');

  storage.setItem(resourceCreateRecoveryStorageKey(41), JSON.stringify(recovery));
  storage.failSet = true;
  const rejectionFallback = new MemoryStorage();
  assert.equal(persistResourceCreateRejection(rejected, storage, rejectionFallback), true, 'a rejected request uses durable fallback storage when replacing the session marker fails');
  assert.deepEqual(readResourceCreateRecovery(41, storage, rejectionFallback), { state: 'valid', recovery: rejected });
  assert.equal(clearResourceCreateRecovery(41, recovery.requestId, storage, rejectionFallback), true, 'explicit rejection release clears both session and fallback markers');
  assert.deepEqual(readResourceCreateRecovery(41, storage, rejectionFallback), { state: 'none' });
  storage.failSet = false;

  assert.equal(clearResourceCreateRecovery(41, recovery.requestId, storage), true);
  assert.deepEqual(readResourceCreateRecovery(41, storage), { state: 'none' });
  storage.setItem(resourceCreateRecoveryStorageKey(41), '{broken');
  assert.deepEqual(readResourceCreateRecovery(41, storage), { state: 'invalid' }, 'corrupt markers fail closed');
  assert.throws(() => persistResourceCreateRecovery(recovery, storage), /无法安全读取/);
  storage.clear();
  storage.blocked = true;
  assert.deepEqual(readResourceCreateRecovery(41, storage), { state: 'unavailable' });
});
