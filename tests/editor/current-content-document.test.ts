import assert from 'node:assert/strict';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
});

const { resolveContentDocument } = await import('../../src/content/orchestrator/currentContentDocument.js');
values.set('xmt_recent_content_docs', JSON.stringify([{ docId: 'production:12', title: '示例创作稿', label: '示例创作稿', kind: 'production', updatedAt: 1 }]));

assert.equal(resolveContentDocument('示例创作稿')?.docId, 'production:12', 'recent title resolves to its real document id');
assert.equal(resolveContentDocument('创作:9')?.docId, 'production:9');
assert.equal(resolveContentDocument('shooting:8')?.docId, 'shooting:8');
assert.equal(resolveContentDocument('随手输入的普通标题'), null, 'an arbitrary title must not become a fake document id');

console.log('current content document resolution tests passed');
