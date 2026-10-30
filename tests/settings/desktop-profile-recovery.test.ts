import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearDesktopProfileRecovery,
  normalizePendingDesktopProfileRecovery,
  persistDesktopProfileRecovery,
  readDesktopProfileRecovery,
  type DesktopProfileRecoveryStorage,
  type PendingDesktopProfileRecovery,
} from '../../src/pages/desktopProfileRecovery';

class MemoryStorage implements DesktopProfileRecoveryStorage {
  values = new Map<string, string>();
  dropWrites = false;
  corruptDraftEmailOnWrite = false;
  retainOnRemove = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.dropWrites) return;
    if (this.corruptDraftEmailOnWrite) {
      const parsed = JSON.parse(value) as PendingDesktopProfileRecovery;
      this.values.set(key, JSON.stringify({ ...parsed, draft: { ...parsed.draft, email: 'altered@example.test' } }));
      return;
    }
    this.values.set(key, value);
  }
  removeItem(key: string) { if (!this.retainOnRemove) this.values.delete(key); }
}

const recovery: PendingDesktopProfileRecovery = {
  version: 1,
  actorId: 73,
  authMode: 'v1-web',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  before: { name: '原姓名', email: 'before@example.test' },
  draft: { name: '新姓名', email: 'draft@example.test' },
};

test('desktop profile recovery persists exactly the actor, auth mode, request and profile snapshots', () => {
  const storage = new MemoryStorage();
  assert.equal(persistDesktopProfileRecovery(recovery, storage), true);
  assert.deepEqual(readDesktopProfileRecovery(73, storage), { state: 'valid', recovery });
  assert.deepEqual(readDesktopProfileRecovery(74, storage), { state: 'none' });
  const stored = JSON.parse(storage.getItem('xmt:desktop-profile-recovery:v1:actor:73') || 'null') as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored).sort(), ['actorId', 'authMode', 'before', 'draft', 'requestId', 'version']);
  assert.equal('token' in stored, false);
  assert.equal('password' in stored, false);
});

test('desktop profile recovery rejects malformed, cross-account, cross-auth and unexpected fields', () => {
  assert.equal(normalizePendingDesktopProfileRecovery({ ...recovery, actorId: 74 }, 73), null);
  assert.equal(normalizePendingDesktopProfileRecovery({ ...recovery, authMode: 'other' }, 73), null);
  assert.equal(normalizePendingDesktopProfileRecovery({ ...recovery, requestId: 'bad-id' }, 73), null);
  assert.equal(normalizePendingDesktopProfileRecovery({ ...recovery, token: 'must-not-be-stored' }, 73), null);
  assert.equal(normalizePendingDesktopProfileRecovery({ ...recovery, draft: { ...recovery.draft, unexpected: true } }, 73), null);
  const storage = new MemoryStorage();
  storage.values.set('xmt:desktop-profile-recovery:v1:actor:73', '{');
  assert.deepEqual(readDesktopProfileRecovery(73, storage), { state: 'invalid' });
});

test('a dropped or field-altered recovery marker fails read-back verification', () => {
  const dropped = new MemoryStorage();
  dropped.dropWrites = true;
  assert.equal(persistDesktopProfileRecovery(recovery, dropped), false);
  assert.deepEqual(readDesktopProfileRecovery(73, dropped), { state: 'none' });

  const altered = new MemoryStorage();
  altered.corruptDraftEmailOnWrite = true;
  assert.equal(persistDesktopProfileRecovery(recovery, altered), false);
  assert.equal(readDesktopProfileRecovery(73, altered).state, 'valid');
});

test('an existing pending request is only replaced by its owner and clear must verify removal', () => {
  const storage = new MemoryStorage();
  assert.equal(persistDesktopProfileRecovery(recovery, storage), true);
  const replacement = {
    ...recovery,
    requestId: '123e4567-e89b-42d3-a456-426614174001',
    before: recovery.draft,
    draft: { name: '再次修改', email: 'again@example.test' },
  };
  assert.equal(persistDesktopProfileRecovery(replacement, storage), false);
  assert.equal(persistDesktopProfileRecovery(replacement, storage, '123e4567-e89b-42d3-a456-426614174001'), false);
  assert.equal(persistDesktopProfileRecovery(replacement, storage, recovery.requestId), true);
  assert.equal(clearDesktopProfileRecovery(recovery, storage), false);
  storage.retainOnRemove = true;
  assert.equal(clearDesktopProfileRecovery(replacement, storage), false);
  storage.retainOnRemove = false;
  assert.equal(clearDesktopProfileRecovery(replacement, storage), true);
  assert.deepEqual(readDesktopProfileRecovery(73, storage), { state: 'none' });
});
