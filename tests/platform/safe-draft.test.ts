import assert from 'node:assert/strict';
import { clearSafeDraft, readSafeDraftValue, writeSafeDraft } from '../../src/platform/safe-draft.js';

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
assert.equal(writeSafeDraft('daily:2026-08-13', [{ sectionKey: 'today', contentMd: '完成移动端验证' }]), true);
assert.deepEqual(readSafeDraftValue('daily:2026-08-13'), [{ sectionKey: 'today', contentMd: '完成移动端验证' }]);
clearSafeDraft('daily:2026-08-13');
assert.equal(readSafeDraftValue('daily:2026-08-13'), null);

console.log('Mobile safe draft contract tests passed');
