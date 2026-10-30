import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingMobileTopicStatusWrite,
  readPendingMobileTopicStatusWrites,
  savePendingMobileTopicStatusWrite,
  type PendingMobileTopicStatusWrite,
} from '../../src/pages/mobile/mobileTopicStatusRecovery.js';

type RecoveryStorage = Parameters<typeof readPendingMobileTopicStatusWrites>[1];

function createStorage(overrides: Partial<NonNullable<RecoveryStorage>> = {}) {
  const values = new Map<string, string>();
  const storage: NonNullable<RecoveryStorage> = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    ...overrides,
  };
  return { storage, values };
}

const auditWrite: PendingMobileTopicStatusWrite = {
  userId: 42,
  topicId: 901,
  operation: 'audit',
  before: 'pending',
  target: 'approved',
  title: '恢复状态操作',
  comment: '',
};

test('status recovery persists exact account-scoped audit semantics before a write', () => {
  const { storage, values } = createStorage();

  assert.equal(savePendingMobileTopicStatusWrite(auditWrite, storage), true);
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, storage), { ok: true, entries: [auditWrite] });
  assert.deepEqual(readPendingMobileTopicStatusWrites(43, storage), { ok: true, entries: [] });
  const [key, serialized] = Array.from(values.entries())[0];
  assert.match(key, /user:42$/);
  assert.deepEqual(JSON.parse(serialized), [auditWrite]);
  assert.doesNotMatch(serialized, /token|password|secret/i);
});

test('a silently dropped marker prevents the caller from sending a status write', () => {
  const { storage } = createStorage({ setItem: () => undefined });

  assert.equal(savePendingMobileTopicStatusWrite(auditWrite, storage), false);
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, storage), { ok: true, entries: [] });
});

test('recovery clearing requires an exact marker and preserves other topic writes', () => {
  const secondWrite: PendingMobileTopicStatusWrite = {
    ...auditWrite,
    topicId: 902,
    operation: 'status',
    before: 'production',
    target: 'shooting',
    title: '另一个选题',
  };
  const { storage, values } = createStorage();
  assert.equal(savePendingMobileTopicStatusWrite(auditWrite, storage), true);
  assert.equal(savePendingMobileTopicStatusWrite(secondWrite, storage), true);
  assert.equal(clearPendingMobileTopicStatusWrite({ ...auditWrite, comment: '不同请求内容' }, storage), false);
  assert.equal(clearPendingMobileTopicStatusWrite(auditWrite, storage), true);
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, storage), { ok: true, entries: [secondWrite] });
  assert.equal(clearPendingMobileTopicStatusWrite(secondWrite, storage), true);
  assert.equal(values.size, 0);
});

test('failed marker removal remains visible as a failed recovery clear', () => {
  const { storage } = createStorage({ removeItem: () => undefined });

  assert.equal(savePendingMobileTopicStatusWrite(auditWrite, storage), true);
  assert.equal(clearPendingMobileTopicStatusWrite(auditWrite, storage), false);
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, storage), { ok: true, entries: [auditWrite] });
});

test('corrupt recovery state fails closed and storage errors never authorize clearing', () => {
  const corrupt = createStorage({ getItem: () => '{not-json' }).storage;
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, corrupt), { ok: false, entries: [] });
  assert.equal(clearPendingMobileTopicStatusWrite(auditWrite, corrupt), false);

  const unavailable = createStorage({ getItem: () => { throw new Error('storage read failed'); } }).storage;
  assert.deepEqual(readPendingMobileTopicStatusWrites(42, unavailable), { ok: false, entries: [] });
  assert.equal(savePendingMobileTopicStatusWrite(auditWrite, unavailable), false);
});
