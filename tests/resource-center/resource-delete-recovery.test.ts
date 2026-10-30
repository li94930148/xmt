import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearResourceDeleteRecovery,
  createResourceDeleteRequestId,
  normalizeResourceDeleteRecovery,
  persistResourceDeleteRecovery,
  readResourceDeleteRecovery,
  resourceDeleteRecoveryStorageKey,
  type ResourceDeleteRecovery,
} from '../../src/utils/resourceDeleteRecovery.js';

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

const recovery: ResourceDeleteRecovery = {
  version: 1,
  actorId: 41,
  resourceId: 701,
  libraryType: 'knowledge',
  requestId: '67f40ad4-5e91-4d8c-9fd1-282f536f14b2',
};

test('resource delete recovery is persisted and isolated by actor and resource', () => {
  const storage = new MemoryStorage();
  assert.equal(resourceDeleteRecoveryStorageKey(41), 'xmt:resource-delete-pending:v1:user:41');
  persistResourceDeleteRecovery(recovery, storage);
  assert.deepEqual(readResourceDeleteRecovery(41, storage), { state: 'valid', recovery });
  assert.deepEqual(readResourceDeleteRecovery(42, storage), { state: 'none' });
  assert.equal(normalizeResourceDeleteRecovery(recovery, 42), null);
  assert.throws(() => persistResourceDeleteRecovery({ ...recovery, resourceId: 702, requestId: 'ad5f5aa9-72bf-4f9b-a8f5-6b61bcd481c1' }, storage), /已有资料删除结果待核实/);
  assert.equal(clearResourceDeleteRecovery({ ...recovery, resourceId: 702 }, storage), false, 'a stale operation cannot clear another resource marker');
  assert.equal(clearResourceDeleteRecovery(recovery, storage), true);
  assert.deepEqual(readResourceDeleteRecovery(41, storage), { state: 'none' });
});

test('resource delete recovery fails closed on corrupt or unavailable storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(resourceDeleteRecoveryStorageKey(41), '{broken');
  assert.deepEqual(readResourceDeleteRecovery(41, storage), { state: 'invalid' });
  assert.throws(() => persistResourceDeleteRecovery(recovery, storage), /无法安全读取/);
  storage.clear();
  storage.blocked = true;
  assert.deepEqual(readResourceDeleteRecovery(41, storage), { state: 'unavailable' });
  assert.throws(() => persistResourceDeleteRecovery(recovery, storage), /未发送删除请求/);
});

test('resource delete recovery verifies persistence and creates a secure request identifier', () => {
  const storage = new MemoryStorage();
  storage.failSet = true;
  assert.throws(() => persistResourceDeleteRecovery(recovery, storage), /未能可靠保存/);
  const requestId = createResourceDeleteRequestId();
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
