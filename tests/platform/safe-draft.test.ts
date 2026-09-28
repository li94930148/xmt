import assert from 'node:assert/strict';
import { clearSafeDraft, readSafeDraftValue, userSafeDraftKey, writeSafeDraft } from '../../src/platform/safe-draft.js';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
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
assert.equal(writeSafeDraft('daily:2026-08-13', [{ sectionKey: 'today', contentMd: '完成移动端验证' }]), true);
assert.equal(readSafeDraftValue(secondAccount), null, 'legacy unscoped drafts must not be assigned to a different account');
assert.deepEqual(readSafeDraftValue('daily:2026-08-13'), [{ sectionKey: 'today', contentMd: '完成移动端验证' }]);
clearSafeDraft('daily:2026-08-13');
assert.equal(readSafeDraftValue('daily:2026-08-13'), null);

console.log('Mobile safe draft contract tests passed');
