import assert from 'node:assert/strict';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '../../src/platform/safe-draft.js';

const values = new Map<string, string>();
let storageWritesAvailable = true;
let storageDeletesAvailable = true;
let storageDeletesApplied = true;
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!storageWritesAvailable) throw new Error('storage quota exceeded');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (!storageDeletesAvailable) throw new Error('storage deletion unavailable');
      if (storageDeletesApplied) values.delete(key);
    },
  },
  configurable: true,
});

assert.equal(readSafeDraftValue('daily:2026-08-13'), null);
const firstAccount = userSafeDraftKey(1, 'daily:2026-08-13');
const secondAccount = userSafeDraftKey(2, 'daily:2026-08-13');
assert(firstAccount && secondAccount);
assert.equal(userSafeDraftKey(null, 'daily:2026-08-13'), null);
assert.equal(userSafeDraftKey(0, 'daily:2026-08-13'), null);
writeSafeDraft(firstAccount, '第一位账号的日报');
assert.equal(readSafeDraftValue(secondAccount), null);
assert.equal(readSafeDraftValue(firstAccount), '第一位账号的日报');
storageWritesAvailable = false;
assert.equal(writeSafeDraft(firstAccount, '无法持久化的内容'), false, 'storage failures must be reported to callers');
assert.equal(readSafeDraftValue(firstAccount), '第一位账号的日报', 'failed writes must not replace the last recoverable draft');
storageWritesAvailable = true;
assert.equal(writeSafeDraft('daily:2026-08-13', [{ sectionKey: 'today', contentMd: '完成移动端验证' }]), true);
assert.equal(readSafeDraftValue(secondAccount), null, 'legacy unscoped drafts must not be assigned to a different account');
assert.deepEqual(readSafeDraftValue('daily:2026-08-13'), [{ sectionKey: 'today', contentMd: '完成移动端验证' }]);
storageDeletesAvailable = false;
assert.equal(clearSafeDraft('daily:2026-08-13'), false, 'deletion failures must be reported without escaping to the caller');
assert.deepEqual(readSafeDraftValue('daily:2026-08-13'), [{ sectionKey: 'today', contentMd: '完成移动端验证' }], 'a failed deletion preserves the recoverable draft');
storageDeletesAvailable = true;
storageDeletesApplied = false;
assert.equal(clearSafeDraft('daily:2026-08-13'), false, 'a silent no-op deletion must not be reported as successful');
assert.deepEqual(readSafeDraftValue('daily:2026-08-13'), [{ sectionKey: 'today', contentMd: '完成移动端验证' }], 'a silent no-op preserves the recoverable draft');
storageDeletesApplied = true;
assert.equal(clearSafeDraft('daily:2026-08-13'), true, 'deletion can be retried after storage recovers');
assert.equal(readSafeDraftValue('daily:2026-08-13'), null);
assert.equal(clearSafeDraft('daily:2026-08-13'), true, 'deleting an absent draft is successful');
assert.equal(readSafeDraftValue(firstAccount), '第一位账号的日报', 'clearing one key preserves other recovery drafts');

console.log('Mobile safe draft contract tests passed');
