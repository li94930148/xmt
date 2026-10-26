import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearResourceUpdateRecovery,
  normalizeResourceUpdateRecovery,
  persistResourceUpdateRecovery,
  persistResourceUpdateRejection,
  readResourceUpdateRecovery,
  resourceUpdateRecoveryStorageKey,
  type ResourceUpdateRecovery,
} from '../../src/utils/resourceUpdateRecovery.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  blocked = false;
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { if (this.blocked) throw new Error('storage unavailable'); this.values.delete(key); }
  setItem(key: string, value: string) { if (this.blocked || this.failWrites) throw new Error('storage unavailable'); this.values.set(key, String(value)); }
}

test('resource update recovery stores the exact actor-scoped payload with its request identity', () => {
  const storage = new MemoryStorage();
  const recovery: ResourceUpdateRecovery = {
    version: 1,
    actorId: 41,
    resourceId: 901,
    libraryType: 'knowledge',
    requestId: 'f5037e85-cc70-49f9-b39f-1d84bd049d3b',
    payload: { title: '新标题', summary: '摘要', category_id: 12, visibility: 'team', content_text: '正文' },
  };

  assert.equal(resourceUpdateRecoveryStorageKey(41), 'xmt:resource-update-pending:v1:actor:41');
  persistResourceUpdateRecovery(recovery, storage);
  assert.deepEqual(readResourceUpdateRecovery(41, storage), { state: 'valid', recovery });
  assert.deepEqual(readResourceUpdateRecovery(42, storage), { state: 'none' }, 'another actor cannot consume this marker');
  const saved = JSON.parse(storage.getItem(resourceUpdateRecoveryStorageKey(41)) || 'null') as Record<string, unknown>;
  assert.deepEqual(Object.keys(saved).sort(), ['actorId', 'libraryType', 'payload', 'requestId', 'resourceId', 'version']);
  assert.deepEqual(saved.payload, recovery.payload, 'refresh recovery can replay exactly the original body');
  assert.equal(normalizeResourceUpdateRecovery(saved, 42), null, 'actor identity is checked again when consuming the marker');
  assert.equal(clearResourceUpdateRecovery(41, '8a3ed49d-dc41-45c0-a856-7a6b14511d25', storage), false, 'a stale response cannot clear another request');
  assert.equal(clearResourceUpdateRecovery(41, recovery.requestId, storage), true);
  assert.deepEqual(readResourceUpdateRecovery(41, storage), { state: 'none' });

  storage.setItem(resourceUpdateRecoveryStorageKey(41), '{broken');
  assert.deepEqual(readResourceUpdateRecovery(41, storage), { state: 'invalid' }, 'corrupt state fails closed');
  storage.clear();
  storage.blocked = true;
  assert.deepEqual(readResourceUpdateRecovery(41, storage), { state: 'unavailable' });
});

test('a definite rejection survives session write failure in a local fallback and cannot be replayed', () => {
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const recovery: ResourceUpdateRecovery = {
    version: 1,
    actorId: 41,
    resourceId: 901,
    libraryType: 'knowledge',
    requestId: 'f5037e85-cc70-49f9-b39f-1d84bd049d3b',
    payload: { title: '新标题', summary: null, category_id: null, visibility: 'team', content_text: null },
  };
  persistResourceUpdateRecovery(recovery, session);
  session.failWrites = true;

  const rejected = { ...recovery, rejectionStatus: 403, rejectionCode: 'FORBIDDEN' };
  assert.equal(persistResourceUpdateRejection(rejected, session, local), true);
  assert.deepEqual(readResourceUpdateRecovery(41, session, local), { state: 'valid', recovery: rejected });
  assert.equal(clearResourceUpdateRecovery(41, recovery.requestId, session, local), true);
  assert.deepEqual(readResourceUpdateRecovery(41, session, local), { state: 'none' });

  assert.equal(normalizeResourceUpdateRecovery({ ...recovery, rejectionStatus: 503 }, 41), null, 'transient server failures must not be treated as final rejection');
});
