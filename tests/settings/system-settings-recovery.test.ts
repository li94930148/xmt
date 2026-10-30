import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSystemSettingsRecovery,
  normalizePendingSystemSettingsRecovery,
  persistSystemSettingsRecovery,
  readSystemSettingsRecovery,
  type PendingSystemSettingsRecovery,
  type SystemSettingsRecoveryStorage,
} from '../../src/pages/systemSettingsRecovery';

class MemoryStorage implements SystemSettingsRecoveryStorage {
  values = new Map<string, string>();
  dropWrites = false;
  retainOnRemove = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (!this.dropWrites) this.values.set(key, value); }
  removeItem(key: string) { if (!this.retainOnRemove) this.values.delete(key); }
}

const recovery: PendingSystemSettingsRecovery = {
  version: 1,
  actorId: 73,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  patch: {
    system: {
      name: '隔离系统',
      browserTitle: '隔离系统',
      description: '设置恢复测试',
      icon: '测',
      defaultTheme: 'light',
    },
  },
  successMessage: '系统设置已更新',
};

test('system settings recovery persists and reads back an actor-scoped patch', () => {
  const storage = new MemoryStorage();
  assert.equal(persistSystemSettingsRecovery(recovery, storage), true);
  assert.deepEqual(readSystemSettingsRecovery(73, storage), { state: 'valid', recovery });
  assert.deepEqual(readSystemSettingsRecovery(74, storage), { state: 'none' });
});

test('system settings recovery rejects malformed, mismatched, and unknown fields', () => {
  assert.equal(normalizePendingSystemSettingsRecovery({ ...recovery, actorId: 74 }, 73), null);
  assert.equal(normalizePendingSystemSettingsRecovery({ ...recovery, requestId: 'bad-id' }, 73), null);
  assert.equal(normalizePendingSystemSettingsRecovery({ ...recovery, patch: { system: { ...recovery.patch.system, unexpected: 'x' } } }, 73), null);
  const storage = new MemoryStorage();
  storage.values.set('xmt:system-settings-recovery:v1:actor:73', '{');
  assert.deepEqual(readSystemSettingsRecovery(73, storage), { state: 'invalid' });
});

test('a silently dropped recovery marker prevents the settings write', () => {
  const storage = new MemoryStorage();
  storage.dropWrites = true;
  assert.equal(persistSystemSettingsRecovery(recovery, storage), false);
  assert.deepEqual(readSystemSettingsRecovery(73, storage), { state: 'none' });
});

test('recovery clearing requires the owning request and verified removal', () => {
  const storage = new MemoryStorage();
  assert.equal(persistSystemSettingsRecovery(recovery, storage), true);
  const otherRequest = { ...recovery, requestId: '123e4567-e89b-42d3-a456-426614174001' };
  assert.equal(clearSystemSettingsRecovery(otherRequest, storage), false);
  assert.deepEqual(readSystemSettingsRecovery(73, storage), { state: 'valid', recovery });
  storage.retainOnRemove = true;
  assert.equal(clearSystemSettingsRecovery(recovery, storage), false);
  storage.retainOnRemove = false;
  assert.equal(clearSystemSettingsRecovery(recovery, storage), true);
  assert.deepEqual(readSystemSettingsRecovery(73, storage), { state: 'none' });
});
