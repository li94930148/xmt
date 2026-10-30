import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMobileProfileRecovery,
  normalizePendingMobileProfileRecovery,
  persistMobileProfileRecovery,
  readMobileProfileRecovery,
  type MobileProfileRecoveryStorage,
  type PendingMobileProfileRecovery,
} from '../../src/pages/mobile/mobileProfileRecovery.js';

function createStorage(overrides: Partial<MobileProfileRecoveryStorage> = {}) {
  const values = new Map<string, string>();
  const storage: MobileProfileRecoveryStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    ...overrides,
  };
  return { storage, values };
}

const recovery: PendingMobileProfileRecovery = {
  version: 1,
  actorId: 42,
  authMode: 'v1-web',
  requestId: '6bb72b91-8d64-49a5-a820-846369ea4d38',
  before: { name: '原姓名', email: 'before@example.test' },
  draft: { name: '新姓名', email: 'after@example.test' },
};

test('profile recovery writes an exact account-scoped snapshot without auth credentials', () => {
  const { storage, values } = createStorage();
  assert.equal(persistMobileProfileRecovery(recovery, undefined, storage), true);
  assert.deepEqual(readMobileProfileRecovery(42, storage), { state: 'valid', recovery });
  assert.equal(readMobileProfileRecovery(43, storage).state, 'none');
  const [key, serialized] = Array.from(values.entries())[0];
  assert.match(key, /actor:42$/);
  assert.deepEqual(JSON.parse(serialized), recovery);
  assert.doesNotMatch(serialized, /token|password|secret/i);
});

test('a silently dropped marker fails closed before the caller sends a profile update', () => {
  let writes = 0;
  const storage = createStorage({
    setItem: () => { writes += 1; },
  }).storage;
  assert.equal(persistMobileProfileRecovery(recovery, undefined, storage), false);
  assert.equal(writes, 1);
  assert.equal(readMobileProfileRecovery(42, storage).state, 'none');
});

test('malformed markers and nonmatching snapshots are rejected', () => {
  assert.equal(normalizePendingMobileProfileRecovery({ ...recovery, unexpected: true }, 42), null);
  assert.equal(normalizePendingMobileProfileRecovery({ ...recovery, actorId: 43 }, 42), null);
  assert.equal(normalizePendingMobileProfileRecovery({ ...recovery, draft: { name: '新姓名', email: '' , token: 'unsafe' } }, 42), null);
  const { storage } = createStorage({
    getItem: () => '{not-json',
  });
  assert.equal(readMobileProfileRecovery(42, storage).state, 'invalid');
});

test('an explicit retry can replace only the exact previous request snapshot', () => {
  const { storage, values } = createStorage();
  assert.equal(persistMobileProfileRecovery(recovery, undefined, storage), true);
  const retry: PendingMobileProfileRecovery = {
    ...recovery,
    requestId: 'fdb24799-058e-450d-841d-69a9fe1c2625',
    before: { name: '另一处更新', email: 'other@example.test' },
  };
  assert.equal(persistMobileProfileRecovery(retry, '6bb72b91-8d64-49a5-a820-846369ea4d38', storage), true);
  assert.deepEqual(readMobileProfileRecovery(42, storage), { state: 'valid', recovery: retry });
  assert.equal(persistMobileProfileRecovery(recovery, 'wrong-request-id', storage), false);
  assert.equal(JSON.parse(Array.from(values.values())[0]).requestId, retry.requestId);
});

test('clearing is bound to the matching request and verifies the removal', () => {
  const { storage } = createStorage();
  assert.equal(persistMobileProfileRecovery(recovery, undefined, storage), true);
  assert.equal(clearMobileProfileRecovery({ ...recovery, requestId: 'fdb24799-058e-450d-841d-69a9fe1c2625' }, storage), false);
  assert.equal(clearMobileProfileRecovery(recovery, storage), true);
  assert.equal(clearMobileProfileRecovery(recovery, storage), true, 'verified prior removal is already a safe cleared state');
  assert.equal(readMobileProfileRecovery(42, storage).state, 'none');

  const failedRemoval = createStorage({ removeItem: () => undefined }).storage;
  assert.equal(persistMobileProfileRecovery(recovery, undefined, failedRemoval), true);
  assert.equal(clearMobileProfileRecovery(recovery, failedRemoval), false);
});

test('storage errors fail closed', () => {
  const storage = createStorage({
    getItem: () => { throw new Error('storage read failed'); },
  }).storage;
  assert.equal(readMobileProfileRecovery(42, storage).state, 'unavailable');
  assert.equal(persistMobileProfileRecovery(recovery, undefined, storage), false);
});
