import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resourceCategoryMutationCanonicalRequest } from '../../shared/resource-category-mutation.js';
import {
  clearResourceCategoryMutationRecovery,
  createResourceCategoryMutationFingerprint,
  normalizeResourceCategoryMutationRecovery,
  persistResourceCategoryMutationRecovery,
  persistResourceCategoryMutationRejection,
  readResourceCategoryMutationRecovery,
  resourceCategoryMutationRecoveryKey,
} from '../../src/utils/resourceCategoryMutationRecovery.js';

class MemoryStorage {
  readonly data = new Map<string, string>();
  failSet = false;
  failRemove = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error('storage set unavailable'); this.data.set(key, value); }
  removeItem(key: string) { if (this.failRemove) throw new Error('storage remove unavailable'); this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

const session = new MemoryStorage();
const local = new MemoryStorage();
const recovery = {
  version: 1 as const,
  actorId: 41,
  libraryType: 'knowledge' as const,
  operation: 'create' as const,
  categoryId: null,
  requestId: 'f1c7f8a0-2b87-4782-a117-d81ed4c08d40',
  fingerprint: '0'.repeat(64),
  payload: { name: '新分类', parent_id: 82 },
};

const fingerprint = await createResourceCategoryMutationFingerprint('create', 'knowledge', null, recovery.payload);
assert.equal(
  fingerprint,
  createHash('sha256').update(resourceCategoryMutationCanonicalRequest('create', 'knowledge', null, recovery.payload)).digest('hex'),
  'browser and server fingerprint material match',
);
const validRecovery = { ...recovery, fingerprint };
persistResourceCategoryMutationRecovery(validRecovery, session as unknown as Storage, local as unknown as Storage);
assert.deepEqual(readResourceCategoryMutationRecovery(41, session as unknown as Storage, local as unknown as Storage), { state: 'valid', recovery: validRecovery });
assert.deepEqual(readResourceCategoryMutationRecovery(42, session as unknown as Storage, local as unknown as Storage), { state: 'none' }, 'recovery is actor scoped');
assert.equal(clearResourceCategoryMutationRecovery(41, 'different-request', session as unknown as Storage, local as unknown as Storage), false);
assert.equal(clearResourceCategoryMutationRecovery(41, validRecovery.requestId, session as unknown as Storage, local as unknown as Storage), true);

const failedSession = new MemoryStorage();
const rejectionFallback = new MemoryStorage();
const failedRecovery = { ...validRecovery, requestId: 'f1c7f8a0-2b87-4782-a117-d81ed4c08d41' };
failedSession.data.set(resourceCategoryMutationRecoveryKey(41), JSON.stringify(failedRecovery));
failedSession.failSet = true;
failedSession.failRemove = true;
const rejected = { ...failedRecovery, rejectionStatus: 409 };
assert.equal(persistResourceCategoryMutationRejection(rejected, failedSession as unknown as Storage, rejectionFallback as unknown as Storage), true, 'local rejection fallback survives session write failure');
assert.equal(clearResourceCategoryMutationRecovery(41, failedRecovery.requestId, failedSession as unknown as Storage, rejectionFallback as unknown as Storage), false, 'failed session cleanup keeps the original marker locked');
const afterRefresh = readResourceCategoryMutationRecovery(41, failedSession as unknown as Storage, rejectionFallback as unknown as Storage);
assert.equal(afterRefresh.state, 'valid');
if (afterRefresh.state === 'valid') {
  assert.equal(afterRefresh.recovery.rejectionStatus, 409, 'a definite rejection remains recorded across refresh even when the session store cannot update or clear');
  assert.equal(afterRefresh.recovery.requestId, failedRecovery.requestId);
}

assert.equal(normalizeResourceCategoryMutationRecovery({ ...validRecovery, categoryId: 0 }, 41), null);
assert.equal(normalizeResourceCategoryMutationRecovery({ ...validRecovery, fingerprint: 'bad' }, 41), null);
assert.equal(normalizeResourceCategoryMutationRecovery({ ...validRecovery, payload: { name: '', parent_id: null } }, 41), null);
console.log('Resource category mutation recovery tests passed.');
